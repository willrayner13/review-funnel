// blog.html navigation and reveal animations
function toggleNav() {
  const h = document.getElementById('navHamburger');
  const d = document.getElementById('navDrawer');
  if (h) h.classList.toggle('open');
  if (d) d.classList.toggle('open');
  document.body.style.overflow = d?.classList.contains('open') ? 'hidden' : '';
}

function closeNav() {
  const h = document.getElementById('navHamburger');
  const d = document.getElementById('navDrawer');
  if (h) h.classList.remove('open');
  if (d) d.classList.remove('open');
  document.body.style.overflow = '';
}

// Close drawer when clicking outside
document.addEventListener('click', function(e) {
  const drawer = document.getElementById('navDrawer');
  const hamburger = document.getElementById('navHamburger');
  if (drawer?.classList.contains('open') && 
      !drawer.contains(e.target) && 
      hamburger && !hamburger.contains(e.target)) {
    closeNav();
  }
});

// Reveal animations on scroll
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// Initial check for visible elements
window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach(el => {
    if (el.getBoundingClientRect().top < window.innerHeight - 50) {
      el.classList.add('visible');
    }
  });
});