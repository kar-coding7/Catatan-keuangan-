'use strict';

/* ======================================================================
   STORAGE KEYS & CONSTANTS
   ====================================================================== */
const LS_TX = 'kp_transactions_v1';
const LS_CAT = 'kp_categories_v1';
const LS_PIN = 'kp_pin_v1';
const LS_HIDE = 'kp_hidebalance_v1';
const LS_GOALS = 'kp_goals_v1';
const LS_SOUND = 'kp_sound_v1';
const LS_ACHIEVEMENTS = 'kp_achievements_v1';
const LS_THEME = 'kp_theme_v1';
const LS_BUDGETS = 'kp_budgets_v1';

const DEFAULT_CATEGORIES = ['Makanan','Minuman','Transportasi','Pendidikan','Teknologi','Hiburan','Pakaian','Kesehatan','Keperluan pribadi','Lainnya'];

const ACCOUNTS = [
  {key:'dana', label:'Dana', icon:'📱'},
  {key:'gopay', label:'GOPAY', icon:'💳'},
  {key:'bank', label:'Bank', icon:'🏦'},
  {key:'fisik', label:'Fisik', icon:'💵'},
];
const ACCOUNT_MAP = Object.fromEntries(ACCOUNTS.map(a=>[a.key,a]));

const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

/* ======================================================================
   STATE
   ====================================================================== */
const state = {
  transactions: [],
  categories: [],
  pin: {enabled:false, hash:'', salt:''},
  currentPage: 'dashboard',
  historyFilters: {type:'all', account:'all', time:'all', search:''},
  chartTimeFilter: 'month',
  currentWallet: null,
  editingTxId: null,
  pendingModalType: null,
  hideBalance: false,
  goals: [],
  soundEnabled: true,
  achievements: [],
  theme: 'light',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  budgets: [],
  budgetMonth: new Date().getMonth()+1,
  budgetYear: new Date().getFullYear(),
};

let barChartInstance = null;
let pieChartInstance = null;

/* ======================================================================
   PERSISTENCE
   ====================================================================== */
function loadData(){
  try{ state.transactions = JSON.parse(localStorage.getItem(LS_TX)) || []; }catch(e){ state.transactions = []; }
  try{ state.categories = JSON.parse(localStorage.getItem(LS_CAT)) || null; }catch(e){ state.categories = null; }
  if(!state.categories || !Array.isArray(state.categories) || state.categories.length===0){
    state.categories = DEFAULT_CATEGORIES.map(name=>({id:'cat_'+name.toLowerCase().replace(/\s+/g,'_'), name}));
    saveCategories();
  }
  try{ state.pin = JSON.parse(localStorage.getItem(LS_PIN)) || {enabled:false, hash:'', salt:''}; }catch(e){ state.pin = {enabled:false, hash:'', salt:''}; }

  try { state.hideBalance = JSON.parse(localStorage.getItem(LS_HIDE)) || false; } catch(e) { state.hideBalance = false; }  
  try{ state.goals = JSON.parse(localStorage.getItem(LS_GOALS)) || []; }catch(e){ state.goals = []; }
  try{ const s = JSON.parse(localStorage.getItem(LS_SOUND)); state.soundEnabled = (s===null || s===undefined) ? true : s; }catch(e){ state.soundEnabled = true; }
  try{ state.achievements = JSON.parse(localStorage.getItem(LS_ACHIEVEMENTS)) || []; }catch(e){ state.achievements = []; }
  try{ state.theme = localStorage.getItem(LS_THEME) || 'light'; }catch(e){ state.theme = 'light'; }
  try{ state.budgets = JSON.parse(localStorage.getItem(LS_BUDGETS)) || []; }catch(e){ state.budgets = []; }
}

function saveTransactions(){ localStorage.setItem(LS_TX, JSON.stringify(state.transactions)); }
function saveCategories(){ localStorage.setItem(LS_CAT, JSON.stringify(state.categories)); }
function savePin(){ localStorage.setItem(LS_PIN, JSON.stringify(state.pin)); }
function saveGoals(){ localStorage.setItem(LS_GOALS, JSON.stringify(state.goals)); }
function saveAchievements(){ localStorage.setItem(LS_ACHIEVEMENTS, JSON.stringify(state.achievements)); }
function saveBudgets(){ localStorage.setItem(LS_BUDGETS, JSON.stringify(state.budgets)); }
function formatBalance(amount) {
  if (state.hideBalance) return '••••';
  return formatRupiah(amount);
}

/* ======================================================================
   FORMATTING HELPERS
   ====================================================================== */
function formatRupiah(n){
  const num = Math.round(n||0);
  const neg = num < 0;
  const s = Math.abs(num).toLocaleString('id-ID');
  return (neg ? '-Rp' : 'Rp') + s;
}
function formatDateID(iso){
  if(!iso) return '';
  const d = new Date(iso+'T00:00:00');
  if(isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function inTimeRange(dateStr, range){
  if(range==='all' || !range) return true;
  const d = new Date(dateStr+'T00:00:00');
  const now = new Date();
  if(range==='today'){
    return d.toDateString()===now.toDateString();
  }
  if(range==='week'){
    const start = new Date(now); start.setHours(0,0,0,0); start.setDate(now.getDate()-now.getDay());
    const end = new Date(start); end.setDate(start.getDate()+7);
    return d>=start && d<end;
  }
  if(range==='month'){
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  }
  if(range==='year'){
    return d.getFullYear()===now.getFullYear();
  }
  return true;
}
/* ======================================================================
   SOUND EFFECTS (Web Audio API — synthesized, no files, works offline)
   ====================================================================== */
let audioCtx = null;
function getAudioCtx(){
  if(!state.soundEnabled) return null;
  try{
    if(!audioCtx){ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    if(audioCtx.state === 'suspended'){ audioCtx.resume(); }
    return audioCtx;
  }catch(e){ return null; }
}
function playTone(freq, startTime, duration, type, gainPeak){
  const ctx = getAudioCtx();
  if(!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + startTime);
  gain.gain.linearRampToValueAtTime(gainPeak||0.14, ctx.currentTime + startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration + 0.03);
}
function playSound(kind){
  if(!state.soundEnabled) return;
  if(kind==='income'){
    playTone(523.25, 0, 0.13, 'sine', 0.14);
    playTone(659.25, 0.09, 0.18, 'sine', 0.14);
  } else if(kind==='expense'){
    playTone(349.23, 0, 0.16, 'triangle', 0.12);
  } else if(kind==='save'){
    playTone(659.25, 0, 0.09, 'sine', 0.13);
    playTone(783.99, 0.08, 0.09, 'sine', 0.13);
    playTone(1046.5, 0.16, 0.18, 'sine', 0.13);
  } else if(kind==='withdraw'){
    playTone(587.33, 0, 0.1, 'sine', 0.12);
    playTone(440.00, 0.08, 0.15, 'sine', 0.12);
  } else if(kind==='transfer'){
    playTone(440.00, 0, 0.08, 'sine', 0.12);
    playTone(554.37, 0.06, 0.12, 'sine', 0.12);
  } else if(kind==='goal'){
    playTone(523.25, 0, 0.12, 'sine', 0.15);
    playTone(659.25, 0.11, 0.12, 'sine', 0.15);
    playTone(783.99, 0.22, 0.12, 'sine', 0.15);
    playTone(1046.5, 0.33, 0.35, 'sine', 0.17);
  } else if(kind==='achievement'){
    playTone(392.00, 0, 0.1, 'sine', 0.13);
    playTone(523.25, 0.09, 0.1, 'sine', 0.14);
    playTone(659.25, 0.18, 0.1, 'sine', 0.15);
    playTone(783.99, 0.27, 0.14, 'sine', 0.16);
    playTone(1046.5, 0.4, 0.45, 'sine', 0.18);
  } else if(kind==='warning'){
    playTone(440.00, 0, 0.12, 'triangle', 0.13);
    playTone(349.23, 0.14, 0.2, 'triangle', 0.13);
  }
}

/* ======================================================================
   SUCCESS BURST ANIMATION
   ====================================================================== */
const BURST_ICONS = {income:'💰', expense:'🧾', save:'🎯', withdraw:'🔓', transfer:'🔁'};
function showSuccessBurst(type){
  const wrap = document.getElementById('successBurst');
  const iconEl = document.getElementById('successBurstIcon');
  const ringEl = document.getElementById('successBurstRing');
  iconEl.textContent = BURST_ICONS[type] || '✅';
  wrap.classList.remove('hidden');
  [iconEl, ringEl].forEach(el=>{
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  });
  clearTimeout(showSuccessBurst._timer);
  showSuccessBurst._timer = setTimeout(()=> wrap.classList.add('hidden'), 700);
}

/* ======================================================================
   CONFETTI (savings goal completed)
   ====================================================================== */
function launchConfetti(){
  const colors = ['#1F6F50','#E1A23D','#2F6FA3','#C1443A','#8B5CF6'];
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  for(let i=0;i<30;i++){
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = (Math.random()*100) + 'vw';
    piece.style.background = colors[Math.floor(Math.random()*colors.length)];
    piece.style.animationDuration = (1.5 + Math.random()*1.1) + 's';
    piece.style.animationDelay = (Math.random()*0.25) + 's';
    piece.style.transform = `rotate(${Math.random()*360}deg)`;
    container.appendChild(piece);
  }
  setTimeout(()=> container.remove(), 3000);
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>t.classList.add('hidden'), 2200);
}

/* ======================================================================
   CORE FINANCIAL CALCULATIONS
   (always derived from the transaction list — never a stored balance)
   ====================================================================== */
function computeBalances(list){
  const acc = {dana:0, gopay:0, bank:0, fisik:0, tabungan:0};
  (list||state.transactions).forEach(tx=>{
    const amt = Number(tx.amount)||0;
    if(!(tx.account in acc)) return;
    if(tx.type==='income'){ acc[tx.account]+=amt; }
    else if(tx.type==='expense'){ acc[tx.account]-=amt; }
    else if(tx.type==='save'){ acc[tx.account]-=amt; acc.tabungan+=amt; }
    else if(tx.type==='withdraw'){ acc[tx.account]+=amt; acc.tabungan-=amt; }
    else if(tx.type==='transfer'){ acc[tx.account]-=amt; if(tx.toAccount in acc) acc[tx.toAccount]+=amt; }
    else if(tx.type==='goal_purchase'){ acc.tabungan-=amt; }
  });
  return acc;
}
function computeTotals(){
  const bal = computeBalances();
  const totalIncome = sumWhere(tx=>tx.type==='income');
  const totalExpense = sumWhere(tx=>tx.type==='expense');
  const totalUsable = bal.dana + bal.gopay + bal.bank + bal.fisik;
  const totalCurrent = totalUsable + bal.tabungan;
  return {
    balances: bal,
    totalIncome, totalExpense,
    totalUsable, totalCurrent,
    totalSavings: bal.tabungan,
  };
}
function sumWhere(predicate, range){
  return state.transactions
    .filter(tx=> predicate(tx) && (!range || inTimeRange(tx.date, range)))
    .reduce((s,tx)=> s + (Number(tx.amount)||0), 0);
}
function computeAccountStats(key){
  if(key==='tabungan'){
    const masuk = sumWhere(tx=>tx.type==='save') + sumWhere(tx=>tx.type==='income' && tx.account==='tabungan');
    const keluar = sumWhere(tx=>tx.type==='withdraw') + sumWhere(tx=>tx.type==='expense' && tx.account==='tabungan');
    const dipakaiTarget = sumWhere(tx=>tx.type==='goal_purchase');
    return [
      {label:'Total masuk ke Tabungan', value: masuk},
      {label:'Total keluar dari Tabungan', value: keluar},
      {label:'Dipakai untuk Target Tabungan', value: dipakaiTarget},
    ];
  }
  const masuk = sumWhere(tx=>tx.type==='income' && tx.account===key);
  const keluar = sumWhere(tx=>tx.type==='expense' && tx.account===key);
  const keTabungan = sumWhere(tx=>tx.type==='save' && tx.account===key);
  const dariTabungan = sumWhere(tx=>tx.type==='withdraw' && tx.account===key);
  const transferKeluar = sumWhere(tx=>tx.type==='transfer' && tx.account===key);
  const transferMasuk = sumWhere(tx=>tx.type==='transfer' && tx.toAccount===key);
  return [
    {label:'Total uang masuk', value: masuk},
    {label:'Total pembelian', value: keluar},
    {label:'Dipindah ke Tabungan', value: keTabungan},
    {label:'Diambil dari Tabungan', value: dariTabungan},
    {label:'Pindah keluar ke dompet lain', value: transferKeluar},
    {label:'Pindah masuk dari dompet lain', value: transferMasuk},
  ];
}
function historyForAccount(key){
  if(key==='tabungan'){
    return state.transactions.filter(tx=> tx.type==='save' || tx.type==='withdraw' || tx.account==='tabungan');
  }
  return state.transactions.filter(tx=> tx.account===key || (tx.type==='transfer' && tx.toAccount===key));
}

/* ======================================================================
   KALENDER KEUANGAN
   ====================================================================== */
document.getElementById('historyViewListBtn').addEventListener('click', ()=>{
  document.getElementById('historyViewListBtn').classList.add('active');
  document.getElementById('historyViewCalendarBtn').classList.remove('active');
  document.getElementById('historyListView').classList.remove('hidden');
  document.getElementById('historyCalendarView').classList.add('hidden');
});
document.getElementById('historyViewCalendarBtn').addEventListener('click', ()=>{
  document.getElementById('historyViewCalendarBtn').classList.add('active');
  document.getElementById('historyViewListBtn').classList.remove('active');
  document.getElementById('historyListView').classList.add('hidden');
  document.getElementById('historyCalendarView').classList.remove('hidden');
  renderCalendar();
});
document.getElementById('calPrevBtn').addEventListener('click', ()=>{
  state.calendarMonth--;
  if(state.calendarMonth<0){ state.calendarMonth=11; state.calendarYear--; }
  renderCalendar();
});
document.getElementById('calNextBtn').addEventListener('click', ()=>{
  state.calendarMonth++;
  if(state.calendarMonth>11){ state.calendarMonth=0; state.calendarYear++; }
  renderCalendar();
});
document.getElementById('calTodayBtn').addEventListener('click', ()=>{
  const now = new Date();
  state.calendarYear = now.getFullYear();
  state.calendarMonth = now.getMonth();
  renderCalendar();
});

function renderCalendar(){
  const grid = document.getElementById('calendarGrid');
  const year = state.calendarYear;
  const month = state.calendarMonth;
  document.getElementById('calTitle').textContent = `${MONTHS_ID[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay()+6)%7; // 0=Senin
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const txByDate = {};
  state.transactions.forEach(tx=>{ txByDate[tx.date] = (txByDate[tx.date]||0)+1; });
  const todayStr = todayISO();

  let html = '';
  for(let i=0;i<startWeekday;i++){ html += `<div class="cal-cell empty"></div>`; }
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const count = txByDate[dateStr]||0;
    html += `<button type="button" class="cal-cell${dateStr===todayStr?' today':''}${count>0?' has-tx':''}" data-date="${dateStr}">
      <span class="cal-day">${d}</span>
      ${count>0?`<span class="cal-count">${count}</span>`:''}
    </button>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
    cell.addEventListener('click', ()=> openDayDetail(cell.dataset.date));
  });
}

