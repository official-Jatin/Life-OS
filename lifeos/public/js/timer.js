import { Storage } from './storage.js';

let mode = 'focus'; // 'focus' | 'shortBreak' | 'longBreak'
let remainingSeconds = 25 * 60;
let isRunning = false;
let isPaused = false;
let intervalId = null;

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getDurationForMode(settings, targetMode) {
  const p = settings?.pomodoro || { focus: 25, shortBreak: 5, longBreak: 15 };
  if (targetMode === 'shortBreak') return p.shortBreak * 60;
  if (targetMode === 'longBreak') return p.longBreak * 60;
  return p.focus * 60;
}

export const Timer = {
  init(settings) {
    if (!isRunning && !isPaused) {
      remainingSeconds = getDurationForMode(settings, mode);
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
    remainingSeconds = getDurationForMode(ctx.state.settings, mode);
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

        remainingSeconds = getDurationForMode(ctx.state.settings, mode);
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
    remainingSeconds = getDurationForMode(ctx.state.settings, mode);
    if (onTick) onTick();
  },

  updateVisibleDisplays() {
    document.querySelectorAll('[data-timer-clock]').forEach((el) => {
      el.textContent = formatTime(remainingSeconds);
    });
  },

  getStateSnapshot() {
    return {
      mode,
      remainingSeconds,
      formatted: formatTime(remainingSeconds),
      isRunning,
      isPaused
    };
  },

  render(container, ctx) {
    const stats = this.getTodayFocusStats(ctx.state);
    const snap = this.getStateSnapshot();
    const rerender = () => this.render(container, ctx);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Focus Timer</h2>
          <p class="page-subtitle">Stay locked in with structured Pomodoro intervals.</p>
        </div>
        <span class="badge badge-purple">${stats.todayCount} sessions today (${stats.todayMinutes} min)</span>
      </div>

      <div class="grid grid-2">
        <div class="card" style="text-align:center;">
          <div class="timer-tabs" style="margin-bottom: 14px;">
            <button class="timer-tab ${snap.mode === 'focus' ? 'active' : ''}" data-mode="focus">Focus (${ctx.state.settings.pomodoro.focus}m)</button>
            <button class="timer-tab ${snap.mode === 'shortBreak' ? 'active' : ''}" data-mode="shortBreak">Short Break (${ctx.state.settings.pomodoro.shortBreak}m)</button>
            <button class="timer-tab ${snap.mode === 'longBreak' ? 'active' : ''}" data-mode="longBreak">Long Break (${ctx.state.settings.pomodoro.longBreak}m)</button>
          </div>

          <div class="timer-display" data-timer-clock>${snap.formatted}</div>

          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            ${!snap.isRunning ? `
              <button class="btn btn-primary" id="timer-start-btn">
                <i data-lucide="play"></i> ${snap.isPaused ? 'Resume' : 'Start'}
              </button>
            ` : `
              <button class="btn btn-secondary" id="timer-pause-btn">
                <i data-lucide="pause"></i> Pause
              </button>
            `}
            <button class="btn btn-secondary" id="timer-reset-btn">
              <i data-lucide="rotate-ccw"></i> Reset
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="award" style="color:var(--accent);"></i> Session Summary</div>
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
            Completed focus sessions automatically record minutes to your daily log for Analytics. Adjust durations anytime in Settings.
          </p>
        </div>
      </div>
    `;

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
