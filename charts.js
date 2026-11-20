// Wait until the HTML document is fully loaded before drawing the chart
document.addEventListener("DOMContentLoaded", function () {
  // Read the global "data" array from data.js (use an empty array if missing)
  const inventoryData = typeof data !== "undefined" && Array.isArray(data) ? data : [];

  // Count how many items belong to each category
  const categoryCounts = {};
  inventoryData.forEach(function (item) {
    const category = item["Category"] || "Uncategorized";
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  // Separate category names (labels) and item counts (values) into arrays
  const labels = Object.keys(categoryCounts);
  const counts = Object.values(categoryCounts);

  // Find the canvas element where the chart will be drawn
  const canvas = document.getElementById("categoryChart");
  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  // Create a bar chart using Chart.js
  new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Number of Items",
          data: counts,
          backgroundColor: "#2563eb",
          borderColor: "#1d4ed8",
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top"
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Category"
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            // Show whole numbers only because item counts are integers
            precision: 0
          },
          title: {
            display: true,
            text: "Number of Items"
          }
        }
      }
    }
  });
});