function openDayDetail(dateStr){
  const dayTx = state.transactions.filter(t=>t.date===dateStr);
  const title = `📅 ${formatDateID(dateStr)}`;
  if(dayTx.length===0){
    showPrompt(title, `<p>Tidak ada transaksi pada tanggal ini.</p>`);
    return;
  }
  const sorted = [...dayTx].sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
  const itemsHtml = sorted.map(tx=>{
    const meta = TYPE_META[tx.type];
    return `<div class="tx-item">
      <div class="tx-icon ${meta.cls}">${meta.icon}</div>
      <div class="tx-mid">
        <div class="tx-name">${escapeHtml(txName(tx))}</div>
        <div class="tx-meta">${txSubLabel(tx)}</div>
      </div>
      <div class="tx-amount ${meta.amtCls}">${meta.sign}${formatBalance(tx.amount)}</div>
    </div>`;
  }).join('');
  showPrompt(title, `<div class="tx-list">${itemsHtml}</div>`);
}

/* ======================================================================
   BUDGET / ANGGARAN BULANAN
   ====================================================================== */
const CATEGORY_ICONS = {
  'Makanan':'🍔', 'Minuman':'🥤', 'Transportasi':'🚌', 'Pendidikan':'📚',
  'Teknologi':'💻', 'Hiburan':'🎮', 'Pakaian':'👕', 'Kesehatan':'💊',
  'Keperluan pribadi':'🧴', 'Lainnya':'📦',
};
function categoryIcon(name){ return CATEGORY_ICONS[name] || '🏷️'; }

function computeBudgetUsed(budget){
  let total = 0;
  state.transactions.forEach(tx=>{
    if(tx.type!=='expense') return;
    if((tx.category||'Lainnya') !== budget.category) return;
    const d = new Date(tx.date+'T00:00:00');
    if(isNaN(d.getTime())) return;
    if(d.getFullYear()===budget.year && (d.getMonth()+1)===budget.month){
      total += Number(tx.amount)||0;
    }
  });
  return total;
}
function budgetStatus(percent){
  if(percent>=100) return 'over';
  if(percent>=90) return 'warning';
  if(percent>=75) return 'near';
  return 'safe';
}
function budgetStatusLabel(status){
  return {safe:'✅ Aman', near:'🔶 Hampir Mencapai Budget', warning:'⚠️ Peringatan', over:'⛔ Budget Terlampaui'}[status];
}
function showBudgetWarning(info){
  const {level, budget, used} = info;
  const over = Math.max(0, used - budget.amount);
  const icon = categoryIcon(budget.category);
  let html;
  if(level==='over'){
    html = `
      <p><strong>Budget: ${formatRupiah(budget.amount)}</strong></p>
      <p>Terpakai: ${formatRupiah(used)}</p>
      <p style="color:var(--red); font-weight:700;">Melebihi: ${formatRupiah(over)}</p>
      <button class="btn-primary" id="budgetWarnOk">Oke</button>
    `;
    showPrompt(`⚠️ Budget ${icon} ${budget.category} Terlampaui`, html);
  } else if(level==='warning'){
    html = `
      <p>Kamu sudah memakai <strong>${formatRupiah(used)}</strong> dari <strong>${formatRupiah(budget.amount)}</strong> (${Math.round(used/budget.amount*100)}%).</p>
      <button class="btn-primary" id="budgetWarnOk">Oke</button>
    `;
    showPrompt(`⚠️ Budget ${icon} ${budget.category} Hampir Habis`, html);
  } else {
    html = `
      <p>Kamu sudah memakai <strong>${formatRupiah(used)}</strong> dari <strong>${formatRupiah(budget.amount)}</strong> (${Math.round(used/budget.amount*100)}%) bulan ini.</p>
      <button class="btn-primary" id="budgetWarnOk">Oke</button>
    `;
    showPrompt(`📊 Budget ${icon} ${budget.category}`, html);
  }
  document.getElementById('budgetWarnOk').addEventListener('click', closePrompt);
}

/* ---- Halaman Budget (sub-page) ---- */
document.getElementById('budgetBack').addEventListener('click', ()=> showPage('statistik'));
document.getElementById('budgetDashViewBtn').addEventListener('click', ()=>{
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.getElementById('page-budget').classList.remove('hidden');
  renderBudget();
  window.scrollTo(0,0);
});
document.getElementById('addBudgetBtn').addEventListener('click', openAddBudget);
document.getElementById('budgetPrevBtn').addEventListener('click', ()=>{
  state.budgetMonth--;
  if(state.budgetMonth<1){ state.budgetMonth=12; state.budgetYear--; }
  renderBudget();
});
document.getElementById('budgetNextBtn').addEventListener('click', ()=>{
  state.budgetMonth++;
  if(state.budgetMonth>12){ state.budgetMonth=1; state.budgetYear++; }
  renderBudget();
});

function renderBudget(){
  document.getElementById('budgetMonthTitle').textContent = `${MONTHS_ID[state.budgetMonth-1]} ${state.budgetYear}`;
  const list = state.budgets.filter(b=> b.month===state.budgetMonth && b.year===state.budgetYear);
  const wrap = document.getElementById('budgetList');
  if(list.length===0){
    wrap.innerHTML = '<div class="empty-state small">Belum ada budget untuk bulan ini.</div>';
    return;
  }
  wrap.innerHTML = '';
  list.forEach(b=> wrap.appendChild(buildBudgetCard(b)));
}
function buildBudgetCard(budget){
  const used = computeBudgetUsed(budget);
  const percent = budget.amount>0 ? (used/budget.amount*100) : 0;
  const percentClamped = Math.min(100, percent);
  const status = budgetStatus(percent);
  const remaining = budget.amount - used;
  const card = document.createElement('div');
  card.className = 'goal-card budget-card';
  card.innerHTML = `
    <div class="goal-card-head">
      <div>
        <div class="goal-name">${categoryIcon(budget.category)} ${escapeHtml(budget.category)}</div>
        <div class="goal-target">${formatBalance(used)} / ${formatBalance(budget.amount)}</div>
      </div>
      <button class="goal-card-menu" data-budget-id="${budget.id}">⋮</button>
    </div>
    <div class="goal-progress-track">
      <div class="goal-progress-fill budget-fill-${status}" style="width:${percentClamped}%"></div>
    </div>
    <div class="goal-foot">
      <span class="budget-status-text budget-status-${status}">${budgetStatusLabel(status)}</span>
      <span class="goal-percent">${percent.toFixed(0)}%</span>
    </div>
    <div class="goal-remaining">${remaining>=0 ? `Sisa ${formatBalance(remaining)}` : `Melebihi ${formatBalance(Math.abs(remaining))}`}</div>
  `;
  card.querySelector('.goal-card-menu').addEventListener('click', (e)=>{
    e.stopPropagation();
    openBudgetMenu(budget.id);
  });
  return card;
}

function openAddBudget(){
  const catOptions = state.categories.map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  showPrompt('Tambah Budget', `
    <div class="field"><label>Bulan</label><input type="text" disabled value="${MONTHS_ID[state.budgetMonth-1]} ${state.budgetYear}"></div>
    <div class="field"><label>Kategori</label><select id="budgetCategoryInput">${catOptions}</select></div>
    <div class="field"><label>Budget Bulanan (Rp)</label>
      <div class="amount-input-row"><input id="budgetAmountInput" type="number" min="1" placeholder="0"><button type="button" class="k-btn" id="budgetAmountK">K</button></div>
    </div>
    <button class="btn-primary" id="budgetSaveBtn">Simpan</button>
  `);
  document.getElementById('budgetAmountK').addEventListener('click', ()=>{
    const inp = document.getElementById('budgetAmountInput');
    const digits = inp.value.replace(/[^0-9]/g,'');
    if(!digits || digits==='0') return;
    inp.value = digits + '000';
    inp.focus();
  });
  document.getElementById('budgetSaveBtn').addEventListener('click', ()=>{
    const category = document.getElementById('budgetCategoryInput').value;
    const amount = Number(document.getElementById('budgetAmountInput').value);
    if(!amount || amount<=0){ toast('Nominal budget harus lebih dari 0'); return; }
    const existing = state.budgets.find(b=> b.category===category && b.year===state.budgetYear && b.month===state.budgetMonth);
    if(existing){ toast('Budget kategori ini di bulan ini sudah ada — edit yang sudah ada.'); return; }
    state.budgets.push({id:'budget_'+Date.now(), month:state.budgetMonth, year:state.budgetYear, category, amount});
    saveBudgets();
    closePrompt();
    renderBudget();
    toast('Budget dibuat');
  });
}
function openEditBudget(id){
  const budget = state.budgets.find(b=>b.id===id);
  if(!budget) return;
  showPrompt('Edit Budget', `
    <div class="field"><label>Kategori</label><input type="text" disabled value="${escapeHtml(budget.category)}"></div>
    <div class="field"><label>Budget Bulanan (Rp)</label>
      <div class="amount-input-row"><input id="budgetAmountInput" type="number" min="1" value="${budget.amount}"><button type="button" class="k-btn" id="budgetAmountK">K</button></div>
    </div>
    <button class="btn-primary" id="budgetSaveBtn">Simpan</button>
  `);
  document.getElementById('budgetAmountK').addEventListener('click', ()=>{
    const inp = document.getElementById('budgetAmountInput');
    const digits = inp.value.replace(/[^0-9]/g,'');
    if(!digits || digits==='0') return;
    inp.value = digits + '000';
    inp.focus();
  });
  document.getElementById('budgetSaveBtn').addEventListener('click', ()=>{
    const amount = Number(document.getElementById('budgetAmountInput').value);
    if(!amount || amount<=0){ toast('Nominal budget harus lebih dari 0'); return; }
    budget.amount = amount;
    saveBudgets();
    closePrompt();
    renderBudget();
    toast('Budget diperbarui');
  });
}
function openBudgetMenu(id){
  const budget = state.budgets.find(b=>b.id===id);
  if(!budget) return;
  const used = computeBudgetUsed(budget);
  showPrompt(`${categoryIcon(budget.category)} ${budget.category}`, `
    <p><span style="color:var(--ink-soft); font-size:0.85rem;">Terpakai ${formatRupiah(used)} dari budget ${formatRupiah(budget.amount)}</span></p>
    <button class="btn-secondary" id="budgetEditBtn">✏️ Edit Budget</button>
    <button class="btn-primary danger" id="budgetDelBtn">🗑️ Hapus Budget</button>
  `);
  document.getElementById('budgetEditBtn').addEventListener('click', ()=>{
    closePrompt();
    openEditBudget(id);
  });
  document.getElementById('budgetDelBtn').addEventListener('click', ()=>{
    closePrompt();
    showPrompt('Hapus Budget', `
      <p>Hapus budget "${escapeHtml(budget.category)}"? Transaksi yang sudah tercatat tidak akan berubah atau terhapus.</p>
      <button class="btn-primary danger" id="budgetDelConfirm">Ya, Hapus</button>
      <button class="btn-secondary" id="budgetDelCancel">Batal</button>
    `);
    document.getElementById('budgetDelConfirm').addEventListener('click', ()=>{
      state.budgets = state.budgets.filter(b=>b.id!==id);
      saveBudgets();
      closePrompt();
      renderBudget();
      toast('Budget dihapus');
    });
    document.getElementById('budgetDelCancel').addEventListener('click', closePrompt);
  });
}

