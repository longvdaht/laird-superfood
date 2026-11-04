import { ThemeEvents } from "@theme/events";

/**
 * .cart-drawer__dialog has `data-skip-node-update` (see the comment on it in cart-drawer.liquid)
 * so morphSection never touches its own attributes - that's what stops it from getting silently
 * closed every time a cart update morphs the header section it lives in (its `open` attribute is
 * pure client runtime state server-rendered HTML never carries).
 *
 * The tradeoff: `aria-labelledby` also stops updating via morph, even though it legitimately
 * needs to change with cart.empty? (the dialog points its label at a different heading once the
 * cart is emptied out, or filled back up). This syncs just that one attribute, reading it from
 * the same fresh section HTML every cart update already carries - never touching `open`, never
 * calling showModal()/close(), so there is no path here that can re-trigger opening or closing
 * the dialog itself.
 *
 * (`class` used to be synced here too, for the `cart-drawer--empty` modifier - that now lives on
 * <cart-drawer-component> instead, so plain morphSection updates it with no custom JS.)
 *
 * The write below is still guarded to only happen when the value actually changed, since it's
 * unchanged on most cart updates (only cart.empty? toggling flips it) and an unconditional write
 * would fire every single time for no reason.
 */
document.addEventListener(ThemeEvents.cartUpdate, (event) => {
  const sections = /** @type {CustomEvent} */ (event).detail?.data?.sections;
  if (!sections) return;

  document.querySelectorAll("cart-items-component").forEach((component) => {
    if (!(component instanceof HTMLElement)) return;

    const sectionId = component.dataset.sectionId;
    const sectionHtml = sectionId && sections[sectionId];
    if (!sectionHtml) return;

    const dialog = component
      .closest(".cart-drawer")
      ?.querySelector(".cart-drawer__dialog");
    if (!(dialog instanceof HTMLElement)) return;

    const freshDialog = new DOMParser()
      .parseFromString(sectionHtml, "text/html")
      .querySelector(".cart-drawer__dialog");
    if (!freshDialog) return;

    const ariaLabelledby = freshDialog.getAttribute("aria-labelledby");
    if (
      ariaLabelledby &&
      dialog.getAttribute("aria-labelledby") !== ariaLabelledby
    ) {
      dialog.setAttribute("aria-labelledby", ariaLabelledby);
    }
  });
});

// TEMP DEBUG - remove after diagnosing "cart closes when applying/removing a discount code".
// Logs, with a stack, every call that could close or detach the cart dialog.
(() => {
  const SEL = ".cart-drawer__dialog";
  const t0 = performance.now();
  const ts = () => `+${(performance.now() - t0).toFixed(0)}ms`;
  const live = () => /** @type {HTMLDialogElement | null} */ (document.querySelector(SEL));
  const state = () => {
    const d = live();
    return d ? `open=${d.open} modal=${d.matches(":modal")} connected=${d.isConnected}` : "NO dialog in DOM";
  };
  const label = (/** @type {any} */ n) =>
    n instanceof Element ? `<${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\s+/)[0] : ""}>` : String(n && n.nodeName);
  const hasDialog = (/** @type {any} */ n) => n instanceof Element && (n.matches(SEL) || !!n.querySelector(SEL));
  const log = (/** @type {string} */ msg) => {
    console.log(`[cart-drawer DEBUG ${ts()}] ${msg} | live: ${state()}`);
    console.trace("[cart-drawer DEBUG] stack");
  };

  const proto = /** @type {any} */ (Node.prototype);
  for (const m of ["insertBefore", "appendChild", "removeChild", "replaceChild"]) {
    const orig = proto[m];
    proto[m] = function (/** @type {any[]} */ ...args) {
      const hit = args.filter((a) => a instanceof Node && hasDialog(a));
      if (hit.length && (m === "removeChild" || m === "replaceChild" || m === "insertBefore"))
        log(`${m}() on ${label(this)} with ${hit.map(label).join(",")}`);
      if (this instanceof Element && this.tagName === "HEADER-ACTIONS" && m !== "appendChild")
        console.log(
          `[cart-drawer DEBUG ${ts()}] header-actions.${m}(${args.map((a) => (a instanceof Node ? (a.nodeType === 3 ? "text" : label(a)) : a)).join(", ")}) | live children: ${Array.from(this.childNodes).map((n, i) => `${i}:${n.nodeType === 3 ? (n.nodeValue?.trim() ? "TEXT" : "ws") : label(n)}`).join(" | ")}`
        );
      return orig.apply(this, args);
    };
  }
  for (const m of ["remove", "replaceWith", "replaceChildren", "before", "after"]) {
    const orig = /** @type {any} */ (Element.prototype)[m];
    /** @type {any} */ (Element.prototype)[m] = function (/** @type {any[]} */ ...args) {
      if (m === "remove" ? hasDialog(this) : hasDialog(this) || args.some(hasDialog)) log(`Element.${m}() on ${label(this)}`);
      return orig.apply(this, args);
    };
  }
  for (const m of ["close", "show", "showModal", "requestClose"]) {
    const orig = /** @type {any} */ (HTMLDialogElement.prototype)[m];
    if (!orig) continue;
    /** @type {any} */ (HTMLDialogElement.prototype)[m] = function (/** @type {any[]} */ ...args) {
      if (this.matches(SEL)) log(`dialog.${m}()`);
      return orig.apply(this, args);
    };
  }
  for (const m of ["removeAttribute", "setAttribute", "toggleAttribute"]) {
    const orig = /** @type {any} */ (Element.prototype)[m];
    /** @type {any} */ (Element.prototype)[m] = function (/** @type {any[]} */ ...args) {
      if (this instanceof HTMLDialogElement && this.matches(SEL) && args[0] === "open") log(`dialog.${m}("open")`);
      return orig.apply(this, args);
    };
  }
  for (const prop of ["innerHTML", "outerHTML"]) {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, prop);
    if (!desc || !desc.set) continue;
    const set = desc.set;
    Object.defineProperty(Element.prototype, prop, {
      ...desc,
      set(v) {
        if (hasDialog(this)) log(`${prop} = ... on ${label(this)}`);
        return set.call(this, v);
      },
    });
  }

  let last = live();
  setInterval(() => {
    const now = live();
    if (now !== last) {
      console.log(`[cart-drawer DEBUG ${ts()}] LIVE DIALOG NODE CHANGED | live: ${state()}`);
      last = now;
    }
  }, 50);
  document.addEventListener("discount:update", () => console.log(`[cart-drawer DEBUG ${ts()}] discount:update event | live: ${state()}`));
  document.addEventListener("cart:update", () => console.log(`[cart-drawer DEBUG ${ts()}] cart:update event | live: ${state()}`));
  document.addEventListener("toggle", (e) => {
    if (e.target instanceof Element && e.target.matches(SEL)) console.log(`[cart-drawer DEBUG ${ts()}] toggle event on dialog | live: ${state()}`);
  }, true);
  console.log(`[cart-drawer DEBUG ${ts()}] discount debug armed | live: ${state()}`);
})();
