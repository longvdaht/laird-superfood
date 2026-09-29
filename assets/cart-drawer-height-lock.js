import { ThemeEvents } from "@theme/events";

/**
 * A single cart action (e.g. changing quantity) can trigger more than one sequential
 * fetch+morph: the quantity change itself, then - if it crosses the GWP threshold -
 * cart-gwp.js's own separate fetch to add/remove the gift line. Each morph dispatches its
 * own cartUpdate event, so the drawer's scrollable content can visibly shrink after the
 * first morph and grow back after the second, a split second later.
 *
 * Locking min-height to the tallest size seen since the drawer was opened (cleared once
 * updates go quiet) keeps it from visibly changing size mid-interaction, while still
 * letting it settle to its real final height - smaller or larger - once nothing is in
 * flight. The baseline is captured on the dialog's native `toggle` event (fired on open,
 * before any morph can happen), not on the first cartUpdate, which would already be
 * reporting the post-morph (already shrunk) height - too late to protect against it.
 */
const SETTLE_DELAY = 300;

/** @type {WeakMap<HTMLElement, number>} */
const maxHeights = new WeakMap();
let settleTimeout;

document.addEventListener(
  "toggle",
  (event) => {
    const dialog = event.target;
    if (
      !(dialog instanceof HTMLElement) ||
      !dialog.matches(".cart-drawer__dialog")
    )
      return;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;

    dialog.querySelectorAll(".cart-drawer__items").forEach((el) => {
      if (el instanceof HTMLElement)
        maxHeights.set(el, el.getBoundingClientRect().height);
    });
  },
  true,
);

document.addEventListener(ThemeEvents.cartUpdate, () => {
  document.querySelectorAll(".cart-drawer__items").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;

    const currentHeight = el.getBoundingClientRect().height;
    const maxHeight = maxHeights.get(el) ?? currentHeight;

    if (currentHeight > maxHeight) {
      maxHeights.set(el, currentHeight);
    } else if (currentHeight < maxHeight) {
      el.style.minHeight = `${maxHeight}px`;
    }
  });

  clearTimeout(settleTimeout);
  settleTimeout = setTimeout(() => {
    document.querySelectorAll(".cart-drawer__items").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.style.minHeight = "";
      maxHeights.set(el, el.getBoundingClientRect().height);
    });
  }, SETTLE_DELAY);
});
