'use strict';

const APP_VERSION = '1.1.1';
const RELEASE_NAME = 'Life Dashboard V1.1.1';

const state = {
  view: 'home',
  taskFilter: 'today',
  selectedListId: null,
  selectedPlanId: null,
  planTab: 'overview'
};

const app = document.getElementById('app');
const pageTitle = document.getElementById('pageTitle');
const modalRoot = document.getElementById('modalRoot');
const toastEl = document.getElementById('toast');

const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const nowIso = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0,10);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const formatDate = value => value ? new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric' }).format(new Date(`${value}T12:00:00`)) : '';
const formatShortDate = value => value ? new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short' }).format(new Date(`${value}T12:00:00`)) : '';
const formatBytes = bytes => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B','KB','MB','GB'];
  const i = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length-1);
  return `${(bytes/Math.pow(1024,i)).toFixed(i ? 1 : 0)} ${units[i]}`;
};
const daysUntil = date => {
  if (!date) return null;
  const a = new Date(`${todayKey()}T12:00:00`);
  const b = new Date(`${date}T12:00:00`);
  return Math.ceil((b-a)/86400000);
};

const itineraryTypeOptions = [
  ['flight','Flight'],['train','Train'],['ferry','Ferry'],['hotel','Hotel / stay'],
  ['food','Food / booking'],['activity','Activity'],['drive','Drive / taxi'],['other','Other']
];
function inferItineraryType(item={}){
  if(item.type) return item.type;
  const text=`${item.title||''} ${item.details||''}`.toLowerCase();
  if(/flight|airport|plane|easyjet|ryanair|ba |british airways/.test(text)) return 'flight';
  if(/train|rail|station|lner|avanti|eurostar/.test(text)) return 'train';
  if(/ferry|boat|ship|viking line/.test(text)) return 'ferry';
  if(/hotel|hostel|check.?in|apartment|accommodation|stay/.test(text)) return 'hotel';
  if(/dinner|lunch|breakfast|restaurant|food|meal/.test(text)) return 'food';
  if(/drive|taxi|uber|car|parking|transfer/.test(text)) return 'drive';
  if(/tour|museum|visit|activity|show|concert|attraction/.test(text)) return 'activity';
  return 'other';
}
function itineraryEmoji(type){return ({flight:'✈️',train:'🚆',ferry:'⛴️',hotel:'🏨',food:'🍽️',activity:'🎟️',drive:'🚗',other:'📍'})[type]||'📍';}
function planThemeClass(plan){
  const source=String(plan.id||plan.title||'life'); let hash=0;
  for(let i=0;i<source.length;i++) hash=(hash*31+source.charCodeAt(i))>>>0;
  return `trip-theme-${hash%4}`;
}
function planPhase(plan, openTaskCount){
  const today=todayKey();
  if(plan.endDate && plan.endDate < today) return {key:'complete',label:'Complete'};
  if(plan.startDate && plan.startDate <= today && (!plan.endDate || plan.endDate >= today)) return {key:'travelling',label:'Travelling'};
  if(plan.startDate && plan.startDate > today && openTaskCount===0) return {key:'ready',label:'Ready'};
  return {key:'planning',label:'Planning'};
}
function sortedItinerary(plan){return [...(plan.itinerary||[])].sort((a,b)=>`${a.date||'9999'}T${a.time||'99:99'}`.localeCompare(`${b.date||'9999'}T${b.time||'99:99'}`));}
function nextItineraryItem(plan){
  const items=sortedItinerary(plan); if(!items.length) return null;
  const now=new Date();
  const upcoming=items.find(x=>{
    if(!x.date) return false;
    const dt=new Date(`${x.date}T${x.time||'23:59'}:00`);
    return dt >= now;
  });
  return upcoming || items[items.length-1];
}
function tripCountdownText(plan){
  const d=daysUntil(plan.startDate);
  if(d===null) return 'Dates not set';
  if(d>1) return `${d} days to go`;
  if(d===1) return 'Tomorrow';
  if(d===0) return 'Starts today';
  if(plan.endDate && plan.endDate>=todayKey()) return 'Trip underway';
  return 'Trip complete';
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function closeModal() { modalRoot.innerHTML = ''; }
function showModal(title, bodyHtml, options = {}) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="close-btn" id="closeModal" aria-label="Close">×</button></div>
        ${bodyHtml}
      </section>
    </div>`;
  document.getElementById('closeModal').onclick = closeModal;
  document.getElementById('modalBackdrop').onclick = e => { if (e.target.id === 'modalBackdrop' && !options.locked) closeModal(); };
}

function setView(view) {
  state.view = view;
  state.selectedListId = null;
  state.selectedPlanId = null;
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function setTitle(text) { pageTitle.textContent = text; }

async function render() {
  try {
    if (state.selectedListId) return renderListDetail(state.selectedListId);
    if (state.selectedPlanId) return renderPlanDetail(state.selectedPlanId);
    if (state.view === 'home') return renderHome();
    if (state.view === 'tasks') return renderTasks();
    if (state.view === 'lists') return renderLists();
    if (state.view === 'plans') return renderPlans();
    if (state.view === 'vault') return renderVault();
    if (state.view === 'inbox') return renderInbox();
    if (state.view === 'settings') return renderSettings();
  } catch (error) {
    console.error(error);
    app.innerHTML = `<div class="empty"><span class="empty-icon">⚠️</span><strong>Something went wrong</strong><div>${escapeHtml(error.message || error)}</div></div>`;
  }
}

async function renderHome() {
  setTitle('Home');
  const [tasks, lists, plans, files, inbox] = await Promise.all(['tasks','lists','plans','files','inbox'].map(LifeDB.getAll));
  const today = todayKey();
  const openTasks = tasks.filter(t => t.status !== 'done');
  const todayTasks = openTasks.filter(t => t.dueDate && t.dueDate <= today && t.status !== 'waiting').sort(sortTasks);
  const waiting = openTasks.filter(t => t.status === 'waiting');
  const nextPlan = plans.filter(p => p.endDate ? p.endDate >= today : true).sort((a,b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'))[0];
  const shopping = lists.find(l => l.type === 'shopping') || lists[0];
  const shoppingRemaining = shopping ? (shopping.items || []).filter(i => !i.checked).length : 0;
  const recentFiles = files.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0,3);
  const dateText = new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(new Date());

  app.innerHTML = `
    <section class="hero">
      <div class="date">${escapeHtml(dateText)}</div>
      <h2>${todayTasks.length ? `${todayTasks.length} thing${todayTasks.length===1?'':'s'} need attention` : 'You’re all caught up for today'}</h2>
      <p>${inbox.length ? `${inbox.length} item${inbox.length===1?'':'s'} are waiting in your Inbox.` : 'Your plans, tasks, lists and files stay on this device.'}</p>
      <div class="hero-version">● Running v${APP_VERSION}</div>
    </section>

    <section class="section">
      <div class="grid-2">
        <button class="mini-card" data-home-go="tasks" style="text-align:left;border:1px solid var(--line)"><div class="metric">${openTasks.length}</div><div class="label">Open tasks</div></button>
        <button class="mini-card" data-home-go="inbox" style="text-align:left;border:1px solid var(--line)"><div class="metric">${inbox.length}</div><div class="label">Inbox items</div></button>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Today</h2><button data-home-go="tasks">View tasks</button></div>
      <div class="card">
        ${todayTasks.length ? todayTasks.slice(0,5).map(t => taskRowHtml(t, plans)).join('') : `<div class="empty"><span class="empty-icon">✓</span><strong>Nothing urgent</strong><div>No tasks due today or overdue.</div></div>`}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Next up</h2><button data-home-go="plans">View plans</button></div>
      ${nextPlan ? planCardHtml(nextPlan, tasks) : `<div class="empty"><span class="empty-icon">✈️</span><strong>No plans yet</strong><div>Create a trip, event or project when you need one place for everything.</div></div>`}
    </section>

    <section class="section">
      <div class="grid-2">
        <div class="mini-card"><div class="metric">${waiting.length}</div><div class="label">Waiting for</div></div>
        <div class="mini-card"><div class="metric">${shoppingRemaining}</div><div class="label">${shopping ? escapeHtml(shopping.name) : 'List items'}</div></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Recent files</h2><button data-home-go="vault">Open Vault</button></div>
      ${recentFiles.length ? recentFiles.map(fileCardHtml).join('') : `<div class="empty"><span class="empty-icon">▣</span><strong>Your Vault is empty</strong><div>PDFs, screenshots and tickets can be stored locally here.</div></div>`}
    </section>`;

  app.querySelectorAll('[data-home-go]').forEach(el => el.onclick = () => setView(el.dataset.homeGo));
  wireTaskRows();
  wirePlanCards();
  wireFileCards();
}

function sortTasks(a,b) {
  if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
  return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') || (b.createdAt || '').localeCompare(a.createdAt || '');
}

function taskRowHtml(task, plans = []) {
  const plan = plans.find(p => p.id === task.planId);
  const overdue = task.dueDate && task.dueDate < todayKey() && task.status !== 'done';
  return `<div class="task-row" data-task-id="${task.id}">
    <input class="task-check" type="checkbox" data-task-toggle="${task.id}" ${task.status==='done'?'checked':''} aria-label="Mark task complete">
    <div>
      <div class="task-title ${task.status==='done'?'done':''}">${escapeHtml(task.title)}</div>
      <div class="meta">
        ${task.dueDate ? `<span class="pill ${overdue?'overdue':''}">${overdue?'Overdue · ':''}${formatShortDate(task.dueDate)}</span>` : ''}
        ${task.status==='waiting' ? `<span class="pill waiting">Waiting</span>` : ''}
        ${plan ? `<button class="pill plan" style="border:0" data-plan-open="${plan.id}">✈ ${escapeHtml(plan.title)}</button>` : ''}
        ${task.category ? `<span class="pill">${escapeHtml(task.category)}</span>` : ''}
      </div>
    </div>
    <button class="text-btn small-btn" data-task-edit="${task.id}" aria-label="Edit task">•••</button>
  </div>`;
}

async function wireTaskRows() {
  app.querySelectorAll('[data-task-toggle]').forEach(el => el.onchange = async () => {
    const task = await LifeDB.get('tasks', el.dataset.taskToggle);
    if (!task) return;
    task.status = el.checked ? 'done' : (task.previousStatus === 'waiting' ? 'waiting' : 'todo');
    if (el.checked) task.previousStatus = task.status === 'done' ? (task.previousStatus || 'todo') : task.status;
    task.updatedAt = nowIso();
    await LifeDB.put('tasks', task);
    render();
  });
  app.querySelectorAll('[data-task-edit]').forEach(el => el.onclick = () => openTaskForm(el.dataset.taskEdit));
  app.querySelectorAll('[data-plan-open]').forEach(el => el.onclick = e => { e.stopPropagation(); state.selectedPlanId = el.dataset.planOpen; state.planTab='tasks'; render(); });
}

async function renderTasks() {
  setTitle('Tasks');
  const [tasks, plans] = await Promise.all([LifeDB.getAll('tasks'), LifeDB.getAll('plans')]);
  const today = todayKey();
  let filtered = [...tasks];
  if (state.taskFilter === 'today') filtered = tasks.filter(t => t.status !== 'done' && t.status !== 'waiting' && t.dueDate && t.dueDate <= today);
  if (state.taskFilter === 'upcoming') filtered = tasks.filter(t => t.status !== 'done' && t.status !== 'waiting' && (!t.dueDate || t.dueDate > today));
  if (state.taskFilter === 'waiting') filtered = tasks.filter(t => t.status === 'waiting');
  filtered.sort(sortTasks);

  app.innerHTML = `
    <div class="segmented">
      ${['today','upcoming','waiting','all'].map(f => `<button data-filter="${f}" class="${state.taskFilter===f?'active':''}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}
    </div>
    <section class="section">
      <div class="card">
        ${filtered.length ? filtered.map(t => taskRowHtml(t, plans)).join('') : `<div class="empty"><span class="empty-icon">✓</span><strong>No tasks here</strong><div>Use + to add a task${state.taskFilter==='waiting'?' you are waiting on':''}.</div></div>`}
      </div>
    </section>`;
  app.querySelectorAll('[data-filter]').forEach(btn => btn.onclick = () => { state.taskFilter = btn.dataset.filter; renderTasks(); });
  wireTaskRows();
}

async function openTaskForm(taskId = null, presetPlanId = null) {
  const [plans, existing] = await Promise.all([LifeDB.getAll('plans'), taskId ? LifeDB.get('tasks', taskId) : Promise.resolve(null)]);
  const task = existing || { title:'', dueDate:'', status:'todo', category:'', planId:presetPlanId || '', notes:'' };
  showModal(taskId ? 'Edit task' : 'Add task', `
    <form id="taskForm" class="form-grid">
      <label>Task<input name="title" required maxlength="140" value="${escapeHtml(task.title)}" placeholder="e.g. Book Tallinn hotel"></label>
      <label>Due date<input name="dueDate" type="date" value="${escapeHtml(task.dueDate || '')}"></label>
      <label>Status<select name="status"><option value="todo" ${task.status==='todo'?'selected':''}>To do</option><option value="waiting" ${task.status==='waiting'?'selected':''}>Waiting for</option><option value="done" ${task.status==='done'?'selected':''}>Complete</option></select></label>
      <label>Linked plan<select name="planId"><option value="">None</option>${plans.map(p=>`<option value="${p.id}" ${task.planId===p.id?'selected':''}>${escapeHtml(p.title)}</option>`).join('')}</select></label>
      <label>Category<input name="category" maxlength="60" value="${escapeHtml(task.category || '')}" placeholder="Household, School, Shopping…"></label>
      <label>Notes<textarea name="notes" placeholder="Optional details">${escapeHtml(task.notes || '')}</textarea></label>
      <div class="form-actions">${taskId?`<button type="button" id="deleteTask" class="danger-btn">Delete</button>`:''}<button type="button" class="secondary-btn" id="cancelTask">Cancel</button><button class="primary-btn">Save task</button></div>
    </form>`);
  document.getElementById('cancelTask').onclick = closeModal;
  if (taskId) document.getElementById('deleteTask').onclick = async () => { if (confirm('Delete this task?')) { await LifeDB.remove('tasks', taskId); closeModal(); render(); } };
  document.getElementById('taskForm').onsubmit = async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const status = form.get('status');
    const record = {
      ...task,
      id: task.id || uid('task'),
      title: form.get('title').trim(), dueDate: form.get('dueDate'), status,
      previousStatus: status === 'done' ? (task.previousStatus || 'todo') : status,
      planId: form.get('planId'), category: form.get('category').trim(), notes: form.get('notes').trim(),
      createdAt: task.createdAt || nowIso(), updatedAt: nowIso()
    };
    await LifeDB.put('tasks', record);
    closeModal(); toast('Task saved'); render();
  };
}

async function renderLists() {
  setTitle('Lists');
  const lists = (await LifeDB.getAll('lists')).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  app.innerHTML = `<section class="section">
    ${lists.length ? lists.map(list => {
      const total = (list.items||[]).length, done=(list.items||[]).filter(i=>i.checked).length;
      return `<button class="card" data-list-open="${list.id}" style="width:100%;text-align:left"><div class="card-row"><div><div class="card-title">${list.type==='shopping'?'🛒':'☑'} ${escapeHtml(list.name)}</div><div class="card-subtitle">${total-done} remaining · ${total} total</div></div><span>›</span></div></button>`;
    }).join('') : `<div class="empty"><span class="empty-icon">☑</span><strong>No lists yet</strong><div>Create a grocery list, packing list or any checklist.</div></div>`}
  </section>`;
  app.querySelectorAll('[data-list-open]').forEach(btn => btn.onclick = () => { state.selectedListId = btn.dataset.listOpen; render(); });
}

async function openListForm() {
  showModal('Create list', `<form id="listForm" class="form-grid"><label>Name<input name="name" required maxlength="80" placeholder="Tesco, Packing, Christmas ideas…"></label><label>Type<select name="type"><option value="general">General checklist</option><option value="shopping">Shopping / groceries</option></select></label><div class="form-actions"><button type="button" class="secondary-btn" id="cancelList">Cancel</button><button class="primary-btn">Create list</button></div></form>`);
  document.getElementById('cancelList').onclick = closeModal;
  document.getElementById('listForm').onsubmit = async e => {
    e.preventDefault(); const f=new FormData(e.currentTarget);
    const list={id:uid('list'),name:f.get('name').trim(),type:f.get('type'),items:[],createdAt:nowIso(),updatedAt:nowIso()};
    await LifeDB.put('lists',list); closeModal(); state.selectedListId=list.id; render();
  };
}

async function renderListDetail(id) {
  const list = await LifeDB.get('lists', id);
  if (!list) { state.selectedListId=null; return renderLists(); }
  setTitle(list.name);
  const items = list.items || [];
  app.innerHTML = `
    <div class="back-row"><button id="backLists">‹ Lists</button></div>
    <section class="section"><div class="card">
      <div class="card-row"><div><div class="card-title">${list.type==='shopping'?'🛒':'☑'} ${escapeHtml(list.name)}</div><div class="card-subtitle">${items.filter(i=>!i.checked).length} remaining</div></div><button id="deleteList" class="text-btn">Delete</button></div>
      <div style="margin-top:10px">${items.length ? items.map(item=>`<div class="list-item-row ${item.checked?'checked':''}"><input class="task-check" type="checkbox" data-list-toggle="${item.id}" ${item.checked?'checked':''}><div class="list-item-text">${escapeHtml(item.text)}</div><button class="text-btn" data-list-delete="${item.id}">×</button></div>`).join('') : `<div class="empty"><strong>List is empty</strong><div>Add the first item below.</div></div>`}</div>
      <form id="inlineListAdd" class="inline-add"><input name="text" required maxlength="120" autocomplete="off" placeholder="Add an item"><button class="primary-btn">Add</button></form>
    </div></section>`;
  document.getElementById('backLists').onclick = () => {state.selectedListId=null; state.view='lists'; render();};
  document.getElementById('deleteList').onclick = async () => { if(confirm(`Delete “${list.name}”?`)){await LifeDB.remove('lists',id);state.selectedListId=null;renderLists();} };
  app.querySelectorAll('[data-list-toggle]').forEach(el=>el.onchange=async()=>{const item=items.find(i=>i.id===el.dataset.listToggle); item.checked=el.checked; list.updatedAt=nowIso(); await LifeDB.put('lists',list); render();});
  app.querySelectorAll('[data-list-delete]').forEach(el=>el.onclick=async()=>{list.items=items.filter(i=>i.id!==el.dataset.listDelete);list.updatedAt=nowIso();await LifeDB.put('lists',list);render();});
  document.getElementById('inlineListAdd').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);list.items=[...(list.items||[]),{id:uid('item'),text:f.get('text').trim(),checked:false}];list.updatedAt=nowIso();await LifeDB.put('lists',list);render();};
}

