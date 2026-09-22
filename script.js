const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');

const pageName = (href) => {
  const url = new URL(href, window.location.href);
  return (url.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
};

const currentPage = document.body.dataset.page || pageName(window.location.href);
document.querySelectorAll('.main-nav a').forEach((link) => {
  link.classList.toggle('active', pageName(link.href) === currentPage);
});

menuToggle?.addEventListener('click', () => {
  const isOpen = mainNav?.classList.toggle('is-open') || false;
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Tutup menu' : 'Buka menu');
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    mainNav?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('aria-label', 'Buka menu');
  });
});

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
}

const tabs = document.querySelectorAll('.filter-tab');
const publicationCards = document.querySelectorAll('.publication-card');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.remove('active'));
    tabs.forEach((item) => item.setAttribute('aria-pressed', 'false'));
    tab.classList.add('active');
    tab.setAttribute('aria-pressed', 'true');
    const filter = tab.dataset.filter;
    publicationCards.forEach((card) => {
      card.classList.toggle('is-hidden', filter !== 'all' && card.dataset.category !== filter);
    });
  });
});


const munasCountdown = document.querySelector('[data-munas-countdown]');
if (munasCountdown) {
  const munasTarget = new Date('2026-09-26T09:00:00+07:00').getTime();
  const daysNode = munasCountdown.querySelector('[data-munas-days]');
  const hoursNode = munasCountdown.querySelector('[data-munas-hours]');
  const minutesNode = munasCountdown.querySelector('[data-munas-minutes]');

  const updateMunasCountdown = () => {
    const remaining = munasTarget - Date.now();
    if (remaining <= 0) {
      munasCountdown.innerHTML = '<div class="munas-live-state">MUNAS AEEVI 2026 sedang berlangsung atau telah selesai.</div>';
      return;
    }
    daysNode.textContent = String(Math.floor(remaining / 86400000)).padStart(2, '0');
    hoursNode.textContent = String(Math.floor(remaining / 3600000) % 24).padStart(2, '0');
    minutesNode.textContent = String(Math.floor(remaining / 60000) % 60).padStart(2, '0');
  };

  updateMunasCountdown();
  window.setInterval(updateMunasCountdown, 30000);
}

document.getElementById('current-year')?.replaceChildren(String(new Date().getFullYear()));
