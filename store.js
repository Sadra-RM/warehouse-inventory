// Shared inventory store used by every part of the dashboard.
// The original items come from data.js and are never modified. Edits, deletions and
// new items are saved as a small set of changes in the browser (localStorage), because
// this site is hosted as static files on GitHub Pages and has no server or database.
(function () {
  var CHANGES_KEY = "inventory-changes-v1";
  var ACTIVITY_KEY = "inventory-activity-v1";
  var MAX_ACTIVITY = 60;

  var baseItems = typeof data !== "undefined" && Array.isArray(data) ? data : [];

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Storage is blocked: changes still apply for this visit, they just are not remembered
    }
  }

  var changes = readJSON(CHANGES_KEY, null) || { edited: {}, deleted: [], added: [] };
  changes.edited = changes.edited || {};
  changes.deleted = changes.deleted || [];
  changes.added = changes.added || [];
  var activity = readJSON(ACTIVITY_KEY, []);
  var cache = null;

  function buildItems() {
    var deleted = {};
    changes.deleted.forEach(function (id) { deleted[id] = true; });
    var merged = baseItems
      .filter(function (item) { return !deleted[item.item_id]; })
      .map(function (item) {
        var edit = changes.edited[item.item_id];
        return edit ? Object.assign({}, item, edit) : Object.assign({}, item);
      });
    changes.added.forEach(function (item) {
      if (!deleted[item.item_id]) {
        var edit = changes.edited[item.item_id];
        merged.push(edit ? Object.assign({}, item, edit) : Object.assign({}, item));
      }
    });
    return merged;
  }

  function items() {
    if (!cache) cache = buildItems();
    return cache;
  }

  function hasStock(item) {
    return typeof item.stock_level === "number" && !isNaN(item.stock_level);
  }

  // in = healthy, low = at or below its reorder point, out = zero units, unknown = no stock data
  function statusOf(item) {
    if (!hasStock(item)) return "unknown";
    if (item.stock_level <= 0) return "out";
    if (typeof item.reorder_point === "number" && item.stock_level <= item.reorder_point) return "low";
    return "in";
  }

  var STATUS_LABELS = { in: "In Stock", low: "Low Stock", out: "Out of Stock", unknown: "No Stock Data" };

  // How many days the current stock lasts at the item's average daily demand
  function daysOfCover(item) {
    if (!hasStock(item) || !item.daily_demand) return null;
    return item.stock_level / item.daily_demand;
  }

  function find(id) {
    return items().find(function (item) { return item.item_id === id; }) || null;
  }

  function displayName(item) {
    return item.name && String(item.name).trim() ? String(item.name).trim() : item.item_id;
  }

  function persist(entry) {
    cache = null;
    writeJSON(CHANGES_KEY, changes);
    if (entry) {
      activity.unshift(Object.assign({ time: Date.now() }, entry));
      activity = activity.slice(0, MAX_ACTIVITY);
      writeJSON(ACTIVITY_KEY, activity);
    }
    window.dispatchEvent(new CustomEvent("inventorychange", { detail: entry || null }));
  }

  function update(id, fields) {
    var before = find(id);
    if (!before) return null;
    changes.edited[id] = Object.assign({}, changes.edited[id], fields);
    var text = "Updated " + displayName(Object.assign({}, before, fields));
    if (typeof fields.stock_level === "number" && fields.stock_level !== before.stock_level) {
      text += " · stock " + (before.stock_level == null ? "—" : before.stock_level) + " → " + fields.stock_level;
    }
    persist({ type: "update", id: id, text: text });
    return find(id);
  }

  function remove(id) {
    var item = find(id);
    if (!item) return false;
    if (changes.deleted.indexOf(id) === -1) changes.deleted.push(id);
    persist({ type: "delete", id: id, text: "Deleted " + displayName(item) + " from " + item.category });
    return true;
  }

  function add(item) {
    if (!item || !item.item_id || find(item.item_id)) return null;
    changes.deleted = changes.deleted.filter(function (id) { return id !== item.item_id; });
    delete changes.edited[item.item_id];
    changes.added = changes.added.filter(function (existing) { return existing.item_id !== item.item_id; });
    changes.added.push(item);
    persist({ type: "add", id: item.item_id, text: "Added " + displayName(item) + " to " + item.category });
    return find(item.item_id);
  }

  function reset() {
    changes = { edited: {}, deleted: [], added: [] };
    persist({ type: "reset", id: null, text: "Restored the original inventory data" });
  }

  function changeCount() {
    return Object.keys(changes.edited).length + changes.deleted.length + changes.added.length;
  }

  function nextId() {
    var max = 0;
    baseItems.concat(changes.added).forEach(function (item) {
      var n = parseInt(String(item.item_id).replace(/\D/g, ""), 10);
      if (n > max) max = n;
    });
    return "ITM" + (max + 1);
  }

  function unique(field) {
    var seen = {};
    items().forEach(function (item) {
      if (item[field] !== undefined && item[field] !== null && item[field] !== "") seen[item[field]] = true;
    });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
  }

  window.Inventory = {
    items: items,
    find: find,
    update: update,
    remove: remove,
    add: add,
    reset: reset,
    statusOf: statusOf,
    statusLabel: function (status) { return STATUS_LABELS[status] || status; },
    daysOfCover: daysOfCover,
    hasStock: hasStock,
    displayName: displayName,
    activity: function () { return activity.slice(); },
    changeCount: changeCount,
    nextId: nextId,
    unique: unique
  };
})();
