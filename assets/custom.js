// Toggle Rebuy's Custom Cart
document.querySelector('.header-actions__cart-icon').addEventListener('click', function(e) {
    e.preventDefault();
    Rebuy.SmartCart.show();
});

// Custom EBD Mobile Menu Open
document.querySelector('.menu-drawer-toggle').addEventListener('click', function(e) {
  e.preventDefault();
  document.querySelector('.mobile-menu-drawer').classList.toggle('show');
  document.body.style.overflow = 'hidden';
});

// Custom EBD Mobile Menu Close
document.querySelector('.mobile-menu-close').addEventListener('click', function(e) {
  e.preventDefault();
  document.querySelector('.mobile-menu-drawer').classList.remove('show');
  document.body.style.overflow = 'auto';
});

// Custom EBD Mobile Menu Dropdowns
  document.querySelectorAll('.mobile-menu-link.has-children').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      link.classList.toggle('closed');
      const submenu = link.nextElementSibling;
      if (submenu && submenu.classList.contains('mobile-menu-submenu')) {
        submenu.classList.toggle('show');
      }
    });
  });

// A11y fix: the Alia promotional popup (scratch-off) doesn't restore keyboard
// focus to the page once it closes, leaving Tab non-functional for keyboard
// users. Alia is a third-party app we can't patch directly, so this watches
// for its dialog closing and resets focus to a safe point. Remove once Alia
// ships a native fix.
(() => {
  const ALIA_MODAL_SELECTOR = '[role="dialog"][aria-label="Promotional popup"]';

  /** @param {Element | null} el */
  const isVisible = (el) => !!el && el.getClientRects().length > 0;

  let modalWasOpen = false;
  let checkScheduled = false;

  function restoreFocus() {
    // document.body isn't focusable by default; toggling tabindex lets us
    // programmatically focus it just long enough to reset the browser's
    // sequential focus navigation starting point back to the top of the page.
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
  }

  function checkAliaModalState() {
    checkScheduled = false;
    const modalIsOpen = isVisible(document.querySelector(ALIA_MODAL_SELECTOR));

    if (modalWasOpen && !modalIsOpen) {
      restoreFocus();
    }

    modalWasOpen = modalIsOpen;
  }

  function scheduleCheck() {
    if (checkScheduled) return;
    checkScheduled = true;
    requestAnimationFrame(checkAliaModalState);
  }

  const aliaModalObserver = new MutationObserver(scheduleCheck);
  aliaModalObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
})();
