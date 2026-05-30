// about.html navigation script
function toggleAboutNav() {
  const hamburger = document.getElementById('aboutHamburger');
  const drawer = document.getElementById('aboutDrawer');
  if (hamburger) hamburger.classList.toggle('open');
  if (drawer) drawer.classList.toggle('open');
}

function closeAboutNav() {
  const hamburger = document.getElementById('aboutHamburger');
  const drawer = document.getElementById('aboutDrawer');
  if (hamburger) hamburger.classList.remove('open');
  if (drawer) drawer.classList.remove('open');
}

// Close drawer when clicking outside
document.addEventListener('click', function(e) {
  const drawer = document.getElementById('aboutDrawer');
  const hamburger = document.getElementById('aboutHamburger');
  if (drawer && drawer.classList.contains('open') && 
      !drawer.contains(e.target) && 
      hamburger && !hamburger.contains(e.target)) {
    closeAboutNav();
  }
});