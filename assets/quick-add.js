import { morph } from '@theme/morph';
import { Component } from '@theme/component';
import { CartUpdateEvent, ThemeEvents } from '@theme/events';
import { DialogComponent, DialogCloseEvent } from '@theme/dialog';
import { mediaQueryLarge, isMobileBreakpoint, getIOSVersion } from '@theme/utilities';

export class QuickAddComponent extends Component {
  /** @type {AbortController | null} */
  #abortController = null;
  /** @type {Map<string, Element>} */
  #cachedContent = new Map();

  get productPageUrl() {
    const productCard = /** @type {import('./product-card').ProductCard | null} */ (this.closest('product-card'));
    const productLink = productCard?.getProductCardLink();

    if (!productLink?.href) return '';

    const url = new URL(productLink.href);

    if (url.searchParams.has('variant')) {
      return url.toString();
    }

    const selectedVariantId = this.#getSelectedVariantId();
    if (selectedVariantId) {
      url.searchParams.set('variant', selectedVariantId);
    }

    return url.toString();
  }

  /**
   * Gets the currently selected variant ID from the product card
   * @returns {string | null} The variant ID or null
   */
  #getSelectedVariantId() {
    const productCard = /** @type {import('./product-card').ProductCard | null} */ (this.closest('product-card'));
    return productCard?.getSelectedVariantId() || null;
  }

  connectedCallback() {
    super.connectedCallback();

    mediaQueryLarge.addEventListener('change', this.#closeQuickAddModal);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    mediaQueryLarge.removeEventListener('change', this.#closeQuickAddModal);
    this.#abortController?.abort();
  }

  /**
   * Handles quick add button click
   * @param {Event} event - The click event
   */
  // handleClick = async (event) => {
  //   event.preventDefault();

  //   const currentUrl = this.productPageUrl;

  //   // Check if we have cached content for this URL
  //   let productGrid = this.#cachedContent.get(currentUrl);

  //   if (!productGrid) {
  //     // Fetch and cache the content
  //     // const html = await this.fetchProductPage(currentUrl);
  //     const html = await this.fetchProductPage(currentUrl).catch(() => null);
  //     if (html) {
  //       const gridElement = html.querySelector('[data-product-grid-content]');
  //       if (gridElement) {
  //         // Cache the cloned element to avoid modifying the original
  //         productGrid = /** @type {Element} */ (gridElement.cloneNode(true));
  //         this.#cachedContent.set(currentUrl, productGrid);
  //       }
  //     }
  //   }

  //   if (productGrid) {
  //     // Use a fresh clone from the cache
  //     const freshContent = /** @type {Element} */ (productGrid.cloneNode(true));
  //     await this.updateQuickAddModal(freshContent);
  //   }

  //   this.#openQuickAddModal();
  // };
  handleClick = async (event) => {
    event.preventDefault();

    const currentUrl = this.productPageUrl;

    let productGrid = this.#cachedContent.get(currentUrl);

    if (!productGrid) {
      const html = await this.fetchProductPage(currentUrl, { cancellable: false });
      const gridElement = html?.querySelector('[data-product-grid-content]');
      if (gridElement) {
        productGrid = /** @type {Element} */ (gridElement.cloneNode(true));
        this.#cachedContent.set(currentUrl, productGrid);
      }
    }

    if (!productGrid) {
      console.warn('[quick-add] No product grid content found for', currentUrl);
      return;
    }

    const freshContent = /** @type {Element} */ (productGrid.cloneNode(true));
    await this.updateQuickAddModal(freshContent);

    // Add the prefetched variant straight to the cart instead of opening the modal.
    this.#submitHiddenProductForm();
  };

  /**
   * Submits the product form rendered into the hidden modal container.
   * Reusing the theme's own form keeps cart section rendering and error handling intact.
   */
  #submitHiddenProductForm() {
    const modalContent = document.getElementById('quick-add-modal-content');
    const submitButton = /** @type {HTMLButtonElement | null} */ (
      modalContent?.querySelector('product-form-component button[type="submit"]:not([disabled])')
    );

    if (!submitButton) {
      console.warn('[quick-add] No enabled submit button found; opening the modal instead.');
      this.#openQuickAddModal();
      return;
    }

    submitButton.click();
  }

  /** @param {QuickAddDialog} dialogComponent */
  #stayVisibleUntilDialogCloses(dialogComponent) {
    this.toggleAttribute('stay-visible', true);

    dialogComponent.addEventListener(DialogCloseEvent.eventName, () => this.toggleAttribute('stay-visible', false), {
      once: true,
    });
  }

  #openQuickAddModal = () => {
    const dialogComponent = document.getElementById('quick-add-dialog');
    if (!(dialogComponent instanceof QuickAddDialog)) return;

    this.#stayVisibleUntilDialogCloses(dialogComponent);

    dialogComponent.showDialog();
  };

  #closeQuickAddModal = () => {
    const dialogComponent = document.getElementById('quick-add-dialog');
    if (!(dialogComponent instanceof QuickAddDialog)) return;

    dialogComponent.closeDialog();
  };

  /**
   * Fetches the product page content
   * @param {string} productPageUrl - The URL of the product page to fetch
   * @returns {Promise<Document | null>}
   */
  // async fetchProductPage(productPageUrl) {
  //   if (!productPageUrl) return null;

  //   // We use this to abort the previous fetch request if it's still pending.
  //   this.#abortController?.abort();
  //   this.#abortController = new AbortController();

  //   try {
  //     const response = await fetch(productPageUrl, {
  //       signal: this.#abortController.signal,
  //     });

  //     if (!response.ok) {
  //       throw new Error(`Failed to fetch product page: HTTP error ${response.status}`);
  //     }

  //     const responseText = await response.text();
  //     const html = new DOMParser().parseFromString(responseText, 'text/html');

  //     return html;
  //   } catch (error) {
  //     if (error.name === 'AbortError') {
  //       return null;
  //     } else {
  //       throw error;
  //     }
  //   } finally {
  //     this.#abortController = null;
  //   }
  // }

  /** @type {Map<string, Promise<Document | null>>} */
  #inflight = new Map();

  /**
   * Fetches the product page content
   * @param {string} productPageUrl - The URL of the product page to fetch
   * @returns {Promise<Document | null>}
   */
  async fetchProductPage(productPageUrl) {
    if (!productPageUrl) return null;

    // Reuse the in-flight request for the same URL instead of aborting it.
    const pending = this.#inflight.get(productPageUrl);
    if (pending) return pending;

    // Only abort requests pointing at a different URL.
    this.#abortController?.abort();

    const controller = new AbortController();
    this.#abortController = controller;

    const request = (async () => {
      try {
        const response = await fetch(productPageUrl, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`Failed to fetch product page: HTTP error ${response.status}`);
        }

        return new DOMParser().parseFromString(await response.text(), 'text/html');
      } catch (error) {
        // Treat any cancellation as silent, regardless of which fetch wrapper produced it.
        if (controller.signal.aborted || error?.name === 'AbortError') return null;
        throw error;
      } finally {
        this.#inflight.delete(productPageUrl);
        // Do not clear a controller that belongs to a newer request.
        if (this.#abortController === controller) this.#abortController = null;
      }
    })();

    this.#inflight.set(productPageUrl, request);
    return request;
  }

  /**
   * Re-renders the variant picker.
   * @param {Element} productGrid - The product grid element
   */
  async updateQuickAddModal(productGrid) {
    const modalContent = document.getElementById('quick-add-modal-content');

    if (!productGrid || !modalContent) return;

    if (isMobileBreakpoint()) {
      const productDetails = productGrid.querySelector('.product-details');
      const productFormComponent = productGrid.querySelector('product-form-component');
      const variantPicker = productGrid.querySelector('variant-picker');
      const productPrice = productGrid.querySelector('product-price');
      const productTitle = document.createElement('a');
      productTitle.textContent = this.dataset.productTitle || '';

      // Make product title as a link to the product page
      productTitle.href = this.productPageUrl;

      const productHeader = document.createElement('div');
      productHeader.classList.add('product-header');

      productHeader.appendChild(productTitle);
      if (productPrice) {
        productHeader.appendChild(productPrice);
      }
      productGrid.appendChild(productHeader);

      if (variantPicker) {
        productGrid.appendChild(variantPicker);
      }
      if (productFormComponent) {
        productGrid.appendChild(productFormComponent);
      }

      productDetails?.remove();
    }

    morph(modalContent, productGrid);

    this.#syncVariantSelection(modalContent);
  }

  /**
   * Syncs the variant selection from the product card to the modal
   * @param {Element} modalContent - The modal content element
   */
  #syncVariantSelection(modalContent) {
    const selectedVariantId = this.#getSelectedVariantId();
    if (!selectedVariantId) return;

    // Find and check the corresponding input in the modal
    const modalInputs = modalContent.querySelectorAll('input[type="radio"][data-variant-id]');
    for (const input of modalInputs) {
      if (input instanceof HTMLInputElement && input.dataset.variantId === selectedVariantId && !input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }
}