/* ---- Ringkasan Budget di Dashboard ---- */
function renderBudgetDashboardSummary(){
  const now = new Date();
  const month = now.getMonth()+1, year = now.getFullYear();
  const list = state.budgets.filter(b=> b.month===month && b.year===year);
  const card = document.getElementById('budgetDashCard');
  if(list.length===0){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  let totalBudget=0, totalUsed=0, nearCount=0;
  list.forEach(b=>{
    const used = computeBudgetUsed(b);
    totalBudget += b.amount;
    totalUsed += used;
    const pct = b.amount>0 ? used/b.amount*100 : 0;
    if(pct>=75) nearCount++;
  });
  const pctRaw = totalBudget>0 ? (totalUsed/totalBudget*100) : 0;
  document.getElementById('budgetDashAmount').textContent = `${formatBalance(totalUsed)} / ${formatBalance(totalBudget)}`;
  document.getElementById('budgetDashPercent').textContent = `${pctRaw.toFixed(0)}%`;
  document.getElementById('budgetDashFill').style.width = Math.min(100, pctRaw) + '%';
  document.getElementById('budgetDashFill').className = 'goal-progress-fill budget-fill-' + budgetStatus(pctRaw);
  document.getElementById('budgetDashNear').textContent = nearCount>0
    ? `${nearCount} kategori mendekati batas`
    : 'Semua kategori dalam batas aman';
}

/* ---- Ringkasan Budget di Statistik ---- */
function renderBudgetStatistik(){
  const now = new Date();
  const month = now.getMonth()+1, year = now.getFullYear();
  document.getElementById('statBudgetMonthLabel').textContent = `${MONTHS_ID[month-1]} ${year}`;
  const list = state.budgets.filter(b=> b.month===month && b.year===year);
  let totalBudget=0, totalUsed=0;
  list.forEach(b=>{ totalBudget += b.amount; totalUsed += computeBudgetUsed(b); });
  document.getElementById('statBudgetTotal').textContent = formatRupiah(totalBudget);
  document.getElementById('statBudgetUsed').textContent = formatRupiah(totalUsed);
  document.getElementById('statBudgetLeft').textContent = formatRupiah(totalBudget-totalUsed);

  const wrap = document.getElementById('statBudgetList');
  if(list.length===0){
    wrap.innerHTML = '<div class="empty-state small">Belum ada budget bulan ini.</div>';
    return;
  }
  wrap.innerHTML = list.map(b=>{
    const used = computeBudgetUsed(b);
    return `<div class="analysis-item">${categoryIcon(b.category)} ${escapeHtml(b.category)}: ${formatRupiah(used)} / ${formatRupiah(b.amount)}</div>`;
  }).join('');
}

/* ======================================================================
   SAVINGS GOALS (Target Tabungan)
   ====================================================================== */
function computeGoalSaved(goalId){
  const masuk = sumWhere(tx=>tx.type==='save' && tx.goalId===goalId);
  const keluar = sumWhere(tx=>tx.type==='withdraw' && tx.goalId===goalId);
  return Math.max(0, masuk - keluar);
}
function goalNameById(goalId){
  const g = state.goals.find(g=>g.id===goalId);
  return g ? g.name : null;
}

/* ======================================================================
   NAVIGATION
   ====================================================================== */
function showPage(name){
  state.currentPage = name;
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.getElementById('page-'+name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.page===name);
  });
  if(name==='dashboard') renderDashboard();
  if(name==='history') renderHistory();
  if(name==='statistik') renderStatistik();
  if(name==='uang') renderUang();
  if(name==='budget') renderBudget();
  window.scrollTo(0,0);
}

document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> showPage(btn.dataset.page));
});

/* ======================================================================
   TRANSACTION ITEM RENDERING
   ====================================================================== */
const TYPE_META = {
  income:   {icon:'🟢', cls:'income',   amtCls:'pos',     sign:'+', label:'Uang Masuk'},
  expense:  {icon:'🔴', cls:'expense',  amtCls:'neg',     sign:'-', label:'Pembelian'},
  save:     {icon:'🔵', cls:'save',     amtCls:'neutral', sign:'',  label:'Menabung'},
  withdraw: {icon:'🟠', cls:'withdraw', amtCls:'neutral', sign:'',  label:'Ambil Tabungan'},
  transfer: {icon:'🔁', cls:'transfer', amtCls:'neutral', sign:'',  label:'Pindah Uang'},
  goal_purchase: {icon:'📦', cls:'goal-purchase', amtCls:'neg', sign:'-', label:'Target Tabungan'},
};

function txSubLabel(tx){
  const accLabel = tx.account==='tabungan' ? 'Tabungan' : (ACCOUNT_MAP[tx.account]?.label || tx.account);
  if(tx.type==='income') return `${formatDateID(tx.date)} · Masuk ke ${accLabel}`;
  if(tx.type==='expense') return `${formatDateID(tx.date)} · ${tx.category||'Lainnya'} · ${accLabel}`;
  if(tx.type==='save'){
    const goalTag = tx.goalId ? goalNameById(tx.goalId) : null;
    return `${formatDateID(tx.date)} · ${accLabel} → Tabungan${goalTag ? ' · 🎯 '+goalTag : ''}`;
  }
  if(tx.type==='withdraw'){
    const goalTag = tx.goalId ? goalNameById(tx.goalId) : null;
    return `${formatDateID(tx.date)} · Tabungan → ${accLabel}${goalTag ? ' · 🎯 '+goalTag : ''}`;
  }
  if(tx.type==='transfer'){
    const toLabel = ACCOUNT_MAP[tx.toAccount]?.label || tx.toAccount;
    return `${formatDateID(tx.date)} · ${accLabel} → ${toLabel}`;
  }
  if(tx.type==='goal_purchase') return `${formatDateID(tx.date)} · 📦 Target Tabungan · Sudah Dibeli`;
  return formatDateID(tx.date);
}
function txName(tx){
  if(tx.type==='expense') return tx.note || 'Pembelian';
  if(tx.type==='income') return tx.note || 'Uang masuk';
  if(tx.type==='save') return tx.note || 'Menabung';
  if(tx.type==='withdraw') return tx.note || 'Ambil dari Tabungan';
  if(tx.type==='transfer') return tx.note || 'Pindah uang';
  if(tx.type==='goal_purchase') return tx.note || 'Target Tabungan';
  return tx.note||'';
}
function renderTxList(container, list){
  container.innerHTML = '';
  if(list.length===0) return;
  const sorted = [...list].sort((a,b)=> (b.date+b.createdAt) > (a.date+a.createdAt) ? 1 : -1);
  sorted.forEach(tx=>{
    const meta = TYPE_META[tx.type];
    const el = document.createElement('div');
    el.className = 'tx-item';
    el.innerHTML = `
      <div class="tx-icon ${meta.cls}">${meta.icon}</div>
      <div class="tx-mid">
        <div class="tx-name">${escapeHtml(txName(tx))}</div>
        <div class="tx-meta">${txSubLabel(tx)}</div>
      </div>
      <div class="tx-amount ${meta.amtCls}">${meta.sign}${formatRupiah(tx.amount)}</div>
    `;
    el.addEventListener('click', ()=> openTxMenu(tx.id));
    container.appendChild(el);
  });
}
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str==null ? '' : str;
  return d.innerHTML;
}

/* ======================================================================
   DASHBOARD
   ====================================================================== */
function computeMonthTotals(year, month){
  let income=0, expense=0, save=0;
  state.transactions.forEach(tx=>{
    const d = new Date(tx.date+'T00:00:00');
    if(isNaN(d.getTime())) return;
    if(d.getFullYear()===year && d.getMonth()===month){
      if(tx.type==='income') income += Number(tx.amount)||0;
      else if(tx.type==='expense') expense += Number(tx.amount)||0;
      else if(tx.type==='save') save += Number(tx.amount)||0;
    }
  });
  return {income, expense, save, left: income-expense-save};
}

function renderDashboard(){
  const t = computeTotals();
  document.getElementById('dashTotalCurrent').textContent = formatBalance(t.totalCurrent);
  document.getElementById('dashUsable').textContent = formatBalance(t.totalUsable);
  document.getElementById('dashSavings').textContent = formatBalance(t.totalSavings);
  document.getElementById('dashTotalIn').textContent = formatBalance(t.totalIncome);
  document.getElementById('dashTotalOut').textContent = formatBalance(t.totalExpense);

  const now = new Date();
  const thisMonth = computeMonthTotals(now.getFullYear(), now.getMonth());
  document.getElementById('sumIn').textContent = formatBalance(thisMonth.income);
  document.getElementById('sumOut').textContent = formatBalance(thisMonth.expense);
  document.getElementById('sumSave').textContent = formatBalance(thisMonth.save);
  document.getElementById('sumLeft').textContent = formatBalance(thisMonth.left);

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMonth = computeMonthTotals(lastMonthDate.getFullYear(), lastMonthDate.getMonth());
  const spikeEl = document.getElementById('spendingSpikeWarning');
  const isSpike = lastMonth.expense > 0 && thisMonth.expense > lastMonth.expense * 1.45;
  if(isSpike){
    spikeEl.classList.remove('hidden');
    const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const notifKey = 'kp_spike_notified_' + monthKey;
    if(state.soundEnabled && !localStorage.getItem(notifKey)){
      playSound('warning');
      localStorage.setItem(notifKey, '1');
    }
  } else {
    spikeEl.classList.add('hidden');
  }

  renderBudgetDashboardSummary();

  const recent = [...state.transactions]
    .sort((a,b)=> (b.date+b.createdAt) > (a.date+a.createdAt) ? 1 : -1)
    .slice(0,6);
  const container = document.getElementById('dashRecent');
  if(recent.length===0){
    container.innerHTML = '<div class="empty-state">Belum ada transaksi. Mulai catat keuanganmu!</div>';
  } else {
    renderTxList(container, recent);
  }
}

/* ======================================================================
   HISTORY
   ====================================================================== */
function setupFilterRow(id, key){
  const row = document.getElementById(id);
  row.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      row.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      state.historyFilters[key] = chip.dataset.val;
      renderHistory();
    });
  });
}
setupFilterRow('filterType','type');
setupFilterRow('filterAccount','account');
setupFilterRow('filterTime','time');

document.getElementById('searchInput').addEventListener('input', (e)=>{
  state.historyFilters.search = e.target.value.trim().toLowerCase();
  renderHistory();
});

