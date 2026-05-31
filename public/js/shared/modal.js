// ===== MODAL MODULE =====
// Handles modal open/close functionality

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function handleModalOverlay(e, id) {
  if (e.target === document.getElementById(id)) {
    closeModal(id);
  }
}

function initModals() {
  // Close modals with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach(modal => {
        modal.classList.remove("open");
        document.body.style.overflow = '';
      });
    }
  });
  
  // Close modals when clicking overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  });
}

// Expose for global onclick
window.openModal = openModal;
window.closeModal = closeModal;
window.handleModalOverlay = handleModalOverlay;

export { openModal, closeModal, handleModalOverlay, initModals };