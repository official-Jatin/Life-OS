# LifeOS — Personal Productivity & QUMS Attendance Dashboard (my college)
 live demo - https://life-os-rc57.onrender.com/ 
LifeOS is a minimal, dark-themed personal productivity web application built with HTML, CSS, Vanilla JavaScript, Chart.js, Lucide Icons, and a Node.js + Express backend for QUMS ERP attendance integration.

## Project Structure

```
lifeos/
├── server.js               # Express server & QUMS ERP proxy
├── package.json
├── .env.example            # QUMS configuration template
└── public/
    ├── index.html          # Main application shell
    ├── css/
    │   └── styles.css      # Dark UI theme (#0B0D12 / #151923 / #8B5CF6)
    └── js/
        ├── storage.js      # localStorage utilities & sample productivity data
        ├── erp.js          # Frontend client for /api/attendance
        ├── dashboard.js    # Dashboard overview
        ├── tasks.js        # Task manager
        ├── habits.js       # Habit tracker & streaks
        ├── timer.js        # Pomodoro focus timer
        ├── attendance.js   # QUMS ERP attendance view
        ├── analytics.js    # Chart.js analytics
        ├── settings.js     # Preferences, JSON export/import, reset
        └── app.js          # Navigation, sidebar, modals & initialization
```

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure QUMS ERP credentials (optional for productivity modules, required for live QUMS attendance):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `QUMS_REG_ID`, `QUMS_YEAR_SEM` (default `5`), and `QUMS_SESSION_COOKIE` (copied from your authenticated QUMS browser session).
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser.
