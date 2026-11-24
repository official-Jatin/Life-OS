import { Storage } from './storage.js';

let mode = 'focus';
let remainingSeconds = 25 * 60;
let totalModeSeconds = 25 * 60;
let isRunning = false;
let isPaused = false;
let intervalId = null;
let clockStyle = 'flip'; // 'flip' | 'orbital'
let isFullscreen = false;
let isTilted = false;

function formatParts(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return { m, s, full: `${m}:${s}` };
}

function getDurationForMode(settings, targetMode) {
  const p = settings?.pomodoro || { focus: 25, shortBreak: 5, longBreak: 15 };
  if (targetMode === 'shortBreak') return p.shortBreak * 60;
  if (targetMode === 'longBreak') return p.longBreak * 60;
  return p.focus * 60;
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.4);
    });
  } catch {}
}

export const Timer = {
  init(settings) {
    if (!isRunning && !isPaused) {
      totalModeSeconds = getDurationForMode(settings, mode);
      remainingSeconds = totalModeSeconds;
    }
  },

  getTodayFocusStats(state) {
    const today = Storage.getTodayKey();
    const entry = state.focusSessions.find((s) => s.date === today);
    const totalSessions = state.focusSessions.reduce((acc, s) => acc + (s.count || 0), 0);
    return {
      todayMinutes: entry ? entry.minutes : 0,
      todayCount: entry ? entry.count : 0,
      totalSessions
    };
  },

  setMode(newMode, ctx, onTick) {
    clearInterval(intervalId);
    intervalId = null;
    isRunning = false;
    isPaused = false;
    mode = newMode;
    totalModeSeconds = getDurationForMode(ctx.state.settings, mode);
    remainingSeconds = totalModeSeconds;
    if (onTick) onTick();
  },

  start(ctx, onTick) {
    if (isRunning) return;
    isRunning = true;
    isPaused = false;
    clearInterval(intervalId);
    intervalId = setInterval(() => {
      if (remainingSeconds > 0) {
        remainingSeconds -= 1;
        this.updateVisibleDisplays();
      } else {
        clearInterval(intervalId);
        intervalId = null;
        isRunning = false;
        isPaused = false;

        if (ctx.state.settings.soundEnabled !== false) playChime();

        if (mode === 'focus') {
          const today = Storage.getTodayKey();
          const mins = ctx.state.settings.pomodoro.focus || 25;
          let entry = ctx.state.focusSessions.find((s) => s.date === today);
          if (!entry) {
            entry = { date: today, minutes: 0, count: 0 };
            ctx.state.focusSessions.push(entry);
          }
          entry.minutes += mins;
          entry.count += 1;
          ctx.save();
          ctx.toast(`Focus session complete! +${mins} min logged.`);
        } else {
          ctx.toast('Break finished! Ready for next focus session.');
        }

        totalModeSeconds = getDurationForMode(ctx.state.settings, mode);
        remainingSeconds = totalModeSeconds;
        if (onTick) onTick();
      }
    }, 1000);
    if (onTick) onTick();
  },

  pause(onTick) {
    if (!isRunning) return;
    clearInterval(intervalId);
    intervalId = null;
    isRunning = false;
    isPaused = true;
    if (onTick) onTick();
  },

  reset(ctx, onTick) {
    clearInterval(intervalId);
    intervalId = null;
    isRunning = false;
    isPaused = false;
    totalModeSeconds = getDurationForMode(ctx.state.settings, mode);
    remainingSeconds = totalModeSeconds;
    if (onTick) onTick();
  },

  updateVisibleDisplays() {
    const parts = formatParts(remainingSeconds);
    document.querySelectorAll('[data-timer-clock]').forEach((el) => {
      el.textContent = parts.full;
    });
    document.querySelectorAll('[data-timer-min]').forEach((el) => {
      el.textContent = parts.m;
    });
    document.querySelectorAll('[data-timer-sec]').forEach((el) => {
      el.textContent = parts.s;
    });
    const circle = document.querySelector('[data-timer-ring]');
    if (circle && totalModeSeconds > 0) {
      const circumference = 2 * Math.PI * 66;
      const progress = remainingSeconds / totalModeSeconds;
      circle.style.strokeDashoffset = String(circumference * (1 - progress));
    }
  },

  getStateSnapshot() {
    const parts = formatParts(remainingSeconds);
    return {
      mode,
      remainingSeconds,
      totalModeSeconds,
      formatted: parts.full,
      parts,
      isRunning,
      isPaused
    };
  },

  render(container, ctx) {
    const stats = this.getTodayFocusStats(ctx.state);
    const snap = this.getStateSnapshot();
    const rerender = () => this.render(container, ctx);
    const soundOn = ctx.state.settings.soundEnabled !== false;
    const circumference = 2 * Math.PI * 66;
    const progress = snap.totalModeSeconds > 0 ? snap.remainingSeconds / snap.totalModeSeconds : 1;
    const dashOffset = circumference * (1 - progress);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Daily Focus</h2>
          <p class="page-subtitle">Flip desk clock &amp; orbital Pomodoro timer with mobile landscape fullscreen.</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div class="timer-tabs">
            <button class="timer-tab ${clockStyle === 'flip' ? 'active' : ''}" data-clock-style="flip">Flip Clock</button>
            <button class="timer-tab ${clockStyle === 'orbital' ? 'active' : ''}" data-clock-style="orbital">Orbital</button>
          </div>
          <button id="toggle-sound-btn" class="btn btn-secondary btn-sm">
            <i data-lucide="${soundOn ? 'volume-2' : 'volume-x'}"></i>
          </button>
          <button id="enter-fullscreen-btn" class="btn btn-primary btn-sm">
            <i data-lucide="maximize-2"></i> Full Screen
          </button>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card" style="text-align:center;">
          <div class="timer-tabs" style="margin-bottom: 16px;">
            <button class="timer-tab ${snap.mode === 'focus' ? 'active' : ''}" data-mode="focus">Focus (${ctx.state.settings.pomodoro.focus}m)</button>
            <button class="timer-tab ${snap.mode === 'shortBreak' ? 'active' : ''}" data-mode="shortBreak">Short (${ctx.state.settings.pomodoro.shortBreak}m)</button>
            <button class="timer-tab ${snap.mode === 'longBreak' ? 'active' : ''}" data-mode="longBreak">Long (${ctx.state.settings.pomodoro.longBreak}m)</button>
          </div>

          ${clockStyle === 'flip' ? `
            <div class="flip-clock" style="margin: 18px 0 24px;">
              <div class="flip-tile"><span data-timer-min>${snap.parts.m}</span><small>MIN</small></div>
              <div class="flip-colon">:</div>
              <div class="flip-tile"><span data-timer-sec>${snap.parts.s}</span><small>SEC</small></div>
            </div>
          ` : `
            <div class="timer-ring-wrap">
              <svg class="timer-ring-svg" width="224" height="224" viewBox="0 0 224 224">
                <circle cx="112" cy="112" r="102" fill="none" stroke="rgba(110,168,254,0.12)" stroke-width="1" />
                <circle cx="112" cy="112" r="84" fill="none" stroke="rgba(110,168,254,0.18)" stroke-width="1" stroke-dasharray="4 6" />
                <g class="timer-orbit-group ${snap.isRunning ? 'running' : ''}">
                  <circle cx="112" cy="10" r="3" fill="#6EA8FE" opacity="0.9" />
                  <circle cx="196" cy="112" r="2.5" fill="#93C5FD" opacity="0.7" />
                </g>
                <circle cx="112" cy="112" r="66" fill="rgba(110,168,254,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="5" />
                <circle data-timer-ring cx="112" cy="112" r="66" fill="none" stroke="#6EA8FE" stroke-width="5"
                  stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                  style="transition: stroke-dashoffset 0.5s linear;" />
              </svg>
              <div class="timer-display" data-timer-clock>${snap.formatted}</div>
            </div>
          `}

          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            ${!snap.isRunning ? `
              <button class="btn btn-primary" id="timer-start-btn"><i data-lucide="play"></i> ${snap.isPaused ? 'Resume' : 'Start'}</button>
            ` : `
              <button class="btn btn-secondary" id="timer-pause-btn"><i data-lucide="pause"></i> Pause</button>
            `}
            <button class="btn btn-secondary" id="timer-reset-btn"><i data-lucide="rotate-ccw"></i> Reset</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="award" style="color:var(--accent);"></i> Session Summary</div>
            <span class="badge badge-purple">${stats.todayCount} today (${stats.todayMinutes} min)</span>
          </div>
          <div class="grid grid-2" style="gap: 12px; margin-bottom: 16px;">
            <div class="list-row" style="flex-direction:column;align-items:flex-start;">
              <span class="stat-label">Completed Today</span>
              <span class="stat-value">${stats.todayCount}</span>
            </div>
            <div class="list-row" style="flex-direction:column;align-items:flex-start;">
              <span class="stat-label">Total Logged Sessions</span>
              <span class="stat-value">${stats.totalSessions}</span>
            </div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);">
            Tap <strong>Full Screen</strong> for a distraction-free desk clock. On mobile devices, you can rotate your phone or tap <strong>Tilt 90°</strong> inside full-screen mode.
          </p>
        </div>
      </div>

      ${isFullscreen ? `
        <div class="focus-fullscreen-overlay ${isTilted ? 'tilted' : ''}" id="focus-fullscreen-overlay">
          <div class="focus-fs-inner">
            <div class="focus-fs-top">
              <span class="badge badge-neutral" style="text-transform:uppercase;letter-spacing:0.08em;">${snap.mode === 'focus' ? 'Focus Session' : snap.mode === 'shortBreak' ? 'Short Break' : 'Long Break'}</span>
              <div style="display:flex;gap:8px;">
                <button id="fs-tilt-btn" class="btn btn-secondary btn-sm"><i data-lucide="smartphone"></i> Tilt 90°</button>
                <button id="fs-exit-btn" class="btn btn-secondary btn-sm"><i data-lucide="minimize-2"></i> Exit</button>
              </div>
            </div>
            <div class="flip-clock flip-clock-lg">
              <div class="flip-tile"><span data-timer-min>${snap.parts.m}</span><small>MIN</small></div>
              <div class="flip-colon">:</div>
              <div class="flip-tile"><span data-timer-sec>${snap.parts.s}</span><small>SEC</small></div>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;">
              ${!snap.isRunning ? `
                <button class="btn btn-primary" id="fs-start-btn"><i data-lucide="play"></i> ${snap.isPaused ? 'Resume' : 'Start'}</button>
              ` : `
                <button class="btn btn-secondary" id="fs-pause-btn"><i data-lucide="pause"></i> Pause</button>
              `}
              <button class="btn btn-secondary" id="fs-reset-btn"><i data-lucide="rotate-ccw"></i> Reset</button>
            </div>
          </div>
        </div>
      ` : ''}
    `;

    container.querySelectorAll('[data-clock-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        clockStyle = btn.dataset.clockStyle;
        rerender();
      });
    });

    container.querySelector('#toggle-sound-btn').addEventListener('click', () => {
      ctx.state.settings.soundEnabled = !soundOn;
      ctx.save();
      rerender();
    });

    container.querySelector('#enter-fullscreen-btn').addEventListener('click', async () => {
      isFullscreen = true;
      rerender();
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape').catch(() => {});
        }
      } catch {}
    });

    const fsExit = container.querySelector('#fs-exit-btn');
    if (fsExit) {
      fsExit.addEventListener('click', async () => {
        isFullscreen = false;
        isTilted = false;
        try {
          if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
          if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        } catch {}
        rerender();
      });
    }

    const fsTilt = container.querySelector('#fs-tilt-btn');
    if (fsTilt) {
      fsTilt.addEventListener('click', () => {
        isTilted = !isTilted;
        rerender();
      });
    }

    const fsStart = container.querySelector('#fs-start-btn');
    if (fsStart) fsStart.addEventListener('click', () => this.start(ctx, rerender));
    const fsPause = container.querySelector('#fs-pause-btn');
    if (fsPause) fsPause.addEventListener('click', () => this.pause(rerender));
    const fsReset = container.querySelector('#fs-reset-btn');
    if (fsReset) fsReset.addEventListener('click', () => this.reset(ctx, rerender));

    container.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode, ctx, rerender));
    });

    const startBtn = container.querySelector('#timer-start-btn');
    if (startBtn) startBtn.addEventListener('click', () => this.start(ctx, rerender));
    const pauseBtn = container.querySelector('#timer-pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.pause(rerender));
    container.querySelector('#timer-reset-btn').addEventListener('click', () => this.reset(ctx, rerender));

    if (window.lucide) window.lucide.createIcons();
  }
};
