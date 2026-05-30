// landing.html - Marketing page functionality

// Navigation
function toggleNav() {
  const hamburger = document.getElementById('navHamburger');
  const drawer = document.getElementById('navDrawer');
  if (hamburger) hamburger.classList.toggle('open');
  if (drawer) drawer.classList.toggle('open');
  document.body.style.overflow = drawer?.classList.contains('open') ? 'hidden' : '';
}

function closeNav() {
  const hamburger = document.getElementById('navHamburger');
  const drawer = document.getElementById('navDrawer');
  if (hamburger) hamburger.classList.remove('open');
  if (drawer) drawer.classList.remove('open');
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

// Scroll reveal animations
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach(el => {
    if (el.getBoundingClientRect().top < window.innerHeight - 50) {
      el.classList.add('visible');
    }
  });
});

// Demo link generator
function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-business';
}

function makeDemoUrl(name) {
  return window.location.origin + '/demo/' + slugify(name) + '?name=' + encodeURIComponent(name);
}

function updateDemo() {
  const name = document.getElementById('demoInput').value.trim();
  const bizEl = document.getElementById('demoBizName');
  const linkEl = document.getElementById('demoLinkDisplay');
  const openBtn = document.getElementById('demoOpenBtn');

  if (!name) {
    if (bizEl) bizEl.textContent = 'Your Business';
    if (linkEl) {
      linkEl.textContent = 'Type a name to generate your demo link...';
      linkEl.classList.remove('active');
    }
    if (openBtn) {
      openBtn.classList.remove('active');
      openBtn.href = '#';
    }
    return;
  }

  if (bizEl) bizEl.textContent = name;
  const url = makeDemoUrl(name);
  if (linkEl) {
    linkEl.textContent = url;
    linkEl.classList.add('active');
  }
  if (openBtn) {
    openBtn.href = url;
    openBtn.classList.add('active');
  }
}

function copyDemoLink() {
  const name = document.getElementById('demoInput').value.trim();
  if (!name) {
    document.getElementById('demoInput').focus();
    return;
  }
  navigator.clipboard.writeText(makeDemoUrl(name));
  const btn = document.getElementById('demoCopyBtn');
  if (btn) {
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  }
}

// Expose functions globally
window.toggleNav = toggleNav;
window.closeNav = closeNav;
window.updateDemo = updateDemo;
window.copyDemoLink = copyDemoLink;