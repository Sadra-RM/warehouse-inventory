// Shared interface helpers: icons, formatting, toasts, dialogs, navigation and the sidebar.
(function () {
  var CATEGORY_COLORS = ["#2563eb", "#0d9488", "#f59e0b", "#6366f1", "#e11d48", "#64748b", "#0891b2", "#84cc16"];
  var categoryOrder = [];

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function icon(name, extraClass) {
    return '<i data-lucide="' + name + '" class="icon' + (extraClass ? " " + extraClass : "") + '" aria-hidden="true"></i>';
  }

  // Lucide swaps every <i data-lucide> placeholder for its SVG icon
  function refreshIcons(root) {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons({ attrs: { "stroke-width": 1.9 }, root: root || document });
    }
  }

  function number(value, digits) {
    if (value === undefined || value === null || isNaN(value)) return "—";
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits === undefined ? 0 : digits });
  }

  function currency(value) {
    if (value === undefined || value === null || isNaN(value)) return "—";
    return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }

  function compact(value) {
    return Number(value).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
  }

  function timeAgo(time) {
    var seconds = Math.round((Date.now() - time) / 1000);
    if (seconds < 45) return "Just now";
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + " min ago";
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + " h ago";
    var days = Math.round(hours / 24);
    if (days < 7) return days + " d ago";
    return new Date(time).toLocaleDateString();
  }

  function categoryColor(category) {
    if (categoryOrder.length === 0 && window.Inventory) categoryOrder = window.Inventory.unique("category");
    var index = categoryOrder.indexOf(category);
    if (index === -1) {
      categoryOrder.push(category);
      index = categoryOrder.length - 1;
    }
    return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
  }

  function statusBadge(status) {
    var label = window.Inventory.statusLabel(status);
    return '<span class="badge badge-' + status + '"><span class="badge-dot" aria-hidden="true"></span>' + esc(label) + "</span>";
  }

  // ---------- Toasts ----------
  function toast(message, type) {
    var region = document.getElementById("toastRegion");
    if (!region) return;
    var kind = type || "success";
    var icons = { success: "circle-check", error: "circle-alert", info: "info" };
    var el = document.createElement("div");
    el.className = "toast toast-" + kind;
    el.setAttribute("role", "status");
    el.innerHTML = icon(icons[kind] || "info", "toast-icon") + '<span class="toast-text">' + esc(message) + "</span>" +
      '<button type="button" class="toast-close" aria-label="Dismiss notification">' + icon("x") + "</button>";
    region.appendChild(el);
    refreshIcons(el);
    var remove = function () {
      el.classList.add("leaving");
      setTimeout(function () { el.remove(); }, 200);
    };
    el.querySelector(".toast-close").addEventListener("click", remove);
    setTimeout(remove, 3800);
  }

  // ---------- Dialogs ----------
  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  // Close a dialog when its dark backdrop is clicked
  function enableBackdropClose(dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  function confirmAction(options) {
    var dialog = document.getElementById("confirmDialog");
    document.getElementById("confirmTitle").textContent = options.title || "Are you sure?";
    document.getElementById("confirmMessage").textContent = options.message || "";
    var okButton = document.getElementById("confirmOk");
    okButton.textContent = options.confirmLabel || "Confirm";
    return new Promise(function (resolve) {
      function finish(result) {
        okButton.removeEventListener("click", onOk);
        dialog.removeEventListener("close", onClose);
        resolve(result);
      }
      function onOk() {
        finish(true);
        closeDialog(dialog);
      }
      function onClose() { finish(false); }
      okButton.addEventListener("click", onOk);
      dialog.addEventListener("close", onClose);
      openDialog(dialog);
    });
  }

  // ---------- Navigation ----------
  var VIEWS = ["dashboard", "inventory", "categories", "locations", "alerts", "reports", "settings"];
  var currentView = null;

  function showView(name, options) {
    var view = VIEWS.indexOf(name) === -1 ? "dashboard" : name;
    var changed = view !== currentView;
    currentView = view;
    document.querySelectorAll(".view").forEach(function (section) {
      section.hidden = section.getAttribute("data-view") !== view;
    });
    document.querySelectorAll("[data-nav]").forEach(function (link) {
      var active = link.getAttribute("data-nav") === view;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    closeMobileSidebar();
    if (changed && !(options && options.keepScroll)) {
      var content = document.getElementById("content");
      if (content) content.scrollTop = 0;
      window.scrollTo(0, 0);
    }
    window.dispatchEvent(new CustomEvent("viewchange", { detail: { view: view } }));
  }

  function navigate(name, options) {
    showView(name, options);
  }

  // ---------- Sidebar ----------
  var COLLAPSE_KEY = "sidebar-collapsed";
  var app;

  function isDrawerMode() {
    return window.matchMedia("(max-width: 1023px)").matches;
  }

  function setCollapsed(collapsed) {
    app.classList.toggle("sidebar-collapsed", collapsed);
    var button = document.getElementById("collapseBtn");
    if (button) {
      button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch (error) { /* ignore */ }
    setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 220);
  }

  function openMobileSidebar() {
    app.classList.add("sidebar-open");
    document.getElementById("menuBtn").setAttribute("aria-expanded", "true");
  }

  function closeMobileSidebar() {
    if (!app) return;
    app.classList.remove("sidebar-open");
    var menu = document.getElementById("menuBtn");
    if (menu) menu.setAttribute("aria-expanded", "false");
  }

  // ---------- Notifications ----------
  function renderNotifications() {
    var list = document.getElementById("notifList");
    var dot = document.getElementById("notifDot");
    var countLabel = document.getElementById("notifCount");
    if (!list) return;
    var alerts = window.Inventory.items()
      .filter(function (item) {
        var status = window.Inventory.statusOf(item);
        return status === "low" || status === "out";
      })
      .sort(function (a, b) { return a.stock_level - b.stock_level; });

    dot.hidden = alerts.length === 0;
    countLabel.textContent = alerts.length === 0 ? "All clear" : alerts.length + " need attention";
    document.getElementById("notifBtn").setAttribute(
      "aria-label",
      "Notifications" + (alerts.length ? ", " + alerts.length + " stock alerts" : "")
    );

    if (alerts.length === 0) {
      list.innerHTML = '<li class="notif-empty">' + icon("circle-check") + "<span>No stock alerts right now.</span></li>";
    } else {
      list.innerHTML = alerts.slice(0, 6).map(function (item) {
        var status = window.Inventory.statusOf(item);
        return '<li><button type="button" class="notif-item" data-view-item="' + esc(item.item_id) + '">' +
          '<span class="notif-icon notif-' + status + '">' + icon(status === "out" ? "package-x" : "triangle-alert") + "</span>" +
          '<span class="notif-body"><strong>' + esc(window.Inventory.displayName(item)) + "</strong>" +
          "<span>" + number(item.stock_level) + " units left · reorder at " + number(item.reorder_point) + "</span></span></button></li>";
      }).join("");
    }
    refreshIcons(list);
  }

  function setupPopover(buttonId, panelId) {
    var button = document.getElementById(buttonId);
    var panel = document.getElementById(panelId);
    if (!button || !panel) return;
    function close() {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      var willOpen = panel.hidden;
      document.querySelectorAll(".popover").forEach(function (p) { p.hidden = true; });
      document.querySelectorAll("[data-popover-btn]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
      panel.hidden = !willOpen;
      button.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    panel.addEventListener("click", function (event) { event.stopPropagation(); });
    document.addEventListener("click", close);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) {
        close();
        button.focus();
      }
    });
    return close;
  }

  document.addEventListener("DOMContentLoaded", function () {
    app = document.getElementById("app");

    var dateLabel = document.getElementById("todayDate");
    if (dateLabel) {
      dateLabel.textContent = new Date().toLocaleDateString(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      });
    }

    var collapsed = false;
    try { collapsed = localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (error) { /* ignore */ }
    setCollapsed(collapsed);

    document.getElementById("collapseBtn").addEventListener("click", function () {
      setCollapsed(!app.classList.contains("sidebar-collapsed"));
    });
    document.getElementById("menuBtn").addEventListener("click", function () {
      if (app.classList.contains("sidebar-open")) closeMobileSidebar();
      else openMobileSidebar();
    });
    document.getElementById("sidebarOverlay").addEventListener("click", closeMobileSidebar);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && app.classList.contains("sidebar-open")) closeMobileSidebar();
    });
    window.addEventListener("resize", function () {
      if (!isDrawerMode()) closeMobileSidebar();
    });

    document.querySelectorAll("[data-nav]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        navigate(link.getAttribute("data-nav"));
      });
    });
    document.addEventListener("click", function (event) {
      var target = event.target.closest("[data-goto]");
      if (target) {
        event.preventDefault();
        navigate(target.getAttribute("data-goto"));
      }
    });
    window.addEventListener("hashchange", function () {
      showView(location.hash.replace("#", ""));
    });

    // Top search bar: searching jumps to the inventory list with the same text
    var globalSearch = document.getElementById("globalSearch");
    var globalForm = document.getElementById("globalSearchForm");
    globalForm.addEventListener("submit", function (event) {
      event.preventDefault();
    });
    globalSearch.addEventListener("input", function () {
      window.dispatchEvent(new CustomEvent("globalsearch", { detail: { query: globalSearch.value } }));
      if (currentView !== "inventory") navigate("inventory", { keepScroll: true });
    });
    document.addEventListener("keydown", function (event) {
      var typing = /input|textarea|select/i.test(document.activeElement.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        globalSearch.focus();
      }
    });

    setupPopover("notifBtn", "notifPanel");
    setupPopover("profileBtn", "profilePanel");
    renderNotifications();
    window.addEventListener("inventorychange", renderNotifications);

    document.querySelectorAll("dialog").forEach(enableBackdropClose);
    document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeDialog(button.closest("dialog"));
      });
    });

    refreshIcons();
    showView(location.hash.replace("#", "") || "dashboard");
  });

  window.UI = {
    esc: esc,
    icon: icon,
    refreshIcons: refreshIcons,
    number: number,
    currency: currency,
    compact: compact,
    timeAgo: timeAgo,
    categoryColor: categoryColor,
    statusBadge: statusBadge,
    toast: toast,
    openDialog: openDialog,
    closeDialog: closeDialog,
    confirmAction: confirmAction,
    navigate: navigate,
    currentView: function () { return currentView; }
  };
})();
