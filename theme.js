// Light / dark theme switch.
// The chosen theme is saved in the browser, so it is remembered the next time the site opens.
(function () {
  var STORAGE_KEY = "theme";
  var root = document.documentElement;

  // Read the saved theme (returns null if nothing is saved or the browser blocks storage)
  function getSavedTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      return saved === "dark" || saved === "light" ? saved : null;
    } catch (error) {
      return null;
    }
  }

  // If nothing is saved, follow the device setting (dark mode on the phone or computer)
  function getSystemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  // Mark the button of the current theme as selected
  function updateButtons(theme) {
    var buttons = document.querySelectorAll("[data-theme-choice]");
    buttons.forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-theme-choice") === theme ? "true" : "false");
    });
  }

  // Apply a theme to the page. This file loads in the <head>, so the theme is set
  // before the page is drawn and there is no flash of the wrong colors.
  function applyTheme(theme, save) {
    root.setAttribute("data-theme", theme);
    updateButtons(theme);
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (error) {
        // Storage is blocked: the theme still changes, it just will not be remembered
      }
      // Tell charts.js to redraw the chart with the new colors
      window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
    }
  }

  applyTheme(getSavedTheme() || getSystemTheme(), false);

  // Connect the Light / Dark buttons once the page is loaded
  document.addEventListener("DOMContentLoaded", function () {
    updateButtons(root.getAttribute("data-theme"));
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyTheme(button.getAttribute("data-theme-choice"), true);
      });
    });
    // Single button in the top bar that switches between light and dark
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
      });
    });
  });
})();