if (!customElements.get('quick-add-component')) {
  customElements.define('quick-add-component', QuickAddComponent);
}

class QuickAddDialog extends DialogComponent {
  #abortController = new AbortController();

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener(ThemeEvents.cartUpdate, this.handleCartUpdate, { signal: this.#abortController.signal });
    this.addEventListener(ThemeEvents.variantUpdate, this.#updateProductTitleLink);

    this.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
    this.removeEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);
  }

  /**
   * Closes the dialog
   * @param {CartUpdateEvent} event - The cart update event
   */
  handleCartUpdate = (event) => {
    if (event.detail.data.didError) return;
    this.closeDialog();
  };

  #updateProductTitleLink = (/** @type {CustomEvent} */ event) => {
    const anchorElement = /** @type {HTMLAnchorElement} */ (
      event.detail.data.html?.querySelector('.view-product-title a')
    );
    const viewMoreDetailsLink = /** @type {HTMLAnchorElement} */ (this.querySelector('.view-product-title a'));
    const mobileProductTitle = /** @type {HTMLAnchorElement} */ (this.querySelector('.product-header a'));

    if (!anchorElement) return;

    if (viewMoreDetailsLink) viewMoreDetailsLink.href = anchorElement.href;
    if (mobileProductTitle) mobileProductTitle.href = anchorElement.href;
  };

  #handleDialogClose = () => {
    const iosVersion = getIOSVersion();
    /**
     * This is a patch to solve an issue with the UI freezing when the dialog is closed.
     * To reproduce it, use iOS 16.0.
     */
    if (!iosVersion || iosVersion.major >= 17 || (iosVersion.major === 16 && iosVersion.minor >= 4)) return;

    requestAnimationFrame(() => {
      /** @type {HTMLElement | null} */
      const grid = document.querySelector('#ResultsList [product-grid-view]');
      if (grid) {
        const currentWidth = grid.getBoundingClientRect().width;
        grid.style.width = `${currentWidth - 1}px`;
        requestAnimationFrame(() => {
          grid.style.width = '';
        });
      }
    });
  };
}

if (!customElements.get('quick-add-dialog')) {
  customElements.define('quick-add-dialog', QuickAddDialog);
}
