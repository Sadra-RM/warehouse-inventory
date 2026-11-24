// Inventory list: live search, filters, sortable columns, pagination,
// responsive cards on phones, and view / edit / delete / add actions.
document.addEventListener("DOMContentLoaded", function () {
  var Inventory = window.Inventory;
  var UI = window.UI;
  var esc = UI.esc;
  var icon = UI.icon;

  // Each column: "key" matches the property name in data.js, "label" is the header shown on the page.
  // "className" hides less important columns on smaller screens.
  var columns = [
    { key: "name", label: "Product", sortValue: function (item) { return Inventory.displayName(item); } },
    { key: "category", label: "Category" },
    { key: "stock_level", label: "Quantity", numeric: true },
    { key: "zone", label: "Zone" },
    { key: "storage_location_id", label: "Location" },
    { key: "daily_demand", label: "Daily Demand", numeric: true, className: "col-xl" },
    { key: "unit_price", label: "Unit Price", numeric: true, className: "col-lg" },
    { key: "total_orders_last_month", label: "Orders (Last Month)", numeric: true, className: "col-xl" },
    { key: "KPI_score", label: "KPI Score", numeric: true, className: "col-xl" },
    { key: "status", label: "Status", sortValue: function (item) { return STATUS_RANK[Inventory.statusOf(item)]; } }
  ];
  var STATUS_RANK = { out: 0, low: 1, in: 2, unknown: 3 };

  // Every field the search box looks through (includes the original data columns)
  var searchFields = [
    "item_id", "name", "category", "daily_demand", "item_popularity_score", "storage_location_id",
    "zone", "unit_price", "total_orders_last_month", "KPI_score", "stock_level"
  ];

  var PAGE_SIZE_KEY = "inventory-page-size";
  var savedPageSize = 10;
  try { savedPageSize = parseInt(localStorage.getItem(PAGE_SIZE_KEY), 10) || 10; } catch (error) { /* ignore */ }

  var state = {
    query: "",
    category: "",
    zone: "",
    status: "",
    location: "",
    sortKey: null,
    sortDirection: null,
    page: 1,
    pageSize: savedPageSize,
    loading: true
  };
  var lastFiltered = [];

  var searchInput = document.getElementById("searchInput");
  var categoryFilter = document.getElementById("categoryFilter");
  var zoneFilter = document.getElementById("zoneFilter");
  var statusFilter = document.getElementById("statusFilter");
  var tableContainer = document.getElementById("tableContainer");
  var cardContainer = document.getElementById("cardContainer");
  var rowCount = document.getElementById("rowCount");
  var pagination = document.getElementById("pagination");
  var clearFiltersBtn = document.getElementById("clearFilters");

  function fillSelect(select, values, allLabel, labelFor) {
    var current = select.value;
    select.innerHTML = '<option value="">' + esc(allLabel) + "</option>" + values.map(function (value) {
      return '<option value="' + esc(value) + '">' + esc(labelFor ? labelFor(value) : value) + "</option>";
    }).join("");
    if (values.indexOf(current) !== -1) select.value = current;
  }

  function refreshFilterOptions() {
    fillSelect(categoryFilter, Inventory.unique("category"), "All categories");
    fillSelect(zoneFilter, Inventory.unique("zone"), "All zones", function (z) { return "Zone " + z; });
    var datalist = document.getElementById("categoryOptions");
    if (datalist) {
      datalist.innerHTML = Inventory.unique("category").map(function (c) {
        return '<option value="' + esc(c) + '"></option>';
      }).join("");
    }
  }

  // Compare two values: numbers are compared as numbers, text is compared naturally (L2 before L10)
  function compareValues(a, b) {
    var aMissing = a === undefined || a === null || a === "";
    var bMissing = b === undefined || b === null || b === "";
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1; // empty values always go to the bottom
    if (bMissing) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function valueFor(item, column) {
    return column.sortValue ? column.sortValue(item) : item[column.key];
  }

  // Return a sorted copy of the rows (the original data is never changed)
  function sortRows(rows) {
    if (!state.sortKey || !state.sortDirection) return rows;
    var column = columns.find(function (c) { return c.key === state.sortKey; });
    var direction = state.sortDirection === "asc" ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      return direction * compareValues(valueFor(a, column), valueFor(b, column));
    });
  }

  function filterRows() {
    var query = state.query.trim().toLowerCase();
    return Inventory.items().filter(function (item) {
      if (state.category && item.category !== state.category) return false;
      if (state.zone && item.zone !== state.zone) return false;
      if (state.status && Inventory.statusOf(item) !== state.status) return false;
      if (state.location && item.storage_location_id !== state.location) return false;
      if (!query) return true;
      return searchFields.some(function (field) {
        var value = item[field];
        return String(value !== undefined && value !== null ? value : "").toLowerCase().indexOf(query) !== -1;
      });
    });
  }

  // Called when a column header is clicked: lowest->highest, then highest->lowest, then back to original order
  function handleHeaderClick(columnKey) {
    if (state.sortKey !== columnKey) {
      state.sortKey = columnKey;
      state.sortDirection = "asc";
    } else if (state.sortDirection === "asc") {
      state.sortDirection = "desc";
    } else {
      state.sortKey = null;
      state.sortDirection = null;
    }
    render();
  }

  function quantityCell(item) {
    if (!Inventory.hasStock(item)) return '<span class="muted">—</span>';
    var status = Inventory.statusOf(item);
    var reorder = item.reorder_point || 0;
    var percent = Math.min(100, Math.round((item.stock_level / Math.max(reorder * 4, 1)) * 100));
    return '<div class="qty"><span class="qty-value">' + UI.number(item.stock_level) + "</span>" +
      '<span class="qty-bar" aria-hidden="true"><span class="qty-fill qty-' + status + '" style="width:' + percent + '%"></span></span></div>';
  }

  function productCell(item) {
    var color = UI.categoryColor(item.category);
    var hasName = item.name && String(item.name).trim();
    return '<div class="product">' +
      '<span class="product-avatar" style="--avatar:' + color + '">' + icon(categoryIcon(item.category)) + "</span>" +
      '<span class="product-text"><span class="product-name">' + esc(Inventory.displayName(item)) + "</span>" +
      '<span class="product-sku">' + (hasName ? "SKU " + esc(item.item_id) : "Reorder at " + UI.number(item.reorder_point)) + "</span></span></div>";
  }

  function categoryIcon(category) {
    var map = { Pharma: "pill", Automotive: "car", Groceries: "shopping-basket", Apparel: "shirt", Electronics: "cpu" };
    return map[category] || "package";
  }

  function actionButtons(item) {
    var id = esc(item.item_id);
    var label = esc(Inventory.displayName(item));
    return '<div class="row-actions">' +
      '<button type="button" class="icon-btn" data-action="view" data-id="' + id + '" aria-label="View ' + label + '" title="View details">' + icon("eye") + "</button>" +
      '<button type="button" class="icon-btn" data-action="edit" data-id="' + id + '" aria-label="Edit ' + label + '" title="Edit">' + icon("pencil") + "</button>" +
      '<button type="button" class="icon-btn danger" data-action="delete" data-id="' + id + '" aria-label="Delete ' + label + '" title="Delete">' + icon("trash-2") + "</button>" +
      "</div>";
  }

  function cellContent(item, column) {
    switch (column.key) {
      case "name": return productCell(item);
      case "category":
        return '<span class="cat-chip"><span class="cat-dot" style="background:' + UI.categoryColor(item.category) + '"></span>' + esc(item.category) + "</span>";
      case "stock_level": return quantityCell(item);
      case "zone": return '<span class="zone-chip">Zone ' + esc(item.zone) + "</span>";
      case "storage_location_id": return '<span class="mono">' + esc(item.storage_location_id) + "</span>";
      case "unit_price": return UI.currency(item.unit_price);
      case "daily_demand": return UI.number(item.daily_demand, 2);
      case "total_orders_last_month": return UI.number(item.total_orders_last_month);
      case "KPI_score": return UI.number(item.KPI_score, 3);
      case "status": return UI.statusBadge(Inventory.statusOf(item));
      default: return esc(item[column.key]);
    }
  }

  function renderSkeleton() {
    var rows = "";
    for (var i = 0; i < 8; i++) {
      rows += "<tr>" + columns.map(function (column) {
        return '<td class="' + (column.className || "") + '"><span class="skeleton" style="width:' + (column.key === "name" ? 70 : 55) + '%"></span></td>';
      }).join("") + '<td><span class="skeleton" style="width:60%"></span></td></tr>';
    }
    tableContainer.innerHTML = '<table class="data-table" aria-busy="true"><thead><tr>' +
      columns.map(function (column) { return '<th class="' + (column.className || "") + '">' + esc(column.label) + "</th>"; }).join("") +
      '<th>Actions</th></tr></thead><tbody>' + rows + "</tbody></table>";
    var cards = "";
    for (var j = 0; j < 4; j++) {
      cards += '<div class="item-card"><span class="skeleton" style="width:50%;height:16px"></span><span class="skeleton" style="width:80%"></span><span class="skeleton" style="width:65%"></span></div>';
    }
    cardContainer.innerHTML = cards;
    rowCount.textContent = "Loading items...";
  }

  function emptyState() {
    var filtered = state.query || state.category || state.zone || state.status || state.location;
    return '<div class="empty-state">' +
      '<span class="empty-icon">' + icon(filtered ? "search-x" : "package-open") + "</span>" +
      "<h3>" + (filtered ? "No matching inventory items found" : "Your inventory is empty") + "</h3>" +
      "<p>" + (filtered ? "Try a different search term or clear the filters." : "Add an item or restore the original data in Settings.") + "</p>" +
      (filtered ? '<button type="button" class="btn btn-secondary" data-clear-filters>' + icon("rotate-ccw") + "Clear filters</button>" : "") +
      "</div>";
  }

  function renderTable(rows) {
    var head = columns.map(function (column) {
      var sorted = column.key === state.sortKey;
      var ariaSort = sorted ? (state.sortDirection === "asc" ? "ascending" : "descending") : "none";
      var arrow = sorted ? (state.sortDirection === "asc" ? "arrow-up" : "arrow-down") : "chevrons-up-down";
      return '<th class="sortable' + (sorted ? " sorted" : "") + (column.numeric ? " num" : "") + " " + (column.className || "") +
        '" aria-sort="' + ariaSort + '"><button type="button" class="sort-btn" data-sort="' + column.key + '" title="Sort by ' + esc(column.label) + '">' +
        esc(column.label) + icon(arrow, "sort-icon") + "</button></th>";
    }).join("") + '<th class="actions-col"><span class="sr-only">Actions</span></th>';

    var body = rows.map(function (item) {
      return '<tr data-row="' + esc(item.item_id) + '">' + columns.map(function (column) {
        var classes = [column.className || "", column.numeric ? "num" : "", column.key === state.sortKey ? "sorted-col" : ""].join(" ").trim();
        return '<td class="' + classes + '">' + cellContent(item, column) + "</td>";
      }).join("") + '<td class="actions-col">' + actionButtons(item) + "</td></tr>";
    }).join("");

    tableContainer.innerHTML = '<table class="data-table"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table>";
  }

  function renderCards(rows) {
    cardContainer.innerHTML = rows.map(function (item) {
      return '<article class="item-card">' +
        '<div class="item-card-top">' + productCell(item) + UI.statusBadge(Inventory.statusOf(item)) + "</div>" +
        '<dl class="item-card-grid">' +
        "<div><dt>Quantity</dt><dd>" + quantityCell(item) + "</dd></div>" +
        "<div><dt>Category</dt><dd>" + esc(item.category) + "</dd></div>" +
        "<div><dt>Zone</dt><dd>Zone " + esc(item.zone) + "</dd></div>" +
        '<div><dt>Location</dt><dd class="mono">' + esc(item.storage_location_id) + "</dd></div>" +
        "</dl>" +
        '<div class="item-card-foot"><span class="muted">' + UI.currency(item.unit_price) + " / unit</span>" + actionButtons(item) + "</div>" +
        "</article>";
    }).join("");
  }

  function renderPagination(total) {
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    if (total === 0) {
      pagination.innerHTML = "";
      return;
    }
    var start = (state.page - 1) * state.pageSize + 1;
    var end = Math.min(total, state.page * state.pageSize);

    var numbers = [];
    for (var p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - state.page) <= 1) numbers.push(p);
      else if (numbers[numbers.length - 1] !== "...") numbers.push("...");
    }

    pagination.innerHTML =
      '<p class="page-info">Showing <strong>' + start + "–" + end + "</strong> of <strong>" + total + "</strong></p>" +
      '<div class="page-controls">' +
      '<label class="page-size"><span>Rows</span><select id="pageSizeSelect" aria-label="Rows per page">' +
      [10, 20, 50, 100].map(function (n) { return "<option" + (n === state.pageSize ? " selected" : "") + ">" + n + "</option>"; }).join("") +
      "</select></label>" +
      '<nav class="pager" aria-label="Pagination">' +
      '<button type="button" class="icon-btn" data-page="' + (state.page - 1) + '"' + (state.page === 1 ? " disabled" : "") + ' aria-label="Previous page">' + icon("chevron-left") + "</button>" +
      numbers.map(function (n) {
        if (n === "...") return '<span class="pager-gap" aria-hidden="true">…</span>';
        return '<button type="button" class="pager-num' + (n === state.page ? " active" : "") + '" data-page="' + n + '"' +
          (n === state.page ? ' aria-current="page"' : "") + ' aria-label="Page ' + n + '">' + n + "</button>";
      }).join("") +
      '<button type="button" class="icon-btn" data-page="' + (state.page + 1) + '"' + (state.page === pages ? " disabled" : "") + ' aria-label="Next page">' + icon("chevron-right") + "</button>" +
      "</nav></div>";
  }

  function render() {
    if (state.loading) return;
    var total = Inventory.items().length;
    var filtered = sortRows(filterRows());
    lastFiltered = filtered;

    rowCount.textContent = "Showing " + filtered.length + " of " + total + " items" +
      (state.location ? " in location " + state.location : "");
    var anyFilter = state.query || state.category || state.zone || state.status || state.location;
    clearFiltersBtn.hidden = !anyFilter;

    renderPagination(filtered.length);
    var pageRows = filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    if (filtered.length === 0) {
      tableContainer.innerHTML = emptyState();
      cardContainer.innerHTML = "";
    } else {
      renderTable(pageRows);
      renderCards(pageRows);
    }
    UI.refreshIcons(document.getElementById("inventoryPanel"));
  }

  function setFilters(next) {
    if ("query" in next) {
      state.query = next.query;
      searchInput.value = next.query;
    }
    if ("category" in next) {
      state.category = next.category;
      categoryFilter.value = next.category;
    }
    if ("zone" in next) {
      state.zone = next.zone;
      zoneFilter.value = next.zone;
    }
    if ("status" in next) {
      state.status = next.status;
      statusFilter.value = next.status;
    }
    state.location = next.location || "";
    state.page = 1;
    render();
  }

  function clearFilters() {
    var global = document.getElementById("globalSearch");
    if (global) global.value = "";
    setFilters({ query: "", category: "", zone: "", status: "", location: "" });
  }

  // ---------- Export ----------
  function exportCsv(rows, filename) {
    var fields = ["item_id", "name", "category", "stock_level", "reorder_point", "lead_time_days", "zone", "storage_location_id",
      "daily_demand", "item_popularity_score", "unit_price", "total_orders_last_month", "KPI_score", "status"];
    var lines = [fields.join(",")].concat(rows.map(function (item) {
      return fields.map(function (field) {
        var value = field === "status" ? Inventory.statusLabel(Inventory.statusOf(item)) : item[field];
        var text = value === undefined || value === null ? "" : String(value);
        return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(",");
    }));
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename || "warehouse-inventory.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    UI.toast("Exported " + rows.length + " items to CSV");
  }

  // ---------- View details ----------
  var viewDialog = document.getElementById("viewDialog");
  var viewingId = null;

  function detailRow(label, value) {
    return "<div><dt>" + esc(label) + "</dt><dd>" + value + "</dd></div>";
  }

  function openView(id) {
    var item = Inventory.find(id);
    if (!item) return;
    viewingId = id;
    var cover = Inventory.daysOfCover(item);
    document.getElementById("viewTitle").textContent = Inventory.displayName(item);
    document.getElementById("viewBody").innerHTML =
      '<div class="view-hero">' + productCell(item) + UI.statusBadge(Inventory.statusOf(item)) + "</div>" +
      '<div class="view-stats">' +
      '<div class="view-stat"><span>Quantity</span><strong>' + UI.number(item.stock_level) + "</strong></div>" +
      '<div class="view-stat"><span>Reorder point</span><strong>' + UI.number(item.reorder_point) + "</strong></div>" +
      '<div class="view-stat"><span>Days of cover</span><strong>' + (cover === null ? "—" : UI.number(cover, 1)) + "</strong></div>" +
      "</div>" +
      '<dl class="detail-grid">' +
      detailRow("Product ID / SKU", '<span class="mono">' + esc(item.item_id) + "</span>") +
      detailRow("Category", esc(item.category)) +
      detailRow("Warehouse zone", "Zone " + esc(item.zone)) +
      detailRow("Storage location", '<span class="mono">' + esc(item.storage_location_id) + "</span>") +
      detailRow("Daily demand", UI.number(item.daily_demand, 2)) +
      detailRow("Lead time", item.lead_time_days == null ? "—" : UI.number(item.lead_time_days) + " days") +
      detailRow("Unit price", UI.currency(item.unit_price)) +
      detailRow("Stock value", Inventory.hasStock(item) ? UI.currency(item.stock_level * (item.unit_price || 0)) : "—") +
      detailRow("Orders last month", UI.number(item.total_orders_last_month)) +
      detailRow("Item popularity score", UI.number(item.item_popularity_score, 2)) +
      detailRow("KPI score", UI.number(item.KPI_score, 3)) +
      "</dl>";
    UI.refreshIcons(viewDialog);
    UI.openDialog(viewDialog);
  }

  document.getElementById("viewEditBtn").addEventListener("click", function () {
    UI.closeDialog(viewDialog);
    if (viewingId) openForm(viewingId);
  });

  // ---------- Add / edit form ----------
  var formDialog = document.getElementById("formDialog");
  var form = document.getElementById("itemForm");
  var formError = document.getElementById("formError");
  var editingId = null;

  function openForm(id) {
    var item = id ? Inventory.find(id) : null;
    editingId = item ? item.item_id : null;
    refreshFilterOptions();
    form.reset();
    formError.hidden = true;
    form.querySelectorAll("[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
    document.getElementById("formTitle").textContent = item ? "Edit " + Inventory.displayName(item) : "Add inventory item";
    document.getElementById("formSubmit").textContent = item ? "Save changes" : "Add item";

    var values = item || { item_id: Inventory.nextId(), zone: "A" };
    form.elements.item_id.value = values.item_id || "";
    form.elements.item_id.readOnly = !!item;
    form.elements.name.value = values.name || "";
    form.elements.category.value = values.category || "";
    form.elements.zone.value = values.zone || "A";
    form.elements.storage_location_id.value = values.storage_location_id || "";
    form.elements.stock_level.value = values.stock_level != null ? values.stock_level : "";
    form.elements.reorder_point.value = values.reorder_point != null ? values.reorder_point : "";
    form.elements.unit_price.value = values.unit_price != null ? values.unit_price : "";
    form.elements.daily_demand.value = values.daily_demand != null ? values.daily_demand : "";
    UI.openDialog(formDialog);
    setTimeout(function () { (item ? form.elements.stock_level : form.elements.name).focus(); }, 30);
  }

  function readNumber(field, options) {
    var input = form.elements[field];
    var raw = input.value.trim();
    if (raw === "") {
      if (options.required) return { error: input };
      return { value: null };
    }
    var value = Number(raw);
    if (isNaN(value) || value < 0 || (options.integer && !Number.isInteger(value)) || value > 1e9) return { error: input };
    return { value: value };
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    form.querySelectorAll("[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
    var errors = [];
    var text = function (field, required, max) {
      var value = form.elements[field].value.trim().slice(0, max || 60);
      if (required && !value) errors.push(form.elements[field]);
      return value;
    };

    var itemId = text("item_id", true, 20).toUpperCase();
    var fields = {
      name: text("name", false, 80),
      category: text("category", true, 40),
      zone: text("zone", true, 4),
      storage_location_id: text("storage_location_id", true, 12).toUpperCase()
    };
    var numbers = {
      stock_level: readNumber("stock_level", { required: true, integer: true }),
      reorder_point: readNumber("reorder_point", { required: true, integer: true }),
      unit_price: readNumber("unit_price", { required: false }),
      daily_demand: readNumber("daily_demand", { required: false })
    };
    Object.keys(numbers).forEach(function (key) {
      if (numbers[key].error) errors.push(numbers[key].error);
      else fields[key] = numbers[key].value;
    });
    if (!editingId && itemId && Inventory.find(itemId)) {
      errors.push(form.elements.item_id);
      formError.textContent = "An item with this ID already exists.";
    } else {
      formError.textContent = "Please fix the highlighted fields. Quantities must be whole numbers of 0 or more.";
    }

    if (errors.length) {
      errors.forEach(function (input) { input.setAttribute("aria-invalid", "true"); });
      formError.hidden = false;
      errors[0].focus();
      return;
    }

    if (editingId) {
      Inventory.update(editingId, fields);
      UI.toast(Inventory.displayName(Inventory.find(editingId)) + " was updated");
    } else {
      var created = Object.assign({
        item_id: itemId,
        item_popularity_score: null,
        total_orders_last_month: 0,
        KPI_score: null,
        lead_time_days: null
      }, fields);
      Inventory.add(created);
      UI.toast(Inventory.displayName(created) + " was added to inventory");
    }
    UI.closeDialog(formDialog);
  });

  // ---------- Delete ----------
  function deleteItem(id) {
    var item = Inventory.find(id);
    if (!item) return;
    var name = Inventory.displayName(item);
    UI.confirmAction({
      title: "Delete " + name + "?",
      message: "This removes the item from the inventory list, charts and reports. You can restore the original data later in Settings.",
      confirmLabel: "Delete item"
    }).then(function (confirmed) {
      if (!confirmed) return;
      Inventory.remove(id);
      UI.toast(name + " was deleted");
    });
  }

  // ---------- Events ----------
  var searchTimer;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = searchInput.value;
      state.page = 1;
      render();
    }, 120);
  });
  categoryFilter.addEventListener("change", function () { setFilters({ category: categoryFilter.value, location: state.location }); });
  zoneFilter.addEventListener("change", function () { setFilters({ zone: zoneFilter.value, location: state.location }); });
  statusFilter.addEventListener("change", function () { setFilters({ status: statusFilter.value, location: state.location }); });
  clearFiltersBtn.addEventListener("click", clearFilters);

  document.getElementById("inventoryPanel").addEventListener("click", function (event) {
    var sortButton = event.target.closest("[data-sort]");
    if (sortButton) return handleHeaderClick(sortButton.getAttribute("data-sort"));
    var pageButton = event.target.closest("[data-page]");
    if (pageButton && !pageButton.disabled) {
      state.page = parseInt(pageButton.getAttribute("data-page"), 10);
      render();
      document.getElementById("inventoryPanel").scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (event.target.closest("[data-clear-filters]")) clearFilters();
  });

  pagination.addEventListener("change", function (event) {
    if (event.target.id === "pageSizeSelect") setPageSize(parseInt(event.target.value, 10));
  });

  function setPageSize(size) {
    state.pageSize = size;
    state.page = 1;
    try { localStorage.setItem(PAGE_SIZE_KEY, String(size)); } catch (error) { /* ignore */ }
    var settingSelect = document.getElementById("settingsPageSize");
    if (settingSelect) settingSelect.value = String(size);
    render();
  }

  // Row actions work anywhere on the page (table, cards, alerts, notifications)
  document.addEventListener("click", function (event) {
    var action = event.target.closest("[data-action]");
    if (action) {
      var id = action.getAttribute("data-id");
      var kind = action.getAttribute("data-action");
      if (kind === "view") openView(id);
      else if (kind === "edit") openForm(id);
      else if (kind === "delete") deleteItem(id);
      return;
    }
    var viewItem = event.target.closest("[data-view-item]");
    if (viewItem) {
      var popover = viewItem.closest(".popover");
      if (popover) popover.hidden = true;
      openView(viewItem.getAttribute("data-view-item"));
      return;
    }
    if (event.target.closest("[data-add-item]")) openForm(null);
    if (event.target.closest("[data-export-filtered]")) exportCsv(lastFiltered, "warehouse-inventory-filtered.csv");
    if (event.target.closest("[data-export-all]")) exportCsv(Inventory.items(), "warehouse-inventory.csv");
  });

  window.addEventListener("globalsearch", function (event) {
    setFilters({ query: event.detail.query, location: state.location });
  });

  window.addEventListener("inventorychange", function () {
    refreshFilterOptions();
    render();
  });

  window.InventoryTable = {
    setFilters: setFilters,
    setPageSize: setPageSize,
    exportCsv: exportCsv,
    pageSize: function () { return state.pageSize; }
  };

  // Show loading placeholders briefly, then the real inventory
  refreshFilterOptions();
  renderSkeleton();
  setTimeout(function () {
    state.loading = false;
    render();
  }, 450);
});
