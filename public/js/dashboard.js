import { Storage } from './storage.js';
import { Tasks } from './tasks.js';
import { Habits } from './habits.js';
import { Timer } from './timer.js';

let dashChart = null;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const Dashboard = {
  render(container, ctx) {
    if (dashChart) {
      try { dashChart.destroy(); } catch {}
      dashChart = null;
    }

    const { state, save, navigate, toast, escapeHtml } = ctx;
    const today = Storage.getTodayKey();
    const formattedDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const taskStats = Tasks.getStats(state);
    const habitStats = Habits.getDailySummary(state);
    const focusStats = Timer.getTodayFocusStats(state);
    const timerSnap = Timer.getStateSnapshot();
    const erp = state.erpCache;
    const todayTasks = state.tasks.filter((t) => t.dueDate === today);

    const circumference = 2 * Math.PI * 66;
    const progress = timerSnap.totalModeSeconds > 0 ? timerSnap.remainingSeconds / timerSnap.totalModeSeconds : 1;
    const dashOffset = circumference * (1 - progress);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">${getGreeting()}, ${escapeHtml(state.settings.displayName)}</h2>
          <p class="page-subtitle">${formattedDate} &bull; Your life, organized.</p>
        </div>
        <span class="badge badge-neutral">${focusStats.todayCount} focus sessions today</span>
      </div>

      <!-- Exact Bento Grid inspired by LIFE OS 2.0 -->
      <div class="bento-grid">
        <!-- Left Column: Tasks + Wellness/Habits -->
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="card card-interactive" id="bento-tasks-card">
            <div class="bento-icon-circle"><i data-lucide="check-square" style="width:18px;height:18px;"></i></div>
            <div class="stat-value" style="font-size:24px;">${taskStats.pct}%</div>
            <div class="bento-label">TASKS &bull; ${taskStats.completed}/${taskStats.total}</div>
            <div class="bento-watermark"><i data-lucide="check-check" style="width:36px;height:36px;"></i></div>
          </div>

          <div class="card" style="flex:1;">
            <svg class="bento-wave-bg" viewBox="0 0 320 380" preserveAspectRatio="none">
              <defs>
                <linearGradient id="cardWaveA" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#94A3B8" stop-opacity="0.32"/>
                  <stop offset="100%" stop-color="#334155" stop-opacity="0.18"/>
                </linearGradient>
                <linearGradient id="cardWaveB" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#CBD5E1" stop-opacity="0.28"/>
                  <stop offset="100%" stop-color="#475569" stop-opacity="0.16"/>
                </linearGradient>
              </defs>
              <path d="M-10,120 C70,180 150,50 240,120 C290,155 310,95 330,110 L330,-10 L-10,-10 Z" fill="url(#cardWaveA)" />
              <path d="M-10,270 C90,210 180,320 330,240 L330,390 L-10,390 Z" fill="url(#cardWaveB)" />
            </svg>
            <div class="bento-content">
              <div class="card-header" style="margin-bottom:12px;">
                <span class="bento-label">WELLNESS &amp; HABITS</span>
                <button class="btn btn-secondary btn-sm" id="dash-view-habits">${habitStats.done}/${habitStats.total}</button>
              </div>
              <div class="item-list">
                ${state.habits.slice(0, 3).map((h) => {
                  const done = Boolean(h.history?.[today]);
                  return `
                    <div class="list-row">
                      <div class="list-row-left">
                        <button class="checkbox-btn ${done ? 'checked' : ''}" data-dash-habit="${h.id}">
                          ${done ? '<i data-lucide="check" style="width:13px;height:13px;"></i>' : ''}
                        </button>
                        <span style="font-size:13px;${done ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${escapeHtml(h.name)}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Centerpiece: DAILY FOCUS Orbital Ring -->
        <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;">
          <div style="width:100%;display:flex;justify-content:space-between;align-items:center;">
            <span class="bento-label" style="margin:0 auto;">DAILY FOCUS</span>
          </div>

          <div class="timer-ring-wrap">
            <svg class="timer-ring-svg" width="224" height="224" viewBox="0 0 224 224">
              <circle cx="112" cy="112" r="102" fill="none" stroke="rgba(110,168,254,0.12)" stroke-width="1" />
              <circle cx="112" cy="112" r="84" fill="none" stroke="rgba(110,168,254,0.18)" stroke-width="1" stroke-dasharray="4 6" />
              <g class="timer-orbit-group ${timerSnap.isRunning ? 'running' : ''}">
                <circle cx="112" cy="10" r="3" fill="#6EA8FE" opacity="0.9" />
                <circle cx="196" cy="112" r="2.5" fill="#93C5FD" opacity="0.7" />
              </g>
              <circle cx="112" cy="112" r="66" fill="rgba(110,168,254,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="5" />
              <circle data-timer-ring cx="112" cy="112" r="66" fill="none" stroke="#6EA8FE" stroke-width="5"
                stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                style="transition: stroke-dashoffset 0.5s linear;" />
            </svg>
            <div class="timer-display" data-timer-clock>${timerSnap.formatted}</div>
          </div>

          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            ${!timerSnap.isRunning ? `
              <button class="btn btn-primary btn-sm" id="dash-timer-start"><i data-lucide="play"></i> ${timerSnap.isPaused ? 'Resume' : 'Start'}</button>
            ` : `
              <button class="btn btn-secondary btn-sm" id="dash-timer-pause"><i data-lucide="pause"></i> Pause</button>
            `}
            <button class="btn btn-secondary btn-sm" id="dash-timer-reset"><i data-lucide="rotate-ccw"></i> Reset</button>
            <button class="btn btn-secondary btn-sm" id="dash-open-timer">Open</button>
          </div>
        </div>

        <!-- Right Column: LEARNING (QUMS) + CREATIVE (Quick Notes) -->
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="card card-interactive" id="dash-erp-card">
            <div class="bento-icon-circle"><i data-lucide="graduation-cap" style="width:18px;height:18px;"></i></div>
            ${erp ? `
              <div class="stat-value" style="font-size:24px;color:${erp.overall.TotalPercentage < 75 ? 'var(--warning)' : 'var(--success)'};">${erp.overall.TotalPercentage}%</div>
              <div class="bento-label">LEARNING &bull; ${erp.overall.TotalPresent}/${erp.overall.TotalLecture}</div>
            ` : `
              <div class="stat-value" style="font-size:20px;color:var(--warning);">Pending</div>
              <div class="bento-label">LEARNING &bull; QUMS ERP</div>
            `}
            <div class="bento-watermark"><i data-lucide="library" style="width:36px;height:36px;"></i></div>
          </div>

          <div class="card" style="flex:1;">
            <div class="bento-icon-circle" style="margin-bottom:12px;"><i data-lucide="pencil" style="width:18px;height:18px;"></i></div>
            <div class="bento-label" style="margin-bottom:10px;">CREATIVE &amp; NOTES</div>
            <textarea id="dash-quick-note" class="textarea" rows="4" placeholder="Jot down quick ideas or reminders...">${escapeHtml(state.quickNote || '')}</textarea>
            <div class="bento-watermark"><i data-lucide="palette" style="width:34px;height:34px;"></i></div>
          </div>
        </div>
      </div>

      <!-- Today's Tasks & Weekly Productivity -->
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="list-todo" style="color:var(--accent);"></i> Today's Tasks</div>
            <button class="btn btn-secondary btn-sm" id="dash-view-tasks">Manage</button>
          </div>
          <form id="dash-quick-task-form" style="display:flex;gap:8px;margin-bottom:12px;">
            <input id="dash-quick-task-input" class="input" type="text" placeholder="Quick add a task for today..." required />
            <button type="submit" class="btn btn-primary btn-sm"><i data-lucide="plus"></i></button>
          </form>
          <div class="item-list">
            ${todayTasks.length === 0 ? `
              <div class="empty-state" style="padding:16px;">No tasks due today.</div>
            ` : todayTasks.slice(0, 4).map((task) => `
              <div class="list-row">
                <div class="list-row-left">
                  <button class="checkbox-btn ${task.completed ? 'checked' : ''}" data-dash-toggle="${task.id}">
                    ${task.completed ? '<i data-lucide="check" style="width:13px;height:13px;"></i>' : ''}
                  </button>
                  <span class="task-title ${task.completed ? 'completed' : ''}">${escapeHtml(task.title)}</span>
                </div>
                <span class="badge ${task.priority === 'High' ? 'badge-danger' : task.priority === 'Medium' ? 'badge-warning' : 'badge-neutral'}">${task.priority}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="bar-chart-3" style="color:var(--accent);"></i> Weekly Productivity</div>
            <button class="btn btn-secondary btn-sm" id="dash-view-analytics">Full Analytics</button>
          </div>
          <div class="chart-box"><canvas id="dash-weekly-chart"></canvas></div>
        </div>
      </div>
    `;

    container.querySelector('#bento-tasks-card').addEventListener('click', () => navigate('tasks'));
    container.querySelector('#dash-view-habits').addEventListener('click', () => navigate('habits'));
    container.querySelector('#dash-erp-card').addEventListener('click', () => navigate('attendance'));
    container.querySelector('#dash-view-tasks').addEventListener('click', () => navigate('tasks'));
    container.querySelector('#dash-open-timer').addEventListener('click', () => navigate('timer'));
    container.querySelector('#dash-view-analytics').addEventListener('click', () => navigate('analytics'));

    container.querySelectorAll('[data-dash-habit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const habit = state.habits.find((h) => h.id === btn.dataset.dashHabit);
        if (habit) {
          habit.history = habit.history || {};
          habit.history[today] = !habit.history[today];
          save();
          this.render(container, ctx);
        }
      });
    });

    container.querySelector('#dash-quick-task-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = container.querySelector('#dash-quick-task-input');
      const title = input.value.trim();
      if (!title) return;
      state.tasks.unshift({
        id: 't_' + Date.now(),
        title,
        priority: 'Medium',
        dueDate: today,
        completed: false,
        completedAt: null,
        isSample: false
      });
      save();
      toast('Task added for today');
      this.render(container, ctx);
    });

    container.querySelector('#dash-quick-note').addEventListener('input', (e) => {
      state.quickNote = e.target.value;
      save();
    });

    container.querySelectorAll('[data-dash-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const task = state.tasks.find((t) => t.id === btn.dataset.dashToggle);
        if (task) {
          task.completed = !task.completed;
          task.completedAt = task.completed ? today : null;
          save();
          this.render(container, ctx);
        }
      });
    });

    const rerender = () => this.render(container, ctx);
    const startBtn = container.querySelector('#dash-timer-start');
    if (startBtn) startBtn.addEventListener('click', () => Timer.start(ctx, rerender));
    const pauseBtn = container.querySelector('#dash-timer-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', () => Timer.pause(rerender));
    container.querySelector('#dash-timer-reset').addEventListener('click', () => Timer.reset(ctx, rerender));

    if (window.Chart) {
      const days = Array.from({ length: 7 }, (_, i) => {
        const key = Storage.getPastDateKey(6 - i);
        const d = new Date(key + 'T00:00:00');
        return { key, label: d.toLocaleDateString('en-US', { weekday: 'short' }) };
      });
      dashChart = new window.Chart(container.querySelector('#dash-weekly-chart'), {
        type: 'bar',
        data: {
          labels: days.map((d) => d.label),
          datasets: [
            {
              label: 'Tasks Completed',
              data: days.map((d) => state.tasks.filter((t) => t.completed && t.completedAt === d.key).length),
              backgroundColor: '#6EA8FE',
              borderRadius: 6
            },
            {
              label: 'Focus Sessions',
              data: days.map((d) => {
                const entry = state.focusSessions.find((s) => s.date === d.key);
                return entry ? entry.count : 0;
              }),
              backgroundColor: '#475569',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8E98A8' } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8E98A8' } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8E98A8', stepSize: 1 } }
          }
        }
      });
    }

    if (window.lucide) window.lucide.createIcons();
  }
};
