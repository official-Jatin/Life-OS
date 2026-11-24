const path = require('path');
const express = require('express');
require('dotenv').config();

const { normalizeAttendancePayload } = require('./erpParser');

const app = express();
const PORT = process.env.PORT || 3000;

const QUMS_BASE_URL = (process.env.QUMS_BASE_URL || 'https://qums.quantumuniversity.edu.in').replace(/\/+$/, '');
const QUMS_ATTENDANCE_ENDPOINT = `${QUMS_BASE_URL}/Web_StudentAcademic/GetYearSemWiseAttendance`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  const configured = Boolean(
    process.env.QUMS_REG_ID &&
    process.env.QUMS_REG_ID !== 'your_registration_id_here' &&
    process.env.QUMS_SESSION_COOKIE
  );
  res.json({
    ok: true,
    erpConfigured: configured,
    yearSem: Number(process.env.QUMS_YEAR_SEM || 5),
    hasCsrfToken: Boolean(process.env.QUMS_CSRF_TOKEN)
  });
});

app.post('/api/attendance', async (req, res) => {
  const regId = process.env.QUMS_REG_ID;
  const sessionCookie = process.env.QUMS_SESSION_COOKIE;
  const yearSem = String(process.env.QUMS_YEAR_SEM || 5);
  const csrfToken = process.env.QUMS_CSRF_TOKEN || '';

  if (!regId || regId === 'your_registration_id_here' || !sessionCookie) {
    return res.status(200).json({
      status: 'pending',
      connected: false,
      message: 'ERP connection is pending. Configure QUMS_REG_ID and QUMS_SESSION_COOKIE in your server .env file.',
      yearSem: Number(yearSem)
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const bodyParams = new URLSearchParams({
      RegID: regId,
      YearSem: yearSem
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': sessionCookie,
      'Origin': QUMS_BASE_URL,
      'Referer': `${QUMS_BASE_URL}/`
    };

    if (csrfToken) {
      bodyParams.append('__RequestVerificationToken', csrfToken);
      headers['RequestVerificationToken'] = csrfToken;
    }

    const erpResponse = await fetch(QUMS_ATTENDANCE_ENDPOINT, {
      method: 'POST',
      headers,
      body: bodyParams.toString(),
      redirect: 'manual',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (erpResponse.status === 401 || erpResponse.status === 403 || (erpResponse.status >= 300 && erpResponse.status < 400)) {
      return res.status(401).json({
        status: 'session_expired',
        connected: false,
        message: 'QUMS session has expired or requires re-authentication. Update QUMS_SESSION_COOKIE (and QUMS_CSRF_TOKEN if required) in .env.'
      });
    }

    if (!erpResponse.ok) {
      return res.status(502).json({
        status: 'error',
        connected: false,
        message: `QUMS ERP returned HTTP ${erpResponse.status}.`
      });
    }

    const rawText = await erpResponse.text();
    let outerJson;
    try {
      outerJson = JSON.parse(rawText);
    } catch {
      return res.status(401).json({
        status: 'session_expired',
        connected: false,
        message: 'QUMS returned a non-JSON response (likely a login or CAPTCHA page). Your session may have expired.'
      });
    }

    const normalized = normalizeAttendancePayload(outerJson);

    return res.json({
      status: 'connected',
      connected: true,
      syncedAt: new Date().toISOString(),
      yearSem: Number(yearSem),
      overall: normalized.overall,
      subjects: normalized.subjects
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';
    return res.status(504).json({
      status: 'network_error',
      connected: false,
      message: isTimeout
        ? 'Request to QUMS ERP timed out. Please try again.'
        : `Network error connecting to QUMS ERP: ${error.message}`
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LifeOS server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
