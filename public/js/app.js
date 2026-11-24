import { Storage } from './storage.js';
import { Dashboard } from './dashboard.js';
import { Tasks } from './tasks.js';
import { Assignments } from './assignments.js';
import { Habits } from './habits.js';
import { Timer } from './timer.js';
import { Attendance } from './attendance.js';
import { Analytics } from './analytics.js';
import { Settings } from './settings.js';
import { Support } from './support.js';
import { ERP } from './erp.js';

const VIEWS = {
  dashboard: Dashboard,
  tasks: Tasks,
  assignments: Assignments,
  habits: Habits,
  timer: Timer,
  attendance: Attendance,
  analytics: Analytics,
  settings: Settings,
  support: Support
};

let state = Storage.load();
let activeView = 'dashboard';
let adminUnlocked = false;
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

function applyTheme(theme) {
  const mode = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', mode);
  const label = document.getElementById('theme-toggle-label');
  if (label) {
    label.textContent = mode === 'light' ? 'Obsidian Dark Mode' : 'B&W Light Mode';
  }
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

function initCursorParallax() {
  const layers = Array.from(document.querySelectorAll('.bg-wave-layer'));
  const spotlight = document.getElementById('bg-spotlight');
  if (!layers.length) return;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  window.addEventListener('pointermove', (e) => {
    targetX = (e.clientX / window.innerWidth) - 0.5;
    targetY = (e.clientY / window.innerHeight) - 0.5;
    if (spotlight) {
      spotlight.style.setProperty('--mx', `${e.clientX}px`);
      spotlight.style.setProperty('--my', `${e.clientY}px`);
    }
  }, { passive: true });

  function tick() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    layers.forEach((layer) => {
      const depth = Number(layer.dataset.depth) || 15;
      layer.style.transform = `translate3d(${(-currentX * depth).toFixed(2)}px, ${(-currentY * depth).toFixed(2)}px, 0)`;
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function saveAndSync() {
  Storage.save(state);
  if (ERP.getAuthToken()) {
    ERP.saveUserData(state);
  }
}

function navigate(view) {
  if (!VIEWS[view]) view = 'dashboard';
  activeView = view;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  closeMobileSidebar();

  const container = document.getElementById('view-container');
  container.style.animation = 'none';
  void container.offsetWidth;
  container.style.animation = '';

  VIEWS[view].render(container, {
    state,
    save: saveAndSync,
    replaceState: (newState) => {
      state = newState;
      saveAndSync();
    },
    applyTheme,
    adminUnlocked,
    navigate,
    toast,
    escapeHtml,
    openConfirmModal,
    updateSidebarErpStatus
  });
}

function toggleTheme() {
  const next = state.settings.theme === 'light' ? 'dark' : 'light';
  state.settings.theme = next;
  applyTheme(next);
  saveAndSync();
  navigate(activeView);
}

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(state.settings.theme);
  Timer.init(state.settings);
  updateSidebarErpStatus(Boolean(state.erpCache));
  initCursorParallax();

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  document.getElementById('coffee-btn').addEventListener('click', () => navigate('support'));
  document.getElementById('mobile-theme-btn').addEventListener('click', toggleTheme);

  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  });

  document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);

  if (ERP.getAuthToken()) {
    const remote = await ERP.loadUserData();
    if (remote?.data) {
      state = { ...state, ...remote.data };
      Storage.save(state);
      applyTheme(state.settings?.theme);
      updateSidebarErpStatus(Boolean(state.erpCache));
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
      adminUnlocked = true;
      navigate('settings');
    }
  });
  if (window.location.hash === '#admin') {
    adminUnlocked = true;
    navigate('settings');
  } else {
    navigate('dashboard');
  }
});
