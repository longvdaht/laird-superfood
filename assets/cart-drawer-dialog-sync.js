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