async function renderPlans() {
  setTitle('Plans');
  const [plans,tasks,files] = await Promise.all([LifeDB.getAll('plans'), LifeDB.getAll('tasks'), LifeDB.getAll('files')]);
  plans.sort((a,b)=>(a.startDate||'9999').localeCompare(b.startDate||'9999'));
  app.innerHTML = `<section class="section">${plans.length ? plans.map(p=>planCardHtml(p,tasks,files)).join('') : `<div class="empty"><span class="empty-icon">✈️</span><strong>No plans yet</strong><div>Create a holiday, event, day out or household project.</div></div>`}</section>`;
  wirePlanCards();
}

function planCardHtml(plan,tasks=[],files=[]) {
  const remaining = tasks.filter(t=>t.planId===plan.id && t.status!=='done').length;
  const fileCount = files.filter(f=>f.planId===plan.id).length;
  const scheduleCount=(plan.itinerary||[]).length;
  const d = daysUntil(plan.startDate);
  const timing = d === null ? '' : d < 0 ? (plan.endDate && plan.endDate>=todayKey()?'Underway':'Complete') : d === 0 ? 'Today' : `${d} day${d===1?'':'s'} away`;
  if(plan.type==='trip'){
    return `<button class="trip-list-card ${planThemeClass(plan)}" data-plan-card="${plan.id}" style="width:100%;text-align:left">
      <div class="trip-list-top"><span class="trip-list-emoji">✈️</span><span class="trip-countdown">${escapeHtml(tripCountdownText(plan))}</span></div>
      <div class="trip-list-title">${escapeHtml(plan.title)}</div>
      <div class="trip-list-subtitle">${[plan.location,plan.startDate?formatDate(plan.startDate):'',plan.endDate?formatDate(plan.endDate):''].filter(Boolean).join(' · ') || 'Add dates and destination'}</div>
      <div class="trip-list-stats"><span>✓ ${remaining} to do</span><span>🗓 ${scheduleCount}</span><span>📎 ${fileCount}</span></div>
    </button>`;
  }
  return `<button class="card" data-plan-card="${plan.id}" style="width:100%;text-align:left"><div class="card-row"><div><div class="card-title">${planEmoji(plan.type)} ${escapeHtml(plan.title)}</div><div class="card-subtitle">${[plan.startDate?formatDate(plan.startDate):'',plan.location,timing].filter(Boolean).join(' · ')}</div><div class="meta"><span class="pill plan">${remaining} task${remaining===1?'':'s'} remaining</span></div></div><span>›</span></div></button>`;
}
function planEmoji(type){return ({trip:'✈️',event:'🎟️',project:'🛠️',dayout:'📍'})[type]||'📌';}
function wirePlanCards(){app.querySelectorAll('[data-plan-card]').forEach(btn=>btn.onclick=()=>{state.selectedPlanId=btn.dataset.planCard;state.planTab='overview';render();});}

