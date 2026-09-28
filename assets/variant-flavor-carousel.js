import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';

/**
 * @typedef {object} FlavorCarouselRefs
 * @property {HTMLElement} [carousel] - The swiper container.
 * @property {HTMLElement} [arrows] - The wrapper around the previous/next buttons.
 * @property {HTMLButtonElement} [previous] - The previous button.
 * @property {HTMLButtonElement} [next] - The next button.
 */

/**
 * Turns the flavor option of the variant picker into a Swiper carousel.
 *
 * The options themselves are plain radio inputs rendered by the variant picker, so selection,
 * combined listing navigation and unavailable states keep being handled by `variant-picker.js`.
 * Swiper (loaded globally in `snippets/scripts.liquid`) only handles the sliding.
 *
 * Selecting a variant re-renders the section, which wipes the classes and inline styles Swiper
 * relies on, so the carousel is rebuilt whenever that happens: `variant:update` covers a variant
 * of the same product, `data-selected-value` covers a combined listing loading another product.
 *
 * @extends Component<FlavorCarouselRefs>
 */
class FlavorCarousel extends Component {
  static observedAttributes = ['data-selected-value'];

  /** @type {any} */
  #swiper = null;

  /** @type {number | null} */
  #rebuildFrame = null;

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdate);
    this.#init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdate);
    if (this.#rebuildFrame) cancelAnimationFrame(this.#rebuildFrame);
    this.#destroy();
  }

  /**
   * @param {string} name - The name of the attribute.
   * @param {string | null} oldValue - The previous value.
   * @param {string | null} newValue - The new value.
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name !== 'data-selected-value' || oldValue === null || oldValue === newValue) return;

    this.#rebuild();
  }

  /**
   * Rebuilds the carousel when a variant of this product was selected.
   *
   * @param {Event} event - The variant update event.
   */
  #onVariantUpdate = (event) => {
    if (!(event.target instanceof Node) || !event.target.contains(this)) return;

    this.#rebuild();
  };

  #init() {
    const { carousel, previous, next } = this.refs;

    if (!carousel || this.#swiper) return;

    const Swiper = /** @type {any} */ (window).Swiper;

    if (!Swiper) {
      window.addEventListener('load', () => this.#init(), { once: true });
      return;
    }

    this.#swiper = new Swiper(carousel, {
      slidesPerView: 'auto',
      slidesPerGroupAuto: true,
      spaceBetween: 16,
      watchOverflow: true,
      // the picker is re-rendered on every variant change, so re-measure when that happens
      observer: true,
      observeParents: true,
      initialSlide: this.#initialSlide,
      navigation: {
        prevEl: previous,
        nextEl: next,
        disabledClass: 'flavor-carousel__arrow--disabled',
        lockClass: 'flavor-carousel__arrow--locked',
      },
      breakpoints: {
        750: {
          spaceBetween: 8,
        },
      },
    });
  }

  /**
   * The slide the carousel starts on, keeping the current position on a rebuild.
   *
   * @returns {number} The index of the slide.
   */
  get #initialSlide() {
    const activeIndex = this.#swiper?.activeIndex;

    if (typeof activeIndex === 'number') return activeIndex;

    return Number(this.dataset.initialSlide) || 0;
  }

  /**
   * Rebuilds the carousel on the next frame, once the section has finished re-rendering.
   */
  #rebuild() {
    if (this.#rebuildFrame) cancelAnimationFrame(this.#rebuildFrame);

    this.#rebuildFrame = requestAnimationFrame(() => {
      this.#rebuildFrame = null;

      const initialSlide = this.#initialSlide;

      this.#destroy();
      this.dataset.initialSlide = String(initialSlide);
      this.#init();
    });
  }

  #destroy() {
    try {
      this.#swiper?.destroy(true, true);
    } catch {
      // Swiper throws when its markup was already replaced, which is safe to ignore.
    }

    this.#swiper = null;
  }
}

if (!customElements.get('flavor-carousel')) {
  customElements.define('flavor-carousel', FlavorCarousel);
}
