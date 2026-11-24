// Draws the bar charts with plain JavaScript and the HTML canvas.
// No external library or internet connection is needed, so the charts always show.

// Wait until the HTML document is fully loaded before drawing the chart
document.addEventListener("DOMContentLoaded", function () {
  // Read the global "data" array from data.js (use an empty array if missing)
  const inventoryData = typeof data !== "undefined" && Array.isArray(data) ? data : [];

  // Find the page elements we need
  const canvas = document.getElementById("categoryChart");
  const chartSelect = document.getElementById("chartSelect");
  const chartTitle = document.getElementById("chartTitle");
  const chartWrapper = document.getElementById("chartWrapper");
  if (!canvas || !canvas.getContext || !chartWrapper) {
    return;
  }
  const ctx = canvas.getContext("2d");
  canvas.style.display = "block";

  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  // Group items by a field and either count them or add up a number field.
  //   groupField: which field to group by (category, zone, storage_location_id)
  //   sumField:   if given, add up this number field; otherwise count items
  function groupData(groupField, sumField) {
    const totals = {};
    inventoryData.forEach(function (item) {
      const group = item[groupField] || "Unknown";
      const amount = sumField ? Number(item[sumField]) || 0 : 1;
      totals[group] = (totals[group] || 0) + amount;
    });
    return totals;
  }

  // Sort names like L2, L10, L100 in natural order (by the number after the letter)
  function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true });
  }

  // All available charts. Add a new entry here to add a new option.
  const chartOptions = {
    category: {
      title: "Items per Category",
      groupField: "category",
      xLabel: "Category",
      yLabel: "Number of Items",
      datasetLabel: "Number of Items",
      color: "#2563eb",
      hoverColor: "#1d4ed8"
    },
    zone: {
      title: "Items per Zone",
      groupField: "zone",
      xLabel: "Zone",
      yLabel: "Number of Items",
      datasetLabel: "Number of Items",
      color: "#7c3aed",
      hoverColor: "#6d28d9",
      sortLabels: true
    },
    location: {
      title: "Items per Storage Location",
      groupField: "storage_location_id",
      xLabel: "Storage Location ID",
      yLabel: "Number of Items",
      datasetLabel: "Number of Items",
      color: "#0891b2",
      hoverColor: "#0e7490",
      sortLabels: true,
      pixelsPerBar: 26 // makes the chart wider so all location IDs stay readable
    },
    orders: {
      title: "Total Orders Last Month per Category",
      groupField: "category",
      sumField: "total_orders_last_month",
      xLabel: "Category",
      yLabel: "Total Orders (last month)",
      datasetLabel: "Total Orders Last Month",
      color: "#059669",
      hoverColor: "#047857"
    }
  };

  // Everything needed to redraw the current chart (on hover and on window resize)
  const state = { option: chartOptions.category, labels: [], values: [], hover: -1, layout: null };

  // Small black box that shows the label and value when you point at a bar
  const tooltip = document.createElement("div");
  tooltip.style.cssText =
    "position:absolute;display:none;pointer-events:none;z-index:2;background:#0f172a;color:#fff;" +
    "padding:6px 10px;border-radius:6px;font-size:12px;white-space:nowrap;transform:translate(-50%,-100%);";
  chartWrapper.appendChild(tooltip);

  // Pick a "nice" step size (1, 2, 5, 10, 20, 50 ...) for the vertical axis
  function niceStep(maxValue, tickCount) {
    const rough = maxValue / tickCount;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const fraction = rough / power;
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return Math.max(1, nice * power);
  }

  // Draw a bar with rounded top corners
  function drawBar(x, y, w, h, radius) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, [Math.min(radius, h), Math.min(radius, h), 0, 0].map(function (r) {
        return Math.min(r, w / 2);
      }));
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
  }

  // Draw the whole chart on the canvas
  function render() {
    const option = state.option;
    const labels = state.labels;
    const values = state.values;

    // Match the canvas size to its container (and sharpen it on high-resolution screens)
    const width = chartWrapper.clientWidth;
    const height = chartWrapper.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = "alphabetic";

    // Nothing to draw if there is no data
    if (labels.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px " + FONT;
      ctx.textAlign = "center";
      ctx.fillText("No data to chart.", width / 2, height / 2);
      state.layout = null;
      return;
    }

    // Work out the plot area; labels turn sideways when they do not fit
    ctx.font = "12px " + FONT;
    const maxLabelWidth = Math.max.apply(null, labels.map(function (l) { return ctx.measureText(l).width; }));
    const maxValue = Math.max.apply(null, values.concat([1]));
    // Leave enough room on the left for the largest number plus the axis title
    const left = Math.max(64, ctx.measureText(Math.ceil(maxValue * 1.15).toLocaleString()).width + 42);
    const right = 16;
    const top = 36;
    const plotWidth = Math.max(width - left - right, 50);
    const slot = plotWidth / labels.length;
    const rotateLabels = maxLabelWidth + 8 > slot;
    const bottom = (rotateLabels ? maxLabelWidth + 14 : 20) + 34;
    const plotHeight = Math.max(height - top - bottom, 50);

    // Vertical axis: about 5 evenly spaced whole-number ticks
    const step = niceStep(maxValue, 5);
    const axisMax = Math.ceil(maxValue / step) * step;
    const yFor = function (v) { return top + plotHeight - (v / axisMax) * plotHeight; };

    // Grid lines and numbers on the vertical axis
    ctx.font = "12px " + FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let v = 0; v <= axisMax; v += step) {
      const y = yFor(v);
      ctx.strokeStyle = v === 0 ? "#94a3b8" : "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, Math.round(y) + 0.5);
      ctx.lineTo(left + plotWidth, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.fillText(v.toLocaleString(), left - 8, y);
    }

    // Bars, value labels above the bars, and category names under them
    const barWidth = Math.min(slot * 0.7, 90);
    const bars = [];
    labels.forEach(function (label, i) {
      const centerX = left + slot * i + slot / 2;
      const barX = centerX - barWidth / 2;
      const barY = yFor(values[i]);
      const barHeight = top + plotHeight - barY;

      ctx.fillStyle = i === state.hover ? option.hoverColor : option.color;
      drawBar(barX, barY, barWidth, barHeight, 6);
      bars.push({ x: barX, y: barY, w: barWidth, centerX: centerX });

      // Number above the bar (skipped when bars are too thin to read)
      if (slot >= 22) {
        ctx.fillStyle = "#334155";
        ctx.font = "11px " + FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(values[i].toLocaleString(), centerX, barY - 5);
      }

      // Name under the bar
      ctx.fillStyle = "#475569";
      ctx.font = "12px " + FONT;
      if (rotateLabels) {
        ctx.save();
        ctx.translate(centerX, top + plotHeight + 8);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(label, 0, 0);
        ctx.restore();
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(label, centerX, top + plotHeight + 18);
      }
    });

    // For wide, scrollable charts, center the titles in the part you can see first
    const visibleWidth = chartWrapper.parentElement ? chartWrapper.parentElement.clientWidth : width;
    const titleCenter = left + Math.min(plotWidth, Math.max(visibleWidth - left - right, 100)) / 2;

    // Axis titles
    ctx.fillStyle = "#475569";
    ctx.font = "bold 12px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(option.xLabel, titleCenter, height - 8);
    ctx.save();
    ctx.translate(14, top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "middle";
    ctx.fillText(option.yLabel, 0, 0);
    ctx.restore();

    // Legend (colored square + name) at the top, centered over the plot
    ctx.font = "12px " + FONT;
    const legendTextWidth = ctx.measureText(option.datasetLabel).width;
    const legendStart = titleCenter - (legendTextWidth + 22) / 2;
    ctx.fillStyle = option.color;
    ctx.fillRect(legendStart, 11, 14, 10);
    ctx.fillStyle = "#475569";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(option.datasetLabel, legendStart + 22, 16);

    // Remember where things are so hovering can find the bar under the mouse
    state.layout = { left: left, top: top, slot: slot, plotWidth: plotWidth, plotHeight: plotHeight, bars: bars };
  }

  // Build the data for one option and draw it
  function drawChart(optionKey) {
    const option = chartOptions[optionKey] || chartOptions.category;

    // Build the labels and values for this chart
    const totals = groupData(option.groupField, option.sumField);
    const labels = Object.keys(totals);
    if (option.sortLabels) {
      labels.sort(naturalSort);
    }
    state.option = option;
    state.labels = labels;
    state.values = labels.map(function (label) { return totals[label]; });
    state.hover = -1;
    tooltip.style.display = "none";

    // Update the heading above the chart
    if (chartTitle) {
      chartTitle.textContent = option.title;
    }

    // Make the chart wider when there are many bars (it scrolls sideways)
    chartWrapper.style.width = option.pixelsPerBar
      ? Math.max(labels.length * option.pixelsPerBar, 600) + "px"
      : "100%";

    render();
  }

  // Show a tooltip and highlight the bar under the mouse
  canvas.addEventListener("mousemove", function (event) {
    const layout = state.layout;
    if (!layout) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let index = Math.floor((x - layout.left) / layout.slot);
    const insidePlot = x >= layout.left && x <= layout.left + layout.plotWidth &&
                       y >= layout.top && y <= layout.top + layout.plotHeight;
    if (!insidePlot || index < 0 || index >= state.labels.length) {
      index = -1;
    }

    if (index !== state.hover) {
      state.hover = index;
      render();
    }

    if (index === -1) {
      tooltip.style.display = "none";
    } else {
      const bar = state.layout.bars[index];
      tooltip.textContent = state.labels[index] + ": " + state.values[index].toLocaleString();
      tooltip.style.left = bar.centerX + "px";
      tooltip.style.top = Math.max(bar.y - 8, 24) + "px";
      tooltip.style.display = "block";
    }
  });

  canvas.addEventListener("mouseleave", function () {
    state.hover = -1;
    tooltip.style.display = "none";
    render();
  });

  // Redraw the chart when the window size changes
  window.addEventListener("resize", render);

  // Redraw the chart whenever a different option is chosen in the dropdown
  if (chartSelect) {
    chartSelect.addEventListener("change", function () {
      drawChart(chartSelect.value);
    });
  }

  // Draw the first chart when the page loads
  drawChart(chartSelect ? chartSelect.value : "category");
});
