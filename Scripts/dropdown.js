/*!
 * Minimal dropdown toggle — replaces Bootstrap 3's dropdown.js plugin.
 * This site only uses the `data-toggle="dropdown"` component from
 * bootstrap.js (no modal, tab, carousel, tooltip, popover, collapse,
 * scrollspy, affix, alert, or button plugins), so this ~30-line vanilla
 * implementation replaces the full 60KB bootstrap.js bundle.
 *
 * Behavior matches Bootstrap 3's dropdown.js for this markup pattern:
 *   <li class="dropup"> (or .dropdown)
 *     <a class="dropdown-toggle" data-toggle="dropdown">...</a>
 *     <ul class="dropdown-menu">...</ul>
 *   </li>
 * Clicking the toggle opens/closes its menu by toggling `.open` on the
 * parent element; clicking anywhere else closes any open menu.
 */
(function () {
    "use strict";

    function closeAllDropdowns(except) {
        document.querySelectorAll(".dropup.open, .dropdown.open").forEach(function (el) {
            if (el !== except) {
                el.classList.remove("open");
            }
        });
    }

    document.addEventListener("click", function (evt) {
        var toggle = evt.target.closest('[data-toggle="dropdown"]');

        if (toggle) {
            var parent = toggle.closest(".dropup, .dropdown");
            if (!parent) return;

            var isOpen = parent.classList.contains("open");
            closeAllDropdowns(parent);
            parent.classList.toggle("open", !isOpen);

            evt.preventDefault();
            evt.stopPropagation();
            return;
        }

        // Click outside any toggle: close open menus (unless the click
        // was inside the open menu itself, e.g. selecting an item).
        if (!evt.target.closest(".dropdown-menu")) {
            closeAllDropdowns();
        }
    });

    document.addEventListener("keydown", function (evt) {
        if (evt.key === "Escape") {
            closeAllDropdowns();
        }
    });
})();