function renderHistory(){
  const f = state.historyFilters;
  const list = state.transactions.filter(tx=>{
    if(f.type!=='all' && tx.type!==f.type) return false;
    if(f.account!=='all'){
      const belongs = f.account==='tabungan'
        ? (tx.account==='tabungan' || tx.type==='save' || tx.type==='withdraw')
        : (tx.account===f.account || (tx.type==='transfer' && tx.toAccount===f.account));
      if(!belongs) return false;
    }
    if(f.time!=='all' && !inTimeRange(tx.date, f.time)) return false;
    if(f.search && !(txName(tx).toLowerCase().includes(f.search))) return false;
    return true;
  });
  const container = document.getElementById('historyList');
  const emptyEl = document.getElementById('historyEmpty');
  renderTxList(container, list);
  emptyEl.classList.toggle('hidden', list.length>0);
}

/* ======================================================================
   STATISTIK
   ====================================================================== */
setupFilterRow('filterChartTime','__chart');
document.getElementById('filterChartTime').querySelectorAll('.chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    state.chartTimeFilter = chip.dataset.val;
    updateCharts();
  });
});

function renderStatistik(){
  const t = computeTotals();
  document.getElementById('statIn').textContent = formatRupiah(t.totalIncome);
  document.getElementById('statOut').textContent = formatRupiah(t.totalExpense);
  document.getElementById('statSave').textContent = formatRupiah(t.totalSavings);
  document.getElementById('statCurrent').textContent = formatRupiah(t.totalCurrent);
  document.getElementById('statUsable').textContent = formatRupiah(t.totalUsable);

  const goalPurchases = state.transactions.filter(tx=> tx.type==='goal_purchase');
  const goalAmount = goalPurchases.reduce((s,tx)=> s + (Number(tx.amount)||0), 0);
  document.getElementById('statGoalCount').textContent = goalPurchases.length;
  document.getElementById('statGoalAmount').textContent = formatRupiah(goalAmount);

  renderAnalysis();
  renderAchievements();
  renderBudgetStatistik();
  updateCharts();
}

/* ======================================================================
   ANALISIS KEUANGAN CERDAS
   ====================================================================== */
function categoryTotalsForMonth(year, month){
  const totals = {};
  state.transactions.forEach(tx=>{
    if(tx.type!=='expense') return;
    const d = new Date(tx.date+'T00:00:00');
    if(isNaN(d.getTime())) return;
    if(d.getFullYear()===year && d.getMonth()===month){
      const cat = tx.category || 'Lainnya';
      totals[cat] = (totals[cat]||0) + (Number(tx.amount)||0);
    }
  });
  return totals;
}
function computeMonthlyAnalysis(){
  const now = new Date();
  const thisM = computeMonthTotals(now.getFullYear(), now.getMonth());
  const lastDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastM = computeMonthTotals(lastDate.getFullYear(), lastDate.getMonth());
  const insights = [];

  if(lastM.expense>0){
    const pct = (thisM.expense-lastM.expense)/lastM.expense*100;
    if(Math.abs(pct)>=5){
      insights.push(`💡 Total pengeluaran bulan ini ${pct>=0?'meningkat':'menurun'} ${Math.abs(pct).toFixed(0)}% dibanding bulan lalu.`);
    }
  }
  if(lastM.income>0){
    const pct = (thisM.income-lastM.income)/lastM.income*100;
    if(Math.abs(pct)>=5){
      insights.push(`💡 Uang masuk bulan ini ${pct>=0?'meningkat':'menurun'} ${Math.abs(pct).toFixed(0)}% dibanding bulan lalu.`);
    }
  }
  if(lastM.save>0){
    const pct = (thisM.save-lastM.save)/lastM.save*100;
    if(Math.abs(pct)>=5){
      insights.push(`💡 Jumlah menabung bulan ini ${pct>=0?'meningkat':'menurun'} ${Math.abs(pct).toFixed(0)}% dibanding bulan lalu.`);
    }
  }

  const thisCat = categoryTotalsForMonth(now.getFullYear(), now.getMonth());
  const lastCat = categoryTotalsForMonth(lastDate.getFullYear(), lastDate.getMonth());
  let biggestChange = null;
  Object.keys(thisCat).forEach(cat=>{
    const prev = lastCat[cat] || 0;
    if(prev>0){
      const pct = (thisCat[cat]-prev)/prev*100;
      if(!biggestChange || Math.abs(pct) > Math.abs(biggestChange.pct)) biggestChange = {cat, pct};
    }
  });
  if(biggestChange && Math.abs(biggestChange.pct)>=20){
    insights.push(`💡 Pengeluaran ${biggestChange.cat} ${biggestChange.pct>=0?'meningkat':'menurun'} ${Math.abs(biggestChange.pct).toFixed(0)}% dibanding bulan lalu.`);
  }

  return insights;
}
function renderAnalysis(){
  const insights = computeMonthlyAnalysis();
  const wrap = document.getElementById('analysisList');
  if(insights.length===0){
    wrap.innerHTML = '<div class="empty-state small">Belum cukup data untuk dianalisis. Catat transaksi minimal 2 bulan berturut-turut untuk melihat perbandingan.</div>';
    return;
  }
  wrap.innerHTML = insights.map(i=>`<div class="analysis-item">${i}</div>`).join('');
}

/* ======================================================================
   ACHIEVEMENT / PENCAPAIAN
   ====================================================================== */
const ACHIEVEMENTS = [
  {id:'first_goal_100', icon:'🎯', title:'Target Pertama', desc:'Berhasil mencapai target tabungan pertama.'},
  {id:'savings_1jt', icon:'💰', title:'Tabungan Rp1 Juta', desc:'Berhasil mengumpulkan tabungan Rp1.000.000.'},
  {id:'nabung_7hari', icon:'🔥', title:'Nabung 7 Hari', desc:'Menabung pada 7 hari yang berbeda.'},
  {id:'first_purchase', icon:'🏆', title:'Target Pertama Dibeli', desc:'Berhasil membeli barang dari Target Tabungan.'},
];
function checkAchievements(silent){
  const unlockedIds = new Set(state.achievements.map(a=>a.id));
  const newlyUnlocked = [];

  const anyGoalReached100 = state.goals.some(g=>{
    if(g.status==='purchased') return true;
    const saved = computeGoalSaved(g.id);
    return g.targetAmount>0 && (saved/g.targetAmount*100) >= 100;
  });
  if(anyGoalReached100 && !unlockedIds.has('first_goal_100')) newlyUnlocked.push('first_goal_100');

  const bal = computeBalances();
  if(bal.tabungan >= 1000000 && !unlockedIds.has('savings_1jt')) newlyUnlocked.push('savings_1jt');

  const saveDays = new Set(state.transactions.filter(t=>t.type==='save').map(t=>t.date));
  if(saveDays.size >= 7 && !unlockedIds.has('nabung_7hari')) newlyUnlocked.push('nabung_7hari');

  const anyPurchase = state.transactions.some(t=>t.type==='goal_purchase');
  if(anyPurchase && !unlockedIds.has('first_purchase')) newlyUnlocked.push('first_purchase');

  if(newlyUnlocked.length>0){
    newlyUnlocked.forEach(id=> state.achievements.push({id, unlockedAt: Date.now()}));
    saveAchievements();
    if(!silent){
      newlyUnlocked.forEach((id, i)=> setTimeout(()=> showAchievementUnlocked(id), i*2400));
    }
    renderAchievements();
  }
}
function showAchievementUnlocked(id){
  const def = ACHIEVEMENTS.find(a=>a.id===id);
  if(!def) return;
  const overlay = document.getElementById('achievementUnlock');
  document.getElementById('achievementUnlockIcon').textContent = def.icon;
  document.getElementById('achievementUnlockTitle').textContent = def.title;
  document.getElementById('achievementUnlockDesc').textContent = def.desc;
  overlay.classList.remove('hidden');
  playSound('achievement');
  launchConfetti();
  clearTimeout(showAchievementUnlocked._timer);
  showAchievementUnlocked._timer = setTimeout(()=> overlay.classList.add('hidden'), 2200);
}
function renderAchievements(){
  const grid = document.getElementById('achievementGrid');
  if(!grid) return;
  const unlockedIds = new Set((state.achievements||[]).map(a=>a.id));
  document.getElementById('achievementCount').textContent = `${unlockedIds.size}/${ACHIEVEMENTS.length} terbuka`;
  grid.innerHTML = ACHIEVEMENTS.map(def=>{
    const unlocked = unlockedIds.has(def.id);
    return `
      <div class="achievement-badge${unlocked?' unlocked':''}">
        <div class="achievement-badge-icon">${unlocked?def.icon:'🔒'}</div>
        <div class="achievement-badge-title">${def.title}</div>
      </div>
    `;
  }).join('');
}

function updateCharts(){
  const range = state.chartTimeFilter;
  const masuk = sumWhere(tx=>tx.type==='income', range);
  const keluar = sumWhere(tx=>tx.type==='expense', range);
  const nabung = sumWhere(tx=>tx.type==='save', range);

  // Ambil warna teks/garis/permukaan dari tema yang sedang aktif (Light/Dark),
  // supaya chart tidak pakai warna hardcoded yang bisa merusak Dark Mode.
  const themeTextColor = cssVar('--ink-soft');
  const themeGridColor = cssVar('--line');
  const themeSurfaceColor = cssVar('--surface');

  const barCtx = document.getElementById('barChart');
  if(barChartInstance) barChartInstance.destroy();
  barChartInstance = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: ['Uang Masuk','Pembelian','Tabungan'],
      datasets: [{
        data: [masuk, keluar, nabung],
        backgroundColor: ['#1F6F50','#C1443A','#2F6FA3'],
        borderRadius: 8,
        maxBarThickness: 56,
      }]
    },
    options: {
      plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label: (c)=> formatRupiah(c.parsed.y) } } },
      scales:{
        x:{ ticks:{ color: themeTextColor }, grid:{ color: themeGridColor } },
        y:{ ticks:{ callback:(v)=> formatRupiah(v), color: themeTextColor }, grid:{ color: themeGridColor } }
      }
    }
  });

  const bal = computeBalances();
  const pieCtx = document.getElementById('pieChart');
  if(pieChartInstance) pieChartInstance.destroy();
  const pieLabels = ['Dana','GOPAY','Bank','Fisik','Tabungan'];
  const pieData = [bal.dana, bal.gopay, bal.bank, bal.fisik, bal.tabungan];
  const hasAny = pieData.some(v=>v>0);
  pieChartInstance = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: pieLabels,
      datasets: [{
        data: hasAny ? pieData : [1,1,1,1,1],
        backgroundColor: ['#E1A23D','#8B5CF6','#2F6FA3','#6B7280','#1F6F50'],
        borderWidth: 2,
        borderColor: themeSurfaceColor,
      }]
    },
    options: {
      plugins:{
        legend:{ position:'bottom', labels:{ boxWidth:12, font:{size:11}, color: themeTextColor } },
        tooltip:{ callbacks:{ label: (c)=> hasAny ? `${c.label}: ${formatRupiah(c.parsed)}` : `${c.label}: belum ada data` } }
      }
    }
  });
}

/* ======================================================================
   UANG (WALLET OVERVIEW)
   ====================================================================== */
