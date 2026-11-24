import { Storage } from './storage.js';

let charts = [];

function destroyCharts() {
  charts.forEach((c) => {
    try { c.destroy(); } catch {}
  });
  charts = [];
}

function getLast7DateKeys() {
  return Array.from({ length: 7 }, (_, i) => {
    const key = Storage.getPastDateKey(6 - i);
    const d = new Date(key + 'T00:00:00');
    return {
      key,
      label: d.toLocaleDateString('en-US', { weekday: 'short' })
    };
  });
}

export const Analytics = {
  render(container, ctx) {
    destroyCharts();
    const { state } = ctx;
    const days = getLast7DateKeys();
    const labels = days.map((d) => d.label);

    const taskCounts = days.map((d) =>
      state.tasks.filter((t) => t.completed && t.completedAt === d.key).length
    );

    const habitCounts = days.map((d) => {
      if (state.habits.length === 0) return 0;
      const done = state.habits.filter((h) => Boolean(h.history?.[d.key])).length;
      return Math.round((done / state.habits.length) * 100);
    });

    const focusMinutes = days.map((d) => {
      const entry = state.focusSessions.find((s) => s.date === d.key);
      return entry ? entry.minutes : 0;
    });

    const hasAttendanceHistory = Array.isArray(state.attendanceHistory) && state.attendanceHistory.length > 0;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Analytics</h2>
          <p class="page-subtitle">7-day productivity trends and historical QUMS attendance.</p>
        </div>
        <span class="badge badge-neutral">Productivity data: localStorage</span>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="check-square" style="color:var(--accent);"></i> Weekly Task Completion</div>
          </div>
          <div class="chart-box"><canvas id="chart-tasks"></canvas></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="activity" style="color:var(--success);"></i> Habit Consistency (%)</div>
          </div>
          <div class="chart-box"><canvas id="chart-habits"></canvas></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="clock" style="color:#A78BFA;"></i> Daily Focus Time (min)</div>
          </div>
          <div class="chart-box"><canvas id="chart-focus"></canvas></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="graduation-cap" style="color:var(--warning);"></i> QUMS Attendance Trend</div>
          </div>
          ${hasAttendanceHistory ? `
            <div class="chart-box"><canvas id="chart-attendance"></canvas></div>
          ` : `
            <div class="empty-state" style="height:260px;display:flex;flex-direction:column;justify-content:center;align-items:center;">
              <p style="max-width:340px;">No historical QUMS attendance snapshots yet. Sync attendance from the QUMS Attendance tab to start recording trends.</p>
            </div>
          `}
        </div>
      </div>
    `;

    if (window.Chart) {
      const isLight = state.settings?.theme === 'light';
      const tickColor = isLight ? '#52525B' : '#8E98A8';
      const gridColor = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.06)';
      const barPrimary = isLight ? '#18181B' : '#6EA8FE';
      const commonOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor } },
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } }
        }
      };

      charts.push(new window.Chart(container.querySelector('#chart-tasks'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: taskCounts,
            backgroundColor: barPrimary,
            borderRadius: 6
          }]
        },
        options: commonOpts
      }));

      charts.push(new window.Chart(container.querySelector('#chart-habits'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: habitCounts,
            borderColor: '#10B981',
            backgroundColor: 'rgba(16,185,129,0.15)',
            fill: true,
            tension: 0.35
          }]
        },
        options: {
          ...commonOpts,
          scales: {
            ...commonOpts.scales,
            y: { ...commonOpts.scales.y, max: 100 }
          }
        }
      }));

      charts.push(new window.Chart(container.querySelector('#chart-focus'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: focusMinutes,
            backgroundColor: '#6366F1',
            borderRadius: 6
          }]
        },
        options: commonOpts
      }));

      if (hasAttendanceHistory) {
        charts.push(new window.Chart(container.querySelector('#chart-attendance'), {
          type: 'line',
          data: {
            labels: state.attendanceHistory.map((h) => h.date),
            datasets: [{
              data: state.attendanceHistory.map((h) => h.percentage),
              borderColor: '#F59E0B',
              backgroundColor: 'rgba(245,158,11,0.15)',
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            ...commonOpts,
            scales: {
              ...commonOpts.scales,
              y: { ...commonOpts.scales.y, max: 100 }
            }
          }
        }));
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }
};
