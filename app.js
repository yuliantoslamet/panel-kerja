(function(){
  const todayStr = () => new Date().toISOString().slice(0,10);
  const dayOfMonth = () => new Date().getDate();
  const daysInMonth = () => new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();

  const TASKS = [
    {id:'d1', label:'Blast Data Permintaan Brosur KEW via WA', type:'daily'},
    {id:'d2', label:'CS STIE', type:'daily'},
    {id:'d3', label:'Crosscheck Halo AI', type:'daily'},
    {id:'d4', label:'Admin PMB', type:'daily'},
    {id:'d5', label:'Crosscheck Nomor Blasting', type:'daily'},
    {id:'d6', label:'Optimasi Email Marketing', type:'daily', note:'Mikirin cara yang lebih optimal'},
    {id:'d7', label:'Jadwalin Live TikTok Univ', type:'daily'},
    {id:'d8', label:'Buzzer Duta', type:'daily'},

    {id:'i1', label:'Blast Sertif via email', type:'interval', days:3},
    {id:'i2', label:'Operator Beasiswa', type:'interval', days:3},
    {id:'i3', label:'Optimasi Halo AI (Recap)', type:'interval', days:3},

    {id:'m1', label:'Blast Pelatihan via WA', type:'event', note:'Per pelatihan — kadang 3x sebulan, kadang tidak ada'},
    {id:'m2', label:'Blast Peserta VJF via WA', type:'monthly'},
    {id:'m3', label:'Pengajuan Perpanjang Masa Aktif no. Adm 5758 & no. Blasting', type:'endofmonth'},
    {id:'m4', label:'Up Sistem Perpanjang Masa Aktif no. Adm 5758 & no. Blasting', type:'endofmonth'},
    {id:'m5', label:'Pencairan Uang Saku Duta', type:'midmonth'},

    {id:'a1', label:'Bersihin Data', type:'adhoc'},
    {id:'a2', label:'Update Template Email', type:'adhoc'},
    {id:'a3', label:'Update Knowledge Halo AI', type:'adhoc'},
    {id:'a4', label:'Backup Saluran Univ', type:'adhoc'},
    {id:'a5', label:'Report Insight Live TikTok', type:'adhoc', note:'Backup talent kalau lupa report'},

    {id:'r1', label:'FU tunggakan mahasiswa bermasalah', type:'rare'},
    {id:'r2', label:'Report FU tunggakan mahasiswa bermasalah', type:'rare'},
    {id:'r3', label:'Buat SKL Mahasiswa', type:'rare'},

    {id:'x1', label:'Pembagian data FDS (data temporary) ke admin cabang', type:'inactive', note:'Sedang tidak berjalan'},
  ];

  const DEFAULT_PROJECTS = [
    {id:'p1', label:'Modif Motor Listrik Security', note:'Project dari pimpinan, di luar job kantor', status:'todo', deadline:'', notes:'', subtasks:[]},
  ];

  function load(key, fallback){
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch(e){ return fallback; }
  }
  function save(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){}
  }

  let historyStore = load('panelkerja_history', {});
  let adhocToday = load('panelkerja_adhoctoday', {date: todayStr(), items: []});
  if (adhocToday.date !== todayStr()) adhocToday = {date: todayStr(), items: []};
  let projects = load('panelkerja_projects', DEFAULT_PROJECTS);
  let notesStore = load('panelkerja_notes', {});
  let selectedProjectId = null;

  function persistLocal(){
    save('panelkerja_history', historyStore);
    save('panelkerja_adhoctoday', adhocToday);
    save('panelkerja_projects', projects);
    save('panelkerja_notes', notesStore);
  }

  // --- Backend sync (Vercel API + KV) ---
  // Saves to localStorage instantly (so the UI never waits on the network),
  // then pushes the same state to the server in the background so it survives
  // a cleared browser / different device. If the request fails, data stays
  // safe in localStorage and gets retried on the next change.
  let syncTimer = null;
  let syncToastTimer = null;

  function showSyncToast(text, isError){
    const el = document.getElementById('syncToast');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(syncToastTimer);
    syncToastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  async function pushRemoteState(){
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyStore, adhocToday, projects, notesStore })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      showSyncToast('Tersimpan ke server', false);
    } catch(e){
      console.warn('Gagal sinkron ke server, data tetap aman di browser ini:', e);
      showSyncToast('Gagal sinkron, tersimpan lokal', true);
    }
  }

  function buildTodayRecapPayload(){
    const date = todayStr();
    const tasks = trackedTasks();
    const done = tasks.filter(t => isDoneToday(t.id)).length;
    const total = tasks.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const band = bandForPct(pct);
    const kategori = {
      blue: 'Biru (90-100%)', green: 'Hijau (60-89%)',
      yellow: 'Kuning (20-59%)', red: 'Merah (0-19%)'
    }[band];
    const details = tasks.map(t => ({
      task: t.label,
      category: tagLabel(t),
      status: isDoneToday(t.id) ? 'Selesai' : 'Belum'
    }));
    return { date, summary: { total, done, pct, kategori }, details };
  }

  // Best-effort: mirrors today's recap into the Google Spreadsheet. This is
  // optional — if GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY haven't
  // been set up in Vercel yet, it just fails quietly and Vercel KV above
  // stays as the reliable primary storage.
  async function pushSheetSync(){
    try {
      const res = await fetch('/api/sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildTodayRecapPayload())
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch(e){
      console.warn('Sinkron ke spreadsheet belum aktif/gagal (opsional, tidak mempengaruhi data utama):', e);
    }
  }

  async function fetchRemoteState(){
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function persistAll(){
    persistLocal();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      pushRemoteState();
      pushSheetSync();
    }, 600);
  }

  async function initState(){
    try {
      const remote = await fetchRemoteState();
      if (remote && (remote.historyStore || remote.projects || remote.notesStore)){
        historyStore = remote.historyStore || historyStore;
        adhocToday = remote.adhocToday || adhocToday;
        if (adhocToday.date !== todayStr()) adhocToday = { date: todayStr(), items: [] };
        projects = remote.projects || projects;
        notesStore = remote.notesStore || notesStore;
        persistLocal();
      }
    } catch(e){
      console.warn('Gagal ambil data dari server, pakai data lokal di browser ini:', e);
      showSyncToast('Mode offline (data lokal)', true);
    }
  }

  function noteKey(id, scoped){ return scoped ? (id + '::' + todayStr()) : id; }
  function getNote(id, scoped){ return notesStore[noteKey(id, scoped)] || ''; }
  function setNote(id, scoped, val){
    const key = noteKey(id, scoped);
    if (val && val.trim()) notesStore[key] = val.trim(); else delete notesStore[key];
    persistAll();
  }
  function escapeAttr(str){
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }
  function noteInputHTML(id, scoped){
    return `<input type="text" class="note-input" data-note-id="${id}" data-scoped="${scoped ? '1' : ''}" placeholder="Tambah catatan (opsional)... misal: hari ini nggak ada" value="${escapeAttr(getNote(id, scoped))}">`;
  }
  function wireNoteInput(el){
    const input = el.querySelector('.note-input');
    if (!input) return;
    input.addEventListener('change', () => {
      setNote(input.dataset.noteId, !!input.dataset.scoped, input.value);
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  function isDoneToday(id){
    return !!(historyStore[todayStr()] && historyStore[todayStr()][id]);
  }
  function toggleTask(id){
    if (!historyStore[todayStr()]) historyStore[todayStr()] = {};
    historyStore[todayStr()][id] = !historyStore[todayStr()][id];
    persistAll();
    renderAll();
  }

  function fmtDate(){
    const d = new Date();
    const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    return d.toLocaleDateString('id-ID', opts);
  }

  function tagLabel(task){
    return {
      daily: 'Harian', interval: (task.days || 2) + '–' + ((task.days || 2)+1) + ' hari', event: 'Per kegiatan',
      monthly: 'Bulanan', endofmonth: 'Akhir bulan', midmonth: 'Pertengahan bulan',
      adhoc: 'Sewaktu-waktu', rare: 'Jarang', inactive: 'Nonaktif'
    }[task.type];
  }

  function taskCard(task){
    const div = document.createElement('div');
    if (task.type === 'inactive'){
      div.className = 'card inactive';
      div.innerHTML = `
        <div class="card-body">
          <div class="card-label">${task.label}</div>
          <div class="card-meta">
            <span class="tag">${tagLabel(task)}</span>
            ${task.note ? `<span class="status-note">${task.note}</span>` : ''}
          </div>
        </div>`;
      return div;
    }
    const done = isDoneToday(task.id);
    div.className = 'card' + (done ? ' ok' : '');
    div.innerHTML = `
      <div class="chk ${done ? 'checked' : ''}">${done ? '✓' : ''}</div>
      <div class="card-body">
        <div class="card-label ${done ? 'checked' : ''}">${task.label}</div>
        <div class="card-meta">
          <span class="tag">${tagLabel(task)}</span>
          ${task.note ? `<span class="status-note">${task.note}</span>` : ''}
        </div>
        ${noteInputHTML(task.id, true)}
      </div>`;
    div.querySelector('.chk').addEventListener('click', () => toggleTask(task.id));
    wireNoteInput(div);
    return div;
  }

  function renderList(container, tasks, cardFn){
    container.innerHTML = '';
    if (!tasks.length){ container.innerHTML = '<div class="empty">Tidak ada tugas di sini.</div>'; return; }
    tasks.forEach(t => container.appendChild(cardFn(t)));
  }

  function renderAll(){
    document.getElementById('todayLabel').textContent = fmtDate();

    const dailyTasks = TASKS.filter(t => t.type === 'daily');
    renderList(document.getElementById('dailyList'), dailyTasks, taskCard);
    const doneCount = dailyTasks.filter(t => isDoneToday(t.id)).length;
    document.getElementById('doneCount').textContent = doneCount;
    document.getElementById('totalCount').textContent = dailyTasks.length;

    renderList(document.getElementById('adhocTodayList'), adhocToday.items, (item) => {
      const div = document.createElement('div');
      div.className = 'card' + (item.done ? ' ok' : '');
      div.innerHTML = `
        <div class="chk ${item.done ? 'checked' : ''}">${item.done ? '✓' : ''}</div>
        <div class="card-body"><div class="card-label ${item.done ? 'checked' : ''}">${item.label}</div></div>
        <button class="btn ghost">Hapus</button>`;
      div.querySelector('.chk').addEventListener('click', () => {
        item.done = !item.done; persistAll(); renderAll();
      });
      div.querySelector('.btn.ghost').addEventListener('click', () => {
        adhocToday.items = adhocToday.items.filter(x => x !== item);
        persistAll(); renderAll();
      });
      return div;
    });

    renderList(document.getElementById('interval3List'), TASKS.filter(t => t.type === 'interval'), taskCard);
    renderList(document.getElementById('monthlyList'), TASKS.filter(t => ['monthly','endofmonth','midmonth','event'].includes(t.type)), taskCard);
    renderList(document.getElementById('adhocList'), TASKS.filter(t => t.type === 'adhoc'), taskCard);
    renderList(document.getElementById('rareList'), TASKS.filter(t => t.type === 'rare'), taskCard);
    renderList(document.getElementById('inactiveList'), TASKS.filter(t => t.type === 'inactive'), taskCard);

    renderProjectPanel();

    updateBadges();
    updateDailyIndicator();
  }

  function recomputeProjectStatus(proj){
    const subs = proj.subtasks || [];
    if (subs.length === 0) return; // no subtasks yet -> status stays manual
    const doneCount = subs.filter(s => s.done).length;
    if (doneCount === 0) proj.status = 'todo';
    else if (doneCount === subs.length) proj.status = 'done';
    else proj.status = 'doing';
  }

  function renderProjectPanel(){
    projects.forEach(p => recomputeProjectStatus(p));
    const listView = document.getElementById('projectListView');
    const detailView = document.getElementById('projectDetailView');
    const selected = projects.find(p => p.id === selectedProjectId);

    if (selected){
      listView.style.display = 'none';
      detailView.style.display = 'block';
      renderProjectDetail(selected, detailView);
      return;
    }
    listView.style.display = 'block';
    detailView.style.display = 'none';

    renderList(document.getElementById('projectList'), projects, (proj) => {
      const div = document.createElement('div');
      div.className = 'card';
      const cycle = { todo: 'doing', doing: 'done', done: 'todo' };
      const labelMap = { todo: 'Belum', doing: 'Proses', done: 'Selesai' };
      const subtasks = proj.subtasks || [];
      const subDone = subtasks.filter(s => s.done).length;
      const isAuto = subtasks.length > 0;
      div.innerHTML = `
        <div class="card-body" style="width:100%">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
            <div>
              <div class="card-label proj-open" style="cursor:pointer; text-decoration:underline; text-decoration-color:var(--line);">${proj.label}</div>
              ${proj.note ? `<div class="status-note" style="margin-top:4px;">${proj.note}</div>` : ''}
              <div class="card-meta">
                ${proj.deadline ? `<span class="tag">Deadline: ${proj.deadline}</span>` : ''}
                ${subtasks.length ? `<span class="tag">${subDone}/${subtasks.length} subtugas</span>` : ''}
              </div>
            </div>
            <button class="proj-status ${proj.status}" ${isAuto ? 'style="cursor:default; opacity:0.85;" title="Otomatis mengikuti sub-tugas"' : ''}>${labelMap[proj.status]}</button>
          </div>
        </div>`;
      div.querySelector('.proj-open').addEventListener('click', () => {
        selectedProjectId = proj.id;
        renderAll();
      });
      if (!isAuto){
        div.querySelector('.proj-status').addEventListener('click', (e) => {
          e.stopPropagation();
          proj.status = cycle[proj.status];
          persistAll(); renderAll();
        });
      }
      return div;
    });
  }

  function renderProjectDetail(proj, container){
    const cycle = { todo: 'doing', doing: 'done', done: 'todo' };
    const labelMap = { todo: 'Belum', doing: 'Proses', done: 'Selesai' };
    const subtasks = proj.subtasks || [];
    const isAuto = subtasks.length > 0;
    container.innerHTML = `
      <button class="btn ghost" id="backToProjects" style="margin-bottom:14px;">← Kembali ke daftar project</button>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
        <div>
          <div class="section-title" style="margin-top:0;">${proj.label}</div>
          ${proj.note ? `<div class="status-note" style="margin-top:-6px; margin-bottom:10px;">${proj.note}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <button class="proj-status ${proj.status}" id="detailStatusBtn" ${isAuto ? 'style="cursor:default; opacity:0.85;"' : ''}>${labelMap[proj.status]}</button>
          ${isAuto ? '<div class="status-note" style="margin-top:5px;">Otomatis dari sub-tugas</div>' : ''}
        </div>
      </div>

      <div style="margin:16px 0;">
        <label class="status-note" style="display:block; margin-bottom:5px;">Deadline (opsional)</label>
        <input type="date" id="projDeadline" value="${proj.deadline || ''}" style="font-family:'IBM Plex Sans',sans-serif; font-size:14px; padding:8px 10px; border-radius:6px; border:1px solid var(--line); background:var(--surface); color:var(--ink);">
      </div>

      <div class="section-title">Sub-tugas</div>
      <div id="projSubtaskList"></div>
      <div class="addrow">
        <input type="text" id="addSubtaskInput" placeholder="Tambah sub-tugas lalu tekan Enter...">
      </div>

      <div class="section-title">Catatan project</div>
      <textarea id="projNotes" rows="5" placeholder="Detail, progress, kendala, atau hal lain yang mau dicatat untuk project ini..."
        style="width:100%; font-family:'IBM Plex Sans',sans-serif; font-size:14px; padding:10px 12px; border-radius:6px; border:1px solid var(--line); background:var(--surface); color:var(--ink); resize:vertical;">${proj.notes || ''}</textarea>
    `;

    container.querySelector('#backToProjects').addEventListener('click', () => {
      selectedProjectId = null;
      renderAll();
    });
    if (!isAuto){
      container.querySelector('#detailStatusBtn').addEventListener('click', () => {
        proj.status = cycle[proj.status];
        persistAll(); renderAll();
      });
    }
    container.querySelector('#projDeadline').addEventListener('change', (e) => {
      proj.deadline = e.target.value;
      persistAll();
    });
    container.querySelector('#projNotes').addEventListener('change', (e) => {
      proj.notes = e.target.value;
      persistAll();
    });
    container.querySelector('#addSubtaskInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()){
        if (!proj.subtasks) proj.subtasks = [];
        proj.subtasks.push({id: 's' + Date.now(), label: e.target.value.trim(), done: false});
        e.target.value = '';
        recomputeProjectStatus(proj);
        persistAll();
        renderProjectDetail(proj, container);
      }
    });

    renderList(container.querySelector('#projSubtaskList'), subtasks, (sub) => {
      const div = document.createElement('div');
      div.className = 'card';
      div.style.padding = '9px 12px';
      div.innerHTML = `
        <div class="chk ${sub.done ? 'checked' : ''}">${sub.done ? '✓' : ''}</div>
        <div class="card-body"><div class="card-label ${sub.done ? 'checked' : ''}" style="font-size:13.5px;">${sub.label}</div></div>
        <button class="btn ghost">Hapus</button>`;
      div.querySelector('.chk').addEventListener('click', () => {
        sub.done = !sub.done;
        recomputeProjectStatus(proj);
        persistAll();
        renderProjectDetail(proj, container);
      });
      div.querySelector('.btn.ghost').addEventListener('click', () => {
        proj.subtasks = proj.subtasks.filter(s => s !== sub);
        recomputeProjectStatus(proj);
        persistAll();
        renderProjectDetail(proj, container);
      });
      return div;
    });
  }

  function setBadge(id, count){
    const el = document.getElementById(id);
    if (count > 0){
      el.textContent = count > 99 ? '99+' : count;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function updateBadges(){
    const dailyTasks = TASKS.filter(t => t.type === 'daily');
    const dailyPending = dailyTasks.filter(t => !isDoneToday(t.id)).length;
    const adhocTodayPending = adhocToday.items.filter(i => !i.done).length;
    setBadge('badge-today', dailyPending + adhocTodayPending);

    const recurringTasks = TASKS.filter(t => ['interval','monthly','endofmonth','midmonth','event'].includes(t.type));
    const recurringPending = recurringTasks.filter(t => !isDoneToday(t.id)).length;
    setBadge('badge-recurring', recurringPending);

    const adhocPending = TASKS.filter(t => (t.type === 'adhoc' || t.type === 'rare') && !isDoneToday(t.id)).length;
    setBadge('badge-adhoc', adhocPending);

    const projectPending = projects.filter(p => p.status !== 'done').length;
    setBadge('badge-project', projectPending);
  }

  function trackedTasks(){
    return TASKS.filter(t => t.type !== 'inactive');
  }

  function completionForDate(dateStr){
    const bucket = historyStore[dateStr];
    const tasks = trackedTasks();
    const total = tasks.length;
    if (!bucket) return { hasData: false, done: 0, total };
    const done = tasks.filter(t => bucket[t.id]).length;
    return { hasData: true, done, total };
  }

  function bandForPct(pct){
    return pct >= 90 ? 'blue' : pct >= 60 ? 'green' : pct >= 20 ? 'yellow' : 'red';
  }

  function cssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  const CATEGORY_LABELS = {
    daily: 'Harian', interval: '2–3 Hari', event: 'Per Kegiatan', monthly: 'Bulanan',
    endofmonth: 'Akhir Bulan', midmonth: 'Pertengahan Bulan', adhoc: 'Sewaktu-waktu', rare: 'Jarang'
  };

  function categoryRecap(){
    const dates = Object.keys(historyStore);
    const tasks = trackedTasks();
    const map = {};
    Object.keys(CATEGORY_LABELS).forEach(k => map[k] = { done: 0, total: 0 });
    dates.forEach(date => {
      const bucket = historyStore[date] || {};
      tasks.forEach(t => {
        if (!map[t.type]) return;
        map[t.type].total++;
        if (bucket[t.id]) map[t.type].done++;
      });
    });
    return Object.keys(CATEGORY_LABELS).map(type => {
      const { done, total } = map[type];
      const pct = total ? Math.round((done / total) * 100) : 0;
      return { type, label: CATEGORY_LABELS[type], done, total, pct };
    });
  }

  let trendChartInstance = null;

  function renderDashboard(){
    const todayC = completionForDate(todayStr());
    const todayPct = todayC.total ? Math.round((todayC.done / todayC.total) * 100) : 0;

    // last 30 days average (only days with data)
    const last30 = [];
    for (let i = 0; i < 30; i++){
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const c = completionForDate(iso);
      if (historyStore[iso]) last30.push(c.total ? (c.done / c.total) * 100 : 0);
    }
    const avg30 = last30.length ? Math.round(last30.reduce((a, b) => a + b, 0) / last30.length) : 0;

    const projDone = projects.filter(p => p.status === 'done').length;

    document.getElementById('kpiGrid').innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Progres Hari Ini</div><div class="kpi-value">${todayPct}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Rata-rata 30 Hari</div><div class="kpi-value">${avg30}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Tugas Selesai Hari Ini</div><div class="kpi-value small">${todayC.done}/${todayC.total}</div></div>
      <div class="kpi-card"><div class="kpi-label">Project Selesai</div><div class="kpi-value small">${projDone}/${projects.length}</div></div>
    `;

    // Trend chart: last 14 days
    const labels = [];
    const dataPoints = [];
    for (let i = 13; i >= 0; i--){
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const c = completionForDate(iso);
      labels.push(d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' }));
      dataPoints.push(c.total ? Math.round((c.done / c.total) * 100) : 0);
    }
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();
    const lineColor = cssVar('--teal') || '#2F6F6B';
    const gridColor = cssVar('--line') || '#D7DEE5';
    const textColor = cssVar('--ink-soft') || '#59677A';
    trendChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '% Selesai',
          data: dataPoints,
          borderColor: lineColor,
          backgroundColor: lineColor + '33',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: lineColor
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { color: textColor, callback: v => v + '%' }, grid: { color: gridColor } },
          x: { ticks: { color: textColor }, grid: { display: false } }
        }
      }
    });

    // Category recap table
    const recap = categoryRecap();
    const bandHex = { blue: cssVar('--blue'), green: cssVar('--teal'), yellow: cssVar('--amber'), red: cssVar('--red') };
    const rows = recap.map(r => {
      const band = bandForPct(r.pct);
      return `<tr>
        <td>${r.label}</td>
        <td class="num">${r.done}/${r.total}</td>
        <td class="num">
          <div class="pct-cell">
            <span>${r.pct}%</span>
            <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${r.pct}%; background:${bandHex[band]}"></div></div>
          </div>
        </td>
      </tr>`;
    }).join('');
    document.getElementById('categoryTable').innerHTML = `
      <table class="rekap-table">
        <thead><tr><th>Kategori</th><th style="text-align:right;">Entri</th><th style="text-align:right;">% Selesai</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    // Project recap
    const labelMap = { todo: 'Belum', doing: 'Proses', done: 'Selesai' };
    if (!projects.length){
      document.getElementById('dashProjectList').innerHTML = '<div class="empty">Belum ada project.</div>';
    } else {
      const prows = projects.map(p => {
        const subs = p.subtasks || [];
        const subDone = subs.filter(s => s.done).length;
        return `<tr>
          <td>${p.label}</td>
          <td class="num">${labelMap[p.status]}</td>
          <td class="num">${subs.length ? subDone + '/' + subs.length : '-'}</td>
          <td class="num">${p.deadline || '-'}</td>
        </tr>`;
      }).join('');
      document.getElementById('dashProjectList').innerHTML = `
        <table class="rekap-table">
          <thead><tr><th>Project</th><th style="text-align:right;">Status</th><th style="text-align:right;">Sub-tugas</th><th style="text-align:right;">Deadline</th></tr></thead>
          <tbody>${prows}</tbody>
        </table>`;
    }
  }

  function updateDailyIndicator(){
    const { done, total } = completionForDate(todayStr());
    const pct = total === 0 ? 100 : Math.round((done / total) * 100);
    const band = bandForPct(pct);

    const el = document.getElementById('dailyIndicator');
    el.classList.remove('blue','green','yellow','red');
    el.classList.add(band);
    document.getElementById('diPct').textContent = pct + '%';
    el.title = `Progres hari ini (harian + rutin + sewaktu-waktu/jarang): ${done}/${total} selesai (${pct}%). Klik untuk lihat kalender.`;
  }

  // Tabs
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'dashboard') renderDashboard();
  });

  // Add ad-hoc today
  document.getElementById('addTodayInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()){
      adhocToday.items.push({label: e.target.value.trim(), done: false});
      e.target.value = '';
      persistAll(); renderAll();
    }
  });

  // Add project
  document.getElementById('addProjectInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()){
      projects.push({id: 'p' + Date.now(), label: e.target.value.trim(), status: 'todo', deadline: '', notes: '', subtasks: []});
      e.target.value = '';
      persistAll(); renderAll();
    }
  });

  // Calendar modal
  const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  let calViewDate = new Date();
  calViewDate.setDate(1);

  function openCalendar(){
    calViewDate = new Date();
    calViewDate.setDate(1);
    renderCalendar();
    document.getElementById('calendarModal').hidden = false;
  }
  function closeCalendar(){
    document.getElementById('calendarModal').hidden = true;
  }
  function renderCalendar(){
    const year = calViewDate.getFullYear(), month = calViewDate.getMonth();
    document.getElementById('calTitle').textContent = MONTH_NAMES[month] + ' ' + year;

    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInM = new Date(year, month + 1, 0).getDate();
    const todayIso = todayStr();

    for (let i = 0; i < startOffset; i++){
      const blank = document.createElement('div');
      blank.className = 'cal-day empty';
      grid.appendChild(blank);
    }
    for (let d = 1; d <= daysInM; d++){
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const iso = `${year}-${mm}-${dd}`;
      const cell = document.createElement('div');
      cell.className = 'cal-day' + (iso === todayIso ? ' today' : '');
      const { hasData, done, total } = completionForDate(iso);
      let barHTML = '<div class="cal-bar-track"></div>';
      if (hasData){
        const pct = total === 0 ? 100 : Math.round((done / total) * 100);
        const barClass = bandForPct(pct);
        cell.title = `${d} ${MONTH_NAMES[month]}: ${done}/${total} selesai (${pct}%)`;
        barHTML = `<div class="cal-bar-track"><div class="cal-bar-fill ${barClass}" style="width:${pct}%"></div></div>`;
      }
      cell.innerHTML = `<span>${d}</span>${barHTML}`;
      grid.appendChild(cell);
    }
  }

  document.getElementById('dailyIndicator').addEventListener('click', openCalendar);
  document.getElementById('calClose').addEventListener('click', closeCalendar);
  document.getElementById('calPrev').addEventListener('click', () => {
    calViewDate.setMonth(calViewDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calViewDate.setMonth(calViewDate.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById('calendarModal').addEventListener('click', (e) => {
    if (e.target.id === 'calendarModal') closeCalendar();
  });

  renderAll();
  initState().then(renderAll);
})();