async function openPlanForm(planId=null) {
  const existing = planId ? await LifeDB.get('plans', planId) : null;
  const p = existing || {title:'',type:'trip',startDate:'',endDate:'',location:'',notes:'',itinerary:[],checklist:[],links:[]};
  showModal(planId?'Edit plan':'Create plan',`<form id="planForm" class="form-grid">
    <label>Name<input name="title" required maxlength="100" value="${escapeHtml(p.title)}" placeholder="Helsinki & Tallinn"></label>
    <label>Type<select name="type"><option value="trip" ${p.type==='trip'?'selected':''}>Trip / holiday</option><option value="event" ${p.type==='event'?'selected':''}>Event</option><option value="dayout" ${p.type==='dayout'?'selected':''}>Day out</option><option value="project" ${p.type==='project'?'selected':''}>Project</option></select></label>
    <div class="grid-2"><label>Start date<input id="planStartDate" name="startDate" type="date" value="${escapeHtml(p.startDate||'')}"></label><label>End date<input id="planEndDate" name="endDate" type="date" value="${escapeHtml(p.endDate||'')}" ${p.startDate?`min="${escapeHtml(p.startDate)}"`:''}></label></div>
    <label>Location<input name="location" maxlength="100" value="${escapeHtml(p.location||'')}" placeholder="Helsinki, Finland"></label>
    <label>Notes<textarea name="notes" placeholder="Useful overview or key information">${escapeHtml(p.notes||'')}</textarea></label>
    <div class="form-actions">${planId?`<button type="button" class="danger-btn" id="deletePlan">Delete</button>`:''}<button type="button" class="secondary-btn" id="cancelPlan">Cancel</button><button class="primary-btn">Save</button></div>
  </form>`);
  document.getElementById('cancelPlan').onclick=closeModal;
  const startInput=document.getElementById('planStartDate');
  const endInput=document.getElementById('planEndDate');
  const syncPlanDates=()=>{
    endInput.min=startInput.value||'';
    if(startInput.value && endInput.value && endInput.value<startInput.value){endInput.value=startInput.value;toast('End date adjusted to match the start date');}
  };
  startInput.onchange=syncPlanDates; syncPlanDates();
  if(planId) document.getElementById('deletePlan').onclick=async()=>{if(confirm('Delete this plan? Linked tasks and files will remain but become unlinked.')){const [tasks,files]=await Promise.all([LifeDB.getAll('tasks'),LifeDB.getAll('files')]);for(const t of tasks.filter(x=>x.planId===planId)){t.planId='';await LifeDB.put('tasks',t);}for(const f of files.filter(x=>x.planId===planId)){f.planId='';f.itineraryItemId='';await LifeDB.put('files',f);}await LifeDB.remove('plans',planId);state.selectedPlanId=null;closeModal();renderPlans();}};
  document.getElementById('planForm').onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);
    const startDate=f.get('startDate'),endDate=f.get('endDate');
    if(startDate && endDate && endDate<startDate){alert('The end date cannot be before the start date.');return;}
    const record={...p,id:p.id||uid('plan'),title:f.get('title').trim(),type:f.get('type'),startDate,endDate,location:f.get('location').trim(),notes:f.get('notes').trim(),itinerary:p.itinerary||[],checklist:p.checklist||[],links:p.links||[],createdAt:p.createdAt||nowIso(),updatedAt:nowIso()};
    await LifeDB.put('plans',record);closeModal();state.selectedPlanId=record.id;render();
  };
}

