import { Component } from "@theme/component";
import { CartUpdateEvent, ThemeEvents } from "@theme/events";
import { fetchConfig } from "@theme/utilities";

/** Upper bound on back-to-back re-checks within one check, so a misbehaving cart can't loop forever. */
const MAX_CHECK_PASSES = 5;

// Shared by EVERY watcher instance, not kept per instance: morphSection can recreate the element
// while the old instance's check is still running, and two checks that overlap would both see "no
// gift yet" and both add one.
let checking = false;
let recheck = false;

// The cart contents (everything except the gift) the gift was last re-added for, so the "move the
// gift back to the newest line" step below runs at most once per cart state and can never loop.
let lastRotationKey = "";

/**
 * Whether something is a full cart object (as /cart.js and /cart/change.js return), as opposed
 * to e.g. the single line item /cart/add.js returns.
 * @param {any} value
 * @returns {boolean}
 */
function isCart(value) {
  return Boolean(value) && Array.isArray(value.items) && typeof value.total_price === "number" && typeof value.items_subtotal_price === "number";
}

/**
 * Invisible watcher that auto-adds/removes the gift-with-purchase (GWP) line item based on the
 * cart subtotal vs a threshold set in theme settings. Runs after every cart update.
 *
 * IMPORTANT: this only drives the front-end UX (auto add/remove, so the shopper never has to do
 * it manually). It does NOT make the gift free, and does NOT stop someone from calling the Cart
 * API directly to bypass the quantity/remove lock rendered in cart-products.liquid. Both of those
 * need to be enforced server-side (an Automatic Discount Function keyed off the `_gwp` line
 * property, and optionally a Cart Transform Function) - tracked as follow-up, not theme code.
 *
 * @extends {Component}
 */
