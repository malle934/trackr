/* ═══════════════════════════════════════════
   app.js — Main application state & wiring
   ═══════════════════════════════════════════ */

(async () => {

  // ── State ────────────────────────────────
  let apps        = [];
  let stats       = {};
  let stageFilter = null;
  let currentView = 'kanban';

  // ── Toast ─────────────────────────────────
  let _toastTimer = null;
  function toast(msg, duration = 3000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.removeAttribute('hidden');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.setAttribute('hidden', ''), duration);
  }

  // ── Render all ────────────────────────────
  function renderAll() {
    renderStats(stats, stageFilter, handleFilterClick);
    if (currentView === 'kanban') {
      renderBoard(apps, stageFilter, handleDrop, handleCardClick, handleAddClick);
    } else {
      renderList(apps, stageFilter, handleCardClick);
    }
    updateFilterTag();
  }

  function updateFilterTag() {
    const wrap = document.getElementById('filter-tag-wrap');
    if (!stageFilter || stageFilter === 'all') { wrap.innerHTML = ''; return; }
    const labels = {
      active: 'Active pipeline', interview: 'Interviews',
      offer: 'Offers', responded: 'Responded',
    };
    const label = stageFilter.startsWith('stage:')
      ? STAGES.find(s => s.id === stageFilter.slice(6))?.label
      : labels[stageFilter];
    if (!label) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="filter-tag">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" aria-hidden="true"><polyline points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        ${label}
        <button class="ft-remove" onclick="clearFilter()" aria-label="Clear filter">×</button>
      </div>`;
  }

  // ── Data loading ──────────────────────────
  async function loadData() {
    try {
      [apps, stats] = await Promise.all([api.getApplications(), api.getStats()]);
    } catch (err) {
      console.error('Backend error:', err);
      showBackendError();
      return;
    }
    renderAll();
  }

  function showBackendError() {
    document.getElementById('board').innerHTML = `
      <div style="padding:3rem;text-align:center;color:var(--text2);max-width:400px;margin:0 auto">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.5" width="40" height="40" style="margin-bottom:16px" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style="font-family:Syne,sans-serif;font-size:16px;font-weight:600;margin-bottom:8px;color:var(--text)">Backend not running</div>
        <div style="font-size:13px;line-height:1.7">Start the FastAPI server first:<br>
          <code style="background:var(--surface2);padding:2px 8px;border-radius:5px;font-size:12px">cd backend &amp;&amp; uvicorn main:app --reload</code>
        </div>
      </div>`;
    // Clear skeleton stats
    document.getElementById('stats-grid').innerHTML = '';
  }

  async function refreshData() {
    try {
      [apps, stats] = await Promise.all([api.getApplications(), api.getStats()]);
      renderAll();
    } catch (err) { console.error(err); }
  }

  // ── Event handlers ────────────────────────

  function handleFilterClick(filter) {
    stageFilter = (stageFilter === filter) ? null : filter;
    if (stageFilter === 'all') stageFilter = null;
    renderAll();
  }

  // exposed globally for filter-tag clear button
  window.clearFilter = () => { stageFilter = null; renderAll(); };

  function handleDrop(appId, newStage) {
    const app = apps.find(a => a.id === appId);
    if (!app || app.stage === newStage) return;
    app.stage = newStage; // optimistic update
    renderAll();
    api.updateApplication(appId, { stage: newStage })
      .then(() => refreshData())
      .catch(err => { toast('Failed to update stage'); console.error(err); loadData(); });
  }

  function handleCardClick(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    modal.openDetail(
      app,
      (a) => modal.openEdit(a, handleSaveEdit, () => modal.openDetail(app, handleCardClick.bind(null, appId), handleDelete)),
      handleDelete
    );
  }

  function handleAddClick(stage = 'applied') {
    modal.openAdd(stage, async (data) => {
      try {
        await api.createApplication(data);
        modal.close();
        toast('Application added ✓');
        await refreshData();
      } catch (err) {
        toast('Failed to save: ' + err.message);
        console.error(err);
      }
    });
  }

  async function handleSaveEdit(appId, data) {
    try {
      await api.updateApplication(appId, data);
      modal.close();
      toast('Saved ✓');
      await refreshData();
    } catch (err) {
      toast('Failed to save: ' + err.message);
      console.error(err);
    }
  }

  function handleDelete(appId) {
    const app = apps.find(a => a.id === appId);
    modal.confirmDelete(app?.company || 'this application', async () => {
      try {
        await api.deleteApplication(appId);
        modal.close();
        toast('Application deleted');
        await refreshData();
      } catch (err) {
        toast('Failed to delete: ' + err.message);
        console.error(err);
      }
    });
  }

  // ── Smart paste ───────────────────────────

  function handlePaste() {
    modal.openPaste(async (text) => {
      modal.showParsing();
      try {
        const app = await api.parseText(text);
        apps.push(app);
        stats = await api.getStats();
        modal.close();
        toast('Application added from paste ✓');
        renderAll();
      } catch (err) {
        modal.showParseError(() => modal.openPaste(handlePaste));
        console.error(err);
      }
    });
  }

  // ── Gmail sync ────────────────────────────

  async function handleGmail() {
    let connectedEmails = [];
    try {
      const status = await api.getAuthStatus();
      connectedEmails = status.emails || [];
    } catch (err) { console.error(err); }

    modal.openGmail(
      connectedEmails,
      () => api.startGmailAuth(),          // onConnect → redirect to Google
      handleGmailSync,                     // onSync
      handleGmailDisconnect                // onDisconnect
    );
  }

  async function handleGmailSync(email) {
    modal.showSyncing(email);
    try {
      const result = await api.syncGmail(email, 90, 50);
      await refreshData();
      modal.showSyncResults(result, () => { modal.close(); });
    } catch (err) {
      modal.showSyncError(() => api.startGmailAuth());
      console.error(err);
    }
  }

  async function handleGmailDisconnect(email) {
    if (!confirm(`Disconnect ${email}?`)) return;
    try {
      await api.disconnectGmail(email);
      toast(`${email} disconnected`);
      handleGmail(); // reopen modal with updated list
    } catch (err) {
      toast('Failed to disconnect');
      console.error(err);
    }
  }

  // ── View toggle ───────────────────────────

  function setView(v) {
    currentView = v;
    const kanban = document.getElementById('kanban-view');
    const list   = document.getElementById('list-view');
    const btnK   = document.getElementById('btn-kanban');
    const btnL   = document.getElementById('btn-list');

    if (v === 'kanban') {
      kanban.removeAttribute('hidden');
      list.setAttribute('hidden', '');
      btnK.classList.add('active');    btnK.setAttribute('aria-pressed', 'true');
      btnL.classList.remove('active'); btnL.setAttribute('aria-pressed', 'false');
    } else {
      kanban.setAttribute('hidden', '');
      list.removeAttribute('hidden');
      btnK.classList.remove('active'); btnK.setAttribute('aria-pressed', 'false');
      btnL.classList.add('active');    btnL.setAttribute('aria-pressed', 'true');
    }
    renderAll();
  }

  // ── Wire up buttons ───────────────────────

  document.getElementById('btn-add').addEventListener('click',   () => handleAddClick());
  document.getElementById('btn-paste').addEventListener('click', handlePaste);
  document.getElementById('btn-gmail').addEventListener('click', handleGmail);
  document.getElementById('btn-kanban').addEventListener('click', () => setView('kanban'));
  document.getElementById('btn-list').addEventListener('click',  () => setView('list'));
  document.getElementById('search-input').addEventListener('input', renderAll);
  document.getElementById('sort-select').addEventListener('change', renderAll);

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) modal.close();
  });

  // ── Keyboard shortcuts ────────────────────

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') modal.close();
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); handleAddClick(); }
  });

  // ── Handle OAuth callback params ──────────
  const params = new URLSearchParams(window.location.search);
  if (params.get('auth_success')) {
    const email = params.get('email');
    toast(`✓ ${email} connected! Click Sync Gmail to import emails.`);
    window.history.replaceState({}, '', window.location.pathname);
  }
  if (params.get('auth_error')) {
    toast(`Gmail connection failed: ${params.get('auth_error')}`);
    window.history.replaceState({}, '', window.location.pathname);
  }

  // ── Boot ──────────────────────────────────
  await loadData();

})();