function renderUang(){
  const bal = computeBalances();
  const grid = document.getElementById('walletGrid');
  grid.innerHTML = '';
  ACCOUNTS.forEach(a=>{
    const card = document.createElement('button');
    card.className = 'wallet-card';
    card.innerHTML = `<div class="wc-icon">${a.icon}</div><div class="wc-name">${a.label}</div><div class="wc-amount">${formatBalance(bal[a.key])}</div>`;
    card.addEventListener('click', ()=> openWalletDetail(a.key));
    grid.appendChild(card);
  });
  const savingsCard = document.createElement('button');
  savingsCard.className = 'wallet-card savings';
  savingsCard.innerHTML = `<div class="wc-icon">🎯</div><div class="wc-name">Tabungan</div><div class="wc-amount">${formatBalance(bal.tabungan)}</div>`;
  savingsCard.addEventListener('click', ()=> openWalletDetail('tabungan'));
  grid.appendChild(savingsCard);

  renderGoalList();
  renderCategoryList();
}
function renderCategoryList(){
  const wrap = document.getElementById('categoryList');
  wrap.innerHTML = '';
  state.categories.forEach(cat=>{
    const chip = document.createElement('div');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span>${escapeHtml(cat.name)}</span>`;
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', ()=> openEditCategory(cat.id));
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', ()=> confirmDeleteCategory(cat.id));
    chip.appendChild(editBtn);
    chip.appendChild(delBtn);
    wrap.appendChild(chip);
  });
}
document.getElementById('addCategoryBtn').addEventListener('click', openAddCategory);

function openAddCategory(){
  showPrompt('Tambah Kategori', `
    <div class="field"><label>Nama kategori</label><input id="catNameInput" type="text" placeholder="Contoh: Belanja Bulanan" maxlength="30"></div>
    <button class="btn-primary" id="catSaveBtn">Simpan</button>
  `);
  document.getElementById('catSaveBtn').addEventListener('click', ()=>{
    const val = document.getElementById('catNameInput').value.trim();
    if(!val){ toast('Nama kategori tidak boleh kosong'); return; }
    state.categories.push({id:'cat_'+Date.now(), name:val});
    saveCategories();
    closePrompt();
    renderCategoryList();
    toast('Kategori ditambahkan');
  });
}
function openEditCategory(id){
  const cat = state.categories.find(c=>c.id===id);
  if(!cat) return;
  showPrompt('Edit Kategori', `
    <div class="field"><label>Nama kategori</label><input id="catNameInput" type="text" value="${escapeHtml(cat.name)}" maxlength="30"></div>
    <button class="btn-primary" id="catSaveBtn">Simpan</button>
  `);
  document.getElementById('catSaveBtn').addEventListener('click', ()=>{
    const val = document.getElementById('catNameInput').value.trim();
    if(!val){ toast('Nama kategori tidak boleh kosong'); return; }
    cat.name = val;
    saveCategories();
    closePrompt();
    renderCategoryList();
    toast('Kategori diperbarui');
  });
}
function confirmDeleteCategory(id){
  const cat = state.categories.find(c=>c.id===id);
  if(!cat) return;
  showPrompt('Hapus Kategori', `
    <p>Hapus kategori "${escapeHtml(cat.name)}"? Transaksi lama tetap menyimpan nama kategori ini.</p>
    <button class="btn-primary danger" id="catDelConfirm">Ya, Hapus</button>
    <button class="btn-secondary" id="catDelCancel">Batal</button>
  `);
  document.getElementById('catDelConfirm').addEventListener('click', ()=>{
    state.categories = state.categories.filter(c=>c.id!==id);
    saveCategories();
    closePrompt();
    renderCategoryList();
  });
  document.getElementById('catDelCancel').addEventListener('click', closePrompt);
}

/* ======================================================================
   TARGET TABUNGAN (SAVINGS GOALS)
   ====================================================================== */
document.getElementById('addGoalBtn').addEventListener('click', openAddGoal);

function renderGoalList(){
  const wrap = document.getElementById('goalList');
  wrap.innerHTML = '';
  if(state.goals.length===0){
    wrap.innerHTML = '<div class="empty-state small">Belum ada target tabungan. Buat target pertamamu!</div>';
    return;
  }
  const activeGoals = state.goals.filter(g=> g.status!=='purchased');
  const purchasedGoals = state.goals.filter(g=> g.status==='purchased');

  if(activeGoals.length>0){
    const label = document.createElement('div');
    label.className = 'goal-section-label';
    label.textContent = '🎯 Target Aktif';
    wrap.appendChild(label);
    activeGoals.forEach(goal=> wrap.appendChild(buildGoalCard(goal)));
  }
  if(purchasedGoals.length>0){
    const label = document.createElement('div');
    label.className = 'goal-section-label';
    label.textContent = '✅ Sudah Dibeli';
    wrap.appendChild(label);
    purchasedGoals.slice().sort((a,b)=> (b.purchasedAt||0)-(a.purchasedAt||0)).forEach(goal=> wrap.appendChild(buildGoalCard(goal)));
  }
  if(activeGoals.length===0 && purchasedGoals.length===0){
    wrap.innerHTML = '<div class="empty-state small">Belum ada target tabungan. Buat target pertamamu!</div>';
  }
}

function computeDeadlineInfo(deadline){
  if(!deadline) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(deadline+'T00:00:00');
  const daysLeft = Math.ceil((dl - today) / 86400000);
  if(daysLeft < 0){
    return {daysLeft, text:'⚠️ Deadline terlewat', warn:true};
  } else if(daysLeft <= 20){
    return {daysLeft, text:`⚠️ Tinggal ${daysLeft} hari lagi`, warn:true};
  }
  return {daysLeft, text:`⏳ ${daysLeft} hari lagi`, warn:false};
}
function computeSavingsPlan(goal, saved){
  if(!goal.deadline) return null;
  const info = computeDeadlineInfo(goal.deadline);
  if(!info || info.daysLeft<=0) return null;
  const remaining = Math.max(0, goal.targetAmount - saved);
  if(remaining<=0) return null;
  const perDay = remaining / info.daysLeft;
  const plan = {perDay, perWeek: perDay*7, perMonth: perDay*30, paceMsg: null};
  const deadlineMs = new Date(goal.deadline+'T00:00:00').getTime();
  const totalDuration = deadlineMs - (goal.createdAt || Date.now());
  if(totalDuration > 0){
    const expectedFraction = Math.min(1, Math.max(0, (Date.now()-(goal.createdAt||Date.now())) / totalDuration));
    const expectedSaved = goal.targetAmount * expectedFraction;
    plan.paceMsg = saved >= expectedSaved
      ? '🔥 Kamu berada di depan target!'
      : '⚠️ Kamu perlu menabung lebih banyak untuk mengejar target.';
  }
  return plan;
}

function buildGoalCard(goal){
  const isPurchased = goal.status==='purchased';
  const card = document.createElement('div');
  card.className = 'goal-card' + (isPurchased ? ' purchased' : '');
  card.setAttribute('data-goal-card', goal.id);

  if(isPurchased){
    card.innerHTML = `
      <div class="goal-card-head">
        <div>
          <div class="goal-name">${escapeHtml(goal.name)}</div>
          <div class="goal-target">Target ${formatRupiah(goal.targetAmount)}</div>
        </div>
        <button class="goal-card-menu" data-goal-id="${goal.id}">⋮</button>
      </div>
      <span class="goal-badge done">✅ Sudah Dibeli</span>
      <div class="goal-purchase-info">
        <div class="goal-purchase-row"><span>Uang digunakan</span><strong>-${formatBalance(goal.targetAmount)}</strong></div>
        <div class="goal-purchase-row"><span>Tanggal</span><strong>${formatDateID(goal.purchaseDate)}</strong></div>
      </div>
    `;
  } else {
    const saved = computeGoalSaved(goal.id);
    const percent = goal.targetAmount>0 ? (saved / goal.targetAmount * 100) : 0;
    const percentClamped = Math.min(100, percent);
    const isDone = percent >= 100;
    const isNear = !isDone && percent >= 80;
    const remaining = Math.max(0, goal.targetAmount - saved);
    const deadlineInfo = computeDeadlineInfo(goal.deadline);
    const plan = isDone ? null : computeSavingsPlan(goal, saved);
    card.innerHTML = `
      <div class="goal-card-head">
        <div>
          <div class="goal-name">${escapeHtml(goal.name)}</div>
          <div class="goal-target">Target ${formatRupiah(goal.targetAmount)}</div>
        </div>
        <button class="goal-card-menu" data-goal-id="${goal.id}">⋮</button>
      </div>
      <div class="goal-progress-track"><div class="goal-progress-fill${isDone?' done':''}" style="width:${percentClamped}%"></div></div>
      <div class="goal-foot">
        <span class="goal-saved">${formatBalance(saved)}</span>
        <span class="goal-percent">${percent.toFixed(0)}%</span>
      </div>
      ${!isDone ? `<div class="goal-remaining">Kurang ${formatRupiah(remaining)} lagi</div>` : ''}
      ${deadlineInfo ? `<div class="goal-deadline${deadlineInfo.warn?' warn':''}">${deadlineInfo.text}</div>` : ''}
      ${plan ? `
        <div class="goal-plan">
          <div class="goal-plan-title">💰 Rencana Menabung</div>
          <div class="goal-plan-row"><span>Per hari</span><strong>${formatRupiah(plan.perDay)}</strong></div>
          <div class="goal-plan-row"><span>Per minggu</span><strong>${formatRupiah(plan.perWeek)}</strong></div>
          <div class="goal-plan-row"><span>Per bulan</span><strong>${formatRupiah(plan.perMonth)}</strong></div>
          ${plan.paceMsg ? `<div class="goal-plan-pace">${plan.paceMsg}</div>` : ''}
        </div>
      ` : ''}
      ${isDone ? '<span class="goal-badge done">✅ Target tercapai!</span>' : ''}
      ${isNear ? '<span class="goal-badge near">🔥 Tinggal sedikit lagi!</span>' : ''}
      ${isDone ? `<button type="button" class="btn-primary full goal-purchase-btn" data-goal-id="${goal.id}">✓ Barang Sudah Dibeli</button>` : ''}
    `;
  }

  card.querySelector('.goal-card-menu').addEventListener('click', (e)=>{
    e.stopPropagation();
    openGoalMenu(goal.id);
  });
  const purchaseBtn = card.querySelector('.goal-purchase-btn');
  if(purchaseBtn){
    purchaseBtn.addEventListener('click', ()=> openConfirmPurchase(goal.id));
  }
  return card;
}

function isDeadlineInPast(deadline){
  if(!deadline) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(deadline+'T00:00:00');
  return dl < today;
}
function showInvalidDeadlineWarning(){
  showPrompt('⚠️ Deadline Tidak Valid', `
    <p>Deadline target tidak boleh berada di masa lalu.</p>
    <button class="btn-primary" id="deadlineWarnOk">Oke</button>
  `);
  document.getElementById('deadlineWarnOk').addEventListener('click', closePrompt);
}

function openAddGoal(){
  showPrompt('Target Tabungan Baru', `
    <div class="field"><label>Nama target</label><input id="goalNameInput" type="text" placeholder="Contoh: Beli Laptop" maxlength="40"></div>
    <div class="field"><label>Nominal target (Rp)</label>
      <div class="amount-input-row"><input id="goalAmountInput" type="number" min="1" placeholder="0"><button type="button" class="k-btn" id="goalAmountK">K</button></div>
    </div>
    <div class="field"><label>📅 Deadline Target (opsional)</label><input id="goalDeadlineInput" type="date"></div>
    <button class="btn-primary" id="goalSaveBtn">Simpan</button>
  `);
  document.getElementById('goalAmountK').addEventListener('click', ()=>{
    const inp = document.getElementById('goalAmountInput');
    const digits = inp.value.replace(/[^0-9]/g,'');
    if(!digits || digits==='0') return;
    inp.value = digits + '000';
    inp.focus();
  });
  document.getElementById('goalSaveBtn').addEventListener('click', ()=>{
    const name = document.getElementById('goalNameInput').value.trim();
    const amount = Number(document.getElementById('goalAmountInput').value);
    const deadline = document.getElementById('goalDeadlineInput').value || null;
    if(!name){ toast('Nama target tidak boleh kosong'); return; }
    if(!amount || amount<=0){ toast('Nominal target harus lebih dari 0'); return; }
    if(isDeadlineInPast(deadline)){ showInvalidDeadlineWarning(); return; }
    state.goals.push({id:'goal_'+Date.now(), name, targetAmount:amount, createdAt:Date.now(), status:'active', deadline});
    saveGoals();
    closePrompt();
    renderGoalList();
    toast('Target tabungan dibuat');
  });
}

function openEditGoal(id){
  const goal = state.goals.find(g=>g.id===id);
  if(!goal) return;
  showPrompt('Edit Target Tabungan', `
    <div class="field"><label>Nama target</label><input id="goalNameInput" type="text" value="${escapeHtml(goal.name)}" maxlength="40"></div>
    <div class="field"><label>Nominal target (Rp)</label>
      <div class="amount-input-row"><input id="goalAmountInput" type="number" min="1" value="${goal.targetAmount}"><button type="button" class="k-btn" id="goalAmountK">K</button></div>
    </div>
    <div class="field"><label>📅 Deadline Target (opsional)</label><input id="goalDeadlineInput" type="date" value="${goal.deadline||''}"></div>
    <button class="btn-primary" id="goalSaveBtn">Simpan</button>
  `);
  document.getElementById('goalAmountK').addEventListener('click', ()=>{
    const inp = document.getElementById('goalAmountInput');
    const digits = inp.value.replace(/[^0-9]/g,'');
    if(!digits || digits==='0') return;
    inp.value = digits + '000';
    inp.focus();
  });
  document.getElementById('goalSaveBtn').addEventListener('click', ()=>{
    const name = document.getElementById('goalNameInput').value.trim();
    const amount = Number(document.getElementById('goalAmountInput').value);
    const deadline = document.getElementById('goalDeadlineInput').value || null;
    if(!name){ toast('Nama target tidak boleh kosong'); return; }
    if(!amount || amount<=0){ toast('Nominal target harus lebih dari 0'); return; }
    if(isDeadlineInPast(deadline)){ showInvalidDeadlineWarning(); return; }
    goal.name = name;
    goal.targetAmount = amount;
    goal.deadline = deadline;
    saveGoals();
    closePrompt();
    renderGoalList();
    toast('Target tabungan diperbarui');
  });
}

function openGoalMenu(id){
  const goal = state.goals.find(g=>g.id===id);
  if(!goal) return;
  if(goal.status==='purchased'){
    showPrompt(goal.name, `
      <p><span style="color:var(--ink-soft); font-size:0.85rem;">✅ Sudah dibeli pada ${formatDateID(goal.purchaseDate)}. Riwayat pembelian ini tetap tersimpan dan tidak bisa diubah.</span></p>
      <button class="btn-secondary" id="goalCloseBtn">Tutup</button>
    `);
    document.getElementById('goalCloseBtn').addEventListener('click', closePrompt);
    return;
  }
  const saved = computeGoalSaved(id);
  showPrompt(goal.name, `
    <p><span style="color:var(--ink-soft); font-size:0.85rem;">Terkumpul ${formatRupiah(saved)} dari target ${formatRupiah(goal.targetAmount)}</span></p>
    <button class="btn-secondary" id="goalEditBtn">✏️ Edit Target</button>
    <button class="btn-primary danger" id="goalDelBtn">🗑️ Hapus Target</button>
  `);
  document.getElementById('goalEditBtn').addEventListener('click', ()=>{
    closePrompt();
    openEditGoal(id);
  });
  document.getElementById('goalDelBtn').addEventListener('click', ()=>{
    closePrompt();
    showPrompt('Hapus Target Tabungan', `
      <p>Hapus target "${escapeHtml(goal.name)}"? Uang yang sudah ditabung tetap aman di Tabungan, hanya label targetnya yang hilang.</p>
      <button class="btn-primary danger" id="goalDelConfirm">Ya, Hapus</button>
      <button class="btn-secondary" id="goalDelCancel">Batal</button>
    `);
    document.getElementById('goalDelConfirm').addEventListener('click', ()=>{
      state.goals = state.goals.filter(g=>g.id!==id);
      saveGoals();
      closePrompt();
      renderGoalList();
      toast('Target tabungan dihapus');
    });
    document.getElementById('goalDelCancel').addEventListener('click', closePrompt);
  });
}

/* ---- Purchase confirmation flow ---- */
function openConfirmPurchase(id){
  const goal = state.goals.find(g=>g.id===id);
  if(!goal || goal.status==='purchased') return; // anti double-transaction guard
  showPrompt('Konfirmasi Pembelian', `
    <p><strong>Barang ini sudah dibeli?</strong></p>
    <p style="color:var(--ink-soft); font-size:0.88rem;">${formatRupiah(goal.targetAmount)} akan digunakan untuk pembelian ${escapeHtml(goal.name)}.</p>
    <button class="btn-primary" id="purchaseConfirmBtn">Ya, Sudah Dibeli</button>
    <button class="btn-secondary" id="purchaseCancelBtn">Batal</button>
  `);
  const confirmBtn = document.getElementById('purchaseConfirmBtn');
  confirmBtn.addEventListener('click', ()=>{
    if(confirmBtn.disabled) return; // guard against rapid double-tap
    confirmBtn.disabled = true;
    closePrompt();
    completeGoalPurchase(id);
  });
  document.getElementById('purchaseCancelBtn').addEventListener('click', closePrompt);
}

function completeGoalPurchase(id){
  const goal = state.goals.find(g=>g.id===id);
  if(!goal || goal.status==='purchased') return; // anti double-transaction guard

  const purchaseDate = todayISO();
  const tx = {
    type: 'goal_purchase',
    amount: goal.targetAmount,
    date: purchaseDate,
    account: 'tabungan',
    goalId: goal.id,
    note: goal.name,
  };

  if(wouldCauseNegativeBalance(tx, null)){
    showInsufficientBalanceWarning();
    return;
  }

  const cardEl = document.querySelector(`.goal-card[data-goal-card="${id}"]`);
  if(cardEl) cardEl.classList.add('goal-card-pulse');

  addTransaction(tx);

  goal.status = 'purchased';
  goal.purchasedAt = Date.now();
  goal.purchaseDate = purchaseDate;
  goal.purchaseTxId = tx.id;
  saveGoals();

  setTimeout(()=>{
    playSound('achievement');
    playPurchaseCelebration(goal);
  }, cardEl ? 260 : 0);
}

function playPurchaseCelebration(goal){
  const overlay = document.getElementById('goalCelebration');
  const sub = document.getElementById('goalCelebrationSub');
  sub.textContent = `${goal.name} berhasil dibeli!`;
  overlay.classList.remove('hidden');
  launchConfetti();
  clearTimeout(playPurchaseCelebration._timer);
  playPurchaseCelebration._timer = setTimeout(()=>{
    overlay.classList.add('hidden');
    refreshCurrentView();
    setTimeout(()=> checkAchievements(), 400);
  }, 1900);
}

/* ======================================================================
   WALLET DETAIL
   ====================================================================== */
const WALLET_LABELS = {dana:'Dana', gopay:'GOPAY', bank:'Bank', fisik:'Uang Fisik', tabungan:'Tabungan'};
function openWalletDetail(key){
  state.currentWallet = key;
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.getElementById('page-walletdetail').classList.remove('hidden');
  renderWalletDetail();
  window.scrollTo(0,0);
}
document.getElementById('walletDetailBack').addEventListener('click', ()=> showPage('uang'));

function renderWalletDetail(){
  const key = state.currentWallet;
  const bal = computeBalances();
  document.getElementById('walletDetailTitle').textContent = WALLET_LABELS[key];
  document.getElementById('walletDetailTabLabel').textContent = 'SALDO ' + WALLET_LABELS[key].toUpperCase();
  document.getElementById('walletDetailBalance').textContent = formatBalance(bal[key]);

  const statsWrap = document.getElementById('walletDetailStats');
  statsWrap.innerHTML = '';
  computeAccountStats(key).forEach(s=>{
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-label">${s.label}</div><div class="stat-value">${formatRupiah(s.value)}</div>`;
    statsWrap.appendChild(card);
  });

  renderTxList(document.getElementById('walletDetailHistory'), historyForAccount(key));
}

