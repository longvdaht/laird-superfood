(function initRCWidget() {
  const BULLET_COLOR = '#4caf79';

  function patch() {
    const widget = document.querySelector('recharge-subscription-widget');
    if (!widget?.shadowRoot) return false;

    // --- Benefits: bullet colour ---
    const benefits = widget.shadowRoot.querySelector('rc-benefits');
    if (!benefits?.shadowRoot) return false;

    const items = benefits.shadowRoot.querySelectorAll('li');
    if (!items.length) return false;

    if (!benefits.shadowRoot.querySelector('#rc-bullet-override')) {
      const style = document.createElement('style');
      style.id = 'rc-bullet-override';
      style.textContent = `li::before { background-color: ${BULLET_COLOR} !important; }`;
      benefits.shadowRoot.appendChild(style);
    }

    // --- Inject shadow DOM style overrides ---
    if (!widget.shadowRoot.querySelector('#rc-widget-overrides')) {
      const style = document.createElement('style');
      style.id = 'rc-widget-overrides';
      style.textContent = `
        .rc-selection__onetime,
        .rc-purchase-option__onetime {
          display: none !important;
        }
      `;
      widget.shadowRoot.appendChild(style);
    }

    // --- Badge text ---
    const badge = widget.shadowRoot.querySelector('#rc-subscription-badge');
    if (badge) {
      const textNode = [...badge.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = 'Save 20%';
    }

    return true;
  }

  // Sync the selected variant to the Recharge widget + product form whenever
  // the theme fires its custom variant:changed event (triggered by flavor card clicks)
  function syncVariant(variantId) {
    // 1. Update Recharge widget attribute so subscription purchases use the right variant
    const widget = document.querySelector('recharge-subscription-widget');
    if (widget) widget.setAttribute('default-variant-id', variantId);

    // 2. Update the variant input in the Shopify product form (light DOM, class="shopify-product-form")
    const variantInput = document.querySelector(
      'form.shopify-product-form input[name="id"], ' +
      'form[data-type="add-to-cart-form"] input[name="id"]'
    );
    if (variantInput) {
      variantInput.value = variantId;
      variantInput.dispatchEvent(new Event('change', { bubbles: true }));
      variantInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  document.addEventListener('variant:changed', function (e) {
    const variantId = e.detail?.variantId;
    if (variantId) syncVariant(variantId);
  });

  const interval = setInterval(() => {
    if (patch()) clearInterval(interval);
  }, 100);

  setTimeout(() => clearInterval(interval), 10000);
})();
