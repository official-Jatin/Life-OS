const AUTH_TOKEN_KEY = 'lifeos_auth_token_v1';
let activeSessionId = null;
let syncDebounceTimer = null;
let adminToken = null;

function getAuthToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || null; } catch { return null; }
}

function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {}
}

export const ERP = {
  isStandalonePreview() {
    return window.location.protocol === 'file:' || window.location.protocol === 'about:' || window.location.hostname === '';
  },

  hasActiveSession() {
    return Boolean(activeSessionId);
  },

  getAuthToken,
  getAdminToken() {
    return adminToken;
  },

  async getPublicSupport() {
    if (this.isStandalonePreview()) return null;
    try {
      const resp = await fetch('/api/support');
      if (!resp.ok) return null;
      const d = await resp.json();
      return d.support || null;
    } catch { return null; }
  },

  async adminLogin(username, password) {
    if (this.isStandalonePreview()) return { ok: false, message: 'Admin console requires the Node.js backend.' };
    try {
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();
      if (data.ok && data.adminToken) adminToken = data.adminToken;
      return data;
    } catch { return { ok: false, message: 'Unable to reach backend server.' }; }
  },

  async adminLogout() {
    const tok = adminToken;
    adminToken = null;
    if (!this.isStandalonePreview() && tok) {
      try { await fetch('/api/admin/logout', { method: 'POST', headers: { 'x-lifeos-admin': tok } }); } catch {}
    }
  },

  async getAdminOverview() {
    if (this.isStandalonePreview() || !adminToken) return null;
    try {
      const resp = await fetch('/api/admin/overview', { headers: { 'x-lifeos-admin': adminToken } });
      if (!resp.ok) {
        if (resp.status === 401) adminToken = null;
        return null;
      }
      return await resp.json();
    } catch { return null; }
  },

  async saveAdminSupport(payload) {
    if (this.isStandalonePreview() || !adminToken) return { ok: false, message: 'Admin auth required.' };
    try {
      const resp = await fetch('/api/admin/support', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-lifeos-admin': adminToken },
        body: JSON.stringify(payload)
      });
      return await resp.json();
    } catch { return { ok: false, message: 'Failed to save support config.' }; }
  },



  async authRegister(username, password) {
    if (this.isStandalonePreview()) return { ok: false, message: 'Account sync requires running the Node.js backend.' };
    const resp = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (data.ok && data.token) setAuthToken(data.token);
    return data;
  },

  async authLogin(username, password) {
    if (this.isStandalonePreview()) return { ok: false, message: 'Account sync requires running the Node.js backend.' };
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (data.ok && data.token) setAuthToken(data.token);
    return data;
  },

  authLogout() {
    setAuthToken(null);
  },

  async loadUserData() {
    const token = getAuthToken();
    if (this.isStandalonePreview() || !token) return null;
    try {
      const resp = await fetch('/api/user/data', { headers: { 'x-lifeos-auth': token } });
      if (!resp.ok) return null;
      return await resp.json();
    } catch { return null; }
  },

  saveUserData(state, immediate = false) {
    const token = getAuthToken();
    if (this.isStandalonePreview() || !token) return Promise.resolve(false);
    const send = async () => {
      try {
        const resp = await fetch('/api/user/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-lifeos-auth': token },
          body: JSON.stringify({ data: state })
        });
        return resp.ok;
      } catch { return false; }
    };
    if (immediate) return send();
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(send, 450);
    return Promise.resolve(true);
  },

  async initLogin() {
    if (this.isStandalonePreview()) {
      return { ok: false, status: 'pending', message: 'Live QUMS login requires running the Node.js/Express backend locally.' };
    }
    try {
      const resp = await fetch('/api/qums/captcha');
      return await resp.json();
    } catch {
      return { ok: false, status: 'network_error', message: 'Unable to reach the LifeOS backend server.' };
    }
  },

  async login({ loginSessionId, username, password, captcha, regId, yearSem }) {
    if (this.isStandalonePreview()) {
      return { connected: false, status: 'pending', message: 'Live QUMS login requires running the Node.js/Express backend locally.' };
    }
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = getAuthToken();
      if (token) headers['x-lifeos-auth'] = token;

      const resp = await fetch('/api/qums/login', {
        method: 'POST',
        headers,
        body: JSON.stringify({ loginSessionId, username, password, captcha, regId, yearSem })
      });
      const data = await resp.json();
      if (data.connected && data.sessionId) activeSessionId = data.sessionId;
      return data;
    } catch {
      return { connected: false, status: 'network_error', message: 'Unable to reach the LifeOS backend server.' };
    }
  },

  async logout() {
    const sid = activeSessionId;
    activeSessionId = null;
    if (!this.isStandalonePreview() && sid) {
      try {
        await fetch('/api/qums/logout', { method: 'POST', headers: { 'x-lifeos-session': sid } });
      } catch {}
    }
  },

  async fetchAttendance(yearSem = 5) {
    if (this.isStandalonePreview()) {
      return { status: 'pending', connected: false, message: 'ERP connection is pending. Run the Node.js/Express backend locally and sign in with your QUMS credentials.' };
    }

    try {
      const headers = {};
      if (activeSessionId) headers['x-lifeos-session'] = activeSessionId;
      const token = getAuthToken();
      if (token) headers['x-lifeos-auth'] = token;

      const response = await fetch(`/api/erp/attendance?yearSem=${encodeURIComponent(yearSem)}`, {
        method: 'GET',
        headers
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.status === 'session_expired') activeSessionId = null;
        return { status: data.status || 'error', connected: false, message: data.message || `Server returned HTTP ${response.status}` };
      }
      return data;
    } catch {
      return { status: 'network_error', connected: false, message: 'Unable to reach the LifeOS backend server. Ensure Node.js is running.' };
    }
  }
};
