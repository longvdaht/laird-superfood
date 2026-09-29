import { ThemeEvents } from '@theme/events';

const LOADING_FALLBACK_TIMEOUT = 5000;

/**
 * component-cart-items.js's #disableCartItems() locks the WHOLE cart list (pointer-events: none)
 * for any in-flight quantity/remove request, with no per-row state to style off of - so every
 * "Remove" button would spin at once instead of just the one actually clicked. This tracks the
 * specific button instead, entirely separate from that existing disable/enable flow (not
 * replacing it, just adding a scoped visual on top).
 */
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;

  const button = event.target.closest('.cart-items__remove');
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;

  button.classList.add('cart-items__remove--loading');
  setTimeout(() => button.classList.remove('cart-items__remove--loading'), LOADING_FALLBACK_TIMEOUT);
});

document.addEventListener(ThemeEvents.cartUpdate, () => {
  document.querySelectorAll('.cart-items__remove--loading').forEach((button) => {
    button.classList.remove('cart-items__remove--loading');
  });
});
