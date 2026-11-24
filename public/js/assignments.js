import { Storage } from './storage.js';

let asgFilter = 'all';
let editingAsgId = null;

function getDueBadge(dueDate, completed) {
  if (completed) return '<span class="badge badge-success">Submitted</span>';
  if (!dueDate) return '<span class="badge badge-neutral">No due date</span>';

  const today = new Date(Storage.getTodayKey() + 'T00:00:00');
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `<span class="badge badge-danger">Overdue (${Math.abs(diffDays)}d)</span>`;
  if (diffDays === 0) return '<span class="badge badge-warning">Due Today</span>';
  if (diffDays <= 2) return `<span class="badge badge-warning">Due in ${diffDays}d</span>`;
  return `<span class="badge badge-purple">Due in ${diffDays}d</span>`;
}

export const Assignments = {
  getUpcomingStats(state) {
    const list = Array.isArray(state.assignments) ? state.assignments : [];
    const pending = list.filter((a) => !a.completed);
    const today = Storage.getTodayKey();
    const dueSoon = pending.filter((a) => {
      if (!a.dueDate) return false;
      const diff = (new Date(a.dueDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000;
      return diff <= 3;
    });
    return { total: list.length, pendingCount: pending.length, dueSoonCount: dueSoon.length };
  },

  render(container, ctx) {
    const { state, save, toast, escapeHtml } = ctx;
    state.assignments = Array.isArray(state.assignments) ? state.assignments : [];

    const filtered = state.assignments
      .filter((a) => {
        if (asgFilter === 'pending') return !a.completed;
        if (asgFilter === 'submitted') return a.completed;
        return true;
      })
      .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));

    const editingItem = editingAsgId ? state.assignments.find((a) => a.id === editingAsgId) : null;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Assignment Deadlines</h2>
          <p class="page-subtitle">Track coursework submissions, subject codes, and upcoming due dates.</p>
        </div>
        <div class="timer-tabs" role="tablist">
          <button class="timer-tab ${asgFilter === 'all' ? 'active' : ''}" data-asg-filter="all">All (${state.assignments.length})</button>
          <button class="timer-tab ${asgFilter === 'pending' ? 'active' : ''}" data-asg-filter="pending">Pending (${state.assignments.filter(a => !a.completed).length})</button>
          <button class="timer-tab ${asgFilter === 'submitted' ? 'active' : ''}" data-asg-filter="submitted">Submitted (${state.assignments.filter(a => a.completed).length})</button>
        </div>
      </div>

      <div class="card" style="margin-bottom: 18px;">
        <form id="assignment-form" class="grid grid-4" style="align-items: end; gap: 12px;">
          <div>
            <label class="field-label" for="asg-title">${editingItem ? 'Edit Assignment' : 'Assignment Title'}</label>
            <input id="asg-title" class="input" type="text" placeholder="e.g., DAA Lab Report 4" value="${editingItem ? escapeHtml(editingItem.title) : ''}" required />
          </div>
          <div>
            <label class="field-label" for="asg-subject">Subject</label>
            <input id="asg-subject" class="input" type="text" placeholder="e.g., CS35303" value="${editingItem ? escapeHtml(editingItem.subject || '') : ''}" />
          </div>
          <div>
            <label class="field-label" for="asg-due">Due Date</label>
            <input id="asg-due" class="input" type="date" value="${editingItem ? editingItem.dueDate : Storage.getPastDateKey(-2)}" required />
          </div>
          <div style="display:flex;gap:8px;">
            <button type="submit" class="btn btn-primary" style="flex:1;">
              <i data-lucide="${editingItem ? 'save' : 'plus'}"></i> ${editingItem ? 'Save' : 'Add Deadline'}
            </button>
            ${editingItem ? '<button type="button" id="asg-cancel-edit" class="btn btn-secondary">Cancel</button>' : ''}
          </div>
        </form>
      </div>

      <div class="card">
        <div class="item-list">
          ${filtered.length === 0 ? `
            <div class="empty-state">No ${asgFilter === 'all' ? '' : asgFilter} assignments yet.</div>
          ` : filtered.map((item) => `
            <div class="list-row">
              <div class="list-row-left">
                <button class="checkbox-btn ${item.completed ? 'checked' : ''}" data-asg-action="toggle" data-id="${item.id}" aria-label="Toggle assignment">
                  ${item.completed ? '<i data-lucide="check" style="width:13px;height:13px;"></i>' : ''}
                </button>
                <div style="min-width:0;">
                  <div class="task-title ${item.completed ? 'completed' : ''}" style="font-weight:500;">${escapeHtml(item.title)}</div>
                  <div style="font-size:12px;color:var(--text-muted);display:flex;gap:10px;align-items:center;margin-top:2px;">
                    <span>${item.subject ? escapeHtml(item.subject) + ' &bull; ' : ''}Due: ${item.dueDate || 'No date'}</span>
                    ${item.isSample ? '<span class="badge badge-neutral" style="padding:1px 6px;font-size:10px;">Sample</span>' : ''}
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${getDueBadge(item.dueDate, item.completed)}
                <button class="btn-icon" data-asg-action="edit" data-id="${item.id}" title="Edit"><i data-lucide="pencil" style="width:15px;height:15px;"></i></button>
                <button class="btn-icon" data-asg-action="delete" data-id="${item.id}" title="Delete"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('[data-asg-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        asgFilter = btn.dataset.asgFilter;
        this.render(container, ctx);
      });
    });

    container.querySelector('#assignment-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = container.querySelector('#asg-title').value.trim();
      const subject = container.querySelector('#asg-subject').value.trim();
      const dueDate = container.querySelector('#asg-due').value;
      if (!title) return;

      if (editingAsgId) {
        const idx = state.assignments.findIndex((a) => a.id === editingAsgId);
        if (idx !== -1) {
          state.assignments[idx] = { ...state.assignments[idx], title, subject, dueDate, isSample: false };
          toast('Assignment updated');
        }
        editingAsgId = null;
      } else {
        state.assignments.unshift({
          id: 'a_' + Date.now(),
          title,
          subject,
          dueDate,
          completed: false,
          isSample: false
        });
        toast('Assignment deadline added');
      }
      save();
      this.render(container, ctx);
    });

    const cancelBtn = container.querySelector('#asg-cancel-edit');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        editingAsgId = null;
        this.render(container, ctx);
      });
    }

    container.querySelectorAll('[data-asg-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const action = btn.dataset.asgAction;
        if (action === 'toggle') {
          const item = state.assignments.find((a) => a.id === id);
          if (item) {
            item.completed = !item.completed;
            save();
            this.render(container, ctx);
          }
        } else if (action === 'edit') {
          editingAsgId = id;
          this.render(container, ctx);
        } else if (action === 'delete') {
          state.assignments = state.assignments.filter((a) => a.id !== id);
          if (editingAsgId === id) editingAsgId = null;
          save();
          toast('Assignment deleted');
          this.render(container, ctx);
        }
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }
};
