import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { ThemeEvents, CartUpdateEvent } from '@theme/events';

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
  #busy = false;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    this.#check();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
  }

  #handleCartUpdate = () => {
    this.#check();
  };

  async #check() {
    if (this.#busy) return;

    const threshold = Number(this.dataset.threshold);
    const defaultVariantId = this.dataset.defaultVariantId;
    if (!threshold || !defaultVariantId) return;

    const cart = await fetchCart();
    if (!cart) return;

    const giftLineIndex = cart.items.findIndex((item) => item.properties && item.properties._gwp === 'true');
    const qualifies = cart.total_price >= threshold;

    if (qualifies && giftLineIndex === -1) {
      await this.#addGift(defaultVariantId);
    } else if (!qualifies && giftLineIndex !== -1) {
      await this.#removeGift(giftLineIndex + 1);
    }
  }

  /**
   * @param {string} variantId
   */
  async #addGift(variantId) {
    this.#busy = true;
    try {
      const body = JSON.stringify({
        id: variantId,
        quantity: 1,
        properties: { _gwp: 'true' },
        sections: getCartSectionIds(),
        sections_url: window.location.pathname,
      });
      const response = await fetch(Theme.routes.cart_add_url, fetchConfig('json', { body }));
      const data = await response.json();

      if (data.status) {
        // Most likely out of stock - nothing more we can do automatically.
        console.error('cart-gwp: could not add gift', data);
        return;
      }

      this.#dispatchUpdate(data.sections);
    } catch (error) {
      console.error(error);
    } finally {
      this.#busy = false;
    }
  }

  /**
   * @param {number} line
   */
  async #removeGift(line) {
    this.#busy = true;
    try {
      const body = JSON.stringify({ line, quantity: 0, sections: getCartSectionIds() });
      const response = await fetch(Theme.routes.cart_change_url, fetchConfig('json', { body }));
      const data = await response.json();
      this.#dispatchUpdate(data.sections);
    } catch (error) {
      console.error(error);
    } finally {
      this.#busy = false;
    }
  }

  /**
   * @param {Record<string, string>} sections
   */
  #dispatchUpdate(sections) {
    this.dispatchEvent(
      new CartUpdateEvent({}, this.id || 'cart-gwp-watcher', { source: 'cart-gwp-watcher', sections })
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
    if (this.hasAttribute('data-disabled')) return;
    this.setAttribute('data-disabled', '');

    const { select } = this.refs;
    const line = Number(this.dataset.line);

    try {
      await fetch(Theme.routes.cart_change_url, fetchConfig('json', { body: JSON.stringify({ line, quantity: 0 }) }));

      const body = JSON.stringify({
        id: select.value,
        quantity: 1,
        properties: { _gwp: 'true' },
        sections: getCartSectionIds(),
        sections_url: window.location.pathname,
      });
      const response = await fetch(Theme.routes.cart_add_url, fetchConfig('json', { body }));
      const data = await response.json();

      this.dispatchEvent(
        new CartUpdateEvent({}, this.id || 'cart-gwp-variant-picker', {
          source: 'cart-gwp-variant-picker',
          sections: data.sections,
        })
      );
    } catch (error) {
      console.error(error);
    } finally {
      this.removeAttribute('data-disabled');
    }
  }
}

/**
 * @returns {string}
 */
function getCartSectionIds() {
  return Array.from(document.querySelectorAll('cart-items-component'))
    .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : null))
    .filter(Boolean)
    .join(',');
}

/**
 * @returns {Promise<Object|null>}
 */
async function fetchCart() {
  try {
    const response = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

if (!customElements.get('cart-gwp-watcher-component')) {
  customElements.define('cart-gwp-watcher-component', CartGwpWatcherComponent);
}

if (!customElements.get('cart-gwp-variant-picker-component')) {
  customElements.define('cart-gwp-variant-picker-component', CartGwpVariantPickerComponent);
}
