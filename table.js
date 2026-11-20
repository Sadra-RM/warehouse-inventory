// Wait until the HTML document is fully loaded before running table code
document.addEventListener("DOMContentLoaded", function () {
  // Read the global "data" array from data.js (use an empty array if missing)
  const inventoryData = typeof data !== "undefined" && Array.isArray(data) ? data : [];

  // Exact column keys matching each object in the warehouse dataset
  const columns = [
    "Item",
    "Category",
    "Stock Level",
    "Reorder Point",
    "Reorder Frequency Days",
    "Lead Time Days",
    "Daily Demand",
    "Demand STD DEV",
    "Item Popularity Score",
    "Storage Location ID",
    "Zone"
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
    columns.forEach(function (columnName) {
      const th = document.createElement("th");
      th.textContent = columnName;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Build one table row for each inventory item
    rows.forEach(function (item) {
      const tr = document.createElement("tr");

      columns.forEach(function (columnName) {
        const td = document.createElement("td");
        const value = item[columnName];

        // Safely insert cell text (fallback to "-" if a value is missing)
        td.textContent = value !== undefined && value !== null ? value : "-";

        // Highlight the stock level if it is at or below the reorder point
        if (
          columnName === "Stock Level" &&
          Number(item["Stock Level"]) <= Number(item["Reorder Point"])
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
      return columns.some(function (columnName) {
        const value = item[columnName];
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