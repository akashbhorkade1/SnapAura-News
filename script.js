document.addEventListener("DOMContentLoaded", function () {
  const itemsPerPage = 10;
  const newsItems = document.querySelectorAll(".news-item");
  const totalPages = Math.ceil(newsItems.length / itemsPerPage);
  const pagination = document.getElementById("pagination");

  function showPage(page) {
    let start = (page - 1) * itemsPerPage;
    let end = start + itemsPerPage;

    newsItems.forEach((item, index) => {
      item.style.display = (index >= start && index < end) ? "block" : "none";
    });

    // Active button highlight
    document.querySelectorAll("#pagination button").forEach((btn, i) => {
      btn.classList.toggle("active", i === page - 1);
    });
  }

  function setupPagination() {
    // Clear old buttons
    pagination.innerHTML = "";

    // Prev button
    let prevBtn = document.createElement("button");
    prevBtn.innerText = "« Prev";
    prevBtn.addEventListener("click", () => {
      let current = document.querySelector("#pagination button.active");
      let page = Array.from(pagination.children).indexOf(current);
      if (page > 1) showPage(page);
    });
    pagination.appendChild(prevBtn);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
      let btn = document.createElement("button");
      btn.innerText = i;
      btn.addEventListener("click", () => showPage(i));
      pagination.appendChild(btn);
    }

    // Next button
    let nextBtn = document.createElement("button");
    nextBtn.innerText = "Next »";
    nextBtn.addEventListener("click", () => {
      let current = document.querySelector("#pagination button.active");
      let page = Array.from(pagination.children).indexOf(current);
      if (page < totalPages) showPage(page + 1);
    });
    pagination.appendChild(nextBtn);
  }

  // सुरुवातीला पहिला page दाखवा
  setupPagination();
  showPage(1);
});
