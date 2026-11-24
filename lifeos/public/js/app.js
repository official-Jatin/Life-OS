import { Storage } from './storage.js';
import { Dashboard } from './dashboard.js';
import { Tasks } from './tasks.js';
import { Habits } from './habits.js';
import { Timer } from './timer.js';
import { Attendance } from './attendance.js';
import { Analytics } from './analytics.js';
import { Settings } from './settings.js';

const VIEWS = {
  dashboard: Dashboard,
  tasks: Tasks,
  habits: Habits,
  timer: Timer,
  attendance: Attendance,
  analytics: Analytics,
  settings: Settings
};

let state = Storage.load();
let activeView = 'dashboard';
let toastTimer = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function openConfirmModal(title, message, onConfirm) {
  const backdrop = document.getElementById('confirm-modal');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  backdrop.classList.add('open');

  const okBtn = document.getElementById('confirm-ok-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');

  const cleanup = () => {
    backdrop.classList.remove('open');
    okBtn.replaceWith(okBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  };

  okBtn.addEventListener('click', () => {
    cleanup();
    onConfirm();
  });

  cancelBtn.addEventListener('click', cleanup);
}

function updateSidebarErpStatus(connected) {
  const dot = document.getElementById('erp-status-dot');
  const text = document.getElementById('erp-status-text');
  if (!dot || !text) return;
  if (connected) {
    dot.classList.add('connected');
    text.textContent = 'QUMS ERP: Connected';
  } else {
    dot.classList.remove('connected');
    text.textContent = 'QUMS ERP: Pending';
  }
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

function navigate(view) {
  if (!VIEWS[view]) view = 'dashboard';
  activeView = view;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  closeMobileSidebar();

  const container = document.getElementById('view-container');
  VIEWS[view].render(container, {
    state,
    save: () => Storage.save(state),
    replaceState: (newState) => {
      state = newState;
      Storage.save(state);
    },
    navigate,
    toast,
    escapeHtml,
    openConfirmModal,
    updateSidebarErpStatus
  });
}

document.addEventListener('DOMContentLoaded', () => {
  Timer.init(state.settings);
  updateSidebarErpStatus(Boolean(state.erpCache));

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  });

  document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);

  navigate('dashboard');
});
