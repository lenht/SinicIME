/*!
 * Minimal menu toggle — the site's only dropdown is the input-mode picker
 * in the header. This ~40-line vanilla implementation replaces what used
 * to be Bootstrap 3's dropdown.js plugin (see git history); it was already
 * a custom replacement, this pass just renames the Bootstrap-era class
 * names (.dropup/.dropdown/.dropdown-menu/data-toggle="dropdown") to a
 * plain, self-descriptive .menu system, and adds the two accessibility
 * hooks the old version was missing: aria-expanded on the trigger, and
 * focus returning to the trigger on Escape.
 *
 * Markup contract:
 *   <div class="menu">
 *     <button class="menu-toggle" data-toggle="menu" aria-expanded="false">...</button>
 *     <ul class="menu-panel">...</ul>
 *   </div>
 * Clicking the toggle opens/closes its panel by toggling `.is-open` on the
 * parent `.menu`; clicking anywhere else, or Escape, closes any open menu.
 * The toggle is a real <button>, so Enter/Space activation is native and
 * needs no extra keydown handling here.
 */
(function () {
    "use strict";

    function setExpanded(toggle, expanded) {
        if (toggle) toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    function closeAllMenus(except) {
        document.querySelectorAll(".menu.is-open").forEach(function (el) {
            if (el !== except) {
                el.classList.remove("is-open");
                setExpanded(el.querySelector('[data-toggle="menu"]'), false);
            }
        });
    }

    document.addEventListener("click", function (evt) {
        var toggle = evt.target.closest('[data-toggle="menu"]');

        if (toggle) {
            var parent = toggle.closest(".menu");
            if (!parent) return;

            var isOpen = parent.classList.contains("is-open");
            closeAllMenus(parent);
            parent.classList.toggle("is-open", !isOpen);
            setExpanded(toggle, !isOpen);

            evt.preventDefault();
            evt.stopPropagation();
            return;
        }

        // Click outside any toggle: close open menus (unless the click
        // was inside the open panel itself, e.g. selecting an item).
        if (!evt.target.closest(".menu-panel")) {
            closeAllMenus();
        }
    });

    document.addEventListener("keydown", function (evt) {
        if (evt.key === "Escape") {
            var openToggle = document.querySelector('.menu.is-open [data-toggle="menu"]');
            closeAllMenus();
            if (openToggle) openToggle.focus();
        }
    });
})();
