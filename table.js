// Wait until the HTML document is fully loaded before running table code
document.addEventListener("DOMContentLoaded", function () {
  // Read the global "data" array from data.js (use an empty array if missing)
  const inventoryData = typeof data !== "undefined" && Array.isArray(data) ? data : [];

  // Each column: "key" must match the property name in data.js, "label" is the header shown on the page
  const columns = [
    { key: "item_id", label: "Item" },
    { key: "category", label: "Category" },
    { key: "stock_level", label: "Stock Level" },
    { key: "reorder_point", label: "Reorder Point" },
    { key: "reorder_frequency", label: "Reorder Frequency Days" },
    { key: "lead_time_days", label: "Lead Time Days" },
    { key: "daily_demand", label: "Daily Demand" },
    { key: "demand_std", label: "Demand STD DEV" },
    { key: "item_popularity", label: "Item Popularity Score" },
    { key: "storage_location", label: "Storage Location ID" },
    { key: "zone", label: "Zone" }
  ];

  // Get references to HTML elements we need to update
  const tableContainer = document.getElementById("tableContainer");
  const searchInput = document.getElementById("searchInput");
  const rowCount = document.getElementById("rowCount");

  // Build and display the HTML table for a given array of rows
  function renderTable(rows) {
    // Clear any previous table content
    tableContainer.innerHTML = "";

    // Update the counter showing how many items are displayed
    rowCount.textContent = "Showing " + rows.length + " of " + inventoryData.length + " items";

    // Show a helpful message if no items match the search
    if (rows.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "empty-message";
      emptyMessage.textContent = "No matching inventory items found.";
      tableContainer.appendChild(emptyMessage);
      return;
    }

    // Create the main table, header, and body elements
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    // Build the table header row from the column names
    const headerRow = document.createElement("tr");
    columns.forEach(function (column) {
      const th = document.createElement("th");
      th.textContent = column.label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Build one table row for each inventory item
    rows.forEach(function (item) {
      const tr = document.createElement("tr");

      columns.forEach(function (column) {
        const td = document.createElement("td");
        const value = item[column.key];

        // Safely insert cell text (fallback to "-" if a value is missing)
        td.textContent = value !== undefined && value !== null ? value : "-";

        // Highlight the stock level if it is at or below the reorder point
        if (
          column.key === "stock_level" &&
          Number(item.stock_level) <= Number(item.reorder_point)
        ) {
          td.className = "low-stock";
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    // Attach header and body to the table, then insert into the page
    table.appendChild(thead);
    table.appendChild(tbody);
    tableContainer.appendChild(table);
  }

  // Filter rows in real time based on what the user typed
  function filterRows() {
    const query = searchInput.value.trim().toLowerCase();

    // If the search box is empty, show all items
    if (query === "") {
      renderTable(inventoryData);
      return;
    }

    // Keep items where at least one field contains the search text
    const filtered = inventoryData.filter(function (item) {
      return columns.some(function (column) {
        const value = item[column.key];
        return String(value !== undefined && value !== null ? value : "")
          .toLowerCase()
          .includes(query);
      });
    });

    renderTable(filtered);
  }

  // Listen for typing in the search box to filter rows live
  searchInput.addEventListener("input", filterRows);

  // Display the complete table when the page first loads
  renderTable(inventoryData);
});