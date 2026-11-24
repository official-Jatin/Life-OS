import { Storage } from './storage.js';

export const Habits = {
  calculateStreak(habit) {
    let streak = 0;
    const today = Storage.getTodayKey();
    let startOffset = habit.history?.[today] ? 0 : 1;
    for (let i = startOffset; i < 365; i++) {
      const key = Storage.getPastDateKey(i);
      if (habit.history?.[key]) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  },

  getWeeklyProgress(habit) {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      if (habit.history?.[Storage.getPastDateKey(i)]) count += 1;
    }
    return { count, pct: Math.round((count / 7) * 100) };
  },

  getDailySummary(state) {
    const today = Storage.getTodayKey();
    const total = state.habits.length;
    const done = state.habits.filter((h) => Boolean(h.history?.[today])).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  },

  render(container, ctx) {
    const { state, save, toast, escapeHtml } = ctx;
    const today = Storage.getTodayKey();
    const summary = this.getDailySummary(state);

    const last7Days = Array.from({ length: 7 }, (_, idx) => {
      const key = Storage.getPastDateKey(6 - idx);
      const d = new Date(key + 'T00:00:00');
      return {
        key,
        label: d.toLocaleDateString('en-US', { weekday: 'short' })
      };
    });

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Habit Tracker</h2>
          <p class="page-subtitle">Build daily consistency and track 7-day streaks.</p>
        </div>
        <span class="badge badge-purple">Today: ${summary.done}/${summary.total} (${summary.pct}%)</span>
      </div>

      <div class="card" style="margin-bottom: 18px;">
        <form id="habit-form" style="display:flex;gap:12px;flex-wrap:wrap;">
          <input id="habit-name-input" class="input" style="flex:1;min-width:220px;" type="text" placeholder="Create a new daily habit (e.g., Practice DSA 30m)" required />
          <button type="submit" class="btn btn-primary">
            <i data-lucide="plus"></i> Add Habit
          </button>
        </form>
      </div>

      <div class="grid grid-2">
        ${state.habits.length === 0 ? `
          <div class="card empty-state" style="grid-column: 1 / -1;">
            <p>No habits yet. Create your first habit above.</p>
          </div>
        ` : state.habits.map((habit) => {
          const streak = this.calculateStreak(habit);
          const weekly = this.getWeeklyProgress(habit);
          const doneToday = Boolean(habit.history?.[today]);
          return `
            <div class="card">
              <div class="card-header" style="margin-bottom: 12px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <button class="checkbox-btn ${doneToday ? 'checked' : ''}" data-action="toggle-today" data-id="${habit.id}" aria-label="Toggle today">
                    ${doneToday ? '<i data-lucide="check" style="width:14px;height:14px;"></i>' : ''}
                  </button>
                  <div>
                    <div style="font-weight:600;font-size:15px;">${escapeHtml(habit.name)}</div>
                    <div style="font-size:12px;color:var(--text-muted);">Weekly: ${weekly.count}/7 days (${weekly.pct}%)</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span class="badge ${streak > 0 ? 'badge-success' : 'badge-neutral'}">
                    <i data-lucide="flame" style="width:12px;height:12px;"></i> ${streak}d streak
                  </span>
                  <button class="btn-icon" data-action="delete-habit" data-id="${habit.id}" title="Delete habit">
                    <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
                  </button>
                </div>
              </div>

              <div class="progress-track" style="margin-bottom: 14px;">
                <div class="progress-fill" style="width: ${weekly.pct}%;"></div>
              </div>

              <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;text-align:center;">
                ${last7Days.map((day) => {
                  const checked = Boolean(habit.history?.[day.key]);
                  return `
                    <button data-action="toggle-day" data-id="${habit.id}" data-date="${day.key}"
                      style="padding:7px 4px;border-radius:8px;border:1px solid ${checked ? 'var(--accent)' : 'var(--border)'};background:${checked ? 'var(--accent-soft)' : '#0E1118'};font-size:11px;color:${checked ? '#DDD6FE' : 'var(--text-muted)'};">
                      <div>${day.label}</div>
                      <div style="margin-top:3px;font-weight:600;">${checked ? '✓' : '·'}</div>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.querySelector('#habit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = container.querySelector('#habit-name-input');
      const name = input.value.trim();
      if (!name) return;
      state.habits.push({
        id: 'h_' + Date.now(),
        name,
        history: {},
        isSample: false
      });
      save();
      toast('Habit created');
      this.render(container, ctx);
    });

    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        const habit = state.habits.find((h) => h.id === id);
        if (!habit) return;

        if (action === 'toggle-today') {
          habit.history = habit.history || {};
          habit.history[today] = !habit.history[today];
          save();
          this.render(container, ctx);
        } else if (action === 'toggle-day') {
          const dateKey = btn.dataset.date;
          habit.history = habit.history || {};
          habit.history[dateKey] = !habit.history[dateKey];
          save();
          this.render(container, ctx);
        } else if (action === 'delete-habit') {
          state.habits = state.habits.filter((h) => h.id !== id);
          save();
          toast('Habit removed');
          this.render(container, ctx);
        }
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }
};
