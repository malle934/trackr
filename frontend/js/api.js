/* ═══════════════════════════════════════════
   api.js — Backend communication layer
   ═══════════════════════════════════════════ */

// Auto-detect backend URL:
// - In production: uses BACKEND_URL set in window (injected by Vercel env)
// - In development: falls back to localhost
const API_BASE = window.BACKEND_URL || 'http://localhost:8000';

const api = (() => {

  async function request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ── Applications ──────────────────────────

  async function getApplications() {
    return request('GET', '/api/applications');
  }

  async function createApplication(data) {
    return request('POST', '/api/applications', data);
  }

  async function updateApplication(id, data) {
    return request('PATCH', `/api/applications/${id}`, data);
  }

  async function deleteApplication(id) {
    return request('DELETE', `/api/applications/${id}`);
  }

  // ── Stats ─────────────────────────────────

  async function getStats() {
    return request('GET', '/api/stats');
  }

  // ── Smart paste ───────────────────────────

  async function parseText(text) {
    return request('POST', '/api/parse', { text });
  }

  // ── Gmail auth ────────────────────────────

  async function getAuthStatus() {
    return request('GET', '/auth/status');
  }

  function startGmailAuth() {
    window.location.href = `${API_BASE}/auth/gmail`;
  }

  async function disconnectGmail(email) {
    return request('DELETE', `/auth/disconnect/${encodeURIComponent(email)}`);
  }

  // ── Gmail sync ────────────────────────────

  async function syncGmail(email, days = 90, maxResults = 50) {
    return request(
      'POST',
      `/api/sync/${encodeURIComponent(email)}?days=${days}&max_results=${maxResults}`
    );
  }

  return {
    getApplications,
    createApplication,
    updateApplication,
    deleteApplication,
    getStats,
    parseText,
    getAuthStatus,
    startGmailAuth,
    disconnectGmail,
    syncGmail,
  };
})();