async function renderPlanDetail(id) {
  const [plan,tasks,files] = await Promise.all([LifeDB.get('plans',id),LifeDB.getAll('tasks'),LifeDB.getAll('files')]);
  if(!plan){state.selectedPlanId=null;return renderPlans();}
  setTitle(plan.title);
  const linkedTasks=tasks.filter(t=>t.planId===id).sort(sortTasks);
  const linkedFiles=files.filter(f=>f.planId===id).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  const itinerary=sortedItinerary(plan);
  const nextItem=nextItineraryItem(plan);
  const openCount=linkedTasks.filter(t=>t.status!=='done').length;
  const phase=planPhase(plan,openCount);
  const tabs=['overview','tasks','itinerary','checklist','files'];
  const isTrip=plan.type==='trip';
  app.innerHTML=`<div class="back-row"><button id="backPlans">‹ Plans</button></div>
    <section class="plan-hero ${isTrip?`trip-hero ${planThemeClass(plan)}`:''}">
      <div class="trip-hero-top"><div class="trip-hero-icon">${planEmoji(plan.type)}</div><button id="editPlan" class="${isTrip?'trip-edit-btn':'secondary-btn small-btn'}">Edit</button></div>
      <h2>${escapeHtml(plan.title)}</h2>
      <div class="${isTrip?'trip-location':'card-subtitle'}">${escapeHtml(plan.location||'')}</div>
      <div class="${isTrip?'trip-dates':'card-subtitle'}">${[plan.startDate?formatDate(plan.startDate):'',plan.endDate?formatDate(plan.endDate):''].filter(Boolean).join(' — ') || 'No dates set'}</div>
      ${isTrip?`<div class="trip-hero-badges"><span>${escapeHtml(tripCountdownText(plan))}</span><span>${phase.label}</span></div>`:''}
    </section>
    ${isTrip?`<div class="trip-progress"><span class="${phase.key==='planning'?'active':''}">Planning</span><span class="${phase.key==='ready'?'active':''}">Ready</span><span class="${phase.key==='travelling'?'active':''}">Travelling</span><span class="${phase.key==='complete'?'active':''}">Complete</span></div>`:''}
    <div class="plan-tabs">${tabs.map(t=>`<button data-plan-tab="${t}" class="${state.planTab===t?'active':''}">${t==='itinerary'?'Schedule':t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>
    <section id="planTabContent"></section>`;
  document.getElementById('backPlans').onclick=()=>{state.selectedPlanId=null;state.view='plans';render();};
  document.getElementById('editPlan').onclick=()=>openPlanForm(id);
  app.querySelectorAll('[data-plan-tab]').forEach(btn=>btn.onclick=()=>{state.planTab=btn.dataset.planTab;render();});
  const c=document.getElementById('planTabContent');
  if(state.planTab==='overview'){
    c.innerHTML=`
      ${isTrip && nextItem?`<section class="section"><div class="section-head"><h2>Next up</h2><button id="openNextSchedule">Schedule</button></div>${nextUpHtml(nextItem,linkedFiles)}</section>`:''}
      ${isTrip?`<section class="trip-quick-grid">
        <button data-trip-jump="itinerary"><span>🗓️</span><strong>Schedule</strong><small>${itinerary.length} item${itinerary.length===1?'':'s'}</small></button>
        <button data-trip-jump="files"><span>🎟️</span><strong>Tickets & files</strong><small>${linkedFiles.length} stored</small></button>
        <button data-trip-jump="checklist"><span>🧳</span><strong>Packing</strong><small>${(plan.checklist||[]).filter(i=>!i.checked).length} left</small></button>
        <button data-trip-jump="tasks"><span>✓</span><strong>Tasks</strong><small>${openCount} remaining</small></button>
      </section>`:`<div class="grid-2"><div class="mini-card"><div class="metric">${openCount}</div><div class="label">Tasks remaining</div></div><div class="mini-card"><div class="metric">${linkedFiles.length}</div><div class="label">Files attached</div></div></div>`}
      <section class="section"><div class="section-head"><h2>Notes</h2></div><div class="card"><div class="card-subtitle" style="white-space:pre-wrap;color:var(--text)">${plan.notes?escapeHtml(plan.notes):'No notes yet. Use Edit to add an overview, addresses or booking references.'}</div></div></section>
      <section class="section"><div class="section-head"><h2>Next tasks</h2><button id="overviewAddTask">Add</button></div><div class="card">${linkedTasks.filter(t=>t.status!=='done').slice(0,4).map(t=>taskRowHtml(t,[plan])).join('')||'<div class="empty"><strong>No open tasks</strong></div>'}</div></section>`;
    document.getElementById('overviewAddTask').onclick=()=>openTaskForm(null,id); wireTaskRows();
    c.querySelectorAll('[data-trip-jump]').forEach(btn=>btn.onclick=()=>{state.planTab=btn.dataset.tripJump;render();});
    const nextBtn=document.getElementById('openNextSchedule'); if(nextBtn) nextBtn.onclick=()=>{state.planTab='itinerary';render();};
  }
  if(state.planTab==='tasks'){
    c.innerHTML=`<div class="section-head"><h2>${openCount} remaining</h2><button id="planAddTask">Add task</button></div><div class="card">${linkedTasks.length?linkedTasks.map(t=>taskRowHtml(t,[plan])).join(''):'<div class="empty"><strong>No linked tasks</strong><div>Tasks added here also appear in the main Tasks screen.</div></div>'}</div>`;
    document.getElementById('planAddTask').onclick=()=>openTaskForm(null,id); wireTaskRows();
  }
  if(state.planTab==='itinerary'){
    c.innerHTML=`<div class="section-head"><h2>Schedule</h2><button id="addItinerary">Add item</button></div>${itinerary.length?timelineHtml(plan,itinerary,linkedFiles):'<div class="empty"><strong>No schedule yet</strong><div>Add flights, trains, check-ins, ferries, activities or anything time-specific.</div></div>'}`;
    document.getElementById('addItinerary').onclick=()=>openItineraryForm(plan);
    c.querySelectorAll('[data-it-edit]').forEach(btn=>btn.onclick=()=>openItineraryForm(plan,btn.dataset.itEdit));
    c.querySelectorAll('[data-it-delete]').forEach(btn=>btn.onclick=async()=>{
      const itemId=btn.dataset.itDelete;
      if(!confirm('Remove this schedule item? Any attached files will stay in the trip Files area and Vault.')) return;
      plan.itinerary=(plan.itinerary||[]).filter(x=>x.id!==itemId);plan.updatedAt=nowIso();
      for(const f of linkedFiles.filter(f=>f.itineraryItemId===itemId)){f.itineraryItemId='';f.updatedAt=nowIso();await LifeDB.put('files',f);}
      await LifeDB.put('plans',plan);render();
    });
    c.querySelectorAll('[data-it-add-file]').forEach(btn=>btn.onclick=()=>openAttachmentPicker(id,btn.dataset.itAddFile));
    wireFileCards();
  }
  if(state.planTab==='checklist'){
    const items=plan.checklist||[];
    c.innerHTML=`<div class="section-head"><h2>${items.filter(i=>!i.checked).length} remaining</h2></div><div class="card">${items.length?items.map(i=>`<div class="list-item-row ${i.checked?'checked':''}"><input class="task-check" type="checkbox" data-plan-check="${i.id}" ${i.checked?'checked':''}><div class="list-item-text">${escapeHtml(i.text)}</div><button class="text-btn" data-plan-check-delete="${i.id}">×</button></div>`).join(''):'<div class="empty"><strong>No checklist yet</strong><div>Ideal for packing or pre-departure items that do not need to be full tasks.</div></div>'}<form id="planChecklistAdd" class="inline-add"><input name="text" required maxlength="120" placeholder="Add checklist item"><button class="primary-btn">Add</button></form></div>`;
    c.querySelectorAll('[data-plan-check]').forEach(el=>el.onchange=async()=>{const item=items.find(i=>i.id===el.dataset.planCheck);item.checked=el.checked;plan.updatedAt=nowIso();await LifeDB.put('plans',plan);render();});
    c.querySelectorAll('[data-plan-check-delete]').forEach(el=>el.onclick=async()=>{plan.checklist=items.filter(i=>i.id!==el.dataset.planCheckDelete);await LifeDB.put('plans',plan);render();});
    document.getElementById('planChecklistAdd').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);plan.checklist=[...(plan.checklist||[]),{id:uid('check'),text:f.get('text').trim(),checked:false}];plan.updatedAt=nowIso();await LifeDB.put('plans',plan);render();};
  }
  if(state.planTab==='files'){
    c.innerHTML=`<div class="section-head"><h2>${linkedFiles.length} file${linkedFiles.length===1?'':'s'}</h2><button id="planUploadFile">Add file</button></div>${linkedFiles.length?linkedFiles.map(f=>fileCardHtml(f,plan)).join(''):'<div class="empty"><span class="empty-icon">▣</span><strong>No files attached</strong><div>Store PDFs, screenshots, tickets and confirmations locally on this device.</div></div>'}`;
    document.getElementById('planUploadFile').onclick=()=>openAttachmentPicker(id);
    wireFileCards();
  }
}

function nextUpHtml(item,files=[]){
  const attached=files.filter(f=>f.itineraryItemId===item.id);
  const type=inferItineraryType(item);
  return `<div class="next-up-card"><div class="next-up-icon">${itineraryEmoji(type)}</div><div class="next-up-body"><div class="next-up-kicker">${[item.date?formatDate(item.date):'',item.time].filter(Boolean).join(' · ')}</div><div class="next-up-title">${escapeHtml(item.title)}</div>${item.details?`<div class="next-up-details">${escapeHtml(item.details)}</div>`:''}${attached.length?`<div class="next-up-file">📎 ${attached.length} file${attached.length===1?'':'s'} attached</div>`:''}</div></div>`;
}

function timelineHtml(plan,itinerary,files){
  const groups=[];
  for(const item of itinerary){
    const key=item.date||'No date'; let group=groups.find(g=>g.key===key);
    if(!group){group={key,items:[]};groups.push(group);} group.items.push(item);
  }
  return groups.map(group=>{
    let heading='No date';
    if(group.key!=='No date'){
      const dayNo=plan.startDate?Math.max(1,Math.round((new Date(`${group.key}T12:00:00`)-new Date(`${plan.startDate}T12:00:00`))/86400000)+1):null;
      const weekday=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'short'}).format(new Date(`${group.key}T12:00:00`));
      heading=`${dayNo?`Day ${dayNo} · `:''}${weekday}`;
    }
    return `<section class="timeline-day"><div class="timeline-day-title">${escapeHtml(heading)}</div><div class="timeline">${group.items.map(item=>itineraryItemHtml(item,files)).join('')}</div></section>`;
  }).join('');
}

function itineraryItemHtml(item,files){
  const attached=files.filter(f=>f.itineraryItemId===item.id);
  const type=inferItineraryType(item);
  return `<article class="timeline-item">
    <div class="timeline-marker"><span>${itineraryEmoji(type)}</span></div>
    <div class="timeline-content">
      <div class="timeline-time">${escapeHtml(item.time||'Any time')}</div>
      <div class="card-title">${escapeHtml(item.title)}</div>
      ${item.details?`<div class="card-subtitle">${escapeHtml(item.details)}</div>`:''}
      ${attached.length?`<div class="schedule-files">${attached.map(f=>`<button class="schedule-file-chip" data-file-open="${f.id}">📎 ${escapeHtml(f.name)}</button>`).join('')}</div>`:''}
      <div class="schedule-actions"><button class="secondary-btn small-btn" data-it-edit="${item.id}">Edit</button><button class="secondary-btn small-btn" data-it-add-file="${item.id}">📎 Add file</button><button class="text-btn small-btn" data-it-delete="${item.id}">Remove</button></div>
    </div>
  </article>`;
}

function openItineraryForm(plan,itemId=null){
  const existing=itemId?(plan.itinerary||[]).find(x=>x.id===itemId):null;
  const item=existing||{id:'',date:plan.startDate||'',time:'',title:'',details:'',type:'other'};
  const selectedType=inferItineraryType(item);
  showModal(itemId?'Edit schedule item':'Add schedule item',`<form id="itForm" class="form-grid">
    <div class="grid-2"><label>Date<input name="date" type="date" value="${escapeHtml(item.date||'')}"></label><label>Time<input name="time" type="time" value="${escapeHtml(item.time||'')}"></label></div>
    <label>Type<select name="type">${itineraryTypeOptions.map(([value,label])=>`<option value="${value}" ${selectedType===value?'selected':''}>${itineraryEmoji(value)} ${label}</option>`).join('')}</select></label>
    <label>Title<input name="title" required maxlength="100" value="${escapeHtml(item.title||'')}" placeholder="Train to Newcastle"></label>
    <label>Details<textarea name="details" placeholder="Terminal, booking reference, address…">${escapeHtml(item.details||'')}</textarea></label>
    <div class="form-actions"><button type="button" class="secondary-btn" id="cancelIt">Cancel</button><button class="primary-btn">${itemId?'Save changes':'Add'}</button></div>
  </form>`);
  document.getElementById('cancelIt').onclick=closeModal;
  document.getElementById('itForm').onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);
    const record={...item,id:item.id||uid('it'),date:f.get('date'),time:f.get('time'),type:f.get('type'),title:f.get('title').trim(),details:f.get('details').trim()};
    if(existing) plan.itinerary=(plan.itinerary||[]).map(x=>x.id===existing.id?record:x); else plan.itinerary=[...(plan.itinerary||[]),record];
    plan.updatedAt=nowIso();await LifeDB.put('plans',plan);closeModal();render();
  };
}

function fileCardHtml(file,plan=null){
  const icon=file.type?.includes('pdf')?'PDF':file.type?.startsWith('image/')?'IMG':'FILE';
  const itineraryItem=plan && file.itineraryItemId ? (plan.itinerary||[]).find(x=>x.id===file.itineraryItemId) : null;
  return `<div class="card" data-file-card="${file.id}"><div class="file-row"><div class="file-icon">${icon}</div><div><div class="card-title">${escapeHtml(file.name)}</div><div class="card-subtitle">${formatBytes(file.size)} · stored locally</div>${itineraryItem?`<div class="meta"><span class="pill plan">${itineraryEmoji(inferItineraryType(itineraryItem))} ${escapeHtml(itineraryItem.title)}</span></div>`:''}</div></div><div class="card-actions"><button class="secondary-btn small-btn" data-file-open="${file.id}">Open</button><button class="secondary-btn small-btn" data-file-download="${file.id}">Save copy</button><button class="text-btn small-btn" data-file-delete="${file.id}">Delete</button></div></div>`;
}

async function renderVault(){
  setTitle('Vault');
  const [files,plans]=await Promise.all([LifeDB.getAll('files'),LifeDB.getAll('plans')]);
  files.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  app.innerHTML=`<div class="notice">Files in the Vault are stored in this browser’s IndexedDB on this device. They are not uploaded into the GitHub repository.</div><section class="section"><div class="section-head"><h2>${files.length} stored file${files.length===1?'':'s'}</h2><button id="vaultUpload">Add file</button></div>${files.length?files.map(f=>{const p=plans.find(p=>p.id===f.planId);const html=fileCardHtml(f,p);return html.replace('</div></div><div class="card-actions">',`${p?`<div class="meta"><span class="pill plan">✈ ${escapeHtml(p.title)}</span></div>`:''}</div></div><div class="card-actions">`)}).join(''):'<div class="empty"><span class="empty-icon">▣</span><strong>Vault is empty</strong><div>Add a PDF, screenshot, ticket or other useful file.</div></div>'}</section>`;
  document.getElementById('vaultUpload').onclick=()=>openAttachmentPicker();
  wireFileCards();
}

async function storeFiles(fileList,planId='',itineraryItemId=''){
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  for(const file of files){await LifeDB.put('files',{id:uid('file'),name:file.name,type:file.type||'application/octet-stream',size:file.size,blob:file,planId,itineraryItemId,category:'',createdAt:nowIso(),updatedAt:nowIso()});}
  toast(`${files.length} file${files.length===1?'':'s'} stored locally`);render();
}

function openAttachmentPicker(planId='',itineraryItemId=''){
  showModal('Add attachment',`<div class="quick-grid attachment-picker-grid">
    <button class="quick-option" id="attachmentCameraButton"><span>📷</span><strong>Take photo</strong><small>Open the camera for a new photo</small></button>
    <button class="quick-option" id="attachmentGalleryButton"><span>🖼️</span><strong>Choose from gallery</strong><small>Select photos or screenshots</small></button>
    <button class="quick-option" id="attachmentFilesButton"><span>📁</span><strong>Browse files</strong><small>PDFs, email files and text documents</small></button>
  </div>
  <input id="attachmentCameraInput" type="file" hidden accept="image/*" capture="environment">
  <input id="attachmentGalleryInput" type="file" hidden accept="image/*" multiple>
  <input id="attachmentFilesInput" type="file" hidden accept=".pdf,.txt,.eml,application/pdf,text/plain,message/rfc822" multiple>`);

  const bindPicker=(buttonId,inputId)=>{
    const input=document.getElementById(inputId);
    document.getElementById(buttonId).onclick=()=>input.click();
    input.onchange=async e=>{
      const chosen=e.target.files;
      if(!chosen?.length)return;
      closeModal();
      await storeFiles(chosen,planId,itineraryItemId);
    };
  };
  bindPicker('attachmentCameraButton','attachmentCameraInput');
  bindPicker('attachmentGalleryButton','attachmentGalleryInput');
  bindPicker('attachmentFilesButton','attachmentFilesInput');
}

function wireFileCards(){
  app.querySelectorAll('[data-file-open]').forEach(btn=>btn.onclick=async()=>{const f=await LifeDB.get('files',btn.dataset.fileOpen);if(!f)return;const url=URL.createObjectURL(f.blob);const w=window.open(url,'_blank');if(!w){const a=document.createElement('a');a.href=url;a.target='_blank';a.click();}setTimeout(()=>URL.revokeObjectURL(url),60000);});
  app.querySelectorAll('[data-file-download]').forEach(btn=>btn.onclick=async()=>{const f=await LifeDB.get('files',btn.dataset.fileDownload);if(!f)return;const url=URL.createObjectURL(f.blob);const a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});
  app.querySelectorAll('[data-file-delete]').forEach(btn=>btn.onclick=async()=>{if(confirm('Delete this locally stored file?')){await LifeDB.remove('files',btn.dataset.fileDelete);render();}});
}

async function renderInbox(){
  setTitle('Inbox');
  const inbox=(await LifeDB.getAll('inbox')).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  app.innerHTML=`<div class="back-row"><button id="backHome">‹ Home</button></div><div class="notice">Inbox is for quick capture when you do not want to decide where something belongs yet.</div><section class="section">${inbox.length?inbox.map(i=>`<div class="card"><div class="card-title">📝 ${escapeHtml(i.text)}</div><div class="card-subtitle">Added ${new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(i.createdAt))}</div><div class="card-actions"><button class="secondary-btn small-btn" data-inbox-task="${i.id}">Make task</button><button class="text-btn small-btn" data-inbox-delete="${i.id}">Delete</button></div></div>`).join(''):'<div class="empty"><span class="empty-icon">📥</span><strong>Inbox is empty</strong><div>Quick-capture notes here and organise them later.</div></div>'}</section>`;
  document.getElementById('backHome').onclick=()=>setView('home');
  app.querySelectorAll('[data-inbox-delete]').forEach(btn=>btn.onclick=async()=>{await LifeDB.remove('inbox',btn.dataset.inboxDelete);render();});
  app.querySelectorAll('[data-inbox-task]').forEach(btn=>btn.onclick=async()=>{const item=await LifeDB.get('inbox',btn.dataset.inboxTask);await LifeDB.put('tasks',{id:uid('task'),title:item.text,status:'todo',previousStatus:'todo',dueDate:'',planId:'',category:'',notes:'',createdAt:nowIso(),updatedAt:nowIso()});await LifeDB.remove('inbox',item.id);toast('Moved to Tasks');render();});
}

function openInboxCapture(){
  showModal('Add to Inbox',`<form id="inboxForm" class="form-grid"><label>Quick note<textarea name="text" required maxlength="500" placeholder="Something to remember, sort or act on later…"></textarea></label><div class="form-actions"><button type="button" class="secondary-btn" id="cancelInbox">Cancel</button><button class="primary-btn">Add</button></div></form>`);
  document.getElementById('cancelInbox').onclick=closeModal;
  document.getElementById('inboxForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await LifeDB.put('inbox',{id:uid('inbox'),type:'note',text:f.get('text').trim(),createdAt:nowIso(),updatedAt:nowIso()});closeModal();toast('Added to Inbox');if(state.view==='inbox')render();};
}

async function renderSettings(){
  setTitle('Settings');
  let usage='Unavailable', quota='';
  if(navigator.storage?.estimate){const est=await navigator.storage.estimate();usage=formatBytes(est.usage||0);quota=formatBytes(est.quota||0);}
  const persisted=navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  app.innerHTML=`<div class="back-row"><button id="backSettings">‹ Home</button></div>
    <section class="section"><div class="card">
      <div class="settings-row"><h3>App version</h3><p>Running <strong>v${APP_VERSION}</strong> · ${RELEASE_NAME}. Use this to confirm exactly which release Samsung Internet has loaded.</p><button id="checkVersion" class="secondary-btn">Check deployed version</button> <button id="reloadLatest" class="secondary-btn">Reload latest</button></div>
      <div class="settings-row"><h3>Local storage</h3><p>Browser storage currently uses about <strong>${usage}</strong>${quota?` of ${quota} available`:''}. Persistent storage requested: <strong>${persisted?'Yes':'No'}</strong>.</p><button id="requestPersist" class="secondary-btn">Protect local storage</button></div>
      <div class="settings-row"><h3>Encrypted backup</h3><p>Export tasks, lists, plans, Inbox items and attachments into one encrypted <code>.lifedash</code> file. Keep the password safe: it is not recoverable.</p><button id="exportBackup" class="primary-btn">Export everything</button> <button id="importBackup" class="secondary-btn">Restore backup</button><input type="file" id="backupInput" hidden accept=".lifedash,application/octet-stream"></div>
      <div class="settings-row"><h3>Cache controls</h3><p>Clearing the app cache does <strong>not</strong> delete your IndexedDB data or attachments. It only forces the app code to be downloaded again.</p><button id="clearCache" class="secondary-btn">Clear app cache</button></div>
      <div class="settings-row"><h3>Privacy</h3><p>Your personal content is stored locally in this browser profile. Someone opening the public GitHub Pages URL on another device gets a fresh empty dashboard. Clearing site data, uninstalling browser data, or changing phones without a backup can remove local content.</p></div>
    </div></section>`;
  document.getElementById('backSettings').onclick=()=>setView('home');
  document.getElementById('checkVersion').onclick=checkDeployedVersion;
  document.getElementById('reloadLatest').onclick=reloadLatest;
  document.getElementById('requestPersist').onclick=async()=>{if(!navigator.storage?.persist){toast('Persistent storage is not supported by this browser');return;}const ok=await navigator.storage.persist();toast(ok?'Persistent storage granted':'Browser did not grant persistent storage');renderSettings();};
  document.getElementById('clearCache').onclick=async()=>{if(confirm('Clear only the app cache and reload? Your Life Dashboard data will stay in IndexedDB.')){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('life-dashboard-')).map(k=>caches.delete(k)));location.reload();}};
  document.getElementById('exportBackup').onclick=exportEncryptedBackup;
  document.getElementById('importBackup').onclick=()=>document.getElementById('backupInput').click();
  document.getElementById('backupInput').onchange=e=>{if(e.target.files[0])restoreEncryptedBackup(e.target.files[0]);};
}

async function checkDeployedVersion(){
  try{const res=await fetch(`./version.json?t=${Date.now()}`,{cache:'no-store'});const info=await res.json();if(info.version===APP_VERSION)toast(`You are running the deployed v${APP_VERSION}`);else alert(`This phone is running v${APP_VERSION}, but GitHub has v${info.version}. Tap “Reload latest”.`);}catch(e){toast('Could not check GitHub right now');}
}

async function reloadLatest(){
  try{if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const r of regs)await r.update();}const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('life-dashboard-')).map(k=>caches.delete(k)));location.reload();}catch(e){location.reload();}
}

function bytesToBase64(bytes){let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary);}
function base64ToBytes(base64){const binary=atob(base64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
async function blobToBase64(blob){return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));}

async function serialiseBackup(){
  const data=await LifeDB.exportAll();
  data.files=await Promise.all((data.files||[]).map(async f=>({...f,blob:undefined,blobBase64:await blobToBase64(f.blob),blobType:f.type||f.blob?.type||'application/octet-stream'})));
  return {format:'life-dashboard-backup',formatVersion:1,appVersion:APP_VERSION,createdAt:nowIso(),data};
}
async function deserialiseBackup(payload){
  if(payload?.format!=='life-dashboard-backup'||!payload.data)throw new Error('Not a valid Life Dashboard backup');
  const data=payload.data;
  data.files=(data.files||[]).map(f=>({...f,blob:new Blob([base64ToBytes(f.blobBase64||'')],{type:f.blobType||f.type||'application/octet-stream'}),blobBase64:undefined,blobType:undefined}));
  return data;
}

async function deriveKey(password,salt){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

async function exportEncryptedBackup(){
  const password=prompt('Choose a password for this backup. You will need the same password to restore it.');
  if(!password)return;
  if(password.length<6){alert('Please use at least 6 characters.');return;}
  try{
    toast('Preparing encrypted backup…');
    const payload=await serialiseBackup();
    const plain=new TextEncoder().encode(JSON.stringify(payload));
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await deriveKey(password,salt);
    const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
    const wrapper={format:'life-dashboard-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:250000,cipher:'AES-256-GCM',salt:bytesToBase64(salt),iv:bytesToBase64(iv),data:bytesToBase64(cipher)};
    const blob=new Blob([JSON.stringify(wrapper)],{type:'application/octet-stream'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`LifeDashboard-${todayKey()}-v${APP_VERSION}.lifedash`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Encrypted backup created');
  }catch(error){console.error(error);alert(`Backup failed: ${error.message||error}`);}
}

async function restoreEncryptedBackup(file){
  const password=prompt('Enter the password used when this backup was created.');
  if(!password)return;
  try{
    const wrapper=JSON.parse(await file.text());
    if(wrapper.format!=='life-dashboard-encrypted')throw new Error('This is not an encrypted Life Dashboard backup');
    const key=await deriveKey(password,base64ToBytes(wrapper.salt));
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(wrapper.iv)},key,base64ToBytes(wrapper.data));
    const payload=JSON.parse(new TextDecoder().decode(plain));
    const data=await deserialiseBackup(payload);
    if(!confirm(`Restore backup from ${new Date(payload.createdAt).toLocaleString('en-GB')}? This will replace the Life Dashboard data currently stored on this device.`))return;
    await LifeDB.replaceAll(data);toast('Backup restored');setView('home');
  }catch(error){console.error(error);alert('Restore failed. Check the backup file and password.');}
}

function openQuickAdd(){
  showModal('Quick add',`<div class="quick-grid">
    <button class="quick-option" data-quick="task"><span>✓</span><strong>Task</strong><small>Something that needs doing</small></button>
    <button class="quick-option" data-quick="inbox"><span>📥</span><strong>Inbox note</strong><small>Capture now, organise later</small></button>
    <button class="quick-option" data-quick="list"><span>☑</span><strong>List</strong><small>Shopping, packing or checklist</small></button>
    <button class="quick-option" data-quick="plan"><span>✈️</span><strong>Plan</strong><small>Trip, event or project</small></button>
    <button class="quick-option" data-quick="file"><span>▣</span><strong>File</strong><small>PDF, ticket or screenshot</small></button>
  </div>`);
  modalRoot.querySelectorAll('[data-quick]').forEach(btn=>btn.onclick=()=>{
    const q=btn.dataset.quick;
    if(q==='task'){closeModal();openTaskForm();}
    if(q==='inbox'){closeModal();openInboxCapture();}
    if(q==='list'){closeModal();openListForm();}
    if(q==='plan'){closeModal();openPlanForm();}
    if(q==='file'){openAttachmentPicker();}
  });
}

document.querySelectorAll('.nav-item').forEach(btn=>btn.onclick=()=>setView(btn.dataset.view));
document.getElementById('quickAddButton').onclick=openQuickAdd;
document.getElementById('inboxButton').onclick=()=>{state.view='inbox';state.selectedListId=null;state.selectedPlanId=null;document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));render();};
document.getElementById('settingsButton').onclick=()=>{state.view='settings';state.selectedListId=null;state.selectedPlanId=null;document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));render();};

async function init(){
  await LifeDB.open();
  render();
  if('serviceWorker' in navigator){
    try{await navigator.serviceWorker.register('./sw.js');}catch(error){console.warn('Service worker registration failed',error);}
  }
}

init();
