import { Storage } from './storage.js';
import { Timer } from './timer.js';

export const Settings = {
  render(container, ctx) {
    const { state, save, toast, openConfirmModal } = ctx;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Settings</h2>
          <p class="page-subtitle">Personalize your profile, timer durations, and manage local data.</p>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="user" style="color:var(--accent);"></i> Profile &amp; Focus Timer</div>
          </div>
          <form id="settings-form" class="form-grid">
            <div>
              <label class="field-label" for="setting-name">Display Name</label>
              <input id="setting-name" class="input" type="text" value="${ctx.escapeHtml(state.settings.displayName)}" required />
            </div>
            <div class="grid grid-3" style="gap:10px;">
              <div>
                <label class="field-label" for="setting-focus">Focus (min)</label>
                <input id="setting-focus" class="input" type="number" min="1" max="120" value="${state.settings.pomodoro.focus}" required />
              </div>
              <div>
                <label class="field-label" for="setting-short">Short Break</label>
                <input id="setting-short" class="input" type="number" min="1" max="60" value="${state.settings.pomodoro.shortBreak}" required />
              </div>
              <div>
                <label class="field-label" for="setting-long">Long Break</label>
                <input id="setting-long" class="input" type="number" min="1" max="60" value="${state.settings.pomodoro.longBreak}" required />
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="justify-self:start;">
              <i data-lucide="save"></i> Save Preferences
            </button>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="database" style="color:var(--accent);"></i> Data Management</div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
            All personal tasks, habits, and focus sessions are stored locally in your browser's <code>localStorage</code>.
          </p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button type="button" id="export-data-btn" class="btn btn-secondary">
              <i data-lucide="download"></i> Export Data as JSON
            </button>
            <label class="btn btn-secondary" style="cursor:pointer;">
              <i data-lucide="upload"></i> Import Data from JSON
              <input type="file" id="import-data-input" accept="application/json,.json" style="display:none;" />
            </label>
            <button type="button" id="clear-data-btn" class="btn btn-danger">
              <i data-lucide="trash-2"></i> Clear All Stored Data
            </button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = container.querySelector('#setting-name').value.trim() || 'Student';
      const focus = Math.max(1, Number(container.querySelector('#setting-focus').value) || 25);
      const shortBreak = Math.max(1, Number(container.querySelector('#setting-short').value) || 5);
      const longBreak = Math.max(1, Number(container.querySelector('#setting-long').value) || 15);

      state.settings.displayName = name;
      state.settings.pomodoro = { focus, shortBreak, longBreak };
      save();
      Timer.reset(ctx);
      toast('Settings saved');
    });

    container.querySelector('#export-data-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lifeos-backup-${Storage.getTodayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Exported LifeOS backup JSON');
    });

    container.querySelector('#import-data-input').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!imported || typeof imported !== 'object') throw new Error('Invalid JSON');
          ctx.replaceState({
            settings: imported.settings || state.settings,
            tasks: Array.isArray(imported.tasks) ? imported.tasks : [],
            habits: Array.isArray(imported.habits) ? imported.habits : [],
            focusSessions: Array.isArray(imported.focusSessions) ? imported.focusSessions : [],
            erpCache: imported.erpCache || null,
            attendanceHistory: Array.isArray(imported.attendanceHistory) ? imported.attendanceHistory : []
          });
          Timer.reset(ctx);
          toast('Data imported successfully');
          this.render(container, ctx);
        } catch {
          toast('Invalid JSON backup file');
        }
      };
      reader.readAsText(file);
    });

    container.querySelector('#clear-data-btn').addEventListener('click', () => {
      openConfirmModal(
        'Clear All Stored Data?',
        'This will permanently erase your tasks, habits, focus history, and cached attendance from localStorage.',
        () => {
          const fresh = Storage.reset();
          ctx.replaceState(fresh);
          Timer.reset(ctx);
          ctx.updateSidebarErpStatus(false);
          toast('All stored data cleared');
          this.render(container, ctx);
        }
      );
    });

    if (window.lucide) window.lucide.createIcons();
  }
};
