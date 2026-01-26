/*!
* SnapAura - Clean Blog (Customized)
* Based on Start Bootstrap - Clean Blog v6.0.9
* Licensed under MIT
*/
window.addEventListener('DOMContentLoaded', () => {
    let scrollPos = 0;
    const mainNav = document.getElementById('mainNav');
    const headerHeight = mainNav.clientHeight;

    window.addEventListener('scroll', function() {
        const currentTop = document.body.getBoundingClientRect().top * -1;

        if (currentTop < scrollPos) {
            // Scrolling Up
            if (currentTop > 0 && mainNav.classList.contains('is-fixed')) {
                mainNav.classList.add('is-visible');
            } else {
                mainNav.classList.remove('is-visible', 'is-fixed');
            }
        } else {
            // Scrolling Down
            mainNav.classList.remove('is-visible');
            if (currentTop > headerHeight && !mainNav.classList.contains('is-fixed')) {
                mainNav.classList.add('is-fixed');
            }
        }
        scrollPos = currentTop;
    });
});

// Existing scroll code इथे आहे...

// Pagination logic
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

    document.querySelectorAll("#pagination button").forEach((btn, i) => {
      btn.classList.toggle("active", i === page - 1);
    });
  }

  function setupPagination() {
    pagination.innerHTML = "";
    for (let i = 1; i <= totalPages; i++) {
      let btn = document.createElement("button");
      btn.innerText = i;
      btn.addEventListener("click", () => showPage(i));
      pagination.appendChild(btn);
    }
  }

  setupPagination();
  showPage(1);
});
