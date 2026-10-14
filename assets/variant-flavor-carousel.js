import { Component } from '@theme/component';

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
 * Selecting a variant or another product of a combined listing morphs the picker (or the whole
 * main content), which wipes the classes and inline styles Swiper relies on, including the
 * `swiper-initialized` class `.swiper` needs to be visible (see `assets/custom.css`). Rather than
 * relying on the event that caused it, the carousel watches its own markup and rebuilds itself
 * whenever Swiper is no longer mounted on it.
 *
 * @extends Component<FlavorCarouselRefs>
 */
class FlavorCarousel extends Component {
  /** @type {any} */
  #swiper = null;

  /** @type {number | null} */
  #rebuildFrame = null;

  #markupObserver = new MutationObserver((mutations) => {
    const markupChanged = mutations.some(
      (mutation) => mutation.type === 'childList' || mutation.target === this.#carousel
    );

    if (markupChanged) this.#rebuild();
  });

  connectedCallback() {
    super.connectedCallback();

    this.#init();
    this.#markupObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#markupObserver.disconnect();
    if (this.#rebuildFrame) cancelAnimationFrame(this.#rebuildFrame);
    this.#destroy();
  }

  /**
   * The swiper container, queried directly since `refs` are only refreshed asynchronously after a morph.
   *
   * @returns {HTMLElement | null} The swiper container.
   */
  get #carousel() {
    return this.querySelector('[ref="carousel"]');
  }

  /**
   * Whether Swiper is still mounted on the current swiper container.
   *
   * @returns {boolean}
   */
  get #isMounted() {
    const carousel = this.#carousel;

    return Boolean(this.#swiper && this.#swiper.el === carousel && carousel?.classList.contains('swiper-initialized'));
  }

  #init() {
    const carousel = this.#carousel;

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
        prevEl: this.querySelector('[ref="previous"]'),
        nextEl: this.querySelector('[ref="next"]'),
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
   * Rebuilds the carousel on the next frame, once the markup has finished re-rendering, unless
   * Swiper is still mounted on it.
   */
  #rebuild() {
    if (this.#rebuildFrame) cancelAnimationFrame(this.#rebuildFrame);

    this.#rebuildFrame = requestAnimationFrame(() => {
      this.#rebuildFrame = null;

      if (this.#isMounted || !(/** @type {any} */ (window).Swiper)) return;

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
