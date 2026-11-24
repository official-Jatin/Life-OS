import { ERP } from './erp.js';
import { Storage } from './storage.js';

let isSyncing = false;
let isLoggingIn = false;
let lastStatusMessage = null;
let lastStatusType = 'pending';
let loginChallenge = null;
let showLoginForm = false;
let showPassword = false;
let subjectSearch = '';
let subjectFilter = 'all'; // 'all' | 'below'
let plannedRemaining = 30;

function formatSyncTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function computeInsights(present, total, minPct) {
  const target = Math.min(99.9, Math.max(1, Number(minPct) || 75));
  const pct = total > 0 ? (present / total) * 100 : 0;
  const canMiss = total > 0 && pct >= target ? Math.max(0, Math.floor((100 * present) / target - total)) : 0;
  const needed = pct < target ? Math.max(0, Math.ceil((target * total - 100 * present) / (100 - target))) : 0;
  return { target, canMiss, needed };
}

function getWarningBadge(percentage, threshold) {
  if (percentage < threshold - 10) return `<span class="badge badge-danger">Critical (&lt;${Math.max(0, threshold - 10)}%)</span>`;
  if (percentage < threshold) return `<span class="badge badge-warning">Below ${threshold}%</span>`;
  return `<span class="badge badge-success">Above ${threshold}%</span>`;
}

function getProgressColor(percentage, threshold) {
  if (percentage < threshold - 10) return 'var(--danger)';
  if (percentage < threshold) return 'var(--warning)';
  return 'var(--success)';
}

