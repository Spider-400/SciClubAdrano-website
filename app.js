const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.main-nav');

const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

function closeMenu() {
  navigation.classList.remove('is-open');
  menuButton.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-open');
}

menuButton.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('is-open');
  menuButton.classList.toggle('is-open', isOpen);
  menuButton.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('nav-open', isOpen);
});

navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.14 }
);
reveals.forEach((item) => {
  if (reducedMotion) item.classList.add('is-visible');
  else revealObserver.observe(item);
});

function animateCounter(element) {
  const target = Number(element.dataset.count);
  const duration = 1100;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const counters = document.querySelectorAll('[data-count]');
const counterObserver = new IntersectionObserver(
  (entries, observer) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    if (reducedMotion) entry.target.textContent = entry.target.dataset.count;
    else animateCounter(entry.target);
    observer.unobserve(entry.target);
  }),
  { threshold: 0.8 }
);
counters.forEach((counter) => counterObserver.observe(counter));

document.querySelector('#year').textContent = new Date().getFullYear();
