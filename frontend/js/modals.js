/* ═══════════════════════════════════════════
   modals.js — All modal dialogs
   ═══════════════════════════════════════════ */

const modal = (() => {

  function show(html) {
    const overlay = document.getElementById('modal-overlay');
    const box     = document.getElementById('modal-box');
    overlay.removeAttribute('hidden');
    box.innerHTML = html;
    box.focus();
  }

  function setContent(html) {
    document.getElementById('modal-box').innerHTML = html;
  }

  function close() {
    document.getElementById('modal-overlay').setAttribute('hidden', '');
  }

  // ── Helpers ──────────────────────────────

  function stageOptions(selected = 'applied') {
    return STAGES.map(s =>
      `<option value="${s.id}"${s.id === selected ? ' selected' : ''}>${s.label}</option>`
    ).join('');
  }

  function priorityOptions(selected = '') {
    const opts = [['', 'None'], ['hot', '🔥 Hot'], ['warm', '⚡ Warm'], ['cold', '❄️ Cold']];
    return opts.map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`).join('');
  }

  function closeBtn(extra = '') {
    return `<button class="modal-close" onclick="modal.close()" aria-label="Close"${extra}>×</button>`;
  }

  // ── Add application ───────────────────────

  function openAdd(stage = 'applied', onSave, prefill = {}) {
    const today = new Date().toISOString().slice(0,10);
    const fu    = new Date(Date.now() + 7 * 864e5).toISOString().slice(0,10);

    show(`
      <div class="modal-header">
        <div class="modal-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          New application
        </div>
        ${closeBtn()}
      </div>
      <div class="form-row">
        <div class="form-field"><label>Company *</label><input id="f-co" placeholder="e.g. Google" value="${esc(prefill.company||'')}" autofocus></div>
        <div class="form-field"><label>Job title</label><input id="f-title" placeholder="e.g. Software Engineer" value="${esc(prefill.title||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Stage</label><select id="f-stage">${stageOptions(stage)}</select></div>
        <div class="form-field"><label>Priority</label><select id="f-priority">${priorityOptions()}</select></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Date applied</label><input type="date" id="f-applied" value="${prefill.applied||today}"></div>
        <div class="form-field"><label>Follow-up date</label><input type="date" id="f-followup" value="${fu}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Salary range</label><input id="f-salary" placeholder="e.g. $120k–$150k"></div>
        <div class="form-field"><label>Location</label><input id="f-location" placeholder="Remote / NYC"></div>
      </div>
      <div class="form-field"><label>Job URL</label><input id="f-url" placeholder="https://company.com/jobs/..."></div>
      <div class="form-field"><label>Notes</label><textarea id="f-notes" placeholder="Recruiter name, next steps…">${esc(prefill.notes||'')}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="modal.close()">Cancel</button>
        <div style="margin-left:auto">
          <button class="btn btn-primary" id="save-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Save application
          </button>
        </div>
      </div>`);

    document.getElementById('save-btn').addEventListener('click', () => {
      const company = document.getElementById('f-co').value.trim();
      if (!company) { alert('Company name is required'); return; }
      onSave({
        company,
        title:    document.getElementById('f-title').value.trim(),
        stage:    document.getElementById('f-stage').value,
        priority: document.getElementById('f-priority').value,
        applied:  document.getElementById('f-applied').value,
        followup: document.getElementById('f-followup').value,
        salary:   document.getElementById('f-salary').value.trim(),
        location: document.getElementById('f-location').value.trim(),
        url:      document.getElementById('f-url').value.trim(),
        notes:    document.getElementById('f-notes').value.trim(),
      });
    });
  }

  // ── Detail view ───────────────────────────

  function openDetail(app, onEdit, onDelete) {
    const stage  = STAGES.find(s => s.id === app.stage);
    const domain = getDomain(app.url);
    const logoEl = domain
      ? `<div style="width:46px;height:46px;border-radius:10px;background:var(--surface3);border:1px solid var(--border);overflow:hidden;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-weight:700;font-size:13px;color:var(--text2)"><img src="https://${domain}/favicon.ico" style="width:100%;height:100%;object-fit:contain" onerror="this.parentElement.textContent='${esc(app.company).substring(0,2).toUpperCase()}'"></div>`
      : `<div style="width:46px;height:46px;border-radius:10px;background:var(--surface3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-weight:700;font-size:13px;color:var(--text2)">${String(app.company).substring(0,2).toUpperCase()}</div>`;

    const pb = app.priority ? `<span class="badge badge-${app.priority}" style="font-size:12px;padding:3px 9px">${app.priority}</span>` : '';

    show(`
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:14px">
          ${logoEl}
          <div>
            <div style="font-family:Syne,sans-serif;font-size:18px;font-weight:700;color:var(--text)">${esc(app.company)}</div>
            <div style="font-size:13px;color:var(--text2);margin-top:2px">${esc(app.title || 'No title specified')}</div>
          </div>
        </div>
        ${closeBtn()}
      </div>

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap">
        ${stagePillHtml(app.stage)}
        ${pb}
        ${app.source_auto ? '<span class="badge badge-auto">auto-detected</span>' : ''}
      </div>

      <div class="detail-grid">
        <div class="detail-item"><div class="detail-item-label">Date applied</div><div class="detail-item-value">${app.applied || '—'}</div></div>
        <div class="detail-item"><div class="detail-item-label">Follow-up</div><div class="detail-item-value" style="${isOverdue(app.followup) ? 'color:var(--amber)' : ''}">${app.followup || '—'}</div></div>
        <div class="detail-item"><div class="detail-item-label">Salary</div><div class="detail-item-value">${app.salary || '—'}</div></div>
        <div class="detail-item"><div class="detail-item-label">Location</div><div class="detail-item-value">${app.location || '—'}</div></div>
      </div>

      ${app.url ? `<div class="detail-item" style="margin-bottom:14px"><div class="detail-item-label">Job URL</div><div class="detail-item-value" style="margin-top:6px"><a href="${esc(app.url)}" target="_blank" rel="noopener">${esc(app.url)}</a></div></div>` : ''}
      ${app.notes ? `<div class="detail-item" style="margin-bottom:6px"><div class="detail-item-label">Notes</div><div style="font-size:13px;color:var(--text2);margin-top:6px;line-height:1.6">${esc(app.notes)}</div></div>` : ''}

      <div class="modal-footer">
        <button class="btn btn-danger" id="del-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Delete
        </button>
        <div style="margin-left:auto;display:flex;gap:8px">
          ${app.url ? `<a href="${esc(app.url)}" target="_blank" rel="noopener" class="btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Open job</a>` : ''}
          <button class="btn btn-primary" id="edit-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
        </div>
      </div>`);

    document.getElementById('edit-btn').addEventListener('click', () => onEdit(app));
    document.getElementById('del-btn').addEventListener('click', () => onDelete(app.id));
  }

  // ── Edit application ──────────────────────

  function openEdit(app, onSave, onBack) {
    show(`
      <div class="modal-header">
        <div class="modal-title">Edit — ${esc(app.company)}</div>
        ${closeBtn()}
      </div>
      <div class="form-row">
        <div class="form-field"><label>Company *</label><input id="f-co" value="${esc(app.company)}" autofocus></div>
        <div class="form-field"><label>Job title</label><input id="f-title" value="${esc(app.title || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Stage</label><select id="f-stage">${stageOptions(app.stage)}</select></div>
        <div class="form-field"><label>Priority</label><select id="f-priority">${priorityOptions(app.priority)}</select></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Date applied</label><input type="date" id="f-applied" value="${app.applied || ''}"></div>
        <div class="form-field"><label>Follow-up date</label><input type="date" id="f-followup" value="${app.followup || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Salary range</label><input id="f-salary" value="${esc(app.salary || '')}"></div>
        <div class="form-field"><label>Location</label><input id="f-location" value="${esc(app.location || '')}"></div>
      </div>
      <div class="form-field"><label>Job URL</label><input id="f-url" value="${esc(app.url || '')}"></div>
      <div class="form-field"><label>Notes</label><textarea id="f-notes">${esc(app.notes || '')}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="modal.close()">Cancel</button>
          <button class="btn btn-primary" id="save-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Save changes
          </button>
        </div>
      </div>`);

    document.getElementById('back-btn').addEventListener('click', () => onBack());
    document.getElementById('save-btn').addEventListener('click', () => {
      const company = document.getElementById('f-co').value.trim();
      if (!company) { alert('Company name is required'); return; }
      onSave(app.id, {
        company,
        title:    document.getElementById('f-title').value.trim(),
        stage:    document.getElementById('f-stage').value,
        priority: document.getElementById('f-priority').value,
        applied:  document.getElementById('f-applied').value,
        followup: document.getElementById('f-followup').value,
        salary:   document.getElementById('f-salary').value.trim(),
        location: document.getElementById('f-location').value.trim(),
        url:      document.getElementById('f-url').value.trim(),
        notes:    document.getElementById('f-notes').value.trim(),
      });
    });
  }

  // ── Smart paste ───────────────────────────

  function openPaste(onParse) {
    show(`
      <div class="modal-header">
        <div class="modal-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17" aria-hidden="true"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
          Smart paste
        </div>
        ${closeBtn()}
      </div>
      <div class="alert alert-info">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Paste any job confirmation email, interview invite, offer letter, or job description. Gemini AI will extract all details automatically.
      </div>
      <div class="form-field">
        <label>Paste content</label>
        <textarea class="paste-area" id="paste-text" placeholder="Dear [Name], thank you for applying to the Senior Engineer role at Acme Corp…"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="modal.close()">Cancel</button>
        <div style="margin-left:auto">
          <button class="btn btn-primary" id="parse-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            Parse with Gemini AI
          </button>
        </div>
      </div>`);

    document.getElementById('parse-btn').addEventListener('click', () => {
      const text = document.getElementById('paste-text').value.trim();
      if (!text) { alert('Please paste some content first'); return; }
      onParse(text);
    });
  }

  function showParsing() {
    setContent(`<div class="loading-center">
      <div class="spinner"></div>
      <p>Analysing with Gemini AI…</p>
      <small>Extracting company, role, stage, and dates</small>
    </div>`);
  }

  function showParseError(onRetry) {
    setContent(`
      <div class="modal-header"><div class="modal-title">Parse failed</div>${closeBtn()}</div>
      <div class="alert alert-danger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        Could not extract job details. Make sure the text contains company and role information.
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="modal.close()">Cancel</button>
        <button class="btn btn-primary" style="margin-left:auto" id="retry-btn">Try again</button>
      </div>`);
    document.getElementById('retry-btn').addEventListener('click', onRetry);
  }

  // ── Gmail sync ────────────────────────────

  function openGmail(connectedEmails, accounts, onConnect, onSync, onDisconnect) {
    const emailListHtml = accounts.length
      ? accounts.map(acc => {
          const lastSync    = acc.last_synced
            ? new Date(acc.last_synced).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
            : null;
          const isFirst     = acc.is_first_sync;
          const syncLabel   = isFirst
            ? 'Will fetch last 90 days'
            : `Will fetch since ${acc.synced_until || 'last sync'}`;
          const syncSubtext = isFirst
            ? 'First sync — reads 3 months of emails'
            : `Last synced: ${lastSync} · ${acc.total_fetched || 0} emails fetched so far`;

          return `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:26px;height:26px;border-radius:50%;background:var(--green-bg);border:1px solid var(--green-border);display:flex;align-items:center;justify-content:center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                  <div style="font-size:13px;color:var(--text);font-weight:500">${esc(acc.email)}</div>
                  <div style="font-size:11px;color:var(--text3);margin-top:1px">${syncSubtext}</div>
                </div>
              </div>
              <button class="btn btn-danger btn-sm disc-btn" data-email="${esc(acc.email)}">Disconnect</button>
            </div>
            <div style="background:var(--surface3);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;margin-bottom:10px;font-size:12px;color:var(--accent2);display:flex;align-items:center;gap:6px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              ${syncLabel}
            </div>
            <button class="btn btn-green btn-full sync-btn" data-email="${esc(acc.email)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              ${isFirst ? 'Start first sync (90 days)' : 'Sync new emails only'}
            </button>
          </div>`}).join('')
      : `<div class="alert alert-info" style="margin-bottom:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          No Gmail accounts connected yet. Click "Connect Gmail" below.
        </div>`;

    show(`
      <div class="modal-header">
        <div class="modal-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Gmail auto-sync
        </div>
        ${closeBtn()}
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);margin-bottom:10px;font-weight:500">Connected accounts</div>
        ${emailListHtml}
      </div>

      <button class="btn btn-primary btn-full" id="connect-btn" style="margin-bottom:10px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        Connect new Gmail account
      </button>
      <div class="alert alert-info" style="margin-bottom:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Read-only OAuth2. Your emails never leave Google + this app.
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="modal.close()">Close</button>
      </div>`);

    document.getElementById('connect-btn').addEventListener('click', onConnect);
    document.querySelectorAll('.sync-btn').forEach(btn =>
      btn.addEventListener('click', () => onSync(btn.dataset.email))
    );
    document.querySelectorAll('.disc-btn').forEach(btn =>
      btn.addEventListener('click', () => onDisconnect(btn.dataset.email))
    );
  }

  function showSyncing(email) {
    setContent(`<div class="loading-center">
      <div class="spinner"></div>
      <p>Syncing Gmail…</p>
      <small>Scanning inbox for job emails — keyword filtered</small>
    </div>`);
  }

  function showSyncResults(result, onDone, onManualAdd) {
    const added    = result.added      || 0;
    const dups     = result.duplicates || 0;
    const skipped  = (result.skipped_emails || []).length;
    const addColor = added > 0 ? 'var(--green)' : 'var(--text3)';

    show(`
      <div class="modal-header">
        <div class="modal-title">Sync complete</div>
        ${closeBtn()}
      </div>

      <div style="text-align:center;padding:0.75rem 0 1rem">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--green-bg);border:1px solid var(--green-border);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style="font-family:Syne,sans-serif;font-size:17px;font-weight:700;color:var(--text)">Gmail synced</div>
      </div>

      <div class="sync-stats">
        <div class="sync-stat"><div class="sync-stat-val" style="color:${addColor}">${added}</div><div class="sync-stat-lbl">Added</div></div>
        <div class="sync-stat"><div class="sync-stat-val" style="color:var(--text3)">${dups}</div><div class="sync-stat-lbl">Existing</div></div>
        <div class="sync-stat"><div class="sync-stat-val" style="color:${skipped>0?'var(--amber)':'var(--text3)'}">${skipped}</div><div class="sync-stat-lbl">Review</div></div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:10px">
        <button class="sync-tab active" data-tab="added" style="flex:1;padding:7px;background:var(--accent-bg);border:none;color:var(--accent2);font-family:DM Sans,sans-serif;font-size:12px;font-weight:500;cursor:pointer;border-right:1px solid var(--border)">
          Added (${added})
        </button>
        <button class="sync-tab" data-tab="existing" style="flex:1;padding:7px;background:var(--surface2);border:none;color:var(--text2);font-family:DM Sans,sans-serif;font-size:12px;cursor:pointer;border-right:1px solid var(--border)">
          Existing (${dups})
        </button>
        <button class="sync-tab" data-tab="review" style="flex:1;padding:7px;background:var(--surface2);border:none;color:${skipped>0?'var(--amber)':'var(--text2)'};font-family:DM Sans,sans-serif;font-size:12px;cursor:pointer">
          Review (${skipped})
        </button>
      </div>

      <!-- Added tab -->
      <div id="sync-panel-added" class="sync-list">
        ${result.items.filter(i=>i.is_new).length === 0
          ? `<div style="text-align:center;padding:1.5rem;color:var(--text3);font-size:13px">No new applications added</div>`
          : result.items.filter(i=>i.is_new).map(item=>`
            <div class="sync-list-item">
              <div style="flex:1;min-width:0">
                <div class="sync-list-item-name">${esc(item.company)} — ${esc(item.title||'Unknown role')}</div>
                <div class="sync-list-item-sub">${esc(item.email_subject||item.email_date||'')}</div>
              </div>
              <div style="display:flex;align-items:center;gap:5px">
                <span class="stage-pill stage-${item.stage}">${STAGES.find(s=>s.id===item.stage)?.label||item.stage}</span>
                <span class="new-badge">New</span>
              </div>
            </div>`).join('')}
      </div>

      <!-- Existing tab -->
      <div id="sync-panel-existing" class="sync-list" style="display:none">
        ${result.items.filter(i=>!i.is_new).length === 0
          ? `<div style="text-align:center;padding:1.5rem;color:var(--text3);font-size:13px">No duplicates</div>`
          : result.items.filter(i=>!i.is_new).map(item=>`
            <div class="sync-list-item">
              <div style="flex:1;min-width:0">
                <div class="sync-list-item-name">${esc(item.company)} — ${esc(item.title||'')}</div>
                <div class="sync-list-item-sub">${esc(item.email_subject||'')}</div>
              </div>
              <span class="dup-badge">Already tracked</span>
            </div>`).join('')}
      </div>

      <!-- Review tab -->
      <div id="sync-panel-review" class="sync-list" style="display:none">
        ${skipped === 0
          ? `<div style="text-align:center;padding:1.5rem;color:var(--text3);font-size:13px">No emails need review ✓</div>`
          : (result.skipped_emails||[]).map((e,i)=>`
            <div class="sync-list-item" style="flex-direction:column;align-items:stretch;gap:6px">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                <div style="flex:1;min-width:0">
                  <div class="sync-list-item-name">${esc(e.subject||'No subject')}</div>
                  <div class="sync-list-item-sub">${esc(e.from||'')} · ${esc(e.date||'')}</div>
                  ${e.snippet?`<div style="font-size:11px;color:var(--text3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.snippet)}</div>`:''}
                </div>
                <button class="btn btn-primary btn-sm add-skipped-btn" 
                  data-subject="${esc(e.subject||'')}"
                  data-from="${esc(e.from||'')}"
                  data-date="${esc(e.date||'')}"
                  data-snippet="${esc(e.snippet||'')}"
                  style="flex-shrink:0;white-space:nowrap">
                  + Add
                </button>
              </div>
            </div>`).join('')}
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary btn-full" id="sync-done-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
          View my pipeline
        </button>
      </div>`);

    // Tab switching
    document.querySelectorAll('.sync-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sync-tab').forEach(t => {
          t.style.background = 'var(--surface2)';
          t.style.color = t.dataset.tab === 'review' && skipped > 0 ? 'var(--amber)' : 'var(--text2)';
        });
        tab.style.background = 'var(--accent-bg)';
        tab.style.color = 'var(--accent2)';
        document.querySelectorAll('[id^="sync-panel-"]').forEach(p => p.style.display = 'none');
        document.getElementById(`sync-panel-${tab.dataset.tab}`).style.display = '';
      });
    });

    // Add skipped email manually
    document.querySelectorAll('.add-skipped-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subject = btn.dataset.subject;
        const from    = btn.dataset.from;
        const date    = btn.dataset.date;
        const snippet = btn.dataset.snippet;
        // Extract company from sender email domain
        const domain  = from.match(/@([^>]+)/)?.[1]?.split('.')[0] || '';
        if (onManualAdd) onManualAdd({ subject, from, date, snippet, domain });
      });
    });

    document.getElementById('sync-done-btn').addEventListener('click', onDone);
  }

  function showSyncError(onRetry) {
    setContent(`
      <div class="modal-header"><div class="modal-title">Sync failed</div>${closeBtn()}</div>
      <div class="alert alert-danger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        Could not sync Gmail. Your session may have expired — try reconnecting your account.
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="modal.close()">Cancel</button>
        <button class="btn btn-primary" style="margin-left:auto" id="retry-btn">Reconnect Gmail</button>
      </div>`);
    document.getElementById('retry-btn').addEventListener('click', onRetry);
  }

  // ── Delete confirmation ───────────────────

  function confirmDelete(company, onConfirm) {
    show(`
      <div class="modal-header">
        <div class="modal-title">Delete application?</div>
        ${closeBtn()}
      </div>
      <div class="alert alert-warning" style="margin-bottom:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        This will permanently delete the <strong>${esc(company)}</strong> application. This cannot be undone.
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="modal.close()">Cancel</button>
        <button class="btn btn-danger" style="margin-left:auto" id="confirm-del">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          Delete
        </button>
      </div>`);
    document.getElementById('confirm-del').addEventListener('click', onConfirm);
  }

  return {
    show, setContent, close,
    openAdd, openDetail, openEdit,
    openPaste, showParsing, showParseError,
    openGmail, showSyncing, showSyncResults, showSyncError,
    confirmDelete,
  };
})();
