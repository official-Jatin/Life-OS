import { ERP } from './erp.js';
import { Storage } from './storage.js';

let isSyncing = false;
let lastStatusMessage = null;
let lastStatusType = 'pending';

function formatSyncTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function getWarningBadge(percentage) {
  if (percentage < 65) return '<span class="badge badge-danger">Critical (&lt;65%)</span>';
  if (percentage < 75) return '<span class="badge badge-warning">Low (&lt;75%)</span>';
  return '<span class="badge badge-success">Safe (&ge;75%)</span>';
}

export const Attendance = {
  async sync(ctx, onComplete) {
    if (isSyncing) return;
    isSyncing = true;
    if (onComplete) onComplete();

    const result = await ERP.fetchAttendance();
    isSyncing = false;

    if (result.connected && result.overall) {
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
    const rerender = () => this.render(container, ctx);

    const statusBadge = cache
      ? '<span class="badge badge-success">Live ERP Connected</span>'
      : lastStatusType === 'session_expired'
        ? '<span class="badge badge-danger">Session Expired</span>'
        : '<span class="badge badge-warning">ERP Connection Pending</span>';

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">QUMS Attendance</h2>
          <p class="page-subtitle">Quantum University Management System (Year/Sem ${cache?.yearSem || 5}) &bull; Last synced: ${formatSyncTime(cache?.syncedAt)}</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${statusBadge}
          <button class="btn btn-primary" id="refresh-attendance-btn" ${isSyncing ? 'disabled' : ''}>
            <i data-lucide="refresh-cw"></i> ${isSyncing ? 'Syncing...' : 'Refresh Attendance'}
          </button>
        </div>
      </div>

      ${lastStatusMessage && !cache ? `
        <div class="card" style="margin-bottom:18px;border-color:${lastStatusType === 'session_expired' || lastStatusType === 'network_error' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.35)'};">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <i data-lucide="alert-triangle" style="color:${lastStatusType === 'session_expired' || lastStatusType === 'network_error' ? 'var(--danger)' : 'var(--warning)'};flex-shrink:0;margin-top:2px;"></i>
            <div>
              <div style="font-weight:600;margin-bottom:4px;">${lastStatusType === 'session_expired' ? 'QUMS Session Expired' : lastStatusType === 'network_error' ? 'Network Error' : 'QUMS ERP Connection Pending'}</div>
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
            LifeOS never displays mock attendance data. Configure <code>QUMS_REG_ID</code> and <code>QUMS_SESSION_COOKIE</code> in your backend <code>.env</code> file, then click <strong>Refresh Attendance</strong> to fetch your real records from QUMS.
          </p>
        </div>
      ` : `
        <div class="grid grid-4" style="margin-bottom: 18px;">
          <div class="card">
            <span class="stat-label">Overall Attendance</span>
            <div class="stat-value" style="color:${cache.overall.TotalPercentage < 75 ? 'var(--warning)' : 'var(--success)'};">${cache.overall.TotalPercentage}%</div>
            ${getWarningBadge(cache.overall.TotalPercentage)}
          </div>
          <div class="card">
            <span class="stat-label">Total Lectures</span>
            <div class="stat-value">${cache.overall.TotalLecture}</div>
            <span class="stat-label">Leave: ${cache.overall.TotalLeave ?? 0}</span>
          </div>
          <div class="card">
            <span class="stat-label">Present Lectures</span>
            <div class="stat-value" style="color:var(--success);">${cache.overall.TotalPresent}</div>
            <span class="stat-label">Attended</span>
          </div>
          <div class="card">
            <span class="stat-label">Absent Lectures</span>
            <div class="stat-value" style="color:var(--danger);">${cache.overall.TotalAbsent}</div>
            <span class="stat-label">Missed</span>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="book-open" style="color:var(--accent);"></i> Subject-wise Attendance</div>
            <span class="badge badge-neutral">${cache.subjects.length} Subjects</span>
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
                  <th>Percentage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${cache.subjects.length === 0 ? `
                  <tr><td colspan="9" style="text-align:center;color:var(--text-muted);">No subject rows returned by QUMS.</td></tr>
                ` : cache.subjects.map((sub) => `
                  <tr>
                    <td style="font-weight:500;">${ctx.escapeHtml(sub.Subject)}</td>
                    <td style="color:var(--text-muted);">${ctx.escapeHtml(sub.SubjectCode || '—')}</td>
                    <td>${sub.SubjectCredit ?? '—'}</td>
                    <td style="color:var(--success);">${sub.TotalPresent}</td>
                    <td style="color:var(--danger);">${sub.TotalAbsent}</td>
                    <td>${sub.TotalLeave ?? 0}</td>
                    <td>${sub.TotalLecture}</td>
                    <td style="font-weight:600;">${sub.Percentage}%</td>
                    <td>${getWarningBadge(sub.Percentage)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    container.querySelector('#refresh-attendance-btn').addEventListener('click', () => {
      this.sync(ctx, rerender);
    });

    if (window.lucide) window.lucide.createIcons();
  }
};
