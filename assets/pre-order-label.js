/**
 * Keeps the pre-order label on the add to cart button.
 *
 * The Recharge subscription widget rewrites the button text after the page renders, so the label
 * Liquid put there does not survive on its own. This watches a pre-order button and puts the
 * label back whenever something replaces it.
 *
 * Only pre-order buttons are watched — `snippets/add-to-cart-button.liquid` marks them with
 * `data-pre-order` and loads this script — so nothing here touches an ordinary product.
 *
 * A price suffix is kept: `sections/new-product-information.liquid` appends ` - $12.34` to the
 * label on the Mahalo templates, and only the words in front of it are restored.
 */
(function () {
  if (window.__preOrderLabelWatcher) return;
  window.__preOrderLabelWatcher = true;

  var SELECTOR = '.add-to-cart-text__content[data-pre-order="true"]';
  var SUFFIX = /\s+-\s+\S.*$/;

  function restore(element) {
    var wanted = element.dataset.baseLabel;
    if (!wanted) return;

    var current = element.textContent.trim();
    if (current === wanted) return;

    var suffix = current.match(SUFFIX);
    var next = suffix ? wanted + suffix[0] : wanted;
    if (current === next) return;

    element.textContent = next;
  }

  var scheduled = false;

  function restoreAll() {
    scheduled = false;
    var elements = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < elements.length; i++) restore(elements[i]);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(restoreAll);
  }

  restoreAll();

  // The widget can rewrite the button long after load, and again on every interaction with it, so
  // the observer stays for the life of the page rather than for a fixed window.
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
})();
