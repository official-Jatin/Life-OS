const crypto = require('crypto');
const { normalizeAttendancePayload } = require('../erpParser');
const dbStore = require('../db/store');

const QUMS_BASE_URL = (process.env.QUMS_BASE_URL || 'https://qums.quantumuniversity.edu.in').replace(/\/+$/, '');
const QUMS_DASHBOARD_URL = `${QUMS_BASE_URL}/Web_StudentAcademic/Cyborg_S_Dashboard`;
const QUMS_ATTENDANCE_ENDPOINT = `${QUMS_BASE_URL}/Web_StudentAcademic/GetYearSemWiseAttendance`;

const sessions = new Map();

function mergeCookies(existingCookieStr, setCookieHeaders) {
  const jar = new Map();
  if (existingCookieStr) {
    existingCookieStr.split(';').forEach((part) => {
      const idx = part.indexOf('=');
      if (idx > 0) jar.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
    });
  }
  (setCookieHeaders || []).forEach((header) => {
    const firstPart = header.split(';')[0];
    const idx = firstPart.indexOf('=');
    if (idx > 0) jar.set(firstPart.slice(0, idx).trim(), firstPart.slice(idx + 1).trim());
  });
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function extractInputValue(html, name) {
  const regex1 = new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i');
  const regex2 = new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i');
  const match = html.match(regex1) || html.match(regex2);
  return match ? match[1] : '';
}

function extractCaptchaSrc(html) {
  const imgMatches = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
  for (const tag of imgMatches) {
    if (/id=["']imgPhoto["']/i.test(tag) || /captcha/i.test(tag)) {
      const srcMatch = tag.match(/src=["']([^"']+)["']/i);
      if (srcMatch) return srcMatch[1];
    }
  }
  for (const tag of imgMatches) {
    const srcMatch = tag.match(/src=["'](data:image\/[^"']+)["']/i);
    if (srcMatch) return srcMatch[1];
  }
  return null;
}

function extractRegIdFromText(text) {
  if (!text) return null;
  const patterns = [
    /(?:window\.|var\s+)RegID\s*=\s*["'](\d{2,10})["']/i,
    /<input[^>]*id=["']?(?:hdn)?RegID["']?[^>]*value=["'](\d{2,10})["']/i,
    /<input[^>]*name=["']?(?:hdn)?RegID["']?[^>]*value=["'](\d{2,10})["']/i,
    /<input[^>]*value=["'](\d{2,10})["'][^>]*id=["']?(?:hdn)?RegID["']?/i,
    /<input[^>]*value=["'](\d{2,10})["'][^>]*name=["']?(?:hdn)?RegID["']?/i,
    /RegI[Dd][^0-9]{0,25}(\d{3,8})/i,
    /GetStudentDetailOnRegID[^;]{0,120}?(\d{3,8})/i,
    /GetYearSemWiseAttendance[^;]{0,120}?(\d{3,8})/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function fetchWithCookies(url, session, referer) {
  let currentUrl = url;
  for (let hop = 0; hop < 5; hop++) {
    const resp = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'Cookie': session.cookies,
        'Referer': referer || `${QUMS_BASE_URL}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      redirect: 'manual'
    });
    session.cookies = mergeCookies(session.cookies, getSetCookies(resp));
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) return resp;
      currentUrl = loc.startsWith('http')
        ? loc
        : `${QUMS_BASE_URL}${loc.startsWith('/') ? '' : '/'}${loc}`;
      continue;
    }
    return resp;
  }
  return null;
}

function getSessionStatus(sessionId) {
  const activeSession = sessionId ? sessions.get(sessionId) : null;
  const envConfigured = Boolean(
    process.env.QUMS_REG_ID &&
    process.env.QUMS_REG_ID !== 'your_registration_id_here' &&
    process.env.QUMS_SESSION_COOKIE
  );
  return {
    erpConfigured: Boolean(activeSession?.authenticated || envConfigured),
    authenticatedViaLogin: Boolean(activeSession?.authenticated),
    yearSem: Number(activeSession?.yearSem || process.env.QUMS_YEAR_SEM || 5)
  };
}

async function initLoginChallenge() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const pageResp = await fetch(`${QUMS_BASE_URL}/`, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });

    const html = await pageResp.text();
    let cookieStr = mergeCookies('', getSetCookies(pageResp));
    const requestVerificationToken = extractInputValue(html, '__RequestVerificationToken');
    const hdnMsg = extractInputValue(html, 'hdnMsg') || 'QGC';
    const captchaRelSrc = extractCaptchaSrc(html);

    let captchaDataUrl = null;
    if (captchaRelSrc) {
      if (captchaRelSrc.startsWith('data:image/')) {
        captchaDataUrl = captchaRelSrc;
      } else {
        const captchaUrl = captchaRelSrc.startsWith('http')
          ? captchaRelSrc
          : `${QUMS_BASE_URL}${captchaRelSrc.startsWith('/') ? '' : '/'}${captchaRelSrc}`;
        const imgResp = await fetch(captchaUrl, {
          method: 'GET',
          headers: {
            'Cookie': cookieStr,
            'Referer': `${QUMS_BASE_URL}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: controller.signal
        });
        cookieStr = mergeCookies(cookieStr, getSetCookies(imgResp));
        if (imgResp.ok) {
          const buf = Buffer.from(await imgResp.arrayBuffer());
          const contentType = imgResp.headers.get('content-type') || 'image/png';
          captchaDataUrl = `data:${contentType};base64,${buf.toString('base64')}`;
        }
      }
    }

    clearTimeout(timeoutId);
    const loginSessionId = crypto.randomUUID();
    sessions.set(loginSessionId, {
      cookies: cookieStr,
      requestVerificationToken,
      hdnMsg,
      authenticated: false,
      regId: null,
      yearSem: Number(process.env.QUMS_YEAR_SEM || 5),
      createdAt: Date.now()
    });

    return {
      ok: true,
      loginSessionId,
      captchaImage: captchaDataUrl,
      hasToken: Boolean(requestVerificationToken)
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function authenticateWithCredentials({ loginSessionId, username, password, captcha, regId, yearSem, authToken }) {
  if (!loginSessionId || !sessions.has(loginSessionId)) {
    return { statusCode: 400, body: { connected: false, status: 'invalid_session', message: 'Login session expired. Refresh the CAPTCHA and try again.' } };
  }
  if (!username || !password || !captcha) {
    return { statusCode: 400, body: { connected: false, status: 'missing_fields', message: 'Please enter your QUMS ID, Password, and CAPTCHA.' } };
  }

  const session = sessions.get(loginSessionId);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const formBody = new URLSearchParams({
      hdnMsg: session.hdnMsg || 'QGC',
      checkOnline: '0',
      __RequestVerificationToken: session.requestVerificationToken || '',
      UserName: String(username).trim(),
      Password: String(password),
      clientIP: '',
      DeviceLocalIp: '',
      DeviceMachineName: '',
      DeviceMachineGuid: '',
      DeviceMacAddress: '',
      DeviceAgentInstalled: 'false',
      captcha: String(captcha).trim()
    });

    const loginResp = await fetch(`${QUMS_BASE_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': session.cookies,
        'Origin': QUMS_BASE_URL,
        'Referer': `${QUMS_BASE_URL}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: formBody.toString(),
      redirect: 'manual',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    session.cookies = mergeCookies(session.cookies, getSetCookies(loginResp));

    const location = loginResp.headers.get('location') || '';
    const isRedirectSuccess = loginResp.status === 302 && location && !/^\/?$/.test(location);

    if (!isRedirectSuccess) {
      return {
        statusCode: 401,
        body: { connected: false, status: 'auth_failed', message: 'QUMS login failed. Check your ID, password, or CAPTCHA and try again.' }
      };
    }

    let discoveredRegId = null;
    try {
      const nextUrl = location.startsWith('http')
        ? location
        : `${QUMS_BASE_URL}${location.startsWith('/') ? '' : '/'}${location}`;
      const dashResp = await fetchWithCookies(nextUrl, session, `${QUMS_BASE_URL}/`);
      const dashHtml = dashResp ? await dashResp.text() : '';
      discoveredRegId = extractRegIdFromText(dashHtml);

      if (!discoveredRegId) {
        const studentDashResp = await fetchWithCookies(QUMS_DASHBOARD_URL, session, nextUrl);
        const studentDashHtml = studentDashResp ? await studentDashResp.text() : '';
        discoveredRegId = extractRegIdFromText(studentDashHtml) || extractRegIdFromText(session.cookies);
        session.dashDebug = `dashStatus=${studentDashResp?.status}, dashUrl=${studentDashResp?.url}, dashLen=${studentDashHtml.length}, discovered=${discoveredRegId}`;
        console.log('[QUMS]', session.dashDebug);
      }
    } catch (e) {
      console.error('[QUMS] Post-login RegID discovery error:', e.message);
    }

    const envRegId = process.env.QUMS_REG_ID && process.env.QUMS_REG_ID !== 'your_registration_id_here'
      ? process.env.QUMS_REG_ID
      : null;

    session.authenticated = true;
    session.regId = (regId && String(regId).trim()) || discoveredRegId || envRegId || String(username).trim();
    session.yearSem = Number(yearSem || process.env.QUMS_YEAR_SEM || 5);
    if (authToken) {
      dbStore.saveQumsSessionForUser(authToken, {
        cookies: session.cookies,
        regId: session.regId,
        yearSem: session.yearSem
      });
    }

    return {
      statusCode: 200,
      body: {
        connected: true,
        status: 'connected',
        sessionId: loginSessionId,
        yearSem: session.yearSem,
        message: 'Connected to QUMS successfully.'
      }
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      statusCode: 504,
      body: { connected: false, status: 'network_error', message: `Network error during QUMS login: ${error.message}` }
    };
  }
}

function formatQumsDateToday() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function extractStudentName(payload) {
  if (!payload) return null;
  let obj = payload;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  const candidates = [];
  if (obj && typeof obj === 'object') {
    if (typeof obj.state === 'string') { try { candidates.push(JSON.parse(obj.state)); } catch {} }
    if (typeof obj.data === 'string') { try { candidates.push(JSON.parse(obj.data)); } catch {} }
    if (typeof obj.d === 'string') { try { candidates.push(JSON.parse(obj.d)); } catch {} }
    candidates.push(obj);
  }
  for (const item of candidates) {
    const row = Array.isArray(item) ? (item[0] || {}) : (item || {});
    if (!row || typeof row !== 'object') continue;
    let name = row.StudentName || row.Student_Name || row.StuName || row.Name || row.FullName || row.CandidateName || row.EmpName ||
      [row.FirstName, row.MiddleName, row.LastName].filter(Boolean).join(' ');
    if (!name) {
      const key = Object.keys(row).find((k) => /(?:student|stu|full|candidate)?_?name$/i.test(k) && typeof row[k] === 'string' && row[k].trim() && !/father|mother|course|program|branch|college|school/i.test(k));
      if (key) name = row[key];
    }
    if (name && String(name).trim()) return String(name).trim();
  }
  return null;
}

async function fetchStudentName(regId, cookies) {
  try {
    const resp = await fetch(QUMS_STUDENT_DETAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
        'Origin': QUMS_BASE_URL,
        'Referer': QUMS_DASHBOARD_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: new URLSearchParams({ RegID: String(regId), Date: formatQumsDateToday() }).toString()
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    const name = extractStudentName(text);
    if (!name) console.log('[QUMS] StudentDetail preview:', text.slice(0, 350));
    return name;
  } catch {
    return null;
  }
}

async function fetchYearSemAttendance({ sessionId, yearSemOverride, authToken }) {
  const activeSession = sessionId ? sessions.get(sessionId) : null;
  const savedDbSession = (!activeSession?.authenticated && authToken) ? dbStore.getQumsSessionForUser(authToken) : null;
  const regId = activeSession?.authenticated ? activeSession.regId : (savedDbSession?.regId || process.env.QUMS_REG_ID);
  const sessionCookie = activeSession?.authenticated ? activeSession.cookies : (savedDbSession?.cookies || process.env.QUMS_SESSION_COOKIE);
  const yearSem = String(yearSemOverride || activeSession?.yearSem || savedDbSession?.yearSem || process.env.QUMS_YEAR_SEM || 5);
  const csrfToken = process.env.QUMS_CSRF_TOKEN || '';

  if (!regId || regId === 'your_registration_id_here' || !sessionCookie) {
    return {
      statusCode: 200,
      body: {
        status: 'pending',
        connected: false,
        message: 'ERP connection is pending. Sign in with your QUMS credentials (and RegID if different from login ID) or configure .env.',
        yearSem: Number(yearSem)
      }
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const bodyParams = new URLSearchParams({ RegID: regId, YearSem: yearSem });
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': sessionCookie,
      'Origin': QUMS_BASE_URL,
      'Referer': QUMS_DASHBOARD_URL,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
      if (activeSession) activeSession.authenticated = false;
      return {
        statusCode: 401,
        body: { status: 'session_expired', connected: false, message: 'QUMS session has expired. Please sign in again.' }
      };
    }

    if (!erpResponse.ok) {
      return {
        statusCode: 502,
        body: { status: 'error', connected: false, message: `QUMS ERP returned HTTP ${erpResponse.status}.` }
      };
    }

    let rawText = await erpResponse.text();
    let outerJson;
    try {
      outerJson = JSON.parse(rawText);
    } catch {
      if (activeSession) activeSession.authenticated = false;
      return {
        statusCode: 401,
        body: { status: 'session_expired', connected: false, message: 'QUMS returned a non-JSON response (likely a login page). Please sign in again.' }
      };
    }

    if (outerJson === null || outerJson === '') {
      const jsonRetry = await fetch(QUMS_ATTENDANCE_ENDPOINT, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ RegID: regId, YearSem: Number(yearSem) }),
        redirect: 'manual'
      });
      rawText = await jsonRetry.text();
      try { outerJson = JSON.parse(rawText); } catch { outerJson = null; }
    }

    if (!outerJson || (typeof outerJson !== 'object' && typeof outerJson !== 'string')) {
      return {
        statusCode: 502,
        body: {
          status: 'error',
          connected: false,
          message: `QUMS returned "${String(rawText).slice(0, 80)}" for RegID=${regId}, YearSem=${yearSem}. (${activeSession?.dashDebug || 'no dashDebug'})`
        }
      };
    }

    const normalized = normalizeAttendancePayload(outerJson);
    const studentName = await fetchStudentName(regId, sessionCookie);
    return {
      statusCode: 200,
      body: {
        status: 'connected',
        connected: true,
        syncedAt: new Date().toISOString(),
        studentName: studentName || null,
        yearSem: Number(yearSem),
        overall: normalized.overall,
        subjects: normalized.subjects
      }
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';
    return {
      statusCode: 504,
      body: {
        status: 'network_error',
        connected: false,
        message: isTimeout ? 'Request to QUMS ERP timed out. Please try again.' : `Network error connecting to QUMS ERP: ${error.message}`
      }
    };
  }
}

function clearSession(sessionId) {
  if (sessionId) sessions.delete(sessionId);
}

module.exports = {
  getSessionStatus,
  initLoginChallenge,
  authenticateWithCredentials,
  fetchYearSemAttendance,
  clearSession
};