export const Attendance = {
  async loadCaptcha(ctx, onComplete) {
    loginChallenge = null;
    if (onComplete) onComplete();
    const res = await ERP.initLogin();
    if (res.ok && res.loginSessionId) {
      loginChallenge = {
        loginSessionId: res.loginSessionId,
        captchaImage: res.captchaImage
      };
    } else {
      lastStatusType = res.status || 'pending';
      lastStatusMessage = res.message || 'Unable to load QUMS login challenge.';
    }
    if (onComplete) onComplete();
  },

  async sync(ctx, onComplete) {
    if (isSyncing) return;
    isSyncing = true;
    if (onComplete) onComplete();

    const result = await ERP.fetchAttendance(ctx.state.erpCache?.yearSem || 5);
    isSyncing = false;

    if (result.connected && result.overall) {
      if (result.studentName) {
        ctx.state.settings.displayName = result.studentName;
      }
      ctx.state.erpCache = {
        overall: result.overall,
        subjects: result.subjects || [],
        yearSem: result.yearSem || 5,
        syncedAt: result.syncedAt || new Date().toISOString()
      };

      const today = Storage.getTodayKey();
      const hist = ctx.state.attendanceHistory || [];
      const existingIdx = hist.findIndex((h) => h.date === today);
      const snapshot = { date: today, percentage: result.overall.TotalPercentage };
      if (existingIdx !== -1) hist[existingIdx] = snapshot;
      else hist.push(snapshot);
      ctx.state.attendanceHistory = hist.slice(-30);

      ctx.save();
      lastStatusType = 'connected';
      lastStatusMessage = 'Synced live attendance from QUMS ERP.';
      ctx.toast('QUMS attendance refreshed');
    } else {
      lastStatusType = result.status || 'pending';
      lastStatusMessage = result.message || 'ERP connection is pending.';
      ctx.toast(lastStatusMessage);
    }

    ctx.updateSidebarErpStatus(Boolean(ctx.state.erpCache));
    if (onComplete) onComplete();
  },

  render(container, ctx) {
    const cache = ctx.state.erpCache;
    const minPct = Number(ctx.state.settings.minAttendancePct) || 75;
    const rerender = () => this.render(container, ctx);

    const statusBadge = cache
      ? '<span class="badge badge-success">Live ERP Connected</span>'
      : lastStatusType === 'session_expired'
        ? '<span class="badge badge-danger">Session Expired</span>'
        : '<span class="badge badge-warning">ERP Connection Pending</span>';

    const overallInsights = cache
      ? computeInsights(cache.overall.TotalPresent, cache.overall.TotalLecture, minPct)
      : null;
    const belowCount = cache
      ? cache.subjects.filter((s) => s.Percentage < minPct).length
      : 0;

    const filteredSubjects = (cache?.subjects || []).filter((sub) => {
      const matchesFilter = subjectFilter === 'below' ? sub.Percentage < minPct : true;
      const q = subjectSearch.trim().toLowerCase();
      const matchesQuery = !q || sub.Subject.toLowerCase().includes(q) || (sub.SubjectCode || '').toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">QUMS Attendance</h2>
          <p class="page-subtitle">
            Year/Sem ${cache?.yearSem || 5}
            ${cache?.overall?.DateFrom ? ` &bull; ${ctx.escapeHtml(cache.overall.DateFrom)} – ${ctx.escapeHtml(cache.overall.DateTo)}` : ''}
            &bull; Last synced: ${formatSyncTime(cache?.syncedAt)}
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${statusBadge}
          <button class="btn btn-secondary" id="toggle-qums-login-btn">
            <i data-lucide="key-round"></i> ${showLoginForm ? 'Hide Login' : (cache ? 'Switch Account' : 'Connect QUMS Account')}
          </button>
          <button class="btn btn-primary" id="refresh-attendance-btn" ${isSyncing ? 'disabled' : ''}>
            <i data-lucide="refresh-cw"></i> ${isSyncing ? 'Syncing...' : 'Refresh Attendance'}
          </button>
        </div>
      </div>

      ${showLoginForm ? `
        <div class="card" style="margin-bottom:18px;border-color:rgba(139,92,246,0.4);">
          <div class="card-header">
            <div class="card-title"><i data-lucide="shield-check" style="color:var(--accent);"></i> Sign in to QUMS ERP</div>
            <span class="badge badge-neutral">Credentials stay on your local server</span>
          </div>
          <form id="qums-login-form" class="grid grid-4" style="align-items:end;gap:12px;">
            <div>
              <label class="field-label" for="qums-id">User ID</label>
              <input id="qums-id" class="input" type="text" placeholder="Enter your User ID" autocomplete="username" required />
            </div>
            <div>
              <label class="field-label" for="qums-pass">Password</label>
              <div class="input-group">
                <input id="qums-pass" class="input" type="${showPassword ? 'text' : 'password'}" placeholder="Enter your password" autocomplete="current-password" required />
                <button type="button" id="toggle-qums-pass" class="input-addon-btn" title="${showPassword ? 'Hide password' : 'Show password'}" aria-label="Toggle password visibility">
                  <i data-lucide="${showPassword ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>
                </button>
              </div>
            </div>
            <div class="span-2">
              <label class="field-label" for="qums-captcha">CAPTCHA</label>
              <div style="display:flex;gap:8px;align-items:center;">
                ${loginChallenge?.captchaImage
                  ? `<img src="${loginChallenge.captchaImage}" alt="QUMS CAPTCHA" style="height:38px;border-radius:6px;border:1px solid var(--border);background:#fff;" />`
                  : `<span style="font-size:12px;color:var(--text-muted);">No image</span>`
                }
                <button type="button" id="reload-captcha-btn" class="btn-icon" title="Reload CAPTCHA"><i data-lucide="refresh-cw" style="width:15px;height:15px;"></i></button>
                <input id="qums-captcha" class="input" type="text" placeholder="Enter CAPTCHA text" required />
              </div>
            </div>
            <div class="span-2" style="display:flex; gap:10px; justify-content:flex-end;">
              <button type="submit" class="btn btn-primary" ${isLoggingIn ? 'disabled' : ''}>
                <i data-lucide="log-in"></i> ${isLoggingIn ? 'Connecting...' : 'Connect & Fetch Attendance'}
              </button>
            </div>
          </form>
        </div>
      ` : ''}

      ${lastStatusMessage && !cache ? `
        <div class="card" style="margin-bottom:18px;border-color:${lastStatusType === 'session_expired' || lastStatusType === 'network_error' || lastStatusType === 'auth_failed' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.35)'};">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <i data-lucide="alert-triangle" style="color:${lastStatusType === 'session_expired' || lastStatusType === 'network_error' || lastStatusType === 'auth_failed' ? 'var(--danger)' : 'var(--warning)'};flex-shrink:0;margin-top:2px;"></i>
            <div>
              <div style="font-weight:600;margin-bottom:4px;">${lastStatusType === 'session_expired' ? 'QUMS Session Expired' : lastStatusType === 'auth_failed' ? 'Authentication Failed' : lastStatusType === 'network_error' ? 'Network Error' : 'QUMS ERP Connection Pending'}</div>
              <p style="color:var(--text-muted);font-size:13px;">${ctx.escapeHtml(lastStatusMessage)}</p>
            </div>
          </div>
        </div>
      ` : ''}

      ${!cache ? `
        <div class="card empty-state">
          <i data-lucide="graduation-cap" style="width:40px;height:40px;color:var(--accent);margin-bottom:10px;"></i>
          <h3 style="font-size:16px;margin-bottom:6px;">No Live QUMS Data Synced Yet</h3>
          <p style="max-width:540px;margin:0 auto 14px;">
            Click <strong>Connect QUMS Account</strong> above to sign in with your User ID, password, and CAPTCHA, or configure <code>QUMS_REG_ID</code> and <code>QUMS_SESSION_COOKIE</code> in <code>.env</code>.
          </p>
        </div>
      ` : `
        <div class="grid grid-4" style="margin-bottom: 18px;">
          <div class="card card-interactive">
            <span class="stat-label">Overall Attendance</span>
            <div class="stat-value" style="color:${getProgressColor(cache.overall.TotalPercentage, minPct)};">${cache.overall.TotalPercentage}%</div>
            ${getWarningBadge(cache.overall.TotalPercentage, minPct)}
          </div>
          <div class="card card-interactive">
            <span class="stat-label">Total Lectures</span>
            <div class="stat-value">${cache.overall.TotalLecture}</div>
            <span class="stat-label">Leave: ${cache.overall.TotalLeave ?? 0}</span>
          </div>
          <div class="card card-interactive">
            <span class="stat-label">Present Lectures</span>
            <div class="stat-value" style="color:var(--success);">${cache.overall.TotalPresent}</div>
            <span class="stat-label">Attended</span>
          </div>
          <div class="card card-interactive">
            <span class="stat-label">Absent Lectures</span>
            <div class="stat-value" style="color:var(--danger);">${cache.overall.TotalAbsent}</div>
            <span class="stat-label">Missed</span>
          </div>
        </div>

        <div class="card" style="margin-bottom: 18px;">
          <div class="card-header" style="margin-bottom:12px;flex-wrap:wrap;">
            <div class="card-title"><i data-lucide="calculator" style="color:var(--accent);"></i> Attendance &amp; Skip Planner</div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:6px;">
                <label for="min-pct-input" style="font-size:12px;color:var(--text-muted);">Target Min %:</label>
                <input id="min-pct-input" class="input" type="number" min="1" max="99" value="${minPct}" style="width:72px;padding:5px 8px;" />
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <label for="rem-classes-input" style="font-size:12px;color:var(--text-muted);">Remaining Classes:</label>
                <input id="rem-classes-input" class="input" type="number" min="0" max="500" value="${plannedRemaining}" style="width:80px;padding:5px 8px;" />
              </div>
            </div>
          </div>
          ${(() => {
            const totalAfter = cache.overall.TotalLecture + plannedRemaining;
            const reqPresent = Math.ceil((minPct / 100) * totalAfter);
            const mustAttend = Math.max(0, reqPresent - cache.overall.TotalPresent);
            const canSkipOutOfRemaining = Math.max(0, plannedRemaining - mustAttend);
            return `
              <div class="grid grid-4" style="gap:12px;">
                <div class="list-row" style="flex-direction:column;align-items:flex-start;">
                  <span class="stat-label">Safe to Miss Now</span>
                  <span class="stat-value" style="font-size:21px;color:var(--success);">${overallInsights.canMiss}</span>
                </div>
                <div class="list-row" style="flex-direction:column;align-items:flex-start;">
                  <span class="stat-label">Can Skip (of ${plannedRemaining} left)</span>
                  <span class="stat-value" style="font-size:21px;color:var(--success);">${mustAttend > plannedRemaining ? 0 : canSkipOutOfRemaining}</span>
                </div>
                <div class="list-row" style="flex-direction:column;align-items:flex-start;">
                  <span class="stat-label">Must Attend (of ${plannedRemaining} left)</span>
                  <span class="stat-value" style="font-size:21px;color:${mustAttend > plannedRemaining ? 'var(--danger)' : 'var(--warning)'};">${mustAttend}</span>
                </div>
                <div class="list-row" style="flex-direction:column;align-items:flex-start;">
                  <span class="stat-label">Subjects Below ${minPct}%</span>
                  <span class="stat-value" style="font-size:21px;color:${belowCount > 0 ? 'var(--danger)' : 'var(--success)'};">${belowCount} / ${cache.subjects.length}</span>
                </div>
              </div>
            `;
          })()}
        </div>

        <div class="card">
          <div class="card-header" style="flex-wrap:wrap;">
            <div class="card-title"><i data-lucide="book-open" style="color:var(--accent);"></i> Subject-wise Attendance</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <input id="subject-search-input" class="input" type="search" placeholder="Search subject or code..." value="${ctx.escapeHtml(subjectSearch)}" style="width:200px;padding:6px 10px;" />
              <div class="timer-tabs">
                <button class="timer-tab ${subjectFilter === 'all' ? 'active' : ''}" data-sub-filter="all">All (${cache.subjects.length})</button>
                <button class="timer-tab ${subjectFilter === 'below' ? 'active' : ''}" data-sub-filter="below">Below ${minPct}% (${belowCount})</button>
              </div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Code</th>
                  <th>Credits</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Leave</th>
                  <th>Total</th>
                  <th style="min-width:160px;">Percentage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${filteredSubjects.length === 0 ? `
                  <tr><td colspan="9" style="text-align:center;color:var(--text-muted);">No matching subjects found.</td></tr>
                ` : filteredSubjects.map((sub) => {
                  const barColor = getProgressColor(sub.Percentage, minPct);
                  const subInsights = computeInsights(sub.TotalPresent, sub.TotalLecture, minPct);
                  return `
                    <tr>
                      <td>
                        <div style="font-weight:500;">${ctx.escapeHtml(sub.Subject)}</div>
                        <div style="font-size:11px;color:var(--text-muted);">
                          ${subInsights.needed > 0 ? `Attend ${subInsights.needed} more for ${minPct}%` : `Can miss ${subInsights.canMiss} for ${minPct}%`}
                        </div>
                      </td>
                      <td style="color:var(--text-muted);">${ctx.escapeHtml(sub.SubjectCode || '—')}</td>
                      <td>${sub.SubjectCredit ?? '—'}</td>
                      <td style="color:var(--success);">${sub.TotalPresent}</td>
                      <td style="color:var(--danger);">${sub.TotalAbsent}</td>
                      <td>${sub.TotalLeave ?? 0}</td>
                      <td>${sub.TotalLecture}</td>
                      <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                          <div class="progress-track" style="height:6px;flex:1;">
                            <div class="progress-fill" style="width:${Math.min(100, sub.Percentage)}%;background:${barColor};"></div>
                          </div>
                          <span style="font-weight:600;min-width:48px;text-align:right;">${sub.Percentage}%</span>
                        </div>
                      </td>
                      <td>${getWarningBadge(sub.Percentage, minPct)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    const remInput = container.querySelector('#rem-classes-input');
    if (remInput) {
      remInput.addEventListener('change', () => {
        plannedRemaining = Math.max(0, Number(remInput.value) || 0);
        rerender();
      });
    }

    const minPctInput = container.querySelector('#min-pct-input');
    if (minPctInput) {
      minPctInput.addEventListener('change', () => {
        ctx.state.settings.minAttendancePct = Math.min(99, Math.max(1, Number(minPctInput.value) || 75));
        ctx.save();
        rerender();
      });
    }

    const searchInput = container.querySelector('#subject-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        subjectSearch = searchInput.value;
        rerender();
        const nextInput = container.querySelector('#subject-search-input');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    }

    container.querySelectorAll('[data-sub-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        subjectFilter = btn.dataset.subFilter;
        rerender();
      });
    });

    const togglePassBtn = container.querySelector('#toggle-qums-pass');
    if (togglePassBtn) {
      togglePassBtn.addEventListener('click', () => {
        showPassword = !showPassword;
        const passInput = container.querySelector('#qums-pass');
        if (passInput) passInput.type = showPassword ? 'text' : 'password';
        togglePassBtn.innerHTML = `<i data-lucide="${showPassword ? 'eye-off' : 'eye'}" style="width:16px;height:16px;"></i>`;
        if (window.lucide) window.lucide.createIcons();
      });
    }

    container.querySelector('#toggle-qums-login-btn').addEventListener('click', () => {
      showLoginForm = !showLoginForm;
      if (showLoginForm && !loginChallenge) {
        this.loadCaptcha(ctx, rerender);
      } else {
        rerender();
      }
    });

    const reloadBtn = container.querySelector('#reload-captcha-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => this.loadCaptcha(ctx, rerender));
    }

    const loginForm = container.querySelector('#qums-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isLoggingIn) return;
        const username = container.querySelector('#qums-id').value.trim();
        const password = container.querySelector('#qums-pass').value;
        const yearSem = cache?.yearSem || 5;
        const captcha = container.querySelector('#qums-captcha').value.trim();

        isLoggingIn = true;
        rerender();

        const loginRes = await ERP.login({
          loginSessionId: loginChallenge?.loginSessionId,
          username,
          password,
          captcha,
          yearSem
        });

        isLoggingIn = false;

        if (loginRes.connected) {
          showLoginForm = false;
          loginChallenge = null;
          ctx.toast('Connected to QUMS! Fetching attendance...');
          await this.sync(ctx, rerender);
        } else {
          lastStatusType = loginRes.status || 'auth_failed';
          lastStatusMessage = loginRes.message || 'Login failed.';
          ctx.toast(lastStatusMessage);
          await this.loadCaptcha(ctx, rerender);
        }
      });
    }

    container.querySelector('#refresh-attendance-btn').addEventListener('click', () => {
      this.sync(ctx, rerender);
    });

    if (window.lucide) window.lucide.createIcons();
  }
};