/* ======================================================================
   TRANSACTION MODAL (add / edit)
   ====================================================================== */
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const txForm = document.getElementById('txForm');

document.querySelectorAll('[data-action]').forEach(btn=>{
  btn.addEventListener('click', ()=> openTxModal(btn.dataset.action));
});
document.getElementById('transferBtn').addEventListener('click', ()=> openTxModal('transfer'));
document.getElementById('modalClose').addEventListener('click', closeTxModal);
modalOverlay.addEventListener('click', (e)=>{ if(e.target===modalOverlay) closeTxModal(); });

function closeTxModal(){
  modalOverlay.classList.add('hidden');
  txForm.innerHTML = '';
  txForm.dataset.submitting = '0';
  state.editingTxId = null;
}

function accountPickerHtml(name, options, selected){
  return `<div class="account-pick" data-picker="${name}">` +
    options.map(o=> `<button type="button" class="account-opt${o.key===selected?' active':''}" data-val="${o.key}">${o.label}</button>`).join('') +
  `</div>`;
}
function wirePicker(root, name){
  const picker = root.querySelector(`[data-picker="${name}"]`);
  if(!picker) return {get:()=>null};
  let value = picker.querySelector('.account-opt.active')?.dataset.val || null;
  picker.querySelectorAll('.account-opt').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      picker.querySelectorAll('.account-opt').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      value = btn.dataset.val;
    });
  });
  return {get:()=>value};
}