class CartGwpWatcherComponent extends Component {
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    // Applying or removing a discount code changes the total (and so whether the cart qualifies)
    // but announces itself with its own event, not cart:update - without this, the gift was
    // never re-checked after a code went on or off until the next page load.
    document.addEventListener(
      ThemeEvents.discountUpdate,
      this.#handleCartUpdate,
    );
    this.#check();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(
      ThemeEvents.cartUpdate,
      this.#handleCartUpdate,
    );
    document.removeEventListener(
      ThemeEvents.discountUpdate,
      this.#handleCartUpdate,
    );
  }

  /**
   * @param {Event} event
   */
  #handleCartUpdate = (event) => {
    // Skip the update this watcher dispatches itself after adding/removing the gift: that
    // correction is exactly what it just verified, so re-checking it only costs another /cart.js.
    if (/** @type {CustomEvent} */ (event).detail?.data?.source === "cart-gwp-watcher") return;
    this.#check();
  };

  async #check() {
    if (checking) {
      // An update landed while a check was already running (the shopper changed subscription
      // and quantity back to back, or this check's own add/remove just fired its update). What
      // that check is looking at may already be stale, so look again once it is done, instead
      // of dropping this update.
      recheck = true;
      return;
    }

    const threshold = Number(this.dataset.threshold);
    const defaultVariantId = this.dataset.defaultVariantId;
    if (!threshold || !defaultVariantId) return;

    checking = true;

    // Checking (and possibly correcting) the gift can take 1-2 sequential fetches, which can
    // easily run long enough to outlast a fixed settle delay elsewhere (see
    // cart-drawer-height-lock.js) - that script listens for this event instead of guessing a
    // timeout, so it never releases its height lock mid-correction and shows a stray resize.
    document.dispatchEvent(
      new CustomEvent("cart:gwp-correcting", { detail: { pending: true } }),
    );

    let exhausted = false;

    try {
      for (let pass = 0; pass < MAX_CHECK_PASSES; pass++) {
        recheck = false;

        // Always decide from the cart as the server has it right now, never from the cart an
        // event happens to carry: with more than one request in flight, responses arrive out of
        // order, and an older snapshot has no gift yet - acting on it adds the gift a second time.
        const cart = await fetchCart();
        if (!cart) break;

        await this.#correct(cart, threshold, defaultVariantId);
        if (!recheck) break;

        // Still being told the cart changed after the last allowed pass.
        if (pass === MAX_CHECK_PASSES - 1) exhausted = true;
      }
    } catch (error) {
      console.error(error);
    } finally {
      checking = false;
      recheck = false;
      document.dispatchEvent(
        new CustomEvent("cart:gwp-correcting", { detail: { pending: false } }),
      );
    }

    // The cap only exists so a runaway can't loop forever; it must not leave the last change
    // unchecked, so pick it up again shortly instead of dropping it.
    if (exhausted) setTimeout(() => this.#check(), 250);
  }

  /**
   * Makes the cart hold exactly one gift line while it qualifies, and none when it doesn't.
   * @param {any} cart
   * @param {number} threshold
   * @param {string} defaultVariantId
   */
  async #correct(cart, threshold, defaultVariantId) {
    const giftVariantId = Number(defaultVariantId);

    /** @param {any} item */
    const isGiftLine = (item) => Boolean(item.properties && item.properties._gwp === "true");

    /** @type {{ line: number, quantity: number }[]} */
    const giftLines = [];
    let giftChargedTotal = 0;
    let discountApplied = false;
    cart.items.forEach((/** @type {any} */ item, /** @type {number} */ index) => {
      if (isGiftLine(item)) {
        giftLines.push({ line: index + 1, quantity: item.quantity });
        giftChargedTotal += item.final_line_price;
      }

      // Shopify only gives the free unit once the cart really qualifies, so a discounted line of
      // the gift product is its own confirmation - whichever line it landed on.
      if (item.variant_id === giftVariantId && item.final_line_price < item.original_line_price) {
        discountApplied = true;
      }
    });

    // What the shopper spends is everything except what the gift itself costs. That keeps the Buy X
    // Get Y discount from propping itself up: when a quantity decrease drops real spend below the
    // threshold, Shopify's discount stops applying and the gift's line price reverts to full price
    // in the same response - left in, that price pushes the subtotal back over the threshold
    // and the gift never gets removed. A product the shopper bought themselves does count (the
    // discount counts it too), so adding the gift's own product can earn the gift.
    // Uses items_subtotal_price (after line discounts such as Subscribe & Save, BEFORE cart-level
    // codes like MISSYOU30): Shopify checks the Buy X Get Y spend before an order discount, so a
    // code must not stop a cart that really spent enough from earning the gift.
    const qualifies = discountApplied || cart.items_subtotal_price - giftChargedTotal >= threshold;

    if (!qualifies) {
      await this.#changeLines(giftLines.map(({ line }) => ({ line, quantity: 0 })));
      return;
    }

    if (giftLines.length === 0) {
      await this.#addGift(defaultVariantId);
      return;
    }

    // Exactly one unit, ever. A second gift line can only come from a race, so heal it.
    const [keep, ...extras] = giftLines;
    const changes = extras.map(({ line }) => ({ line, quantity: 0 }));
    if (keep && keep.quantity !== 1) changes.push({ line: keep.line, quantity: 1 });
    if (changes.length > 0) {
      await this.#changeLines(changes);
      return;
    }

    // Shopify gives the free unit to the NEWEST line of the gift variant. If the shopper adds that
    // same product themselves after the gift is already in the cart, the discount lands on THEIR
    // line (it shows $0) while the real gift line pays full price. Taking the gift out and adding
    // it back makes it the newest line again, which moves the discount back onto it.
    const gift = keep && cart.items[keep.line - 1];
    const discountOnWrongLine = cart.items.some(
      (/** @type {any} */ item) =>
        !isGiftLine(item) && item.variant_id === giftVariantId && item.final_line_price < item.original_line_price,
    );
    if (gift && gift.final_line_price > 0 && discountOnWrongLine) {
      const key = cart.items
        .filter((/** @type {any} */ item) => !isGiftLine(item))
        .map((/** @type {any} */ item) => `${item.key}:${item.quantity}`)
        .join("|");
      if (key === lastRotationKey) return;
      lastRotationKey = key;

      await this.#changeLines([{ line: keep.line, quantity: 0 }]);
      await this.#addGift(defaultVariantId);
    }
  }

  /**
   * @param {string} variantId
   */
  async #addGift(variantId) {
    try {
      const body = JSON.stringify({
        id: variantId,
        quantity: 1,
        properties: { _gwp: "true" },
        sections: getCartSectionIds(),
        sections_url: window.location.pathname,
      });
      const response = await fetch(
        Theme.routes.cart_add_url,
        fetchConfig("json", { body }),
      );
      const data = await response.json();

      if (data.status) {
        // Most likely out of stock - nothing more we can do automatically.
        console.error("cart-gwp: could not add gift", data);
        return;
      }

      this.#dispatchUpdate(data.sections);
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Applies line changes one after the other, highest line number first so the lower ones stay
   * valid while earlier lines are removed, then tells the cart to refresh once.
   * @param {{ line: number, quantity: number }[]} changes
   */
  async #changeLines(changes) {
    if (changes.length === 0) return;

    try {
      /** @type {any} */
      let data = null;

      for (const { line, quantity } of [...changes].sort((a, b) => b.line - a.line)) {
        const body = JSON.stringify({
          line,
          quantity,
          sections: getCartSectionIds(),
          sections_url: window.location.pathname,
        });
        const response = await fetch(
          Theme.routes.cart_change_url,
          fetchConfig("json", { body }),
        );
        data = await response.json();

        if (data.status || data.errors) {
          console.error("cart-gwp: could not change gift line", data);
          return;
        }
      }

      this.#dispatchUpdate(data.sections);
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * @param {Record<string, string>} sections
   */
  #dispatchUpdate(sections) {
    this.dispatchEvent(
      new CartUpdateEvent({}, this.id || "cart-gwp-watcher", {
        source: "cart-gwp-watcher",
        sections,
      }),
    );
  }
}

