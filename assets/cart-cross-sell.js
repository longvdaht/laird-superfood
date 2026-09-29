import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';

// How long to keep a quick-add button marked "loading" at most, in case the cart update event
// it's waiting for never fires (request error swallowed somewhere, etc).
const LOADING_FALLBACK_TIMEOUT = 5000;

/**
 * A custom element that renders a simple, scroll-snap based carousel for the
 * cart drawer cross-sell rows. Deliberately not reusing the full slideshow
 * component: this only needs prev/next scroll, no autoplay/dots/section schema.
 *
 * Also drives the quick-add buttons' loading spinner - product-form.js's add-to-cart flow does
 * NOT disable the button while the request is in flight (only on a quantity-limit error), so
 * there's no built-in hook to style off of. This adds its own class on click, cleared on the
 * next cart update instead.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} track
 * @property {HTMLButtonElement} prevButton
 * @property {HTMLButtonElement} nextButton
 *
 * @extends {Component<Refs>}
 */
class CartCrossSellCarousel extends Component {
  connectedCallback() {
    super.connectedCallback();
    const { track } = this.refs;
    if (!track) return;

    track.addEventListener('scroll', this.#updateButtonStates, { passive: true });

    // track.scrollWidth is wrong (too small) until the <img>s inside it finish loading, so a
    // plain call here on connect can disable the wrong button until the next scroll. `load`
    // doesn't bubble, but it does fire in the capture phase, so this still catches it from an
    // ancestor without needing a listener on every <img>.
    track.addEventListener('load', this.#updateButtonStates, { capture: true, passive: true });
    this.#updateButtonStates();

    this.addEventListener('click', this.#handleAddClick, { capture: true });
    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    const { track } = this.refs;
    track?.removeEventListener('scroll', this.#updateButtonStates);
    track?.removeEventListener('load', this.#updateButtonStates, { capture: true });
    this.removeEventListener('click', this.#handleAddClick, { capture: true });
    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
  }

  /**
   * @param {PointerEvent} event
   */
  #handleAddClick = (event) => {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest('.quick-add__button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    button.classList.add('cart-cross-sell__add-loading');
    setTimeout(() => button.classList.remove('cart-cross-sell__add-loading'), LOADING_FALLBACK_TIMEOUT);
  };

  /**
   * morphSection re-patches this element's markup from the server's fresh HTML after any cart
   * change, which doesn't know about the runtime-only "disabled"/loading state JS was managing,
   * so both need recomputing here instead of just once on connect.
   */
  #handleCartUpdate = () => {
    this.querySelectorAll('.cart-cross-sell__add-loading').forEach((button) => {
      button.classList.remove('cart-cross-sell__add-loading');
    });
    this.#updateButtonStates();
  };

  /**
   * Scrolls the track one "page" to the left.
   */
  scrollPrev() {
    this.#scrollBy(-1);
  }

  /**
   * Scrolls the track one "page" to the right.
   */
  scrollNext() {
    this.#scrollBy(1);
  }

  /**
   * @param {number} direction - -1 for previous, 1 for next.
   */
  #scrollBy(direction) {
    const { track } = this.refs;
    if (!track) return;

    const amount = track.clientWidth * 0.9 * direction;
    track.scrollBy({ left: amount, behavior: 'smooth' });
  }

  /**
   * Disables prev/next when the track is already scrolled all the way to that end, so the
   * button fades to the "can't click this" color instead of always looking the same.
   */
  #updateButtonStates = () => {
    const { track, prevButton, nextButton } = this.refs;
    if (!track) return;

    const maxScrollLeft = track.scrollWidth - track.clientWidth;

    if (prevButton) prevButton.disabled = track.scrollLeft <= 1;
    if (nextButton) nextButton.disabled = track.scrollLeft >= maxScrollLeft - 1;
  };
}

if (!customElements.get('cart-cross-sell-carousel')) {
  customElements.define('cart-cross-sell-carousel', CartCrossSellCarousel);
}
