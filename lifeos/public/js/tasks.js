import { Storage } from './storage.js';

let currentFilter = 'all';
let editingTaskId = null;

function priorityBadge(priority) {
  if (priority === 'High') return '<span class="badge badge-danger">High</span>';
  if (priority === 'Medium') return '<span class="badge badge-warning">Medium</span>';
  return '<span class="badge badge-neutral">Low</span>';
}

export const Tasks = {
  getStats(state) {
    const today = Storage.getTodayKey();
    const todayTasks = state.tasks.filter((t) => t.dueDate === today);
    const total = state.tasks.length;
    const completed = state.tasks.filter((t) => t.completed).length;
    const todayCompleted = todayTasks.filter((t) => t.completed).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, todayTasks, todayCompleted, pct };
  },

  render(container, ctx) {
    const { state, save, toast, escapeHtml } = ctx;
    const filtered = state.tasks.filter((t) => {
      if (currentFilter === 'pending') return !t.completed;
      if (currentFilter === 'completed') return t.completed;
      return true;
    });

    const editingTask = editingTaskId ? state.tasks.find((t) => t.id === editingTaskId) : null;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Task Manager</h2>
          <p class="page-subtitle">Organize daily priorities, due dates, and track completion.</p>
        </div>
        <div class="timer-tabs" role="tablist">
          <button class="timer-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">All (${state.tasks.length})</button>
          <button class="timer-tab ${currentFilter === 'pending' ? 'active' : ''}" data-filter="pending">Pending (${state.tasks.filter(t => !t.completed).length})</button>
          <button class="timer-tab ${currentFilter === 'completed' ? 'active' : ''}" data-filter="completed">Completed (${state.tasks.filter(t => t.completed).length})</button>
        </div>
      </div>

      <div class="card" style="margin-bottom: 18px;">
        <form id="task-form" class="grid grid-4" style="align-items: end; gap: 12px;">
          <div style="grid-column: span 2;">
            <label class="field-label" for="task-title-input">${editingTask ? 'Edit Task' : 'New Task'}</label>
            <input id="task-title-input" class="input" type="text" placeholder="e.g., Finish Computer Networks notes" value="${editingTask ? escapeHtml(editingTask.title) : ''}" required />
          </div>
          <div>
            <label class="field-label" for="task-priority-input">Priority</label>
            <select id="task-priority-input" class="select">
              <option value="Low" ${editingTask?.priority === 'Low' ? 'selected' : ''}>Low</option>
              <option value="Medium" ${!editingTask || editingTask?.priority === 'Medium' ? 'selected' : ''}>Medium</option>
              <option value="High" ${editingTask?.priority === 'High' ? 'selected' : ''}>High</option>
            </select>
          </div>
          <div style="display: flex; gap: 8px;">
            <div style="flex: 1;">
              <label class="field-label" for="task-date-input">Due Date</label>
              <input id="task-date-input" class="input" type="date" value="${editingTask ? editingTask.dueDate : Storage.getTodayKey()}" />
            </div>
            <button type="submit" class="btn btn-primary" style="align-self: end;">
              <i data-lucide="${editingTask ? 'save' : 'plus'}"></i>
              ${editingTask ? 'Save' : 'Add'}
            </button>
            ${editingTask ? '<button type="button" id="cancel-edit-btn" class="btn btn-secondary" style="align-self: end;">Cancel</button>' : ''}
          </div>
        </form>
      </div>

      <div class="card">
        <div class="item-list" id="task-list">
          ${filtered.length === 0 ? `
            <div class="empty-state">
              <p>No ${currentFilter === 'all' ? '' : currentFilter} tasks yet.</p>
            </div>
          ` : filtered.map((task) => `
            <div class="list-row" data-id="${task.id}">
              <div class="list-row-left">
                <button class="checkbox-btn ${task.completed ? 'checked' : ''}" data-action="toggle" data-id="${task.id}" aria-label="Toggle task">
                  ${task.completed ? '<i data-lucide="check" style="width:14px;height:14px;"></i>' : ''}
                </button>
                <div style="min-width:0;">
                  <div class="task-title ${task.completed ? 'completed' : ''}" style="font-weight:500;">${escapeHtml(task.title)}</div>
                  <div style="font-size:12px;color:var(--text-muted);display:flex;gap:10px;align-items:center;margin-top:3px;">
                    <span>Due: ${task.dueDate || 'No date'}</span>
                    ${task.isSample ? '<span class="badge badge-purple" style="padding:1px 6px;font-size:10px;">Sample</span>' : ''}
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${priorityBadge(task.priority)}
                <button class="btn-icon" data-action="edit" data-id="${task.id}" title="Edit task"><i data-lucide="pencil" style="width:15px;height:15px;"></i></button>
                <button class="btn-icon" data-action="delete" data-id="${task.id}" title="Delete task"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        this.render(container, ctx);
      });
    });

    const form = container.querySelector('#task-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = container.querySelector('#task-title-input').value.trim();
      const priority = container.querySelector('#task-priority-input').value;
      const dueDate = container.querySelector('#task-date-input').value || Storage.getTodayKey();
      if (!title) return;

      if (editingTaskId) {
        const idx = state.tasks.findIndex((t) => t.id === editingTaskId);
        if (idx !== -1) {
          state.tasks[idx] = { ...state.tasks[idx], title, priority, dueDate, isSample: false };
          toast('Task updated');
        }
        editingTaskId = null;
      } else {
        state.tasks.unshift({
          id: 't_' + Date.now(),
          title,
          priority,
          dueDate,
          completed: false,
          completedAt: null,
          isSample: false
        });
        toast('Task added');
      }
      save();
      this.render(container, ctx);
    });

    const cancelBtn = container.querySelector('#cancel-edit-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        editingTaskId = null;
        this.render(container, ctx);
      });
    }

    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'toggle') {
          const task = state.tasks.find((t) => t.id === id);
          if (task) {
            task.completed = !task.completed;
            task.completedAt = task.completed ? Storage.getTodayKey() : null;
            save();
            this.render(container, ctx);
          }
        } else if (action === 'edit') {
          editingTaskId = id;
          this.render(container, ctx);
        } else if (action === 'delete') {
          state.tasks = state.tasks.filter((t) => t.id !== id);
          if (editingTaskId === id) editingTaskId = null;
          save();
          toast('Task deleted');
          this.render(container, ctx);
        }
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }
};
