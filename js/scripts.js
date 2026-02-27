/*!
 * SnapAura Scripts (Fixed)
 * - Safe mainNav check (won't crash on pages without #mainNav)
 * - Pagination works with .post-preview items
 */

// ─── Sticky Nav (only runs if #mainNav exists) ───────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const mainNav = document.getElementById('mainNav');
  if (!mainNav) return; // FIX: was crashing on every page that lacks #mainNav

  let scrollPos = 0;
  const headerHeight = mainNav.clientHeight;

  window.addEventListener('scroll', function () {
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

// ─── Pagination (only runs if #pagination + .post-preview exist) ─────────────
document.addEventListener('DOMContentLoaded', function () {
  const pagination = document.getElementById('pagination');
  if (!pagination) return; // FIX: safe guard — do nothing on pages without pagination

  const itemsPerPage = 10;
  // FIX: use .post-preview (actual class used on all pages) instead of .news-item
  const newsItems = document.querySelectorAll('.post-preview');
  if (newsItems.length === 0) return;

  const totalPages = Math.ceil(newsItems.length / itemsPerPage);

  function showPage(page) {
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    newsItems.forEach((item, index) => {
      item.style.display = (index >= start && index < end) ? 'block' : 'none';
    });
    document.querySelectorAll('#pagination button').forEach((btn, i) => {
      btn.classList.toggle('active', i === page - 1);
    });
  }

  function setupPagination() {
    pagination.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.innerText = i;
      btn.className = 'btn btn-sm btn-outline-secondary me-1 mb-2';
      btn.addEventListener('click', () => showPage(i));
      pagination.appendChild(btn);
    }
  }

  // Only render pagination if more than one page
  if (totalPages > 1) {
    setupPagination();
    showPage(1);
  }
});
