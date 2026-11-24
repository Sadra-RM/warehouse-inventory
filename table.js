// Wait until the HTML document is fully loaded before running table code
document.addEventListener("DOMContentLoaded", function () {
  // Read the global "data" array from data.js (use an empty array if missing)
  const inventoryData = typeof data !== "undefined" && Array.isArray(data) ? data : [];

  // Each column: "key" must match the property name in data.js, "label" is the header shown on the page
  const columns = [
    { key: "item_id", label: "Item" },
    { key: "category", label: "Category" },
    { key: "daily_demand", label: "Daily Demand" },
    { key: "item_popularity_score", label: "Item Popularity Score" },
    { key: "storage_location_id", label: "Storage Location ID" },
    { key: "zone", label: "Zone" },
    { key: "unit_price", label: "Unit Price" },
    { key: "total_orders_last_month", label: "Total Orders Last Month" },
    { key: "KPI_score", label: "KPI Score" }
  ];

  // Get references to HTML elements we need to update
  const tableContainer = document.getElementById("tableContainer");
  const searchInput = document.getElementById("searchInput");
  const rowCount = document.getElementById("rowCount");

  // Current sort settings: which column is sorted and in which direction.
  // sortDirection is "asc" (lowest to highest), "desc" (highest to lowest), or null (original order)
  let sortKey = null;
  let sortDirection = null;

  // Compare two values: numbers are compared as numbers, text is compared naturally (L2 before L10)
  function compareValues(a, b) {
    const aMissing = a === undefined || a === null || a === "";
    const bMissing = b === undefined || b === null || b === "";
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1; // empty values always go to the bottom
    if (bMissing) return -1;

    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  // Return a sorted copy of the rows (the original data is never changed)
  function sortRows(rows) {
    if (!sortKey || !sortDirection) {
      return rows;
    }
    const direction = sortDirection === "asc" ? 1 : -1;
    return rows.slice().sort(function (rowA, rowB) {
      return direction * compareValues(rowA[sortKey], rowB[sortKey]);
    });
  }

  // Called when a column header is clicked: lowest->highest, then highest->lowest, then back to original order
  function handleHeaderClick(columnKey) {
    if (sortKey !== columnKey) {
      sortKey = columnKey;
      sortDirection = "asc";
    } else if (sortDirection === "asc") {
      sortDirection = "desc";
    } else {
      sortKey = null;
      sortDirection = null;
    }
    updateTable();
  }

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
      th.className = "sortable";
      th.tabIndex = 0; // lets keyboard users focus the header and press Enter to sort

      // Show an arrow: up = lowest to highest, down = highest to lowest, double arrow = not sorted
      let arrow = " \u2195";
      let ariaSort = "none";
      if (column.key === sortKey) {
        th.classList.add("sorted");
        arrow = sortDirection === "asc" ? " \u25B2" : " \u25BC";
        ariaSort = sortDirection === "asc" ? "ascending" : "descending";
      }
      th.setAttribute("aria-sort", ariaSort);
      th.textContent = column.label + arrow;
      th.title = "Click to sort by " + column.label;

      th.addEventListener("click", function () {
        handleHeaderClick(column.key);
      });
      th.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleHeaderClick(column.key);
        }
      });

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

        // Color the whole sorted column so it is easy to see
        if (column.key === sortKey) {
          td.className = "sorted-col";
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

  // Apply the current search text and sort settings, then redraw the table
  function updateTable() {
    const query = searchInput.value.trim().toLowerCase();

    // If the search box is empty, use all items; otherwise keep items where any field contains the text
    const filtered =
      query === ""
        ? inventoryData
        : inventoryData.filter(function (item) {
            return columns.some(function (column) {
              const value = item[column.key];
              return String(value !== undefined && value !== null ? value : "")
                .toLowerCase()
                .includes(query);
            });
          });

    renderTable(sortRows(filtered));
  }

  // Listen for typing in the search box to filter rows live
  searchInput.addEventListener("input", updateTable);

  // Display the complete table when the page first loads
  updateTable();
});
