/* ═══════════════════════════════════════════
   board.js — Kanban board & list view rendering
   ═══════════════════════════════════════════ */

const STAGES = [
  { id: 'bookmarked', label: 'Bookmarked', color: '#5a5a72' },
  { id: 'applied',    label: 'Applied',    color: '#6c63ff' },
  { id: 'phone',      label: 'Phone screen', color: '#a855f7' },
  { id: 'interview',  label: 'Interview',  color: '#f59e0b' },
  { id: 'final',      label: 'Final round', color: '#ec4899' },
  { id: 'offer',      label: 'Offer',      color: '#22c55e' },
  { id: 'rejected',   label: 'Rejected',   color: '#ef4444' },
];

const PORDER = { hot: 0, warm: 1, cold: 2, '': 3 };

let _dragId = null;

// ── Helpers ────────────────────────────────

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d) <= new Date();
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function logoHtml(company, url, size = 26, radiusPx = 6) {
  const initials = String(company || '?').substring(0, 2).toUpperCase();
  const domain = getDomain(url);
  const style = `width:${size}px;height:${size}px;border-radius:${radiusPx}px`;
  if (domain) {
    return `<div class="company-logo" style="${style}">` +
      `<img src="https://${domain}/favicon.ico" loading="lazy" ` +
      `onerror="this.parentElement.textContent='${initials}'"></div>`;
  }
  return `<div class="company-logo" style="${style}">${initials}</div>`;
}

function stagePillHtml(stageId) {
  const stage = STAGES.find(s => s.id === stageId);
  const label = stage ? stage.label : stageId;
  return `<span class="stage-pill stage-${stageId}">
    <span style="width:5px;height:5px;border-radius:50%;background:${stage?.color || '#888'};display:inline-block"></span>
    ${label}
  </span>`;
}

// ── Filter & sort ──────────────────────────

function getFiltered(apps, stageFilter) {
  let list = [...apps];

  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  if (q) list = list.filter(a => (a.company + ' ' + a.title).toLowerCase().includes(q));

  if (stageFilter === 'active')    list = list.filter(a => !['rejected', 'offer'].includes(a.stage));
  else if (stageFilter === 'interview') list = list.filter(a => ['interview', 'final'].includes(a.stage));
  else if (stageFilter === 'offer')    list = list.filter(a => a.stage === 'offer');
  else if (stageFilter === 'responded') list = list.filter(a => !['applied', 'bookmarked'].includes(a.stage));
  else if (stageFilter?.startsWith('stage:')) list = list.filter(a => a.stage === stageFilter.slice(6));

  const sort = document.getElementById('sort-select')?.value || 'date';
  if (sort === 'company')  list.sort((a, b) => a.company.localeCompare(b.company));
  else if (sort === 'priority') list.sort((a, b) => (PORDER[a.priority] ?? 3) - (PORDER[b.priority] ?? 3));
  else if (sort === 'stage')    list.sort((a, b) => STAGES.findIndex(s => s.id === a.stage) - STAGES.findIndex(s => s.id === b.stage));
  else list.sort((a, b) => (b.applied || '').localeCompare(a.applied || ''));

  return list;
}

// ── Kanban board ───────────────────────────

