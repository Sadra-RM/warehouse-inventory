// Statistic cards, stock alerts, recent activity, and the Categories, Locations,
// Stock Alerts, Reports and Settings pages. Everything is calculated from the live inventory.
document.addEventListener("DOMContentLoaded", function () {
  var Inventory = window.Inventory;
  var UI = window.UI;
  var esc = UI.esc;
  var icon = UI.icon;

  var CATEGORY_ICONS = { Pharma: "pill", Automotive: "car", Groceries: "shopping-basket", Apparel: "shirt", Electronics: "cpu" };
  function categoryIcon(category) { return CATEGORY_ICONS[category] || "package"; }

  function summarize(groupField) {
    var groups = {};
    Inventory.items().forEach(function (item) {
      var key = item[groupField] || "Unknown";
      var g = groups[key] || (groups[key] = { key: key, items: 0, units: 0, value: 0, low: 0, out: 0, orders: 0, kpiSum: 0, kpiCount: 0, locations: {} });
      g.items++;
      if (Inventory.hasStock(item)) {
        g.units += item.stock_level;
        g.value += item.stock_level * (item.unit_price || 0);
      }
      var status = Inventory.statusOf(item);
      if (status === "low") g.low++;
      if (status === "out") g.out++;
      g.orders += item.total_orders_last_month || 0;
      if (typeof item.KPI_score === "number") {
        g.kpiSum += item.KPI_score;
        g.kpiCount++;
      }
      if (item.storage_location_id) g.locations[item.storage_location_id] = true;
    });
    return Object.keys(groups)
      .sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); })
      .map(function (key) {
        var g = groups[key];
        g.locationCount = Object.keys(g.locations).length;
        g.kpi = g.kpiCount ? g.kpiSum / g.kpiCount : null;
        return g;
      });
  }

  function alertItems() {
    return Inventory.items()
      .filter(function (item) {
        var status = Inventory.statusOf(item);
        return status === "low" || status === "out";
      })
      .sort(function (a, b) {
        return a.stock_level / Math.max(a.reorder_point, 1) - b.stock_level / Math.max(b.reorder_point, 1);
      });
  }

  // ---------- Statistic cards ----------
  function renderStats() {
    var items = Inventory.items();
    var withStock = items.filter(Inventory.hasStock);
    var units = withStock.reduce(function (sum, item) { return sum + item.stock_level; }, 0);
    var value = withStock.reduce(function (sum, item) { return sum + item.stock_level * (item.unit_price || 0); }, 0);
    var low = items.filter(function (item) { return Inventory.statusOf(item) === "low"; }).length;
    var out = items.filter(function (item) { return Inventory.statusOf(item) === "out"; }).length;
    var categories = Inventory.unique("category").length;
    var zones = Inventory.unique("zone").length;
    var percent = function (n) { return items.length ? Math.round((n / items.length) * 100) : 0; };

    var cards = [
      { label: "Total Products", value: UI.number(items.length), icon: "boxes", tone: "blue",
        meta: withStock.length + " with stock data", goto: "inventory" },
      { label: "Total Stock Quantity", value: UI.number(units), icon: "layers", tone: "green",
        meta: "$" + UI.compact(value) + " inventory value", goto: "reports" },
      { label: "Low Stock Items", value: UI.number(low), icon: "triangle-alert", tone: "orange",
        meta: percent(low) + "% of products at reorder point", goto: "alerts" },
      { label: "Out of Stock Items", value: UI.number(out), icon: "package-x", tone: "red",
        meta: out === 0 ? "Every product has units on hand" : percent(out) + "% of products", goto: "alerts" },
      { label: "Total Categories", value: UI.number(categories), icon: "tags", tone: "indigo",
        meta: "Across " + zones + " warehouse zones", goto: "categories" }
    ];

    document.getElementById("statGrid").innerHTML = cards.map(function (card) {
      return '<button type="button" class="stat-card tone-' + card.tone + '" data-goto="' + card.goto + '">' +
        '<span class="stat-top"><span class="stat-label">' + esc(card.label) + "</span>" +
        '<span class="stat-icon">' + icon(card.icon) + "</span></span>" +
        '<span class="stat-value">' + card.value + "</span>" +
        '<span class="stat-meta"><span class="stat-indicator" aria-hidden="true"></span>' + esc(card.meta) + "</span>" +
        "</button>";
    }).join("");
  }

  // ---------- Low stock warning (dashboard) ----------
  function alertRow(item, compact) {
    var status = Inventory.statusOf(item);
    var reorder = Math.max(item.reorder_point || 0, 1);
    var percent = Math.min(100, Math.round((item.stock_level / reorder) * 100));
    var cover = Inventory.daysOfCover(item);
    var urgent = cover !== null && item.lead_time_days != null && cover <= item.lead_time_days;
    return '<li class="alert-row">' +
      '<span class="alert-icon alert-' + status + '">' + icon(status === "out" ? "package-x" : "triangle-alert") + "</span>" +
      '<div class="alert-main">' +
      '<div class="alert-head"><button type="button" class="link-btn" data-action="view" data-id="' + esc(item.item_id) + '">' + esc(Inventory.displayName(item)) + "</button>" +
      '<span class="muted">' + esc(item.category) + " · Zone " + esc(item.zone) + " · " + esc(item.storage_location_id) + "</span></div>" +
      '<div class="alert-progress"><span class="progress"><span class="progress-fill fill-' + status + '" style="width:' + percent + '%"></span></span>' +
      '<span class="alert-qty"><strong>' + UI.number(item.stock_level) + "</strong> / " + UI.number(item.reorder_point) + " reorder</span></div>" +
      (compact ? "" : '<div class="alert-tags">' +
        '<span class="pill">' + (cover === null ? "—" : UI.number(cover, 1)) + " days of cover</span>" +
        (item.lead_time_days != null ? '<span class="pill">' + item.lead_time_days + " day lead time</span>" : "") +
        (urgent ? '<span class="pill pill-danger">' + icon("clock-alert") + "Reorder now</span>" : "") +
        "</div>") +
      "</div>" +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="' + esc(item.item_id) + '">' + icon("package-plus") + "Restock</button>" +
      "</li>";
  }

  function emptyBlock(iconName, title, text) {
    return '<div class="empty-state small"><span class="empty-icon">' + icon(iconName) + "</span><h3>" + esc(title) + "</h3><p>" + esc(text) + "</p></div>";
  }

  function renderLowStock() {
    var alerts = alertItems();
    var el = document.getElementById("lowStockList");
    document.getElementById("lowStockCount").textContent = alerts.length + (alerts.length === 1 ? " item" : " items");
    el.innerHTML = alerts.length
      ? '<ul class="alert-list">' + alerts.slice(0, 5).map(function (item) { return alertRow(item, true); }).join("") + "</ul>"
      : emptyBlock("circle-check", "Stock levels are healthy", "No items are at or below their reorder point.");
  }

  // ---------- Recent activity ----------
  var ACTIVITY_ICONS = {
    add: { icon: "plus", tone: "green" },
    update: { icon: "pencil", tone: "blue" },
    delete: { icon: "trash-2", tone: "red" },
    reset: { icon: "rotate-ccw", tone: "orange" }
  };

  function renderActivity() {
    var list = Inventory.activity();
    var el = document.getElementById("activityList");
    if (!list.length) {
      el.innerHTML = emptyBlock("history", "No activity yet", "Edits, additions and deletions you make will appear here.");
      return;
    }
    el.innerHTML = '<ol class="activity-list">' + list.slice(0, 7).map(function (entry) {
      var meta = ACTIVITY_ICONS[entry.type] || { icon: "dot", tone: "blue" };
      return '<li class="activity-item"><span class="activity-icon tone-' + meta.tone + '">' + icon(meta.icon) + "</span>" +
        '<div class="activity-body"><span>' + esc(entry.text) + '</span><time datetime="' + new Date(entry.time).toISOString() + '">' + UI.timeAgo(entry.time) + "</time></div></li>";
    }).join("") + "</ol>";
  }

  // ---------- Categories page ----------
  function renderCategories() {
    var groups = summarize("category");
    var totalUnits = groups.reduce(function (sum, g) { return sum + g.units; }, 0);
    document.getElementById("categoryGrid").innerHTML = groups.length ? groups.map(function (g) {
      var color = UI.categoryColor(g.key);
      var share = totalUnits ? Math.round((g.units / totalUnits) * 100) : 0;
      return '<button type="button" class="card group-card" data-filter-category="' + esc(g.key) + '" style="--group:' + color + '">' +
        '<span class="group-head"><span class="group-icon">' + icon(categoryIcon(g.key)) + "</span>" +
        '<span class="group-title"><strong>' + esc(g.key) + "</strong><span>" + g.items + " products</span></span>" +
        (g.low + g.out ? '<span class="badge badge-low"><span class="badge-dot"></span>' + (g.low + g.out) + " low</span>" : '<span class="badge badge-in"><span class="badge-dot"></span>Healthy</span>') +
        "</span>" +
        '<span class="group-stats"><span><small>Units</small><strong>' + UI.number(g.units) + "</strong></span>" +
        "<span><small>Value</small><strong>$" + UI.compact(g.value) + "</strong></span>" +
        "<span><small>Orders / mo</small><strong>" + UI.compact(g.orders) + "</strong></span></span>" +
        '<span class="group-share"><span class="progress"><span class="progress-fill" style="width:' + share + "%;background:" + color + '"></span></span><small>' + share + "% of all stock</small></span>" +
        "</button>";
    }).join("") : emptyBlock("tags", "No categories", "Add inventory items to see categories.");
  }

  // ---------- Locations page ----------
  function renderLocations() {
    var zones = summarize("zone");
    var maxUnits = Math.max.apply(null, zones.map(function (z) { return z.units; }).concat([1]));
    document.getElementById("zoneGrid").innerHTML = zones.map(function (z) {
      return '<button type="button" class="card zone-card" data-filter-zone="' + esc(z.key) + '">' +
        '<span class="zone-letter">' + esc(z.key) + "</span>" +
        '<span class="zone-info"><strong>Zone ' + esc(z.key) + "</strong><span>" + z.locationCount + " storage locations · " + z.items + " products</span>" +
        '<span class="progress"><span class="progress-fill" style="width:' + Math.round((z.units / maxUnits) * 100) + '%"></span></span></span>' +
        '<span class="zone-units"><strong>' + UI.number(z.units) + "</strong><small>units</small>" +
        (z.low + z.out ? '<span class="badge badge-low"><span class="badge-dot"></span>' + (z.low + z.out) + " low</span>" : "") + "</span>" +
        "</button>";
    }).join("");

    var locations = summarize("storage_location_id");
    var maxLoc = Math.max.apply(null, locations.map(function (l) { return l.units; }).concat([1]));
    document.getElementById("locationCount").textContent = locations.length + " locations";
    document.getElementById("locationGrid").innerHTML = locations.map(function (l) {
      var intensity = 0.12 + (l.units / maxLoc) * 0.88;
      var label = l.key + ": " + l.items + " products, " + UI.number(l.units) + " units" + (l.low + l.out ? ", " + (l.low + l.out) + " low stock" : "");
      return '<button type="button" class="loc-tile' + (l.low + l.out ? " has-alert" : "") + (intensity > 0.55 ? " deep" : "") + '" data-filter-location="' + esc(l.key) + '" style="--intensity:' + intensity.toFixed(2) + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
        '<span class="loc-id">' + esc(l.key) + "</span><span class=\"loc-units\">" + UI.compact(l.units) + "</span></button>";
    }).join("");
  }

  // ---------- Stock Alerts page ----------
  function renderAlertsPage() {
    var alerts = alertItems();
    var missing = Inventory.items().filter(function (item) { return Inventory.statusOf(item) === "unknown"; });
    var urgent = alerts.filter(function (item) {
      var cover = Inventory.daysOfCover(item);
      return cover !== null && item.lead_time_days != null && cover <= item.lead_time_days;
    });
    document.getElementById("alertSummary").innerHTML =
      '<div class="mini-stat tone-orange">' + icon("triangle-alert") + "<span><strong>" + alerts.length + "</strong> at or below reorder point</span></div>" +
      '<div class="mini-stat tone-red">' + icon("clock-alert") + "<span><strong>" + urgent.length + "</strong> run out before a reorder could arrive</span></div>" +
      '<div class="mini-stat tone-slate">' + icon("circle-help") + "<span><strong>" + missing.length + "</strong> without stock data</span></div>";

    document.getElementById("alertsFull").innerHTML = alerts.length
      ? '<ul class="alert-list">' + alerts.map(function (item) { return alertRow(item, false); }).join("") + "</ul>"
      : emptyBlock("circle-check", "No stock alerts", "Every item with stock data is above its reorder point.");

    document.getElementById("missingStock").innerHTML = missing.length
      ? '<ul class="simple-list">' + missing.map(function (item) {
          return '<li><span><strong>' + esc(Inventory.displayName(item)) + '</strong> <span class="muted">' + esc(item.category) + " · " + esc(item.storage_location_id) + "</span></span>" +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="' + esc(item.item_id) + '">' + icon("pencil") + "Add stock data</button></li>";
        }).join("") + "</ul>"
      : '<p class="muted">Every item has stock data.</p>';
  }

  // ---------- Reports page ----------
  function summaryTable(groups, firstLabel, keyPrefix) {
    var totals = groups.reduce(function (t, g) {
      t.items += g.items; t.units += g.units; t.value += g.value; t.orders += g.orders; t.low += g.low + g.out;
      return t;
    }, { items: 0, units: 0, value: 0, orders: 0, low: 0 });
    return '<div class="table-scroll"><table class="data-table compact"><thead><tr>' +
      "<th>" + esc(firstLabel) + '</th><th class="num">Products</th><th class="num">Units</th><th class="num">Stock value</th>' +
      '<th class="num">Orders (last month)</th><th class="num">Avg KPI</th><th class="num">Low stock</th></tr></thead><tbody>' +
      groups.map(function (g) {
        return "<tr><td><strong>" + esc((keyPrefix || "") + g.key) + '</strong></td><td class="num">' + g.items + '</td><td class="num">' + UI.number(g.units) +
          '</td><td class="num">' + UI.currency(g.value) + '</td><td class="num">' + UI.number(g.orders) + '</td><td class="num">' +
          (g.kpi === null ? "—" : g.kpi.toFixed(3)) + '</td><td class="num">' + (g.low + g.out) + "</td></tr>";
      }).join("") +
      '</tbody><tfoot><tr><td>Total</td><td class="num">' + totals.items + '</td><td class="num">' + UI.number(totals.units) + '</td><td class="num">' +
      UI.currency(totals.value) + '</td><td class="num">' + UI.number(totals.orders) + '</td><td class="num">—</td><td class="num">' + totals.low + "</td></tr></tfoot></table></div>";
  }

  function renderReports() {
    document.getElementById("categoryReport").innerHTML = summaryTable(summarize("category"), "Category");
    document.getElementById("zoneReport").innerHTML = summaryTable(summarize("zone"), "Zone", "Zone ");
  }

  // ---------- Settings page ----------
  function renderSettings() {
    var count = Inventory.changeCount();
    document.getElementById("changeCount").textContent = count === 0
      ? "You are viewing the original inventory data."
      : count + (count === 1 ? " local change is" : " local changes are") + " saved in this browser.";
    document.getElementById("resetData").disabled = count === 0;
    var pageSize = document.getElementById("settingsPageSize");
    if (window.InventoryTable) pageSize.value = String(window.InventoryTable.pageSize());
  }

  document.getElementById("settingsPageSize").addEventListener("change", function (event) {
    window.InventoryTable.setPageSize(parseInt(event.target.value, 10));
    UI.toast("Inventory list now shows " + event.target.value + " rows per page");
  });

  document.getElementById("resetData").addEventListener("click", function () {
    UI.confirmAction({
      title: "Restore original data?",
      message: "All edits, added items and deletions saved in this browser will be discarded. The original data.js inventory is restored.",
      confirmLabel: "Restore data"
    }).then(function (confirmed) {
      if (!confirmed) return;
      Inventory.reset();
      UI.toast("Original inventory data restored");
    });
  });

  // Category, zone and location cards open the inventory list already filtered
  document.addEventListener("click", function (event) {
    var category = event.target.closest("[data-filter-category]");
    var zone = event.target.closest("[data-filter-zone]");
    var loc = event.target.closest("[data-filter-location]");
    if (!category && !zone && !loc) return;
    window.InventoryTable.setFilters({
      category: category ? category.getAttribute("data-filter-category") : "",
      zone: zone ? zone.getAttribute("data-filter-zone") : "",
      status: "",
      query: "",
      location: loc ? loc.getAttribute("data-filter-location") : ""
    });
    UI.navigate("inventory");
  });

  function renderAll() {
    renderStats();
    renderLowStock();
    renderActivity();
    renderCategories();
    renderLocations();
    renderAlertsPage();
    renderReports();
    renderSettings();
    UI.refreshIcons(document.getElementById("content"));
    var badge = document.getElementById("alertNavBadge");
    var count = alertItems().length;
    badge.textContent = count;
    badge.hidden = count === 0;
  }

  window.addEventListener("inventorychange", renderAll);
  window.addEventListener("viewchange", function () {
    renderActivity();
    UI.refreshIcons(document.getElementById("activityList"));
  });
  renderAll();
});
