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
  