/* ═══════════════════════════════════════════
   app.js — Main application state & wiring
   ═══════════════════════════════════════════ */

(async () => {

  // ── State ─────────────────────────────────
  let apps        = [];
  let stats       = {};
  let stageFilter = null;
  let currentView = 'kanban';
  let currentTab  = 'pipeline';

  // ── Toast ──────────────────────────────────
  let _toastTimer = null;
  function toast(msg, duration = 3000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.removeAttribute('hidden');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.setAttribute('hidden', ''), duration);
  }

  // ── Tab switching ──────────────────────────
  function switchTab(tab) {
    currentTab = tab;
    const panels = { pipeline: 'panel-pipeline', analytics: 'panel-analytics' };
    Object.entries(panels).forEach(([t, panelId]) => {
      const panel = document.getElementById(panelId);
      const tabBtn = document.getElementById(`tab-${t}`);
      const bnavBtn = document.getElementById(`bnav-${t}`);
      if (panel)  { t === tab ? panel.removeAttribute('hidden') : panel.setAttribute('hidden',''); }
      if (tabBtn) { tabBtn.classList.toggle('active', t === tab); tabBtn.setAttribute('aria-selected', t===tab); }
      if (bnavBtn){ bnavBtn.classList.toggle('active', t === tab); }
    });
    if (tab === 'analytics') analytics.update(apps);
  }

  // ── Render all ─────────────────────────────
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
    const labels = { active:'Active pipeline', interview:'Interviews', offer:'Offers', responded:'Responded' };
    const label = stageFilter.startsWith('stage:')
      ? STAGES.find(s => s.id === stageFilter.slice(6))?.label
      : labels[stageFilter];
    if (!label) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `<div class="filter-tag">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      ${label}
      <button class="ft-remove" onclick="clearFilter()" aria-label="Clear filter">×</button>
    </div>`;
  }

  // ── Data loading ───────────────────────────
  async function loadData() {
    try {
      [apps, stats] = await Promise.all([api.getApplications(), api.getStats()]);
    } catch (err) {
      console.error('Backend error:', err);
      showBackendError();
      return;
    }
    renderAll();
    analytics.init(apps);
  }

  function showBackendError() {
    document.getElementById('board').innerHTML = `
      <div style="padding:3rem;text-align:center;color:var(--text2);max-width:400px;margin:0 auto">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.5" width="36" height="36" style="margin-bottom:14px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style="font-family:Syne,sans-serif;font-size:15px;font-weight:600;margin-bottom:8px;color:var(--text)">Backend not running</div>
        <div style="font-size:13px;line-height:1.7;color:var(--text2)">Start the FastAPI server:<br>
          <code style="background:var(--surface2);padding:2px 8px;border-radius:5px;font-size:12px">uvicorn main:app --reload</code>
        </div>
      </div>`;
    document.getElementById('stats-grid').innerHTML = '';
  }

  async function refreshData() {
    try {
      [apps, stats] = await Promise.all([api.getApplications(), api.getStats()]);
      renderAll();
      analytics.update(apps);
    } catch (err) { console.error(err); }
  }

  // ── Event handlers ─────────────────────────
  function handleFilterClick(filter) {
    stageFilter = (stageFilter === filter) ? null : filter;
    if (stageFilter === 'all') stageFilter = null;
    if (stageFilter) switchTab('pipeline');
    renderAll();
  }

  window.clearFilter = () => { stageFilter = null; renderAll(); };
  window._handleCardClick = (id) => handleCardClick(id);

  function handleDrop(appId, newStage) {
    const app = apps.find(a => a.id === appId);
    if (!app || app.stage === newStage) return;
    app.stage = newStage;
    renderAll();
    api.updateApplication(appId, { stage: newStage })
      .then(() => refreshData())
      .catch(err => { toast('Failed to update stage'); loadData(); });
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
      } catch (err) { toast('Failed to save: ' + err.message); }
    });
  }

  async function handleSaveEdit(appId, data) {
    try {
      await api.updateApplication(appId, data);
      modal.close();
      toast('Saved ✓');
      await refreshData();
    } catch (err) { toast('Failed to save: ' + err.message); }
  }

  function handleDelete(appId) {
    const app = apps.find(a => a.id === appId);
    modal.confirmDelete(app?.company || 'this application', async () => {
      try {
        await api.deleteApplication(appId);
        modal.close();
        toast('Application deleted');
        await refreshData();
      } catch (err) { toast('Failed to delete: ' + err.message); }
    });
  }

  // ── Smart paste ────────────────────────────
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
        analytics.update(apps);
      } catch (err) {
        modal.showParseError(() => modal.openPaste(handlePaste));
      }
    });
  }

  // ── Gmail sync ─────────────────────────────
  async function handleGmail() {
    let connectedEmails = [];
    let accounts        = [];
    try {
      const status = await api.getAuthStatus();
      connectedEmails  = status.emails  || [];
      accounts         = status.accounts|| [];
    } catch (err) { console.error(err); }

    modal.openGmail(
      connectedEmails,
      accounts,
      () => api.startGmailAuth(),
      handleGmailSync,
      handleGmailDisconnect
    );
  }

  async function handleGmailSync(email) {
    modal.showSyncing(email);
    try {
      const result = await api.syncGmail(email);
      await refreshData();
      modal.showSyncResults(result, () => { modal.close(); switchTab('pipeline'); });
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
      handleGmail();
    } catch (err) { toast('Failed to disconnect'); }
  }

  // ── View toggle ────────────────────────────
  function setView(v) {
    currentView = v;
    const kanban = document.getElementById('kanban-view');
    const list   = document.getElementById('list-view');
    const btnK   = document.getElementById('btn-kanban');
    const btnL   = document.getElementById('btn-list');
    if (v === 'kanban') {
      kanban.removeAttribute('hidden'); list.setAttribute('hidden','');
      btnK.classList.add('active');    btnL.classList.remove('active');
    } else {
      kanban.setAttribute('hidden',''); list.removeAttribute('hidden');
      btnK.classList.remove('active'); btnL.classList.add('active');
    }
    renderAll();
  }

  // ── Mobile menu ────────────────────────────
  function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    menu.hasAttribute('hidden') ? menu.removeAttribute('hidden') : menu.setAttribute('hidden','');
  }
  function closeMobileMenu() {
    document.getElementById('mobile-menu')?.setAttribute('hidden','');
  }

  // ── Wire up all buttons ────────────────────
  // Desktop header
  document.getElementById('btn-add')?.addEventListener('click',   () => handleAddClick());
  document.getElementById('btn-paste')?.addEventListener('click', handlePaste);
  document.getElementById('btn-gmail')?.addEventListener('click', handleGmail);
  // Mobile header
  document.getElementById('btn-mobile-menu')?.addEventListener('click', toggleMobileMenu);
  document.getElementById('btn-add-m')?.addEventListener('click',   () => { closeMobileMenu(); handleAddClick(); });
  document.getElementById('btn-paste-m')?.addEventListener('click', () => { closeMobileMenu(); handlePaste(); });
  document.getElementById('btn-gmail-m')?.addEventListener('click', () => { closeMobileMenu(); handleGmail(); });
  // Bottom nav
  document.getElementById('bnav-pipeline')?.addEventListener('click',  () => switchTab('pipeline'));
  document.getElementById('bnav-analytics')?.addEventListener('click', () => switchTab('analytics'));
  document.getElementById('bnav-add')?.addEventListener('click',       () => handleAddClick());
  document.getElementById('bnav-gmail')?.addEventListener('click',     () => handleGmail());
  // View toggle
  document.getElementById('btn-kanban')?.addEventListener('click', () => setView('kanban'));
  document.getElementById('btn-list')?.addEventListener('click',   () => setView('list'));
  // Tabs
  document.getElementById('tab-pipeline')?.addEventListener('click',  () => switchTab('pipeline'));
  document.getElementById('tab-analytics')?.addEventListener('click', () => switchTab('analytics'));
  // Search/sort
  document.getElementById('search-input')?.addEventListener('input',  renderAll);
  document.getElementById('sort-select')?.addEventListener('change',  renderAll);

  // Modal overlay click to close
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) modal.close();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { modal.close(); closeMobileMenu(); }
    if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); handleAddClick(); }
  });

  // ── Handle OAuth redirect params ───────────
  const params = new URLSearchParams(window.location.search);
  if (params.get('auth_success')) {
    const email = params.get('email');
    toast(`✓ ${email} connected! Click Sync Gmail to import.`);
    window.history.replaceState({}, '', window.location.pathname);
  }
  if (params.get('auth_error')) {
    toast(`Gmail error: ${params.get('auth_error')}`);
    window.history.replaceState({}, '', window.location.pathname);
  }

  // ── Wire analytics controls ────────────────
  analytics.wireControls();

  // ── Boot ───────────────────────────────────
  await loadData();

})();
