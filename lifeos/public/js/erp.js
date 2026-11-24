export const ERP = {
  isStandalonePreview() {
    return window.location.protocol === 'file:' || window.location.protocol === 'about:' || window.location.hostname === '';
  },

  async fetchAttendance() {
    if (this.isStandalonePreview()) {
      return {
        status: 'pending',
        connected: false,
        message: 'ERP connection is pending. Run the Node.js/Express backend locally with your QUMS credentials in .env to sync live attendance.'
      };
    }

    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      if (!response.ok) {
        return {
          status: data.status || 'error',
          connected: false,
          message: data.message || `Server returned HTTP ${response.status}`
        };
      }

      return data;
    } catch (err) {
      return {
        status: 'network_error',
        connected: false,
        message: 'Unable to reach the LifeOS backend server. Ensure Node.js is running.'
      };
    }
  }
};
