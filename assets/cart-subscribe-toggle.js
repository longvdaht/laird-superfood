import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { ThemeEvents, CartUpdateEvent } from '@theme/events';

/**
 * Toggles a cart line item between one-time purchase and a subscription (selling plan), and lets
 * the shopper change delivery frequency while subscribed.
 *
 * The public Cart API does not reliably support switching a line's selling_plan back to "none"
 * through /cart/change.js alone, so this removes the line and re-adds it, which is the
 * documented, guaranteed-correct path.
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
    const variantId = this.dataset.variantId;
    const quantity = Number(this.dataset.quantity) || 1;
    const sections = getCartSectionIds();

    try {
      // Step 1: clear the current line.
      await fetch(
        Theme.routes.cart_change_url,
        fetchConfig('json', { body: JSON.stringify({ line, quantity: 0 }) })
      );

      // Step 2: re-add with (or without) the selling plan.
      /** @type {Record<string, unknown>} */
      const addBody = {
        id: variantId,
        quantity,
        sections,
        sections_url: window.location.pathname,
      };
      if (sellingPlanId) addBody.selling_plan = sellingPlanId;

      const response = await fetch(
        Theme.routes.cart_add_url,
        fetchConfig('json', { body: JSON.stringify(addBody) })
      );
      const data = await response.json();

      if (data.status) {
        console.error('cart-subscribe-toggle: add failed', data);
        return;
      }

      this.dispatchEvent(
        new CartUpdateEvent({}, this.id || 'cart-subscribe-toggle', {
          source: 'cart-subscribe-toggle',
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
