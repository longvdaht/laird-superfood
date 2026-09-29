import { QuantitySelectorComponent } from '@theme/component-quantity-selector';

/**
 * A custom element that allows the user to select a quantity in the cart.
 * Extends QuantitySelectorComponent but uses absolute max limits instead of effective max.
 * Semantics: "What should the total quantity BE in the cart" vs "How many to ADD to cart"
 *
 * @extends {QuantitySelectorComponent}
 */
class CartQuantitySelectorComponent extends QuantitySelectorComponent {
  /**
   * Gets the effective maximum value for cart quantity selector
   * Cart page: uses absolute max (how much can be in cart total)
   * @returns {number | null} The effective max, or null if no max
   */
  getEffectiveMax() {
    const { max } = this.getCurrentValues();
    return max; // Cart uses absolute max, not max minus cart quantity
  }

  /**
   * Updates button states based on current value and limits
   * Cart buttons are always managed client-side, never server-disabled - EXCEPT when
   * data-quantity-locked is set (Cart Rebuild: gift-with-purchase line items), which this
   * class doesn't know the reason for, it just always keeps both buttons disabled regardless
   * of min/max so a GWP line's quantity can never be bumped through this control.
   */
  updateButtonStates() {
    const { minusButton, plusButton } = this.refs;

    if (this.hasAttribute('data-quantity-locked')) {
      minusButton.disabled = true;
      plusButton.disabled = true;
      return;
    }

    const { min, value } = this.getCurrentValues();
    const effectiveMax = this.getEffectiveMax();

    // Cart buttons are always dynamically managed
    minusButton.disabled = value <= min;
    plusButton.disabled = effectiveMax !== null && value >= effectiveMax;
  }
}

if (!customElements.get('cart-quantity-selector-component')) {
  customElements.define('cart-quantity-selector-component', CartQuantitySelectorComponent);
}
