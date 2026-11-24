import { Storage } from './storage.js';
import { Timer } from './timer.js';
import { ERP } from './erp.js';

let adminOverviewCache = null;

export const Settings = {
  async render(container, ctx) {
    const { state, save, toast, openConfirmModal, escapeHtml } = ctx;
    const isSignedIn = Boolean(ERP.getAuthToken());
    const isAdmin = Boolean(ERP.getAdminToken());
    const rerender = () => this.render(container, ctx);

    if (isAdmin && !adminOverviewCache) {
      adminOverviewCache = await ERP.getAdminOverview();
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Settings</h2>
          <p class="page-subtitle">Personalize your profile, focus durations, cloud sync, and Admin Console.</p>
        </div>
      </div>

      <div class="grid grid-2" style="margin-bottom: 18px;">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="user" style="color:var(--accent);"></i> Profile &amp; Focus Timer</div>
          </div>
          <form id="settings-form" class="form-grid">
            <div>
              <label class="field-label" for="setting-name">Display Name</label>
              <input id="setting-name" class="input" type="text" value="${escapeHtml(state.settings.displayName)}" required />
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
            <div class="card-title"><i data-lucide="cloud" style="color:var(--accent);"></i> LifeOS Account &amp; Session Sync</div>
            <span class="badge ${isSignedIn ? 'badge-success' : 'badge-neutral'}">${isSignedIn ? 'Synced' : 'Local Only'}</span>
          </div>
          ${isSignedIn ? `
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
              Your tasks, assignments, habits, notes, analytics, and encrypted QUMS session are saved in the backend database.
            </p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button type="button" id="cloud-sync-now-btn" class="btn btn-primary btn-sm"><i data-lucide="refresh-cw"></i> Sync Now</button>
              <button type="button" id="cloud-logout-btn" class="btn btn-secondary btn-sm"><i data-lucide="log-out"></i> Sign Out</button>
            </div>
          ` : `
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
              Create a LifeOS account or sign in to save your progress and encrypted QUMS session across visits.
            </p>
            <form id="cloud-auth-form" class="form-grid" style="gap:10px;">
              <input id="cloud-user" class="input" type="text" placeholder="Choose a username" required />
              <input id="cloud-pass" class="input" type="password" placeholder="Password (min 4 chars)" required />
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="submit" data-auth-mode="login" class="btn btn-primary btn-sm">Sign In</button>
                <button type="submit" data-auth-mode="register" class="btn btn-secondary btn-sm">Create Account</button>
              </div>
            </form>
          `}
        </div>
      </div>

      <!-- Admin Console (Hidden from regular visitors; open via #admin or Ctrl+Shift+A) -->
      ${(window.location.hash === '#admin' || isAdmin || ctx.adminUnlocked) ? `<div class="card" style="margin-bottom: 18px;">
        <div class="card-header">
          <div class="card-title"><i data-lucide="shield" style="color:var(--accent);"></i> Admin Console</div>
          <span class="badge ${isAdmin ? 'badge-success' : 'badge-neutral'}">${isAdmin ? 'Admin Authenticated' : 'Locked'}</span>
        </div>

        ${!isAdmin ? `
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
            Sign in with your server <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> to manage the global Support QR scanner and inspect the database &amp; activity logs.
          </p>
          <form id="admin-login-form" class="grid grid-3" style="align-items:end;gap:10px;">
            <div>
              <label class="field-label" for="admin-user">Admin Username</label>
              <input id="admin-user" class="input" type="text" placeholder="admin" required />
            </div>
            <div>
              <label class="field-label" for="admin-pass">Admin Password</label>
              <input id="admin-pass" class="input" type="password" placeholder="Admin password" required />
            </div>
            <button type="submit" class="btn btn-primary"><i data-lucide="lock-open"></i> Sign In as Admin</button>
          </form>
        ` : `
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:16px;flex-wrap:wrap;">
            <button type="button" id="admin-refresh-btn" class="btn btn-secondary btn-sm"><i data-lucide="refresh-cw"></i> Refresh DB</button>
            <button type="button" id="admin-logout-btn" class="btn btn-danger btn-sm"><i data-lucide="log-out"></i> Admin Sign Out</button>
          </div>

          <div class="grid grid-3" style="gap:12px;margin-bottom:18px;">
            <div class="list-row" style="flex-direction:column;align-items:flex-start;">
              <span class="stat-label">Registered Users</span>
              <span class="stat-value" style="font-size:22px;">${adminOverviewCache?.totalUsers ?? 0}</span>
            </div>
            <div class="list-row" style="flex-direction:column;align-items:flex-start;">
              <span class="stat-label">QUMS Sessions Saved</span>
              <span class="stat-value" style="font-size:22px;">${adminOverviewCache?.qumsLinkedCount ?? 0}</span>
            </div>
            <div class="list-row" style="flex-direction:column;align-items:flex-start;">
              <span class="stat-label">Active Auth Tokens</span>
              <span class="stat-value" style="font-size:22px;">${adminOverviewCache?.activeTokensCount ?? 0}</span>
            </div>
          </div>

          <form id="admin-support-form" class="form-grid" style="margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid var(--border);">
            <div style="font-weight:600;font-size:13px;">Global Support / QR Scanner Config (Public Read-Only)</div>
            <div class="grid grid-3" style="gap:10px;">
              <div>
                <label class="field-label" for="admin-qr-file">Upload QR Scanner Image</label>
                <input id="admin-qr-file" class="input" type="file" accept="image/*" />
              </div>
              <div>
                <label class="field-label" for="admin-upi">UPI ID</label>
                <input id="admin-upi" class="input" type="text" placeholder="yourname@upi" value="${escapeHtml(adminOverviewCache?.supportConfig?.upiId || '')}" />
              </div>
              <div>
                <label class="field-label" for="admin-coffee-url">Buy Me a Coffee URL</label>
                <input id="admin-coffee-url" class="input" type="url" placeholder="https://buymeacoffee.com/..." value="${escapeHtml(adminOverviewCache?.supportConfig?.coffeeUrl || '')}" />
              </div>
            </div>
            <div style="display:flex;gap:10px;">
              <button type="submit" class="btn btn-primary btn-sm"><i data-lucide="save"></i> Save Global Support QR</button>
            </div>
          </form>

          <div class="grid grid-2" style="gap:16px;">
            <div>
              <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Database Users</div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>User</th><th>QUMS</th><th>Tasks/Habits</th><th>Updated</th></tr></thead>
                  <tbody>
                    ${(adminOverviewCache?.users || []).length === 0 ? `
                      <tr><td colspan="4" style="color:var(--text-muted);text-align:center;">No registered users yet.</td></tr>
                    ` : adminOverviewCache.users.map((u) => `
                      <tr>
                        <td style="font-weight:500;">${escapeHtml(u.username)}</td>
                        <td><span class="badge ${u.hasQumsSession ? 'badge-success' : 'badge-neutral'}">${u.hasQumsSession ? 'Linked' : 'None'}</span></td>
                        <td>${u.tasksCount}T / ${u.assignmentsCount}A / ${u.habitsCount}H</td>
                        <td style="font-size:12px;color:var(--text-muted);">${new Date(u.updatedAt).toLocaleString()}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Recent Server Activity</div>
              <div class="item-list" style="max-height:240px;overflow-y:auto;">
                ${(adminOverviewCache?.activityLogs || []).length === 0 ? `
                  <div class="empty-state" style="padding:16px;">No activity logged yet.</div>
                ` : adminOverviewCache.activityLogs.slice(0, 20).map((log) => `
                  <div class="list-row" style="padding:8px 10px;">
                    <div style="font-size:12px;">
                      <strong>${escapeHtml(log.event)}</strong>: ${escapeHtml(log.detail)}
                    </div>
                    <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${new Date(log.at).toLocaleTimeString()}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `}
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="database" style="color:var(--accent);"></i> Local Backup &amp; Reset</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
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
    `;

    container.querySelector('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      state.settings.displayName = container.querySelector('#setting-name').value.trim() || 'Student';
      state.settings.pomodoro = {
        focus: Math.max(1, Number(container.querySelector('#setting-focus').value) || 25),
        shortBreak: Math.max(1, Number(container.querySelector('#setting-short').value) || 5),
        longBreak: Math.max(1, Number(container.querySelector('#setting-long').value) || 15)
      };
      save();
      Timer.reset(ctx);
      toast('Settings saved');
    });

    const authForm = container.querySelector('#cloud-auth-form');
    if (authForm) {
      let authMode = 'login';
      authForm.querySelectorAll('[data-auth-mode]').forEach((b) => {
        b.addEventListener('click', () => { authMode = b.dataset.authMode; });
      });
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = container.querySelector('#cloud-user').value.trim();
        const p = container.querySelector('#cloud-pass').value;
        const res = authMode === 'register' ? await ERP.authRegister(u, p) : await ERP.authLogin(u, p);
        if (res.ok) {
          if (authMode === 'login') {
            const loaded = await ERP.loadUserData();
            if (loaded?.data) {
              ctx.replaceState(loaded.data);
              ctx.applyTheme(loaded.data.settings?.theme || 'light');
            }
          } else {
            await ERP.saveUserData(state, true);
          }
          toast(authMode === 'register' ? 'Account created & synced!' : 'Signed in & synced!');
          rerender();
        } else {
          toast(res.message || 'Authentication failed');
        }
      });
    }

    const syncNowBtn = container.querySelector('#cloud-sync-now-btn');
    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', async () => {
        const ok = await ERP.saveUserData(state, true);
        toast(ok ? 'Synced to backend database' : 'Sync failed');
      });
    }

    const logoutBtn = container.querySelector('#cloud-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        ERP.authLogout();
        toast('Signed out of cloud sync');
        rerender();
      });
    }

    const adminLoginForm = container.querySelector('#admin-login-form');
    if (adminLoginForm) {
      adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = container.querySelector('#admin-user').value.trim();
        const p = container.querySelector('#admin-pass').value;
        const res = await ERP.adminLogin(u, p);
        if (res.ok) {
          adminOverviewCache = await ERP.getAdminOverview();
          toast('Admin authenticated');
          rerender();
        } else {
          toast(res.message || 'Admin login failed');
        }
      });
    }

    const adminRefreshBtn = container.querySelector('#admin-refresh-btn');
    if (adminRefreshBtn) {
      adminRefreshBtn.addEventListener('click', async () => {
        adminOverviewCache = await ERP.getAdminOverview();
        toast('Database overview refreshed');
        rerender();
      });
    }

    const adminLogoutBtn = container.querySelector('#admin-logout-btn');
    if (adminLogoutBtn) {
      adminLogoutBtn.addEventListener('click', async () => {
        await ERP.adminLogout();
        adminOverviewCache = null;
        toast('Admin signed out');
        rerender();
      });
    }

    const adminSupportForm = container.querySelector('#admin-support-form');
    if (adminSupportForm) {
      let pendingQr = adminOverviewCache?.supportConfig?.scannerImage || '';
      container.querySelector('#admin-qr-file').addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          pendingQr = String(reader.result || '');
          toast('QR image ready — click Save Global Support QR');
        };
        reader.readAsDataURL(file);
      });

      adminSupportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await ERP.saveAdminSupport({
          upiId: container.querySelector('#admin-upi').value.trim(),
          coffeeUrl: container.querySelector('#admin-coffee-url').value.trim(),
          scannerImage: pendingQr
        });
        if (res.ok) {
          adminOverviewCache = await ERP.getAdminOverview();
          toast('Global Support QR saved!');
          rerender();
        } else {
          toast(res.message || 'Failed to save');
        }
      });
    }

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
            assignments: Array.isArray(imported.assignments) ? imported.assignments : [],
            habits: Array.isArray(imported.habits) ? imported.habits : [],
            focusSessions: Array.isArray(imported.focusSessions) ? imported.focusSessions : [],
            quickNote: imported.quickNote || '',
            dailyMood: imported.dailyMood || {},
            erpCache: imported.erpCache || null,
            attendanceHistory: Array.isArray(imported.attendanceHistory) ? imported.attendanceHistory : []
          });
          Timer.reset(ctx);
          ctx.applyTheme(ctx.state.settings.theme || 'light');
          toast('Data imported successfully');
          rerender();
        } catch {
          toast('Invalid JSON backup file');
        }
      };
      reader.readAsText(file);
    });

    container.querySelector('#clear-data-btn').addEventListener('click', () => {
      openConfirmModal(
        'Clear All Stored Data?',
        'This will permanently erase your tasks, assignments, habits, focus history, and cached attendance from localStorage.',
        () => {
          const fresh = Storage.reset();
          ctx.replaceState(fresh);
          Timer.reset(ctx);
          ctx.applyTheme('light');
          ctx.updateSidebarErpStatus(false);
          toast('All stored data cleared');
          rerender();
        }
      );
    });

    if (window.lucide) window.lucide.createIcons();
  }
};
