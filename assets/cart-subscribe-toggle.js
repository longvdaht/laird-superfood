import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { ThemeEvents, CartUpdateEvent } from '@theme/events';

/**
 * Toggles a cart line item between one-time purchase and a subscription (selling plan), and lets
 * the shopper change delivery frequency while subscribed.
 *
 * The line is changed in place with a single /cart/change.js call (`selling_plan` set to a plan
 * id, another plan id, or null for one-time), which keeps it exactly where it is in the cart.
 * This used to remove the line and add it back, but Shopify puts a newly added line at the TOP
 * of the cart, so every edit made the item jump up above the others.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} checkbox
 * @property {HTMLSelectElement} [frequencySelect]
 * @property {HTMLElement} [frequencyWrap] - wraps frequencySelect, carries the visible border/
 * arrow styling - toggled instead of the <select> itself so that styling hides along with it.
 *
 * @extends {Component<Refs>}
 */
class CartSubscribeToggleComponent extends Component {
  /**
   * Handles the toggle checkbox changing.
   */
  async toggle() {
    const { checkbox, frequencyWrap } = this.refs;
    const sellingPlanId = checkbox.checked ? this.dataset.defaultPlanId : null;

    if (frequencyWrap) {
      frequencyWrap.hidden = !checkbox.checked;
    }

    await this.#setSellingPlan(sellingPlanId);
  }

  /**
   * Handles the delivery frequency select changing.
   */
  async changeFrequency() {
    const { frequencySelect } = this.refs;
    if (!frequencySelect) return;
    await this.#setSellingPlan(frequencySelect.value);
  }

  /**
   * @param {string | null} sellingPlanId
   */
  async #setSellingPlan(sellingPlanId) {
    if (this.hasAttribute('data-disabled')) return;
    this.setAttribute('data-disabled', '');

    const line = Number(this.dataset.line);
    const quantity = Number(this.dataset.quantity) || 1;

    // Keep the whole cart disabled until this request (and the gift check it triggers) is done.
    const cartItems = this.closest('cart-items-component');
    if (cartItems && 'holdBusy' in cartItems && typeof cartItems.holdBusy === 'function') cartItems.holdBusy();

    try {
      const response = await fetch(
        Theme.routes.cart_change_url,
        fetchConfig('json', {
          body: JSON.stringify({
            line,
            quantity,
            selling_plan: sellingPlanId,
            sections: getCartSectionIds(),
            sections_url: window.location.pathname,
          }),
        })
      );
      const data = await response.json();

      if (data.status || data.errors) {
        console.error('cart-subscribe-toggle: change failed', data);
        return;
      }

      this.dispatchEvent(
        new CartUpdateEvent({}, this.id || 'cart-subscribe-toggle', {
          source: 'cart-subscribe-toggle',
          sections: data.sections,
          // /cart/change.js answers with the whole cart, so cart-gwp.js can skip its own fetch.
          cart: data,
        })
      );
    } catch (error) {
      console.error(error);
    } finally {
      this.removeAttribute('data-disabled');
      if (cartItems && 'releaseBusy' in cartItems && typeof cartItems.releaseBusy === 'function') cartItems.releaseBusy();
    }
  }
}

/**
 * Collects the section ids of every cart-items-component on the page, so the Cart API response
 * comes back with fresh HTML for all of them (drawer + any other cart UI rendered at once).
 * @returns {string}
 */
function getCartSectionIds() {
  return Array.from(document.querySelectorAll('cart-items-component'))
    .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : null))
    .filter(Boolean)
    .join(',');
}

if (!customElements.get('cart-subscribe-toggle-component')) {
  customElements.define('cart-subscribe-toggle-component', CartSubscribeToggleComponent);
}
