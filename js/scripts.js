/*!
 * SnapAura Scripts (Fixed)
 * - Safe mainNav check (won't crash on pages without #mainNav)
 * - Pagination works with .post-preview items
 * - Throttled scroll for performance
 * - Recalculates headerHeight on resize
 * - Scroll to top on page change
 * - Accessibility: aria-label on pagination buttons
 */

// ─── Sticky Nav (only runs if #mainNav exists) ───────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const mainNav = document.getElementById('mainNav');
  if (!mainNav) return;

  let scrollPos = 0;
  let headerHeight = mainNav.clientHeight;

  window.addEventListener('resize', () => {
    headerHeight = mainNav.clientHeight;
  });

  let ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const currentTop = document.body.getBoundingClientRect().top * -1;

        if (currentTop < scrollPos) {
          if (currentTop > 0 && mainNav.classList.contains('is-fixed')) {
            mainNav.classList.add('is-visible');
          } else {
            mainNav.classList.remove('is-visible', 'is-fixed');
          }
        } else {
          mainNav.classList.remove('is-visible');
          if (currentTop > headerHeight && !mainNav.classList.contains('is-fixed')) {
            mainNav.classList.add('is-fixed');
          }
        }
        scrollPos = currentTop;
        ticking = false;
      });
      ticking = true;
    }
  });
});

// ─── Pagination (only runs if #pagination + .post-preview exist) ─────────────
document.addEventListener('DOMContentLoaded', function () {
  const pagination = document.getElementById('pagination');
  if (!pagination) return;

  const itemsPerPage = 10;
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
    window.scrollTo({ top: pagination.offsetTop - 100, behavior: 'smooth' });
  }

  function setupPagination() {
    pagination.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.innerText = i;
      btn.className = 'btn btn-sm btn-outline-secondary me-1 mb-2';
      btn.setAttribute('aria-label', 'Go to page ' + i);
      btn.addEventListener('click', () => showPage(i));
      pagination.appendChild(btn);
    }
  }

  if (totalPages > 1) {
    setupPagination();
    showPage(1);
  }
});