/**
 * Lets the shopper switch which variant of the gift product they receive, when the configured
 * gift product has more than one available variant (e.g. choosing a flavor).
 *
 * @typedef {object} Refs
 * @property {HTMLSelectElement} select
 * @extends {Component<Refs>}
 */
class CartGwpVariantPickerComponent extends Component {
  async changeVariant() {
    if (this.hasAttribute("data-disabled")) return;
    this.setAttribute("data-disabled", "");

    const { select } = this.refs;
    const line = Number(this.dataset.line);

    try {
      await fetch(
        Theme.routes.cart_change_url,
        fetchConfig("json", { body: JSON.stringify({ line, quantity: 0 }) }),
      );

      const body = JSON.stringify({
        id: select.value,
        quantity: 1,
        properties: { _gwp: "true" },
        sections: getCartSectionIds(),
        sections_url: window.location.pathname,
      });
      const response = await fetch(
        Theme.routes.cart_add_url,
        fetchConfig("json", { body }),
      );
      const data = await response.json();

      this.dispatchEvent(
        new CartUpdateEvent({}, this.id || "cart-gwp-variant-picker", {
          source: "cart-gwp-variant-picker",
          sections: data.sections,
        }),
      );
    } catch (error) {
      console.error(error);
    } finally {
      this.removeAttribute("data-disabled");
    }
  }
}

/**
 * @returns {string}
 */
function getCartSectionIds() {
  return Array.from(document.querySelectorAll("cart-items-component"))
    .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : null))
    .filter(Boolean)
    .join(",");
}

/**
 * @returns {Promise<Object|null>}
 */
async function fetchCart() {
  try {
    const response = await fetch("/cart.js", {
      headers: { Accept: "application/json" },
    });
    const cart = await response.json();
    return isCart(cart) ? cart : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

if (!customElements.get("cart-gwp-watcher-component")) {
  customElements.define("cart-gwp-watcher-component", CartGwpWatcherComponent);
}

if (!customElements.get("cart-gwp-variant-picker-component")) {
  customElements.define(
    "cart-gwp-variant-picker-component",
    CartGwpVariantPickerComponent,
  );
}
