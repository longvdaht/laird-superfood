import { ThemeEvents } from '@theme/events';

/**
 * .cart-drawer__dialog has `data-skip-node-update` (see the comment on it in
 * cart-drawer.liquid) so morphSection never touches its own attributes - that's what stops it
 * from getting silently closed every time a cart update morphs the header section it lives in
 * (its `open` attribute is pure client runtime state server-rendered HTML never carries).
 *
 * The tradeoff: `class` and `aria-labelledby` also stop updating via morph, even though both
 * legitimately need to change with cart.empty? (the dialog gets a `cart-drawer--empty` class
 * and points its label at a different heading once the cart is emptied out, or filled back
 * up). This syncs just those two, reading them from the same fresh section HTML every cart
 * update already carries - never touching `open`, never calling showModal()/close(), so there
 * is no path here that can re-trigger opening or closing the dialog itself.
 */
document.addEventListener(ThemeEvents.cartUpdate, (event) => {
  const sections = /** @type {CustomEvent} */ (event).detail?.data?.sections;
  if (!sections) return;

  document.querySelectorAll('cart-items-component').forEach((component) => {
    if (!(component instanceof HTMLElement)) return;

    const sectionId = component.dataset.sectionId;
    const sectionHtml = sectionId && sections[sectionId];
    if (!sectionHtml) return;

    const dialog = component.closest('.cart-drawer')?.querySelector('.cart-drawer__dialog');
    if (!(dialog instanceof HTMLElement)) return;

    const freshDialog = new DOMParser()
      .parseFromString(sectionHtml, 'text/html')
      .querySelector('.cart-drawer__dialog');
    if (!freshDialog) return;

    dialog.className = freshDialog.className;

    const ariaLabelledby = freshDialog.getAttribute('aria-labelledby');
    if (ariaLabelledby) dialog.setAttribute('aria-labelledby', ariaLabelledby);
  });
});
