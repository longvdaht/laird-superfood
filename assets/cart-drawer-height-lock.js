import { ThemeEvents } from "@theme/events";

/**
 * A single cart action (e.g. changing quantity, or toggling a line between subscription and
 * one-time) can trigger more than one sequential fetch+morph: the action itself, then - if it
 * crosses the GWP threshold - cart-gwp.js's own separate fetch(es) to add/remove the gift line.
 * Each morph dispatches its own cartUpdate event, so the drawer's scrollable content can
 * visibly shrink after the first morph and grow back after the second, a split second later.
 *
 * Locking min-height to the tallest size seen since the drawer was opened keeps it from
 * visibly changing size mid-interaction, while still letting it settle to its real final
 * height - smaller or larger - once nothing is in flight. The baseline is captured on the
 * dialog's native `toggle` event (fired on open, before any morph can happen), not on the
 * first cartUpdate, which would already be reporting the post-morph (already shrunk) height -
 * too late to protect against it.
 *
 * The lock only releases once cart-gwp.js reports it's done checking/correcting (via the
 * `cart:gwp-correcting` event, the same signal component-cart-items.js uses for the same
 * reason) - never on a fixed timer. That correction can take 1-2 sequential fetches, easily
 * longer than any reasonable fixed delay, and releasing early (while it's still in flight) is
 * exactly what let a resize flash through in practice.
 */

/** @type {WeakMap<HTMLElement, number>} */
const maxHeights = new WeakMap();
let gwpCorrecting = false;

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

document.addEventListener("cart:gwp-correcting", (event) => {
  gwpCorrecting = Boolean(/** @type {CustomEvent} */ (event).detail?.pending);
  if (!gwpCorrecting) settle();
});

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

  if (!gwpCorrecting) settle();
});

function settle() {
  document.querySelectorAll(".cart-drawer__items").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.style.minHeight = "";
    maxHeights.set(el, el.getBoundingClientRect().height);
  });
}
