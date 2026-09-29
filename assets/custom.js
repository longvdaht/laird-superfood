// Cart Rebuild: Rebuy can call Rebuy.SmartCart.show() on its own (from its own admin config, not
// this theme) to pop its old cart open. Locking `.show` on whatever `Rebuy.SmartCart` object
// happens to exist when this runs isn't enough - Rebuy builds SmartCart with Vue, and Vue replaces
// `Rebuy.SmartCart` with a brand new observed instance once it finishes mounting, discarding
// whichever object we locked earlier. So instead this traps the `SmartCart` property itself:
// whatever object Rebuy assigns to `Rebuy.SmartCart`, at any point, gets its `.show` neutralized
// immediately as it comes in.
(function neutralizeRebuySmartCart() {
  function lockShow(instance) {
    if (!instance || typeof instance !== "object") return;
    try {
      Object.defineProperty(instance, "show", {
        configurable: false,
        get: function () {
          return function () {};
        },
        set: function () {},
      });
    } catch (e) {
      // already locked (or locked by something else) - ignore
    }
  }

  function trapSmartCart(rebuy) {
    var current;
    try {
      Object.defineProperty(rebuy, "SmartCart", {
        configurable: false,
        get: function () {
          return current;
        },
        set: function (value) {
          current = value;
          lockShow(value);
        },
      });
    } catch (e) {
      if (rebuy.SmartCart) lockShow(rebuy.SmartCart);
    }
  }

  if (typeof Rebuy !== "undefined") {
    trapSmartCart(Rebuy);
    return;
  }

  var attempts = 0;
  var interval = setInterval(function () {
    attempts += 1;
    if (typeof Rebuy !== "undefined") {
      trapSmartCart(Rebuy);
      clearInterval(interval);
    } else if (attempts > 100) {
      // give up after ~10s
      clearInterval(interval);
    }
  }, 100);
})();

// Custom EBD Mobile Menu Open
document
  .querySelector(".menu-drawer-toggle")
  .addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelector(".mobile-menu-drawer").classList.toggle("show");
    document.body.style.overflow = "hidden";
  });

// Custom EBD Mobile Menu Close
document
  .querySelector(".mobile-menu-close")
  .addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelector(".mobile-menu-drawer").classList.remove("show");
    document.body.style.overflow = "auto";
  });

// Custom EBD Mobile Menu Dropdowns
document.querySelectorAll(".mobile-menu-link.has-children").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    link.classList.toggle("closed");
    const submenu = link.nextElementSibling;
    if (submenu && submenu.classList.contains("mobile-menu-submenu")) {
      submenu.classList.toggle("show");
    }
  });
});