function renderBoard(apps, stageFilter, onDrop, onCardClick, onAddClick) {
  const filtered = getFiltered(apps, stageFilter);
  const board = document.getElementById('board');
  board.innerHTML = '';

  STAGES.forEach(stage => {
    const cards   = filtered.filter(a => a.stage === stage.id);
    const allCnt  = apps.filter(a => a.stage === stage.id).length;
    const showRatio = filtered.length < apps.length && allCnt !== cards.length;

    const col = document.createElement('div');
    col.className = 'column';

    // Header
    const header = document.createElement('div');
    header.className = 'col-header';
    header.innerHTML = `
      <div class="col-title">
        <span class="col-dot" style="background:${stage.color}"></span>
        ${stage.label}
      </div>
      <span class="col-count">${cards.length}${showRatio ? '/' + allCnt : ''}</span>`;
    col.appendChild(header);

    // Drop zone body
    const body = document.createElement('div');
    body.className = 'col-body';
    body.dataset.stage = stage.id;
    body.setAttribute('role', 'list');
    body.setAttribute('aria-label', `${stage.label} column`);

    body.addEventListener('dragover',  e => { e.preventDefault(); body.classList.add('drag-over'); });
    body.addEventListener('dragleave', ()  => body.classList.remove('drag-over'));
    body.addEventListener('drop', e => {
      e.preventDefault();
      body.classList.remove('drag-over');
      if (_dragId) onDrop(_dragId, stage.id);
    });

    if (cards.length === 0) {
      body.innerHTML = `<div class="empty-col">Drop here</div>`;
    } else {
      cards.forEach(app => body.appendChild(makeCard(app, onCardClick)));
    }
    col.appendChild(body);

    // Add button
    const addBtn = document.createElement('button');
    addBtn.className = 'col-add-btn';
    addBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add`;
    addBtn.addEventListener('click', () => onAddClick(stage.id));
    col.appendChild(addBtn);

    board.appendChild(col);
  });
}

function makeCard(app, onClick) {
  const el = document.createElement('div');
  el.className = 'app-card';
  el.draggable = true;
  el.dataset.id = app.id;
  el.setAttribute('role', 'listitem');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `${app.company} — ${app.title || 'No title'}`);

  const stage = STAGES.find(s => s.id === app.stage);
  el.style.setProperty('--card-accent', (stage?.color || '#6c63ff') + '44');
  el.style.borderLeft = `3px solid ${stage?.color || '#6c63ff'}55`;

  el.addEventListener('dragstart', () => { _dragId = app.id; el.classList.add('dragging'); });
  el.addEventListener('dragend',   () => { _dragId = null;   el.classList.remove('dragging'); });
  el.addEventListener('click',     () => onClick(app.id));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(app.id); } });

  const pb  = app.priority ? `<span class="badge badge-${app.priority}">${app.priority}</span>` : '';
  const sal = app.salary   ? `<div class="card-salary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>${esc(app.salary)}</div>` : '';
  const fu  = isOverdue(app.followup) ? `<div class="card-followup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>Follow up ${app.followup}</div>` : '';
  const src = app.source_auto ? `<span class="badge badge-auto" style="margin-left:auto">auto</span>` : '';

  el.innerHTML = `
    <div class="card-row1">
      ${logoHtml(app.company, app.url)}
      <span class="card-company">${esc(app.company)}</span>${src}
    </div>
    <div class="card-title">${esc(app.title || 'No title')}</div>
    <div class="card-footer">
      <span class="card-date">${app.applied || '—'}</span>${pb}
    </div>
    ${sal}${fu}`;

  return el;
}

// ── List view ──────────────────────────────

function renderList(apps, stageFilter, onRowClick) {
  const filtered = getFiltered(apps, stageFilter);
  const tbody = document.getElementById('list-body');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text3)">No applications match your filter</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(app => {
    const pb = app.priority ? `<span class="badge badge-${app.priority}">${app.priority}</span>` : '—';
    return `
      <tr data-id="${app.id}" tabindex="0" role="row" aria-label="${esc(app.company)} — ${esc(app.title)}">
        <td>
          <div class="table-company">
            <div class="table-co-logo">${
              getDomain(app.url)
                ? `<img src="https://${getDomain(app.url)}/favicon.ico" loading="lazy" onerror="this.parentElement.textContent='${String(app.company).substring(0,2).toUpperCase()}'">`
                : String(app.company).substring(0, 2).toUpperCase()
            }</div>
            <span class="table-name">${esc(app.company)}</span>
          </div>
        </td>
        <td style="color:var(--text2)">${esc(app.title || '—')}</td>
        <td>${stagePillHtml(app.stage)}</td>
        <td>${pb}</td>
        <td style="color:var(--text3)">${app.applied || '—'}</td>
        <td style="color:var(--text3)">${app.salary  || '—'}</td>
        <td style="color:var(--text3)">${app.location|| '—'}</td>
      </tr>`;
  }).join('');

  // Attach click & keyboard handlers
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    const click = () => onRowClick(row.dataset.id);
    row.addEventListener('click', click);
    row.addEventListener('keydown', e => { if (e.key === 'Enter') click(); });
  });
}

// ── Stats ──────────────────────────────────

function renderStats(stats, stageFilter, onFilterClick) {
  const data = [
    { key: 'all',       label: 'Total applied',  value: stats.total,         sub: 'all time' },
    { key: 'active',    label: 'Active pipeline', value: stats.active,        sub: 'in progress' },
    { key: 'interview', label: 'Interviews',      value: stats.interviews,    sub: 'scheduled' },
    { key: 'offer',     label: 'Offers',          value: stats.offers,        sub: 'received' },
    { key: 'responded', label: 'Response rate',   value: stats.response_rate + '%', sub: 'of applications' },
  ];

  document.getElementById('stats-grid').innerHTML = data.map(s => `
    <div class="stat-card${stageFilter === s.key ? ' active' : ''}"
         tabindex="0" role="button"
         aria-pressed="${stageFilter === s.key}"
         data-filter="${s.key}"
         title="Filter by ${s.label}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
      <div class="stat-sub">${s.sub}</div>
    </div>`).join('');

  document.querySelectorAll('.stat-card[data-filter]').forEach(card => {
    card.addEventListener('click',   () => onFilterClick(card.dataset.filter));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilterClick(card.dataset.filter); } });
  });
}
