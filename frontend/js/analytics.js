/* ═══════════════════════════════════════════
   analytics.js — Analytics tab
   Calendar + Timeline chart + Day detail
   ═══════════════════════════════════════════ */

const analytics = (() => {

  const STAGE_COLORS = {
    bookmarked: '#5a5a72',
    applied:    '#6c63ff',
    phone:      '#a855f7',
    interview:  '#f59e0b',
    final:      '#ec4899',
    offer:      '#22c55e',
    rejected:   '#ef4444',
  };

  let _apps        = [];
  let _calYear     = new Date().getFullYear();
  let _calMonth    = new Date().getMonth();
  let _selectedDay = null;
  let _chartInst   = null;
  let _groupBy     = 'weekly';
  let _rangeDays   = 90;

  // ── Public: init with app data ────────────

  function init(apps) {
    _apps = apps;
    _calYear  = new Date().getFullYear();
    _calMonth = new Date().getMonth();
    _renderAll();
  }

  function update(apps) {
    _apps = apps;
    _renderAll();
  }

  // ── Date range helpers ────────────────────

  function getRange() {
    const fromEl = document.getElementById('analytics-from');
    const toEl   = document.getElementById('analytics-to');
    if (fromEl?.value && toEl?.value) {
      return { from: new Date(fromEl.value), to: new Date(toEl.value + 'T23:59:59') };
    }
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - _rangeDays);
    return { from, to };
  }

  function getFilteredApps() {
    const { from, to } = getRange();
    return _apps.filter(a => {
      if (!a.applied) return false;
      const d = new Date(a.applied);
      return d >= from && d <= to;
    });
  }

  // ── Render all analytics ──────────────────

  function _renderAll() {
    _renderSummary();
    _renderTimeline();
    _renderCalendar();
    if (_selectedDay) _renderDayDetail(_selectedDay);
  }

  // ── Summary cards ─────────────────────────

  function _renderSummary() {
    const filtered = getFilteredApps();
    const stages = [
      { id: 'applied',   label: 'Applied',    color: STAGE_COLORS.applied },
      { id: 'interview', label: 'Interviews',  color: STAGE_COLORS.interview },
      { id: 'offer',     label: 'Offers',      color: STAGE_COLORS.offer },
      { id: 'rejected',  label: 'Rejected',    color: STAGE_COLORS.rejected },
    ];

    const el = document.getElementById('analytics-summary');
    if (!el) return;

    el.innerHTML = stages.map(s => {
      const count = filtered.filter(a =>
        s.id === 'interview' ? ['interview','final'].includes(a.stage) : a.stage === s.id
      ).length;
      return `<div class="a-stat" style="--stage-color:${s.color}">
        <div class="a-stat-val">${count}</div>
        <div class="a-stat-lbl">${s.label}</div>
      </div>`;
    }).join('');
  }

  // ── Timeline chart ────────────────────────

  function _renderTimeline() {
    const canvas = document.getElementById('timeline-chart');
    if (!canvas) return;

    const filtered = getFilteredApps();
    if (!filtered.length) {
      canvas.parentElement.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text3);font-size:13px">No applications in selected range</div>';
      return;
    }

    const { from, to } = getRange();
    const buckets = _buildBuckets(from, to, filtered);

    // Destroy previous chart
    if (_chartInst) { _chartInst.destroy(); _chartInst = null; }
    if (!canvas.getContext) return;

    // Simple canvas bar chart (no external lib)
    _drawBarChart(canvas, buckets);
  }

  function _buildBuckets(from, to, apps) {
    const buckets = {};

    apps.forEach(app => {
      if (!app.applied) return;
      const d = new Date(app.applied);
      const key = _bucketKey(d);
      if (!buckets[key]) buckets[key] = { label: _bucketLabel(d), applied:0, interview:0, offer:0, rejected:0, phone:0, final:0 };
      const stage = ['interview','final'].includes(app.stage) ? 'interview' : app.stage;
      if (buckets[key][stage] !== undefined) buckets[key][stage]++;
    });

    return Object.entries(buckets)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([,v]) => v);
  }

  function _bucketKey(d) {
    if (_groupBy === 'daily')   return d.toISOString().slice(0,10);
    if (_groupBy === 'monthly') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    // weekly — Monday of the week
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    return monday.toISOString().slice(0,10);
  }

  function _bucketLabel(d) {
    if (_groupBy === 'daily')   return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    if (_groupBy === 'monthly') return d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    return monday.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  }

  function _drawBarChart(canvas, buckets) {
    const ctx    = canvas.getContext('2d');
    const dpr    = window.devicePixelRatio || 1;
    const W      = canvas.parentElement.clientWidth || 600;
    const H      = 220;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const pad   = { top:20, right:16, bottom:40, left:36 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top  - pad.bottom;

    const stacks = ['applied','interview','offer','rejected'];
    const colors = {
      applied:'rgba(108,99,255,0.8)', interview:'rgba(245,158,11,0.8)',
      offer:'rgba(34,197,94,0.8)',    rejected:'rgba(239,68,68,0.8)'
    };

    // Max value
    const maxVal = Math.max(...buckets.map(b => stacks.reduce((s,k)=>s+(b[k]||0),0)), 1);
    const barW   = Math.max(6, (chartW / Math.max(buckets.length,1)) * 0.6);
    const gap    = chartW / Math.max(buckets.length, 1);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    for (let i=0;i<=4;i++) {
      const y = pad.top + chartH - (i/4)*chartH;
      ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+chartW,y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px DM Sans,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round((i/4)*maxVal), pad.left-4, y+3);
    }

    // Bars
    buckets.forEach((bucket, i) => {
      const x = pad.left + i*gap + gap/2 - barW/2;
      let yOffset = 0;
      stacks.forEach(key => {
        const val = bucket[key] || 0;
        if (!val) return;
        const barH = (val/maxVal)*chartH;
        const y    = pad.top + chartH - yOffset - barH;
        ctx.fillStyle = colors[key];
        const r = Math.min(4, barW/2);
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x,y,barW,barH,yOffset===0?[r,r,0,0]:[0,0,0,0]) : ctx.rect(x,y,barW,barH);
        ctx.fill();
        yOffset += barH;
      });

      // X axis label
      if (buckets.length <= 24) {
        ctx.fillStyle = 'rgba(144,144,168,0.8)';
        ctx.font = '10px DM Sans,sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x + barW/2, pad.top+chartH+14);
        if (buckets.length > 12) { ctx.rotate(-Math.PI/4); ctx.textAlign = 'right'; }
        ctx.fillText(bucket.label, 0, 0);
        ctx.restore();
      }
    });

    // Legend
    const legendItems = [
      {label:'Applied',color:colors.applied},
      {label:'Interview',color:colors.interview},
      {label:'Offer',color:colors.offer},
      {label:'Rejected',color:colors.rejected},
    ];
    let lx = pad.left;
    ctx.font = '11px DM Sans,sans-serif';
    legendItems.forEach(item => {
      ctx.fillStyle = item.color;
      ctx.beginPath(); ctx.roundRect?ctx.roundRect(lx,6,10,10,[3]):ctx.rect(lx,6,10,10); ctx.fill();
      ctx.fillStyle = 'rgba(144,144,168,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, lx+13, 15);
      lx += ctx.measureText(item.label).width + 30;
    });
  }

  // ── Calendar ──────────────────────────────

  function _renderCalendar() {
    const el = document.getElementById('calendar');
    const lbl = document.getElementById('cal-month-label');
    if (!el) return;

    const monthName = new Date(_calYear, _calMonth).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    if (lbl) lbl.textContent = monthName;

    const days  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const first = new Date(_calYear, _calMonth, 1);
    const last  = new Date(_calYear, _calMonth+1, 0);
    let startDow = first.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon=0

    // Build app map for this month
    const appMap = {};
    _apps.forEach(app => {
      if (!app.applied) return;
      const d = new Date(app.applied);
      if (d.getFullYear() === _calYear && d.getMonth() === _calMonth) {
        const key = d.getDate();
        if (!appMap[key]) appMap[key] = [];
        appMap[key].push(app);
      }
    });

    const today = new Date();
    let html = days.map(d=>`<div class="cal-day-header">${d}</div>`).join('');

    // Empty cells before first
    for (let i=0;i<startDow;i++) html += `<div class="cal-day empty"></div>`;

    for (let d=1; d<=last.getDate(); d++) {
      const isToday = today.getDate()===d && today.getMonth()===_calMonth && today.getFullYear()===_calYear;
      const isSelected = _selectedDay === `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayApps = appMap[d] || [];

      const dots = dayApps.slice(0,4).map(a =>
        `<span class="cal-dot" style="background:${STAGE_COLORS[a.stage]||'#888'}"></span>`
      ).join('');

      html += `<div class="cal-day${isToday?' today':''}${isSelected?' active':''}"
        data-date="${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}"
        onclick="analytics._selectDay(this.dataset.date)">
        <span class="cal-day-num">${d}</span>
        <div class="cal-dots">${dots}</div>
      </div>`;
    }

    el.innerHTML = html;
  }

  function _selectDay(dateStr) {
    _selectedDay = dateStr;
    _renderCalendar();
    _renderDayDetail(dateStr);
  }

  function _renderDayDetail(dateStr) {
    const titleEl = document.getElementById('day-detail-title');
    const listEl  = document.getElementById('day-detail-list');
    if (!titleEl || !listEl) return;

    const d = new Date(dateStr);
    const label = d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const dayApps = _apps.filter(a => a.applied === dateStr);

    titleEl.textContent = `${label} — ${dayApps.length} application${dayApps.length!==1?'s':''}`;

    if (!dayApps.length) {
      listEl.innerHTML = `<div class="day-detail-empty">No applications on this day</div>`;
      return;
    }

    listEl.innerHTML = dayApps.map(app => {
      const domain  = _getDomain(app.url);
      const logoHtml = domain
        ? `<div class="day-detail-logo"><img src="https://${domain}/favicon.ico" loading="lazy" onerror="this.parentElement.textContent='${String(app.company).substring(0,2).toUpperCase()}'"></div>`
        : `<div class="day-detail-logo">${String(app.company).substring(0,2).toUpperCase()}</div>`;
      return `<div class="day-detail-item" onclick="analytics._openApp('${app.id}')">
        ${logoHtml}
        <div class="day-detail-info">
          <div class="day-detail-company">${_esc(app.company)}</div>
          <div class="day-detail-title">${_esc(app.title||'No title')}</div>
        </div>
        <span class="stage-pill stage-${app.stage}" style="flex-shrink:0">
          <span style="width:5px;height:5px;border-radius:50%;background:${STAGE_COLORS[app.stage]||'#888'};display:inline-block"></span>
          ${STAGES.find(s=>s.id===app.stage)?.label||app.stage}
        </span>
      </div>`;
    }).join('');
  }

  // ── Calendar navigation ───────────────────

  function prevMonth() {
    _calMonth--;
    if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    _renderCalendar();
  }

  function nextMonth() {
    _calMonth++;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    _renderCalendar();
  }

  // ── Helpers ───────────────────────────────
  function _getDomain(url) { try { return new URL(url).hostname; } catch { return ''; } }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _openApp(id) { if (window._handleCardClick) window._handleCardClick(id); }

  // ── Wire up controls ──────────────────────

  function wireControls() {
    // Range buttons
    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        _rangeDays = parseInt(btn.dataset.days);
        // Clear custom date inputs
        const f = document.getElementById('analytics-from');
        const t = document.getElementById('analytics-to');
        if (f) f.value = '';
        if (t) t.value = '';
        _renderAll();
      });
    });

    // Group buttons
    document.querySelectorAll('.group-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.group-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        _groupBy = btn.dataset.group;
        _renderTimeline();
      });
    });

    // Custom date range
    ['analytics-from','analytics-to'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        document.querySelectorAll('.range-btn').forEach(b=>b.classList.remove('active'));
        _renderAll();
      });
    });

    // Calendar nav
    document.getElementById('cal-prev')?.addEventListener('click', prevMonth);
    document.getElementById('cal-next')?.addEventListener('click', nextMonth);
  }

  return {
    init, update, wireControls,
    _selectDay, _openApp,
    prevMonth, nextMonth,
  };
})();
