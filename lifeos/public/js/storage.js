const STORAGE_KEY = 'lifeos_app_data_v1';

function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPastDateKey(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createSampleData() {
  const today = getTodayKey();
  const d1 = getPastDateKey(1);
  const d2 = getPastDateKey(2);
  const d3 = getPastDateKey(3);
  const d4 = getPastDateKey(4);
  const d5 = getPastDateKey(5);

  return {
    settings: {
      displayName: 'Alex',
      pomodoro: {
        focus: 25,
        shortBreak: 5,
        longBreak: 15
      }
    },
    tasks: [
      {
        id: 't1',
        title: 'Review Operating Systems lecture notes',
        priority: 'High',
        dueDate: today,
        completed: false,
        completedAt: null,
        isSample: true
      },
      {
        id: 't2',
        title: 'Submit DBMS lab assignment',
        priority: 'High',
        dueDate: today,
        completed: true,
        completedAt: today,
        isSample: true
      },
      {
        id: 't3',
        title: 'Solve 3 LeetCode medium problems',
        priority: 'Medium',
        dueDate: today,
        completed: false,
        completedAt: null,
        isSample: true
      },
      {
        id: 't4',
        title: 'Organize semester project repository',
        priority: 'Low',
        dueDate: getPastDateKey(-2),
        completed: false,
        completedAt: null,
        isSample: true
      }
    ],
    habits: [
      {
        id: 'h1',
        name: 'Deep Work (1 hr)',
        history: { [today]: false, [d1]: true, [d2]: true, [d3]: true, [d4]: true },
        isSample: true
      },
      {
        id: 'h2',
        name: 'Read 20 pages',
        history: { [today]: true, [d1]: true, [d2]: false, [d3]: true, [d4]: true },
        isSample: true
      },
      {
        id: 'h3',
        name: 'Evening Workout',
        history: { [today]: false, [d1]: true, [d2]: true, [d3]: false, [d5]: true },
        isSample: true
      }
    ],
    focusSessions: [
      { date: d5, minutes: 50, count: 2 },
      { date: d4, minutes: 75, count: 3 },
      { date: d3, minutes: 25, count: 1 },
      { date: d2, minutes: 100, count: 4 },
      { date: d1, minutes: 50, count: 2 },
      { date: today, minutes: 25, count: 1 }
    ],
    erpCache: null,
    attendanceHistory: []
  };
}

export const Storage = {
  getTodayKey,
  getPastDateKey,

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = createSampleData();
        this.save(initial);
        return initial;
      }
      const parsed = JSON.parse(raw);
      return {
        ...createSampleData(),
        ...parsed,
        settings: {
          displayName: parsed?.settings?.displayName || 'Alex',
          pomodoro: {
            focus: Number(parsed?.settings?.pomodoro?.focus) || 25,
            shortBreak: Number(parsed?.settings?.pomodoro?.shortBreak) || 5,
            longBreak: Number(parsed?.settings?.pomodoro?.longBreak) || 15
          }
        },
        tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
        habits: Array.isArray(parsed?.habits) ? parsed.habits : [],
        focusSessions: Array.isArray(parsed?.focusSessions) ? parsed.focusSessions : [],
        erpCache: parsed?.erpCache || null,
        attendanceHistory: Array.isArray(parsed?.attendanceHistory) ? parsed.attendanceHistory : []
      };
    } catch {
      return createSampleData();
    }
  },

  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors in restricted environments
    }
  },

  reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    const fresh = {
      settings: { displayName: 'Student', pomodoro: { focus: 25, shortBreak: 5, longBreak: 15 } },
      tasks: [],
      habits: [],
      focusSessions: [],
      erpCache: null,
      attendanceHistory: []
    };
    this.save(fresh);
    return fresh;
  }
};
