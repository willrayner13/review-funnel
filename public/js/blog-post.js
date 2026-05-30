// blog-post.js - Shared navigation for blog articles

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

// Expose functions globally
window.toggleNav = toggleNav;
window.closeNav = closeNav;