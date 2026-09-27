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



document.getElementById('current-year')?.replaceChildren(String(new Date().getFullYear()));

const carousel = document.querySelector('.hero-carousel');
if (carousel) {
  const slides = [...carousel.querySelectorAll('.hero-slide')];
  const dots = [...carousel.querySelectorAll('.hero-dot')];
  let active = 0;
  let timer;
  const show = (index) => {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const visible = i === active;
      slide.classList.toggle('is-active', visible);
      slide.setAttribute('aria-hidden', String(!visible));
      slide.querySelectorAll('a').forEach(link => { link.tabIndex = visible ? 0 : -1; });
      dots[i].classList.toggle('is-active', visible);
      if (visible) dots[i].setAttribute('aria-current', 'true');
      else dots[i].removeAttribute('aria-current');
    });
  };
  const stop = () => clearInterval(timer);
  const play = () => {
    stop();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      timer = setInterval(() => show(active + 1), 6000);
  };
  carousel.querySelector('.hero-prev').addEventListener('click', () => { show(active - 1); play(); });
  carousel.querySelector('.hero-next').addEventListener('click', () => { show(active + 1); play(); });
  dots.forEach((dot, i) => dot.addEventListener('click', () => { show(i); play(); }));
  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', play);
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', event => { if (!carousel.contains(event.relatedTarget)) play(); });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : play());
  play();
}