function openTxModal(type, existingTx){
  state.editingTxId = existingTx ? existingTx.id : null;
  const titles = {income:'💰 Uang Masuk', expense:'🛒 Pembelian', save:'🎯 Menabung', withdraw:'🔓 Ambil dari Tabungan', transfer:'🔁 Pindah Uang'};
  modalTitle.textContent = titles[type];

  const accountOptsFull = [...ACCOUNTS, {key:'tabungan', label:'Tabungan', icon:'🎯'}];
  const walletOnlyOpts = ACCOUNTS;

  let html = '';
  if(type==='income'){
    html = `
      <div class="field"><label>Nominal (Rp)</label><div class="amount-input-row"><input required type="number" min="1" id="fAmount" placeholder="0" value="${existingTx?existingTx.amount:''}"><button type="button" class="k-btn" id="fAmountK">K</button></div></div>
      <div class="field"><label>Sumber uang</label><input type="text" id="fNote" placeholder="Contoh: Uang saku, Gaji" value="${existingTx?escapeHtml(existingTx.note):''}"></div>
      <div class="field"><label>Tanggal</label><input required type="date" id="fDate" value="${existingTx?existingTx.date:todayISO()}"></div>
      <div class="field"><label>Masuk ke</label>${accountPickerHtml('acc', accountOptsFull, existingTx?existingTx.account:'dana')}</div>
      <button type="submit" class="btn-primary">Simpan</button>
    `;
  } else if(type==='expense'){
    const catOptions = state.categories.map(c=>`<option value="${escapeHtml(c.name)}" ${existingTx&&existingTx.category===c.name?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
    html = `
      <div class="field"><label>Nama barang</label><input required type="text" id="fNote" placeholder="Contoh: Makan siang" value="${existingTx?escapeHtml(existingTx.note):''}"></div>
      <div class="field"><label>Harga (Rp)</label><div class="amount-input-row"><input required type="number" min="1" id="fAmount" placeholder="0" value="${existingTx?existingTx.amount:''}"><button type="button" class="k-btn" id="fAmountK">K</button></div></div>
      <div class="field"><label>Tanggal</label><input required type="date" id="fDate" value="${existingTx?existingTx.date:todayISO()}"></div>
      <div class="field"><label>Tempat uang diambil</label>${accountPickerHtml('acc', accountOptsFull, existingTx?existingTx.account:'dana')}</div>
      <div class="field"><label>Kategori</label><select id="fCategory">${catOptions}</select></div>
      <div class="field"><label>Catatan (opsional)</label><textarea id="fExtra" rows="2" placeholder="Catatan tambahan">${existingTx&&existingTx.extra?escapeHtml(existingTx.extra):''}</textarea></div>
      <button type="submit" class="btn-primary">Simpan</button>
    `;
  } else if(type==='save'){
    const selectableGoals = state.goals.filter(g=> g.status!=='purchased' || (existingTx && existingTx.goalId===g.id));
    const goalOptions = selectableGoals.map(g=>`<option value="${g.id}" ${existingTx&&existingTx.goalId===g.id?'selected':''}>${escapeHtml(g.name)}</option>`).join('');
    html = `
      <div class="field"><label>Nominal (Rp)</label><div class="amount-input-row"><input required type="number" min="1" id="fAmount" placeholder="0" value="${existingTx?existingTx.amount:''}"><button type="button" class="k-btn" id="fAmountK">K</button></div></div>
      <div class="field"><label>Sumber uang</label>${accountPickerHtml('acc', walletOnlyOpts, existingTx?existingTx.account:'dana')}</div>
      <div class="field"><label>Tanggal</label><input required type="date" id="fDate" value="${existingTx?existingTx.date:todayISO()}"></div>
      <div class="field"><label>Keterangan (opsional)</label><input type="text" id="fNote" placeholder="Contoh: Tabungan liburan" value="${existingTx?escapeHtml(existingTx.note):''}"></div>
      ${selectableGoals.length>0 ? `<div class="field"><label>Target Tabungan (opsional)</label><select id="fGoal"><option value="">— Tidak terikat target —</option>${goalOptions}</select></div>` : ''}
      <button type="submit" class="btn-primary">Simpan</button>
    `;
  } else if(type==='withdraw'){
    const goalOptions = state.goals.map(g=>`<option value="${g.id}" ${existingTx&&existingTx.goalId===g.id?'selected':''}>${escapeHtml(g.name)}</option>`).join('');
    html = `
      <div class="field"><label>Nominal (Rp)</label><div class="amount-input-row"><input required type="number" min="1" id="fAmount" placeholder="0" value="${existingTx?existingTx.amount:''}"><button type="button" class="k-btn" id="fAmountK">K</button></div></div>
      <div class="field"><label>Tujuan uang</label>${accountPickerHtml('acc', walletOnlyOpts, existingTx?existingTx.account:'dana')}</div>
      <div class="field"><label>Tanggal</label><input required type="date" id="fDate" value="${existingTx?existingTx.date:todayISO()}"></div>
      <div class="field"><label>Keterangan (opsional)</label><input type="text" id="fNote" placeholder="Contoh: Ambil untuk kebutuhan" value="${existingTx?escapeHtml(existingTx.note):''}"></div>
      ${state.goals.length>0 ? `<div class="field"><label>Target Tabungan (opsional)</label><select id="fGoal"><option value="">— Tidak terikat target —</option>${goalOptions}</select></div>` : ''}
      <button type="submit" class="btn-primary">Simpan</button>
    `;
  } else if(type==='transfer'){
    html = `
      <div class="field"><label>Nominal (Rp)</label><div class="amount-input-row"><input required type="number" min="1" id="fAmount" placeholder="0" value="${existingTx?existingTx.amount:''}"><button type="button" class="k-btn" id="fAmountK">K</button></div></div>
      <div class="field"><label>Dari dompet</label>${accountPickerHtml('accFrom', walletOnlyOpts, existingTx?existingTx.account:'fisik')}</div>
      <div class="field"><label>Ke dompet</label>${accountPickerHtml('accTo', walletOnlyOpts, existingTx?existingTx.toAccount:'dana')}</div>
      <div class="field"><label>Tanggal</label><input required type="date" id="fDate" value="${existingTx?existingTx.date:todayISO()}"></div>
      <div class="field"><label>Keterangan (opsional)</label><input type="text" id="fNote" placeholder="Contoh: Simpan uang tunai ke Dana" value="${existingTx?escapeHtml(existingTx.note):''}"></div>
      <button type="submit" class="btn-primary">Simpan</button>
    `;
  }
  txForm.innerHTML = html;
  const picker = type==='transfer' ? null : wirePicker(txForm, 'acc');
  const pickerFrom = type==='transfer' ? wirePicker(txForm, 'accFrom') : null;
  const pickerTo = type==='transfer' ? wirePicker(txForm, 'accTo') : null;
  const kBtn = document.getElementById('fAmountK');
  if(kBtn){
    kBtn.addEventListener('click', ()=>{
      const amountInput = document.getElementById('fAmount');
      const digitsOnly = amountInput.value.replace(/[^0-9]/g, '');
      if(!digitsOnly || digitsOnly==='0'){ return; }
      amountInput.value = digitsOnly + '000';
      amountInput.focus();
    });
  }
  modalOverlay.classList.remove('hidden');

  txForm.onsubmit = (e)=>{
    e.preventDefault();
    if(txForm.dataset.submitting==='1') return; // cegah transaksi ganda dari klik cepat berulang
    const amount = Number(document.getElementById('fAmount').value);
    if(!amount || amount<=0){ toast('Nominal harus lebih dari 0'); return; }
    const date = document.getElementById('fDate').value || todayISO();

    let tx;
    if(type==='transfer'){
      const fromAcc = pickerFrom.get();
      const toAcc = pickerTo.get();
      if(!fromAcc || !toAcc){ toast('Pilih dompet asal dan tujuan'); return; }
      if(fromAcc===toAcc){ toast('Dompet asal dan tujuan tidak boleh sama'); return; }
      tx = {type, amount, date, account:fromAcc, toAccount:toAcc};
      tx.note = document.getElementById('fNote').value.trim();
    } else {
      const account = picker.get();
      if(!account){ toast('Pilih tempat uang'); return; }
      tx = {type, amount, date, account};
      if(type==='expense'){
        tx.note = document.getElementById('fNote').value.trim() || 'Pembelian';
        tx.category = document.getElementById('fCategory').value;
        tx.extra = document.getElementById('fExtra').value.trim();
      } else {
        tx.note = document.getElementById('fNote').value.trim();
        if(type==='save' || type==='withdraw'){
          const goalSelect = document.getElementById('fGoal');
          tx.goalId = (goalSelect && goalSelect.value) ? goalSelect.value : null;
        }
      }
    }

    // Validasi saldo — cegah saldo negatif untuk semua jenis transaksi kecuali Uang Masuk.
    if(type!=='income'){
      if(wouldCauseNegativeBalance(tx, state.editingTxId)){
        showInsufficientBalanceWarning();
        return;
      }
    }

    txForm.dataset.submitting = '1';
    let goalNotifyMsg = null;
    if(type==='save' && tx.goalId && !state.editingTxId){
      const goal = state.goals.find(g=>g.id===tx.goalId);
      if(goal && goal.targetAmount>0){
        const before = computeGoalSaved(tx.goalId);
        const after = before + amount;
        const beforePct = before / goal.targetAmount * 100;
        const afterPct = after / goal.targetAmount * 100;
        if(beforePct<100 && afterPct>=100){
          goalNotifyMsg = `🎉 Target "${goal.name}" tercapai! Saatnya wujudkan rencanamu.`;
        } else if(beforePct<80 && afterPct>=80){
          goalNotifyMsg = `🔥 Tabungan "${goal.name}" sudah ${afterPct.toFixed(0)}%, tinggal sedikit lagi!`;
        }
      }
    }

    // Peringatan budget — hanya dicek untuk transaksi Pembelian BARU (bukan edit),
    // supaya tidak muncul berulang kali hanya karena render/refresh.
    let budgetWarningInfo = null;
    if(type==='expense' && !state.editingTxId){
      const d = new Date(date+'T00:00:00');
      const matchingBudget = state.budgets.find(b=>
        b.category===tx.category && b.year===d.getFullYear() && b.month===(d.getMonth()+1)
      );
      if(matchingBudget && matchingBudget.amount>0){
        const before = computeBudgetUsed(matchingBudget);
        const after = before + amount;
        const beforePct = before / matchingBudget.amount * 100;
        const afterPct = after / matchingBudget.amount * 100;
        if(beforePct<100 && afterPct>=100){
          budgetWarningInfo = {level:'over', budget:matchingBudget, used:after};
        } else if(beforePct<90 && afterPct>=90){
          budgetWarningInfo = {level:'warning', budget:matchingBudget, used:after};
        } else if(beforePct<75 && afterPct>=75){
          budgetWarningInfo = {level:'near', budget:matchingBudget, used:after};
        }
      }
    }

    if(state.editingTxId){
      updateTransaction(state.editingTxId, tx);
      toast('Transaksi diperbarui');
    } else {
      addTransaction(tx);
      playSound(type);
      showSuccessBurst(type);
      toast(goalNotifyMsg || 'Transaksi tersimpan');
      if(goalNotifyMsg && goalNotifyMsg.indexOf('tercapai')>-1){
        setTimeout(()=>{ playSound('goal'); launchConfetti(); checkAchievements(); }, 380);
      } else {
        setTimeout(()=> checkAchievements(), 300);
      }
      if(budgetWarningInfo){
        setTimeout(()=> showBudgetWarning(budgetWarningInfo), 500);
      }
    }
    closeTxModal();
    refreshCurrentView();
  };
}

/* ======================================================================
   TX MENU (edit / delete)
   ====================================================================== */
function openTxMenu(id){
  const tx = state.transactions.find(t=>t.id===id);
  if(!tx) return;

  if(tx.type==='goal_purchase'){
    showPrompt('Target Tabungan', `
      <p><strong>${escapeHtml(txName(tx))}</strong><br><span style="color:var(--ink-soft); font-size:0.85rem;">${formatBalance(tx.amount)} · ${formatDateID(tx.date)}</span></p>
      <p style="color:var(--ink-soft); font-size:0.85rem;">Ini catatan pembelian target tabungan. Kalau ini salah tekan, kamu bisa batalkan — uangnya akan dikembalikan ke Tabungan dan target aktif lagi.</p>
      <button class="btn-primary danger" id="txDelBtn">↩️ Batalkan Pembelian</button>
    `);
    document.getElementById('txDelBtn').addEventListener('click', ()=>{
      closePrompt();
      showPrompt('Batalkan Pembelian', `
        <p>Yakin ingin membatalkan pembelian ini? Uang ${formatRupiah(tx.amount)} akan dikembalikan ke Tabungan dan target akan aktif kembali.</p>
        <button class="btn-primary danger" id="txDelConfirm">Ya, Batalkan</button>
        <button class="btn-secondary" id="txDelCancel">Tutup</button>
      `);
      document.getElementById('txDelConfirm').addEventListener('click', ()=>{
        const goal = state.goals.find(g=>g.id===tx.goalId);
        if(goal){
          goal.status = 'active';
          delete goal.purchasedAt;
          delete goal.purchaseDate;
          delete goal.purchaseTxId;
          saveGoals();
        }
        deleteTransaction(id);
        closePrompt();
        toast('Pembelian dibatalkan, target aktif lagi');
        refreshCurrentView();
      });
      document.getElementById('txDelCancel').addEventListener('click', closePrompt);
    });
    return;
  }

  showPrompt('Transaksi', `
    <p><strong>${escapeHtml(txName(tx))}</strong><br><span style="color:var(--ink-soft); font-size:0.85rem;">${formatBalance(tx.amount)} · ${formatDateID(tx.date)}</span></p>
    <button class="btn-secondary" id="txEditBtn">✏️ Edit Transaksi</button>
    <button class="btn-primary danger" id="txDelBtn">🗑️ Hapus Transaksi</button>
  `);
  document.getElementById('txEditBtn').addEventListener('click', ()=>{
    closePrompt();
    openTxModal(tx.type, tx);
  });
  document.getElementById('txDelBtn').addEventListener('click', ()=>{
    closePrompt();
    showPrompt('Hapus Transaksi', `
      <p>Yakin ingin menghapus transaksi ini? Saldo akan dihitung ulang otomatis.</p>
      <button class="btn-primary danger" id="txDelConfirm">Ya, Hapus</button>
      <button class="btn-secondary" id="txDelCancel">Batal</button>
    `);
    document.getElementById('txDelConfirm').addEventListener('click', ()=>{
      deleteTransaction(id);
      closePrompt();
      toast('Transaksi dihapus');
      refreshCurrentView();
    });
    document.getElementById('txDelCancel').addEventListener('click', closePrompt);
  });
}

/* ======================================================================
   TRANSACTION CRUD
   ====================================================================== */
function addTransaction(tx){
  tx.id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  tx.createdAt = Date.now();
  state.transactions.push(tx);
  saveTransactions();
}
function updateTransaction(id, updates){
  const idx = state.transactions.findIndex(t=>t.id===id);
  if(idx>-1){
    state.transactions[idx] = {...state.transactions[idx], ...updates};
    saveTransactions();
  }
}
function deleteTransaction(id){
  state.transactions = state.transactions.filter(t=>t.id!==id);
  saveTransactions();
}
function refreshCurrentView(){
  if(state.currentPage==='walletdetail' || document.getElementById('page-walletdetail').classList.contains('hidden')===false){
    if(!document.getElementById('page-walletdetail').classList.contains('hidden')){
      renderWalletDetail();
      return;
    }
  }
  showPage(state.currentPage);
}

/* ======================================================================
   GENERIC PROMPT MODAL
   ====================================================================== */
const promptOverlay = document.getElementById('promptOverlay');
const promptTitle = document.getElementById('promptTitle');
const promptBody = document.getElementById('promptBody');
document.getElementById('promptClose').addEventListener('click', closePrompt);
promptOverlay.addEventListener('click', (e)=>{ if(e.target===promptOverlay) closePrompt(); });

function showPrompt(title, html){
  promptTitle.textContent = title;
  promptBody.innerHTML = html;
  promptOverlay.classList.remove('hidden');
}
function closePrompt(){
  promptOverlay.classList.add('hidden');
  promptBody.innerHTML = '';
}

/* ======================================================================
   BALANCE VALIDATION (mencegah saldo negatif)
   ====================================================================== */
function wouldCauseNegativeBalance(candidateTx, excludeTxId){
  const virtualList = state.transactions
    .filter(t=> t.id !== excludeTxId)
    .concat([candidateTx]);
  const bal = computeBalances(virtualList);
  const EPS = -1; // toleransi pembulatan kecil
  return Object.values(bal).some(v=> v < EPS);
}
function showInsufficientBalanceWarning(){
  showPrompt('⚠️ Saldo Tidak Cukup', `
    <p>Saldo Anda tidak cukup untuk melakukan transaksi ini.</p>
    <button class="btn-primary" id="insufficientOkBtn">Oke</button>
  `);
  document.getElementById('insufficientOkBtn').addEventListener('click', closePrompt);
}

/* ======================================================================
   PIN / LOCK SCREEN
   ====================================================================== */
async function hashPin(pin, salt){
  try{
    const enc = new TextEncoder().encode(pin + salt);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){
    // Fallback for contexts where Web Crypto is unavailable (e.g. plain file:// on some browsers).
    // Not cryptographically strong, but still avoids storing the PIN as plain text.
    let h = 0;
    const s = pin + salt;
    for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; }
    return 'fb' + h.toString(16);
  }
}
function randomSalt(){
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let pinBuffer = '';
let pinMode = 'unlock'; // 'unlock' | 'setup1' | 'setup2'
let pinFirstEntry = '';

const lockScreen = document.getElementById('lockScreen');
const appEl = document.getElementById('app');
const pinDots = document.getElementById('pinDots').querySelectorAll('span');
const pinError = document.getElementById('pinError');

document.getElementById('pinPad').addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-k]');
  if(!btn) return;
  const k = btn.dataset.k;
  if(k==='back'){ pinBuffer = pinBuffer.slice(0,-1); }
  else if(pinBuffer.length<4){ pinBuffer += k; }
  updatePinDots();
  if(pinBuffer.length===4){ setTimeout(handlePinComplete, 120); }
});
function updatePinDots(){
  pinDots.forEach((d,i)=> d.classList.toggle('filled', i<pinBuffer.length));
}
async function handlePinComplete(){
  const entered = pinBuffer;
  pinBuffer = '';
  if(pinMode==='unlock'){
    const h = await hashPin(entered, state.pin.salt);
    if(h===state.pin.hash){
      unlockApp();
    } else {
      pinError.textContent = 'PIN salah, coba lagi';
      updatePinDots();
      navigator.vibrate && navigator.vibrate(150);
      setTimeout(()=>{ updatePinDots(); }, 300);
    }
  } else if(pinMode==='setup1'){
    pinFirstEntry = entered;
    pinMode = 'setup2';
    pinError.textContent = '';
    document.querySelector('.lock-card p').textContent = 'Ulangi PIN untuk konfirmasi';
    updatePinDots();
  } else if(pinMode==='setup2'){
    if(entered===pinFirstEntry){
      const salt = randomSalt();
      const hash = await hashPin(entered, salt);
      state.pin = {enabled:true, hash, salt};
      savePin();
      document.getElementById('pinToggle').checked = true;
      exitPinSetup();
      toast('PIN diaktifkan');
    } else {
      pinError.textContent = 'PIN tidak sama, coba lagi';
      pinMode = 'setup1';
      document.querySelector('.lock-card p').textContent = 'Buat PIN 4 digit';
      updatePinDots();
    }
  }
}
function unlockApp(){
  lockScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  pinError.textContent = '';
  pinBuffer = '';
  updatePinDots();
}
function showLockScreen(mode){
  pinMode = mode || 'unlock';
  pinBuffer = '';
  pinError.textContent = '';
  document.querySelector('.lock-card h1').textContent = pinMode==='unlock' ? 'Buku Kas Terkunci' : 'Atur PIN Baru';
  document.querySelector('.lock-card p').textContent = pinMode==='unlock' ? 'Masukkan PIN untuk membuka' : 'Buat PIN 4 digit';
  updatePinDots();
  lockScreen.classList.remove('hidden');
  appEl.classList.add('hidden');
}
function exitPinSetup(){
  pinMode = 'unlock';
  unlockApp();
}

function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function applyTheme(){
  document.documentElement.setAttribute('data-theme', state.theme);
  const btn = document.getElementById('themeToggleBtn');
  if(btn) btn.textContent = state.theme==='dark' ? '🌒' : '☀️';
  if(state.currentPage==='statistik' && typeof Chart!=='undefined'){
    updateCharts();
  }
}
document.getElementById('themeToggleBtn').addEventListener('click', ()=>{
  state.theme = state.theme==='dark' ? 'light' : 'dark';
  localStorage.setItem(LS_THEME, state.theme);
  const btn = document.getElementById('themeToggleBtn');
  btn.classList.add('theme-spin');
  setTimeout(()=> btn.classList.remove('theme-spin'), 400);
  applyTheme();
});

document.getElementById('lockBtn').addEventListener('click', ()=>{
  if(state.pin.enabled){
    showLockScreen('unlock');
  } else {
    toast('Aktifkan PIN dulu di menu Pengaturan');
  }
});

document.getElementById('pinToggle').addEventListener('change', (e)=>{
  if(e.target.checked){
    if(state.pin.enabled) return;
    showLockScreen('setup1');
  } else {
    showPrompt('Nonaktifkan PIN', `
      <p>Yakin ingin menonaktifkan kunci PIN untuk aplikasi ini?</p>
      <button class="btn-primary danger" id="pinOffConfirm">Ya, Nonaktifkan</button>
      <button class="btn-secondary" id="pinOffCancel">Batal</button>
    `);
    document.getElementById('pinOffConfirm').addEventListener('click', ()=>{
      state.pin = {enabled:false, hash:'', salt:''};
      savePin();
      closePrompt();
      toast('PIN dinonaktifkan');
    });
    document.getElementById('pinOffCancel').addEventListener('click', ()=>{
      e.target.checked = true;
      closePrompt();
    });
  }
});

document.getElementById('openMusikBtn').addEventListener('click', ()=>{
  showPage('musik');
  if(window.mpRefreshMiniPlayer) window.mpRefreshMiniPlayer();
});
document.getElementById('musikBack').addEventListener('click', ()=>{
  showPage('pengaturan');
  if(window.mpRefreshMiniPlayer) window.mpRefreshMiniPlayer();
});

document.getElementById('changePinBtn').addEventListener('click', ()=>{
  if(!state.pin.enabled){ toast('Aktifkan PIN dulu sebelum mengubahnya'); return; }
  showPrompt('🔐 Ubah PIN', `
    <div class="field"><label>PIN Lama</label><input type="password" inputmode="numeric" maxlength="4" id="oldPinInput" placeholder="••••"></div>
    <div class="field"><label>PIN Baru</label><input type="password" inputmode="numeric" maxlength="4" id="newPinInput" placeholder="••••"></div>
    <div class="field"><label>Konfirmasi PIN Baru</label><input type="password" inputmode="numeric" maxlength="4" id="confirmPinInput" placeholder="••••"></div>
    <div id="changePinError" class="pin-error-inline"></div>
    <button class="btn-primary" id="changePinSaveBtn">Ubah PIN</button>
  `);
  document.getElementById('changePinSaveBtn').addEventListener('click', async ()=>{
    const oldPin = document.getElementById('oldPinInput').value;
    const newPin = document.getElementById('newPinInput').value;
    const confirmPin = document.getElementById('confirmPinInput').value;
    const errEl = document.getElementById('changePinError');
    errEl.textContent = '';
    if(!/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)){
      errEl.textContent = 'PIN harus 4 digit angka.';
      return;
    }
    const oldHash = await hashPin(oldPin, state.pin.salt);
    if(oldHash !== state.pin.hash){
      errEl.textContent = '⚠️ PIN lama salah.';
      return;
    }
    if(newPin !== confirmPin){
      errEl.textContent = 'Konfirmasi PIN baru tidak cocok.';
      return;
    }
    const salt = randomSalt();
    const hash = await hashPin(newPin, salt);
    state.pin = {enabled:true, hash, salt};
    savePin();
    closePrompt();
    toast('PIN berhasil diubah');
  });
});

/* ======================================================================
   BACKUP / RESTORE / RESET
   ====================================================================== */
document.getElementById('backupBtn').addEventListener('click', ()=>{
  const payload = {
    app: 'buku-kas',
    version: 4,
    exportedAt: new Date().toISOString(),
    transactions: state.transactions,
    categories: state.categories,
    goals: state.goals,
    achievements: state.achievements,
    budgets: state.budgets,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `buku-kas-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Backup diunduh');
});

document.getElementById('restoreBtn').addEventListener('click', ()=>{
  document.getElementById('importFile').click();
});
document.getElementById('importFile').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (evt)=>{
    let data;
    try{ data = JSON.parse(evt.target.result); }
    catch(err){ toast('File tidak valid'); return; }
    if(!data || !Array.isArray(data.transactions)){ toast('Format file tidak dikenali'); return; }
    // Backup versi lama mungkin tidak punya goals/achievements/budgets — fallback ke array kosong, bukan error.
    const goalsInFile = Array.isArray(data.goals) ? data.goals : [];
    const achievementsInFile = Array.isArray(data.achievements) ? data.achievements : [];
    const budgetsInFile = Array.isArray(data.budgets) ? data.budgets : [];
    showPrompt('Import Data', `
      <p>Mengimpor data akan <strong>mengganti semua data saat ini</strong> (${state.transactions.length} transaksi, ${state.goals.length} target, ${state.budgets.length} budget) dengan data dari file ini (${data.transactions.length} transaksi, ${goalsInFile.length} target, ${budgetsInFile.length} budget). Lanjutkan?</p>
      <button class="btn-primary" id="importConfirm">Ya, Ganti Data</button>
      <button class="btn-secondary" id="importCancel">Batal</button>
    `);
    document.getElementById('importConfirm').addEventListener('click', ()=>{
      state.transactions = data.transactions || [];
      if(Array.isArray(data.categories) && data.categories.length>0) state.categories = data.categories;
      state.goals = goalsInFile;
      state.achievements = achievementsInFile;
      state.budgets = budgetsInFile;
      saveTransactions();
      saveCategories();
      saveGoals();
      saveAchievements();
      saveBudgets();
      closePrompt();
      toast('Data berhasil dipulihkan');
      showPage('dashboard');
    });
    document.getElementById('importCancel').addEventListener('click', closePrompt);
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('resetBtn').addEventListener('click', ()=>{
  showPrompt('Hapus Semua Data', `
    <p>Semua transaksi, kategori buatan, Target Tabungan, dan Budget akan dihapus permanen. Tindakan ini tidak dapat dibatalkan. Pastikan sudah backup data jika perlu.</p>
    <button class="btn-primary danger" id="resetConfirm">Ya, Hapus Semua</button>
    <button class="btn-secondary" id="resetCancel">Batal</button>
  `);
  document.getElementById('resetConfirm').addEventListener('click', ()=>{
    state.transactions = [];
    state.categories = DEFAULT_CATEGORIES.map(name=>({id:'cat_'+name.toLowerCase().replace(/\s+/g,'_'), name}));
    state.goals = [];
    state.budgets = [];
    saveTransactions();
    saveCategories();
    saveGoals();
    saveBudgets();
    closePrompt();
    toast('Semua data telah dihapus');
    showPage('dashboard');
  });
  document.getElementById('resetCancel').addEventListener('click', closePrompt);
});

/* ======================================================================
   INIT
   ====================================================================== */
function init(){
  loadData();
  applyTheme();
  document.getElementById('pinToggle').checked = !!state.pin.enabled;
  document.getElementById('soundToggle').checked = state.soundEnabled;
  checkAchievements(true);
  if(state.pin.enabled){
    showLockScreen('unlock');
  } else {
    appEl.classList.remove('hidden');
  }
  showPage('dashboard');
}
document.getElementById('hideBalanceBtn').textContent = state.hideBalance ? '🙈' : '👁️';
init();
const hideBtn = document.getElementById('hideBalanceBtn');
hideBtn.textContent = state.hideBalance ? '🙈' : '👁️';
hideBtn.addEventListener('click', () => {
  state.hideBalance = !state.hideBalance;
  localStorage.setItem(LS_HIDE, JSON.stringify(state.hideBalance));
  hideBtn.textContent = state.hideBalance ? '🙈' : '👁️';
  refreshCurrentView();
});
document.getElementById('soundToggle').addEventListener('change', (e)=>{
  state.soundEnabled = e.target.checked;
  localStorage.setItem(LS_SOUND, JSON.stringify(state.soundEnabled));
  if(state.soundEnabled){ playSound('save'); }
});
