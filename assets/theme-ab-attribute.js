/**
 * Stamps the theme the customer is being served onto their cart, as the `_theme_ab` cart
 * attribute, so that Shopify Flow can turn it into an order tag.
 *
 * Rollouts serves one of two themes per customer but does not expose which one as a data point,
 * and a theme cannot tag an order itself, so the theme id has to travel with the cart: it reaches
 * the order as a custom attribute, and a Flow on "Order created" reads it and adds the tag.
 *
 * The id is stamped rather than the name because theme names get edited and Flow conditions match
 * on the exact string; the mapping from id to "Theme A" / "Theme B" lives in the Flow.
 *
 * First write wins, so the attribute records the theme the cart was actually built on: a customer
 * who is later served the other theme does not rewrite the history of their own cart.
 *
 * Orders that never go through the storefront — draft orders, subscription renewals, POS — carry
 * no attribute at all, so the Flow needs a branch for that.
 */
(function () {
  var ATTRIBUTE = '_theme_ab';

  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  }

  function stamp() {
    var theme = window.Shopify && window.Shopify.theme;
    var themeId = theme && theme.id;

    if (!themeId) return;

    fetch(root() + 'cart.js', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (cart) {
        if (!cart || (cart.attributes && cart.attributes[ATTRIBUTE])) return null;

        var attributes = {};
        attributes[ATTRIBUTE] = String(themeId);

        return fetch(root() + 'cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ attributes: attributes }),
        });
      })
      .catch(function () {
        // A missing tag is not worth breaking the page over.
      });
  }

  // Stamped on page load rather than on add to cart: the accelerated checkout buttons on a product
  // page skip the cart entirely, so the attribute has to already be there when one is clicked.
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(stamp, { timeout: 2000 });
  } else {
    window.setTimeout(stamp, 0);
  }
})();
