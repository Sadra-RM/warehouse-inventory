// Donut chart (stock distribution by category) and line chart (projected stock over time).
// Both are drawn as SVG with plain JavaScript, like the bar chart in charts.js.
document.addEventListener("DOMContentLoaded", function () {
  var Inventory = window.Inventory;
  var UI = window.UI;
  var esc = UI.esc;
  var SVG_NS = "http://www.w3.org/2000/svg";

  // ---------- Donut chart ----------
  var donutSvg = document.getElementById("donutChart");
  var donutLegend = document.getElementById("donutLegend");
  var donutValue = document.getElementById("donutValue");
  var donutLabel = document.getElementById("donutLabel");
  var donutMode = "stock";
  var donutSlices = [];

  function donutData() {
    var totals = {};
    var counts = {};
    Inventory.items().forEach(function (item) {
      var key = item.category || "Unknown";
      totals[key] = (totals[key] || 0) + (donutMode === "stock" ? Number(item.stock_level) || 0 : 1);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(totals)
      .map(function (key) { return { label: key, value: totals[key], count: counts[key] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  function setDonutCenter(slice, total) {
    if (slice) {
      donutValue.textContent = UI.number(slice.value);
      donutLabel.textContent = slice.label + " · " + Math.round((slice.value / total) * 100) + "%";
    } else {
      donutValue.textContent = UI.compact(total);
      donutLabel.textContent = donutMode === "stock" ? "Total units" : "Total items";
    }
  }

  function highlight(index) {
    donutSvg.querySelectorAll(".donut-seg").forEach(function (seg, i) {
      seg.classList.toggle("dim", index !== -1 && i !== index);
      seg.classList.toggle("active", i === index);
    });
    donutLegend.querySelectorAll(".legend-item").forEach(function (row, i) {
      row.classList.toggle("dim", index !== -1 && i !== index);
    });
    var total = donutSlices.reduce(function (sum, s) { return sum + s.value; }, 0);
    setDonutCenter(index === -1 ? null : donutSlices[index], total);
  }

  function renderDonut() {
    donutSlices = donutData();
    var total = donutSlices.reduce(function (sum, s) { return sum + s.value; }, 0);
    var radius = 78;
    var circumference = 2 * Math.PI * radius;
    var gap = donutSlices.length > 1 ? 3 : 0;
    var offset = 0;

    donutSvg.innerHTML = '<circle class="donut-track" cx="100" cy="100" r="' + radius + '"></circle>';
    donutSlices.forEach(function (slice, index) {
      var length = total ? (slice.value / total) * circumference : 0;
      var circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("class", "donut-seg");
      circle.setAttribute("cx", "100");
      circle.setAttribute("cy", "100");
      circle.setAttribute("r", String(radius));
      circle.setAttribute("stroke", UI.categoryColor(slice.label));
      circle.setAttribute("stroke-dasharray", Math.max(length - gap, 0.001) + " " + circumference);
      circle.setAttribute("stroke-dashoffset", String(-offset));
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("role", "button");
      circle.setAttribute("aria-label", slice.label + ": " + UI.number(slice.value) + (donutMode === "stock" ? " units" : " items") + ". Show in inventory");
      circle.addEventListener("pointerenter", function () { highlight(index); });
      circle.addEventListener("focus", function () { highlight(index); });
      circle.addEventListener("pointerleave", function () { highlight(-1); });
      circle.addEventListener("blur", function () { highlight(-1); });
      circle.addEventListener("click", function () { openCategory(slice.label); });
      circle.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCategory(slice.label);
        }
      });
      donutSvg.appendChild(circle);
      offset += length;
    });

    donutLegend.innerHTML = donutSlices.map(function (slice, index) {
      var share = total ? Math.round((slice.value / total) * 100) : 0;
      return '<li><button type="button" class="legend-item" data-index="' + index + '">' +
        '<span class="legend-swatch" style="background:' + UI.categoryColor(slice.label) + '"></span>' +
        '<span class="legend-name">' + esc(slice.label) + "</span>" +
        '<span class="legend-meta">' + UI.number(slice.value) + "</span>" +
        '<span class="legend-share">' + share + "%</span></button></li>";
    }).join("");
    setDonutCenter(null, total);
  }

  function openCategory(category) {
    if (window.InventoryTable) window.InventoryTable.setFilters({ category: category, status: "", zone: "", query: "" });
    UI.navigate("inventory");
  }

  donutLegend.addEventListener("pointerover", function (event) {
    var row = event.target.closest(".legend-item");
    if (row) highlight(parseInt(row.getAttribute("data-index"), 10));
  });
  donutLegend.addEventListener("pointerleave", function () { highlight(-1); });
  donutLegend.addEventListener("click", function (event) {
    var row = event.target.closest(".legend-item");
    if (row) openCategory(donutSlices[parseInt(row.getAttribute("data-index"), 10)].label);
  });

  document.querySelectorAll("[data-donut-mode]").forEach(function (button) {
    button.addEventListener("click", function () {
      donutMode = button.getAttribute("data-donut-mode");
      document.querySelectorAll("[data-donut-mode]").forEach(function (b) {
        b.setAttribute("aria-pressed", b === button ? "true" : "false");
      });
      renderDonut();
    });
  });

  // ---------- Line chart ----------
  var lineWrap = document.getElementById("lineChart");
  var lineTooltip = document.getElementById("lineTooltip");
  var horizon = 14;
  var linePoints = [];

  // Projects stock on hand for each upcoming day from the current level and average daily demand
  function projection(days) {
    var items = Inventory.items().filter(Inventory.hasStock);
    var series = [];
    for (var day = 0; day <= days; day++) {
      var units = 0;
      var needReorder = 0;
      items.forEach(function (item) {
        var left = Math.max(0, item.stock_level - (item.daily_demand || 0) * day);
        units += left;
        if (left <= (item.reorder_point || 0)) needReorder++;
      });
      series.push({ day: day, units: Math.round(units), reorder: needReorder });
    }
    return series;
  }

  function niceMax(value) {
    if (value <= 0) return 10;
    var power = Math.pow(10, Math.floor(Math.log10(value)));
    var fraction = value / power;
    var steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    var nice = steps.find(function (step) { return fraction <= step; }) || 10;
    return nice * power;
  }

  function dateLabel(day) {
    var date = new Date();
    date.setDate(date.getDate() + day);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function renderLine() {
    var width = lineWrap.clientWidth;
    var height = lineWrap.clientHeight || 260;
    if (!width) return;
    var series = projection(horizon);
    var pad = { top: 16, right: 12, bottom: 28, left: 52 };
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;
    var maxUnits = niceMax(Math.max.apply(null, series.map(function (p) { return p.units; })));
    var x = function (i) { return pad.left + (series.length > 1 ? (i / (series.length - 1)) * plotW : plotW / 2); };
    var y = function (v) { return pad.top + plotH - (v / maxUnits) * plotH; };

    linePoints = series.map(function (p, i) { return Object.assign({ x: x(i), y: y(p.units) }, p); });

    var grid = "";
    for (var t = 0; t <= 4; t++) {
      var value = (maxUnits / 4) * t;
      var gy = y(value);
      grid += '<line class="grid-line" x1="' + pad.left + '" x2="' + (width - pad.right) + '" y1="' + gy + '" y2="' + gy + '"></line>' +
        '<text class="axis-text" x="' + (pad.left - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + UI.compact(value) + "</text>";
    }
    var step = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(plotW / 70))));
    var labels = series.map(function (p, i) {
      if (i % step !== 0 && i !== series.length - 1) return "";
      var anchor = i === 0 ? "start" : i === series.length - 1 ? "end" : "middle";
      return '<text class="axis-text" x="' + x(i) + '" y="' + (height - 8) + '" text-anchor="' + anchor + '">' + (i === 0 ? "Today" : dateLabel(p.day)) + "</text>";
    }).join("");

    var path = linePoints.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
    var area = path + " L" + x(series.length - 1) + " " + (pad.top + plotH) + " L" + x(0) + " " + (pad.top + plotH) + " Z";

    lineWrap.querySelector("svg") && lineWrap.querySelector("svg").remove();
    var svgMarkup =
      '<svg width="' + width + '" height="' + height + '" role="img" aria-label="Projected units in stock over the next ' + horizon + ' days, from ' +
      UI.number(series[0].units) + " today to " + UI.number(series[series.length - 1].units) + '">' +
      '<defs><linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.28"></stop>' +
      '<stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"></stop></linearGradient></defs>' +
      grid + labels +
      '<path class="line-area" d="' + area + '" fill="url(#lineFill)"></path>' +
      '<path class="line-path" d="' + path + '"></path>' +
      '<line class="hover-line" x1="0" x2="0" y1="' + pad.top + '" y2="' + (pad.top + plotH) + '" visibility="hidden"></line>' +
      '<circle class="hover-dot" r="5" cx="0" cy="0" visibility="hidden"></circle>' +
      '<rect class="hover-capture" x="' + pad.left + '" y="' + pad.top + '" width="' + plotW + '" height="' + plotH + '"></rect>' +
      "</svg>";
    lineWrap.insertAdjacentHTML("afterbegin", svgMarkup);

    var svg = lineWrap.querySelector("svg");
    var hoverLine = svg.querySelector(".hover-line");
    var hoverDot = svg.querySelector(".hover-dot");
    var capture = svg.querySelector(".hover-capture");

    function show(event) {
      var rect = svg.getBoundingClientRect();
      var mx = event.clientX - rect.left;
      var nearest = linePoints.reduce(function (best, p) { return Math.abs(p.x - mx) < Math.abs(best.x - mx) ? p : best; }, linePoints[0]);
      hoverLine.setAttribute("x1", nearest.x);
      hoverLine.setAttribute("x2", nearest.x);
      hoverLine.setAttribute("visibility", "visible");
      hoverDot.setAttribute("cx", nearest.x);
      hoverDot.setAttribute("cy", nearest.y);
      hoverDot.setAttribute("visibility", "visible");
      lineTooltip.innerHTML = "<strong>" + (nearest.day === 0 ? "Today" : dateLabel(nearest.day)) + "</strong>" +
        "<span>" + UI.number(nearest.units) + " units on hand</span>" +
        "<span>" + nearest.reorder + " items at reorder point</span>";
      lineTooltip.hidden = false;
      var left = Math.min(Math.max(nearest.x, 80), width - 80);
      lineTooltip.style.left = left + "px";
      lineTooltip.style.top = Math.max(nearest.y - 12, 8) + "px";
    }
    function hide() {
      hoverLine.setAttribute("visibility", "hidden");
      hoverDot.setAttribute("visibility", "hidden");
      lineTooltip.hidden = true;
    }
    capture.addEventListener("pointermove", show);
    capture.addEventListener("pointerdown", show);
    capture.addEventListener("pointerleave", hide);

    var first = series[0];
    var last = series[series.length - 1];
    document.getElementById("lineSummary").innerHTML =
      '<span class="pill">' + UI.number(first.units) + " units today</span>" +
      '<span class="pill pill-warn">' + last.reorder + " items need reorder in " + horizon + " days</span>";
  }

  document.querySelectorAll("[data-horizon]").forEach(function (button) {
    button.addEventListener("click", function () {
      horizon = parseInt(button.getAttribute("data-horizon"), 10);
      document.querySelectorAll("[data-horizon]").forEach(function (b) {
        b.setAttribute("aria-pressed", b === button ? "true" : "false");
      });
      renderLine();
    });
  });

  function renderAll() {
    renderDonut();
    renderLine();
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderLine, 80);
  });
  window.addEventListener("inventorychange", renderAll);
  window.addEventListener("viewchange", function () { requestAnimationFrame(renderLine); });

  renderAll();
});
