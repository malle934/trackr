/* ═══════════════════════════════════════════
   analytics.js — v2
   Fixes: date timezone bug, timeline canvas
   destroy bug, summary counts, custom range
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
  let _groupBy     = 'weekly';
  let _rangeDays   = 90;

  // ── Public ────────────────────────────────
  function init(apps)   { _apps = apps; _calYear = new Date().getFullYear(); _calMonth = new Date().getMonth(); _renderAll(); }
  function update(apps) { _apps = apps; _renderAll(); }

  // ── FIX 1: Parse date without timezone shift ──
  // new Date("2026-05-29") is UTC midnight → shows May 28 in IST
  // Fix: parse parts manually
  function _parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d); // local midnight — no timezone shift
  }

  // ── Date range ────────────────────────────
  function getRange() {
    const fromEl = document.getElementById('analytics-from');
    const toEl   = document.getElementById('analytics-to');
    if (fromEl?.value && toEl?.value) {
      return {
        from: _parseLocalDate(fromEl.value),
        to:   _parseLocalDate(toEl.value),
      };
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
      const d = _parseLocalDate(a.applied);
      return d >= from && d <= to;
    });
  }

  // ── Render all ────────────────────────────
  function _renderAll() {
    _renderSummary();
    _renderTimeline();
    _renderCalendar();
    if (_selectedDay) _renderDayDetail(_selectedDay);
  }

  // ── FIX 4: Summary counts all apps applied in range ──
  function _renderSummary() {
    const filtered = getFilteredApps();
    const total    = filtered.length; // all apps applied in range

    // Count by current stage
    const byStage = (stageIds) => filtered.filter(a => stageIds.includes(a.stage)).length;

    const cards = [
      { label:'Applied',    value: total,                                    color: STAGE_COLORS.applied   },
      { label:'Interviews', value: byStage(['phone','interview','final']),   color: STAGE_COLORS.interview },
      { label:'Offers',     value: byStage(['offer']),                       color: STAGE_COLORS.offer     },
      { label:'Rejected',   value: byStage(['rejected']),                    color: STAGE_COLORS.rejected  },
    ];

    const el = document.getElementById('analytics-summary');
    if (!el) return;
    el.innerHTML = cards.map(c => `
      <div class="a-stat" style="--stage-color:${c.color}">
        <div class="a-stat-val">${c.value}</div>
        <div class="a-stat-lbl">${c.label}</div>
      </div>`).join('');
  }

  // ── FIX 2: Timeline — never destroy canvas element ──
  function _renderTimeline() {
    const wrap = document.querySelector('.chart-wrap');
    if (!wrap) return;

    const filtered = getFilteredApps();

    // Always keep canvas in DOM — just draw "no data" if empty
    let canvas = document.getElementById('timeline-chart');
    if (!canvas) {
      wrap.innerHTML = '<canvas id="timeline-chart"></canvas>';
      canvas = document.getElementById('timeline-chart');
    }

    if (!filtered.length) {
      // Draw "no data" message on canvas instead of replacing it
      const ctx = canvas.getContext('2d');
      const W   = wrap.clientWidth || 600;
      canvas.width  = W;
      canvas.height = 220;
      canvas.style.width  = W + 'px';
      canvas.style.height = '220px';
      ctx.clearRect(0, 0, W, 220);
      ctx.fillStyle = 'rgba(144,144,168,0.5)';
      ctx.font      = '14px DM Sans,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No applications in selected range', W / 2, 110);
      return;
    }

    const buckets = _buildBuckets(filtered);
    _drawBarChart(canvas, buckets, wrap.clientWidth || 600);
  }

  function _buildBuckets(apps) {
    const buckets = {};
    apps.forEach(app => {
      if (!app.applied) return;
      const d   = _parseLocalDate(app.applied);
      const key = _bucketKey(d);
      if (!buckets[key]) buckets[key] = { label: _bucketLabel(d), applied:0, interview:0, offer:0, rejected:0 };
      const stage = ['phone','interview','final'].includes(app.stage) ? 'interview' : app.stage;
      if (buckets[key][stage] !== undefined) buckets[key][stage]++;
      else buckets[key]['applied']++; // bookmarked etc → applied bucket
    });
    return Object.entries(buckets).sort((a,b)=>a[0].localeCompare(b[0])).map(([,v])=>v);
  }

  function _bucketKey(d) {
    if (_groupBy==='daily')   return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    if (_groupBy==='monthly') return `${d.getFullYear()}-${p(d.getMonth()+1)}`;
    // weekly — Monday
    const day  = d.getDay();
    const diff = day===0 ? -6 : 1-day;
    const mon  = new Date(d); mon.setDate(d.getDate()+diff);
    return `${mon.getFullYear()}-${p(mon.getMonth()+1)}-${p(mon.getDate())}`;
  }

  function _bucketLabel(d) {
    if (_groupBy==='daily')   return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    if (_groupBy==='monthly') return d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
    const day=d.getDay(),diff=day===0?-6:1-day,mon=new Date(d);
    mon.setDate(d.getDate()+diff);
    return mon.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  }

  function p(n){ return String(n).padStart(2,'0'); }

  function _drawBarChart(canvas, buckets, W) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const H   = 220;
    canvas.width  = W*dpr; canvas.height = H*dpr;
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    ctx.scale(dpr,dpr);

    const pad    = {top:24,right:16,bottom:44,left:36};
    const chartW = W-pad.left-pad.right;
    const chartH = H-pad.top-pad.bottom;
    const stacks = ['applied','interview','offer','rejected'];
    const colors = {
      applied:'rgba(108,99,255,0.85)',interview:'rgba(245,158,11,0.85)',
      offer:'rgba(34,197,94,0.85)',   rejected:'rgba(239,68,68,0.85)'
    };

    ctx.clearRect(0,0,W,H);

    const maxVal = Math.max(...buckets.map(b=>stacks.reduce((s,k)=>s+(b[k]||0),0)),1);
    const gap    = chartW/Math.max(buckets.length,1);
    const barW   = Math.max(6,gap*0.55);

    // Grid lines
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const y=pad.top+chartH-(i/4)*chartH;
      ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+chartW,y); ctx.stroke();
      ctx.fillStyle='rgba(144,144,168,0.7)'; ctx.font='10px DM Sans,sans-serif'; ctx.textAlign='right';
      ctx.fillText(Math.round((i/4)*maxVal),pad.left-5,y+3);
    }

    // Bars
    buckets.forEach((bucket,i)=>{
      const x=pad.left+i*gap+gap/2-barW/2;
      let yOff=0;
      stacks.forEach(key=>{
        const val=bucket[key]||0; if(!val)return;
        const bH=(val/maxVal)*chartH;
        const y=pad.top+chartH-yOff-bH;
        ctx.fillStyle=colors[key];
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(x,y,barW,bH,yOff===0?[3,3,0,0]:[0]);
        else ctx.rect(x,y,barW,bH);
        ctx.fill(); yOff+=bH;
      });
      if(buckets.length<=30){
        ctx.fillStyle='rgba(144,144,168,0.8)'; ctx.font='10px DM Sans,sans-serif';
        ctx.save(); ctx.translate(x+barW/2,pad.top+chartH+12);
        if(buckets.length>14){ctx.rotate(-Math.PI/4);ctx.textAlign='right';}
        else ctx.textAlign='center';
        ctx.fillText(bucket.label,0,0); ctx.restore();
      }
    });

    // Legend
    const legend=[
      {l:'Applied',c:colors.applied},{l:'Interview',c:colors.interview},
      {l:'Offer',c:colors.offer},{l:'Rejected',c:colors.rejected}
    ];
    let lx=pad.left; ctx.font='11px DM Sans,sans-serif';
    legend.forEach(item=>{
      ctx.fillStyle=item.c;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(lx,5,10,10,[2]); else ctx.rect(lx,5,10,10);
      ctx.fill();
      ctx.fillStyle='rgba(144,144,168,0.9)'; ctx.textAlign='left';
      ctx.fillText(item.l,lx+13,14);
      lx+=ctx.measureText(item.l).width+26;
    });
  }

  // ── Calendar ──────────────────────────────
  function _renderCalendar() {
    const el  = document.getElementById('calendar');
    const lbl = document.getElementById('cal-month-label');
    if (!el) return;

    if(lbl) lbl.textContent = new Date(_calYear,_calMonth).toLocaleDateString('en-US',{month:'long',year:'numeric'});

    const days   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const first  = new Date(_calYear,_calMonth,1);
    const last   = new Date(_calYear,_calMonth+1,0);
    let startDow = first.getDay();
    startDow     = startDow===0 ? 6 : startDow-1;

    // Build app map — FIX: use local date parsing
    const appMap = {};
    _apps.forEach(app => {
      if (!app.applied) return;
      const d = _parseLocalDate(app.applied);
      if (d.getFullYear()===_calYear && d.getMonth()===_calMonth) {
        const key = d.getDate();
        if (!appMap[key]) appMap[key] = [];
        appMap[key].push(app);
      }
    });

    const today = new Date();
    let html    = days.map(d=>`<div class="cal-day-header">${d}</div>`).join('');
    for(let i=0;i<startDow;i++) html+=`<div class="cal-day empty"></div>`;

    for(let d=1;d<=last.getDate();d++){
      const dateStr   = `${_calYear}-${p(_calMonth+1)}-${p(d)}`;
      const isToday   = today.getDate()===d && today.getMonth()===_calMonth && today.getFullYear()===_calYear;
      const isSelected= _selectedDay===dateStr;
      const dayApps   = appMap[d]||[];
      const dots      = dayApps.slice(0,4).map(a=>`<span class="cal-dot" style="background:${STAGE_COLORS[a.stage]||'#888'}"></span>`).join('');

      html+=`<div class="cal-day${isToday?' today':''}${isSelected?' active':''}"
        data-date="${dateStr}" onclick="analytics._selectDay(this.dataset.date)">
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

  // ── FIX 1: Day detail uses local date parsing ──
  function _renderDayDetail(dateStr) {
    const titleEl = document.getElementById('day-detail-title');
    const listEl  = document.getElementById('day-detail-list');
    if(!titleEl||!listEl) return;

    // FIX: parse date locally to avoid timezone off-by-one
    const d     = _parseLocalDate(dateStr);
    const label = d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});

    // FIX: compare date strings directly (not Date objects)
    const dayApps = _apps.filter(a => a.applied === dateStr);
    titleEl.textContent = `${label} — ${dayApps.length} application${dayApps.length!==1?'s':''}`;

    if(!dayApps.length){
      listEl.innerHTML=`<div class="day-detail-empty">No applications on this day</div>`;
      return;
    }

    listEl.innerHTML=dayApps.map(app=>{
      const domain=_getDomain(app.url);
      const logo=domain
        ?`<div class="day-detail-logo"><img src="https://${domain}/favicon.ico" loading="lazy" onerror="this.parentElement.textContent='${String(app.company).substring(0,2).toUpperCase()}'"></div>`
        :`<div class="day-detail-logo">${String(app.company).substring(0,2).toUpperCase()}</div>`;
      return `<div class="day-detail-item" onclick="analytics._openApp('${app.id}')">
        ${logo}
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

  // ── Calendar nav ──────────────────────────
  function prevMonth(){
    _calMonth--; if(_calMonth<0){_calMonth=11;_calYear--;}
    _renderCalendar();
  }
  function nextMonth(){
    _calMonth++; if(_calMonth>11){_calMonth=0;_calYear++;}
    _renderCalendar();
  }

  // ── Helpers ───────────────────────────────
  function _getDomain(url){try{return new URL(url).hostname;}catch{return '';}}
  function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function _openApp(id){if(window._handleCardClick)window._handleCardClick(id);}

  // ── Wire controls ──────────────────────────
  function wireControls(){
    document.querySelectorAll('.range-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.range-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        _rangeDays=parseInt(btn.dataset.days);
        const f=document.getElementById('analytics-from');
        const t=document.getElementById('analytics-to');
        if(f)f.value=''; if(t)t.value='';  // clear custom range
        _renderAll();
      });
    });

    document.querySelectorAll('.group-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.group-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        _groupBy=btn.dataset.group;
        _renderTimeline();
      });
    });

    // FIX 2: Custom date — re-create canvas before rendering
    ['analytics-from','analytics-to'].forEach(id=>{
      document.getElementById(id)?.addEventListener('change',()=>{
        const fromEl=document.getElementById('analytics-from');
        const toEl  =document.getElementById('analytics-to');
        if(!fromEl?.value||!toEl?.value) return; // wait until both set
        document.querySelectorAll('.range-btn').forEach(b=>b.classList.remove('active'));
        // Re-create canvas so timeline redraws fresh
        const wrap=document.querySelector('.chart-wrap');
        if(wrap) wrap.innerHTML='<canvas id="timeline-chart"></canvas>';
        _renderAll();
      });
    });

    document.getElementById('cal-prev')?.addEventListener('click',prevMonth);
    document.getElementById('cal-next')?.addEventListener('click',nextMonth);
  }

  return { init, update, wireControls, _selectDay, _openApp, prevMonth, nextMonth };
})();
