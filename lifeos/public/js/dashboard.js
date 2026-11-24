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

    const { state, save, navigate, escapeHtml } = ctx;
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

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">${getGreeting()}, ${escapeHtml(state.settings.displayName)}</h2>
          <p class="page-subtitle">${formattedDate}</p>
        </div>
        <span class="badge badge-purple">Productivity: Sample + Local Data</span>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px;">
        <div class="card">
          <span class="stat-label">Daily Completion</span>
          <div class="stat-value">${taskStats.pct}%</div>
          <div class="progress-track" style="margin-top:8px;">
            <div class="progress-fill" style="width:${taskStats.pct}%;"></div>
          </div>
        </div>

        <div class="card">
          <span class="stat-label">Habit Progress</span>
          <div class="stat-value">${habitStats.done}/${habitStats.total}</div>
          <span class="stat-label">${habitStats.pct}% completed today</span>
        </div>

        <div class="card">
          <span class="stat-label">Focus Today</span>
          <div class="stat-value">${focusStats.todayMinutes}m</div>
          <span class="stat-label">${focusStats.todayCount} Pomodoro sessions</span>
        </div>

        <div class="card" style="cursor:pointer;" id="dash-erp-card">
          <span class="stat-label">QUMS Attendance</span>
          ${erp ? `
            <div class="stat-value" style="color:${erp.overall.TotalPercentage < 75 ? 'var(--warning)' : 'var(--success)'};">${erp.overall.TotalPercentage}%</div>
            <span class="stat-label">${erp.overall.TotalPresent}/${erp.overall.TotalLecture} lectures (Live ERP)</span>
          ` : `
            <div class="stat-value" style="font-size:18px;color:var(--warning);margin-top:10px;">Pending</div>
            <span class="stat-label">Connect QUMS backend</span>
          `}
        </div>
      </div>

      <div class="grid grid-dashboard" style="margin-bottom: 18px;">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="list-todo" style="color:var(--accent);"></i> Today's Tasks</div>
            <button class="btn btn-secondary btn-sm" id="dash-view-tasks">Manage</button>
          </div>
          <div class="item-list">
            ${todayTasks.length === 0 ? `
              <div class="empty-state" style="padding:20px;">No tasks due today.</div>
            ` : todayTasks.slice(0, 5).map((task) => `
              <div class="list-row">
                <div class="list-row-left">
                  <button class="checkbox-btn ${task.completed ? 'checked' : ''}" data-dash-toggle="${task.id}">
                    ${task.completed ? '<i data-lucide="check" style="width:14px;height:14px;"></i>' : ''}
                  </button>
                  <span class="task-title ${task.completed ? 'completed' : ''}">${escapeHtml(task.title)}</span>
                </div>
                <span class="badge ${task.priority === 'High' ? 'badge-danger' : task.priority === 'Medium' ? 'badge-warning' : 'badge-neutral'}">${task.priority}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;">
          <div class="card-header">
            <div class="card-title"><i data-lucide="timer" style="color:var(--accent);"></i> Focus Timer</div>
            <button class="btn btn-secondary btn-sm" id="dash-open-timer">Full View</button>
          </div>
          <div class="timer-display" style="font-size:44px;margin:10px 0;" data-timer-clock>${timerSnap.formatted}</div>
          <div style="display:flex;justify-content:center;gap:10px;">
            ${!timerSnap.isRunning ? `
              <button class="btn btn-primary btn-sm" id="dash-timer-start"><i data-lucide="play"></i> ${timerSnap.isPaused ? 'Resume' : 'Start'}</button>
            ` : `
              <button class="btn btn-secondary btn-sm" id="dash-timer-pause"><i data-lucide="pause"></i> Pause</button>
            `}
            <button class="btn btn-secondary btn-sm" id="dash-timer-reset"><i data-lucide="rotate-ccw"></i> Reset</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="bar-chart-3" style="color:var(--accent);"></i> Weekly Productivity</div>
          <button class="btn btn-secondary btn-sm" id="dash-view-analytics">Full Analytics</button>
        </div>
        <div class="chart-box"><canvas id="dash-weekly-chart"></canvas></div>
      </div>
    `;

    container.querySelector('#dash-erp-card').addEventListener('click', () => navigate('attendance'));
    container.querySelector('#dash-view-tasks').addEventListener('click', () => navigate('tasks'));
    container.querySelector('#dash-open-timer').addEventListener('click', () => navigate('timer'));
    container.querySelector('#dash-view-analytics').addEventListener('click', () => navigate('analytics'));

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
              backgroundColor: '#8B5CF6',
              borderRadius: 6
            },
            {
              label: 'Focus Sessions',
              data: days.map((d) => {
                const entry = state.focusSessions.find((s) => s.date === d.key);
                return entry ? entry.count : 0;
              }),
              backgroundColor: '#10B981',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94A3B8' } }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94A3B8' } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94A3B8', stepSize: 1 } }
          }
        }
      });
    }

    if (window.lucide) window.lucide.createIcons();
  }
};
