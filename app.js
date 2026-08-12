'use strict';

const APP_VERSION = '2.0.0';
const RELEASE_NAME = 'Life Dashboard V2.0.0';

const state = {
  view: 'home',
  taskFilter: 'today',
  selectedListId: null,
  selectedPlanId: null,
  planTab: 'overview',
  highlightItineraryItemId: null,
  searchQuery: ''
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
function planPhase(plan, openTaskCount, plannedCount=0){
  const today=todayKey();
  if(plan.endDate && plan.endDate < today) return {key:'complete',label:'Complete'};
  if(plan.startDate && plan.startDate <= today && (!plan.endDate || plan.endDate >= today)) return {key:'travelling',label:'Travelling'};
  if(plan.startDate && plan.startDate > today && openTaskCount===0 && plannedCount===0) return {key:'ready',label:'Ready'};
  return {key:'planning',label:'Planning'};
}

function scheduleSortKey(item){
  const date=item.displayDate||item.date||'9999-99-99';
  let time=item.displayTime ?? item.time ?? '';
  if(item.virtualMode==='stay') time='00:00';
  return `${date}T${time||'99:59'}`;
}
function sortedItinerary(plan){return [...(plan.itinerary||[])].sort((a,b)=>scheduleSortKey(a).localeCompare(scheduleSortKey(b)));}
function eachDateInclusive(start,end){
  if(!start||!end||end<start)return [];
  const dates=[]; const cursor=new Date(`${start}T12:00:00`); const finish=new Date(`${end}T12:00:00`);
  while(cursor<=finish){dates.push(cursor.toISOString().slice(0,10));cursor.setDate(cursor.getDate()+1);}
  return dates;
}
function expandedItinerary(plan){
  const entries=[];
  for(const source of sortedItinerary(plan)){
    const type=inferItineraryType(source);
    if(type==='hotel' && source.date && source.endDate && source.endDate>=source.date){
      const dates=eachDateInclusive(source.date,source.endDate);
      if(dates.length===1){entries.push({...source,sourceId:source.id,displayDate:source.date,displayTime:source.time||'',displayTitle:source.title,virtualMode:'hotel'});continue;}
      dates.forEach((date,index)=>{
        const first=index===0,last=index===dates.length-1;
        entries.push({...source,sourceId:source.id,displayDate:date,displayTime:first?(source.time||''):last?(source.endTime||''):'',displayTitle:first?`Check in · ${source.title}`:last?`Check out · ${source.title}`:`Staying at ${source.title}`,virtualMode:first?'checkin':last?'checkout':'stay'});
      });
    } else {
      entries.push({...source,sourceId:source.id,displayDate:source.date||'',displayTime:source.time||'',displayTitle:source.title,virtualMode:''});
    }
  }
  return entries.sort((a,b)=>scheduleSortKey(a).localeCompare(scheduleSortKey(b)));
}
function nextItineraryItem(plan){
  const items=expandedItinerary(plan).filter(x=>x.virtualMode!=='stay');
  if(!items.length) return null;
  const now=new Date();
  return items.find(x=>{
    if(!x.displayDate) return false;
    const dt=new Date(`${x.displayDate}T${x.displayTime||'23:59'}:00`);
    return dt >= now;
  }) || null;
}

function fileDisplayName(file){return file?.displayName?.trim() || file?.name || 'Untitled file';}
function originalFileName(file){return file?.originalName || file?.name || 'file';}
function fileExtension(name){const m=String(name||'').match(/(\.[^./\\]+)$/);return m?m[1]:'';}
function downloadFileName(file){const display=fileDisplayName(file);const ext=fileExtension(originalFileName(file));return ext && !display.toLowerCase().endsWith(ext.toLowerCase()) ? `${display}${ext}` : display;}
function relativeBackupText(value){
  if(!value)return 'No backup created yet';
  const days=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86400000));
  if(days===0)return 'Backed up today';
  if(days===1)return 'Last backup yesterday';
  return `Last backup ${days} days ago`;
}
function itineraryMetaParts(item){
  const type=inferItineraryType(item); const parts=[];
  if(item.from||item.to)parts.push([item.from,item.to].filter(Boolean).join(' → '));
  if(type==='flight' && item.flightNumber)parts.push(`Flight ${item.flightNumber}`);
  if((type==='train'||type==='ferry') && item.serviceNumber)parts.push(item.serviceNumber);
  if(item.arrivalTime)parts.push(`Arrive ${item.arrivalDate&&item.arrivalDate!==item.date?`${formatShortDate(item.arrivalDate)} · `:''}${item.arrivalTime}`);
  if(item.venue)parts.push(item.venue);
  if(item.address)parts.push(item.address);
  if(item.bookingRef)parts.push(`Ref ${item.bookingRef}`);
  return parts;
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

function uniq(values){return [...new Set((values||[]).filter(Boolean))];}
function filePlanIds(file){return uniq([file?.planId,...(file?.planIds||[])]);}
function fileItineraryIds(file){return uniq([file?.itineraryItemId,...(file?.itineraryItemIds||[])]);}
function fileTaskIds(file){return uniq(file?.taskIds||[]);}
function fileLinkedToPlan(file,plan,linkedTasks=[]){
  if(filePlanIds(file).includes(plan.id))return true;
  const itineraryIds=new Set((plan.itinerary||[]).map(i=>i.id));
  if(fileItineraryIds(file).some(id=>itineraryIds.has(id)))return true;
  const taskIds=new Set(linkedTasks.map(t=>t.id));
  return fileTaskIds(file).some(id=>taskIds.has(id));
}
function filesForSchedule(files,itemId){return files.filter(f=>fileItineraryIds(f).includes(itemId));}
function recurrenceLabel(value){return ({daily:'Daily',weekly:'Weekly',monthly:'Monthly',yearly:'Yearly'})[value]||'';}
function nextRecurringDate(date,recurrence){
  if(!date||!recurrence)return date||'';
  const d=new Date(`${date}T12:00:00`);
  if(recurrence==='daily')d.setDate(d.getDate()+1);
  if(recurrence==='weekly')d.setDate(d.getDate()+7);
  if(recurrence==='monthly'){
    const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));
  }
  if(recurrence==='yearly'){
    const month=d.getMonth(),day=d.getDate();d.setDate(1);d.setFullYear(d.getFullYear()+1);d.setMonth(month);const max=new Date(d.getFullYear(),month+1,0).getDate();d.setDate(Math.min(day,max));
  }
  return d.toISOString().slice(0,10);
}
function scheduleMoment(item){
  const date=item.displayDate||item.date||''; if(!date)return null;
  return new Date(`${date}T${item.displayTime||item.time||'23:59'}:00`);
}
function isTripActive(plan){const t=todayKey();return plan.type==='trip'&&!!plan.startDate&&plan.startDate<=t&&(!plan.endDate||plan.endDate>=t);}
function isImageFile(file){return !!file?.type?.startsWith('image/');}
function scheduleStatusLabel(item){return item.bookingStatus==='booked'?'Booked':item.bookingStatus==='planned'?'Planned':'';}

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

function updateFab(){
  const fab=document.getElementById('quickAddButton');
  if(!fab)return;
  fab.hidden=false; fab.textContent='＋';
  const set=(label,handler)=>{fab.setAttribute('aria-label',label);fab.title=label;fab.onclick=handler;};
  if(state.selectedPlanId){
    const planId=state.selectedPlanId;
    if(state.planTab==='itinerary')return set('Add schedule item',async()=>{const plan=await LifeDB.get('plans',planId);if(plan)openItineraryForm(plan);});
    if(state.planTab==='tasks')return set('Add task to this plan',()=>openTaskForm(null,planId));
    if(state.planTab==='files')return set('Add file to this plan',()=>openAttachmentPicker(planId));
    if(state.planTab==='checklist')return set('Add checklist item',()=>openPlanChecklistItem(planId));
    return set('Add task to this plan',()=>openTaskForm(null,planId));
  }
  if(state.selectedListId)return set('Add item to this list',()=>openListItem(state.selectedListId));
  if(state.view==='home')return set('Quick add',openQuickAdd);
  if(state.view==='tasks')return set('Add task',()=>openTaskForm());
  if(state.view==='lists')return set('Create list',()=>openListForm());
  if(state.view==='plans')return set('Create plan',()=>openPlanForm());
  if(state.view==='vault')return set('Add file',()=>openAttachmentPicker());
  if(state.view==='inbox')return set('Add Inbox note',openInboxCapture);
  fab.hidden=true;
}

async function render() {
  updateFab();
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
  const [tasks, lists, plans, files, inbox, backupMeta] = await Promise.all([...['tasks','lists','plans','files','inbox'].map(LifeDB.getAll), LifeDB.get('settings','backupMeta')]);
  const today=todayKey();
  const openTasks=tasks.filter(t=>t.status!=='done');
  const todayTasks=openTasks.filter(t=>t.dueDate&&t.dueDate<=today&&t.status!=='waiting').sort(sortTasks);
  const waiting=openTasks.filter(t=>t.status==='waiting');
  const activeTrip=plans.find(isTripActive)||null;
  const nextPlan=activeTrip||plans.filter(p=>p.endDate?p.endDate>=today:true).sort((a,b)=>(a.startDate||'9999').localeCompare(b.startDate||'9999'))[0];
  const shopping=lists.find(l=>l.type==='shopping')||lists[0];
  const shoppingRemaining=shopping?(shopping.items||[]).filter(i=>!i.checked).length:0;
  const recentFiles=[...files].sort((a,b)=>(b.pinned===true)-(a.pinned===true)||(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,3);
  const dateText=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const todaySchedule=[];
  for(const plan of plans){for(const item of expandedItinerary(plan).filter(i=>(i.displayDate||i.date)===today)){todaySchedule.push({plan,item});}}
  todaySchedule.sort((a,b)=>scheduleSortKey(a.item).localeCompare(scheduleSortKey(b.item)));
  const agendaCount=todayTasks.length+todaySchedule.length;
  const heroTitle=activeTrip?`You’re travelling · ${activeTrip.title}`:agendaCount?`${agendaCount} thing${agendaCount===1?'':'s'} on today`:'You’re all caught up for today';

  app.innerHTML=`
    <section class="hero ${activeTrip?'hero-travel':''}">
      <div class="date">${escapeHtml(dateText)}</div>
      <h2>${escapeHtml(heroTitle)}</h2>
      <p>${activeTrip?'Schedule, tickets and today’s tasks are pulled together below.':inbox.length?`${inbox.length} item${inbox.length===1?'':'s'} are waiting in your Inbox.`:'Your plans, tasks, lists and files stay on this device.'}</p>
      <div class="hero-version">● Running v${APP_VERSION}</div>
    </section>
    <button class="backup-status ${backupMeta?.lastBackupAt&&(Date.now()-new Date(backupMeta.lastBackupAt).getTime())>14*86400000?'stale':''}" id="homeBackupStatus"><span>💾</span><span>${escapeHtml(relativeBackupText(backupMeta?.lastBackupAt))}</span><span>›</span></button>

    ${activeTrip?`<section class="section"><div class="section-head"><h2>Trip today</h2><button data-open-active-trip="${activeTrip.id}">Open trip</button></div><div class="trip-today-strip ${planThemeClass(activeTrip)}"><strong>${escapeHtml(activeTrip.title)}</strong><span>${escapeHtml(activeTrip.location||'')}</span><div><button data-trip-home-jump="itinerary">🗓 Schedule</button><button data-trip-home-jump="files">🎟 Tickets</button></div></div></section>`:''}

    <section class="section">
      <div class="section-head"><h2>Today</h2><button data-home-go="tasks">Tasks</button></div>
      <div class="today-agenda">
        ${todaySchedule.map(({plan,item})=>`<button class="agenda-row" data-home-schedule-plan="${plan.id}" data-home-schedule-id="${item.sourceId||item.id}"><div class="agenda-time">${escapeHtml(item.displayTime||item.time||(item.virtualMode==='stay'?'All day':'Anytime'))}</div><div class="agenda-icon">${itineraryEmoji(inferItineraryType(item))}</div><div><strong>${escapeHtml(item.displayTitle||item.title)}</strong><small>${escapeHtml(plan.title)}${filesForSchedule(files,item.sourceId||item.id).length?` · 📎 ${filesForSchedule(files,item.sourceId||item.id).length}`:''}</small></div><span>›</span></button>`).join('')}
        ${todayTasks.map(t=>`<div class="agenda-task">${taskRowHtml(t,plans)}</div>`).join('')}
        ${!agendaCount?`<div class="empty"><span class="empty-icon">✓</span><strong>Nothing urgent</strong><div>No tasks due and nothing scheduled for today.</div></div>`:''}
      </div>
    </section>

    <section class="section"><div class="grid-2"><button class="mini-card" data-home-go="tasks" style="text-align:left;border:1px solid var(--line)"><div class="metric">${openTasks.length}</div><div class="label">Open tasks</div></button><button class="mini-card" data-home-go="inbox" style="text-align:left;border:1px solid var(--line)"><div class="metric">${inbox.length}</div><div class="label">Inbox items</div></button></div></section>

    ${!activeTrip?`<section class="section"><div class="section-head"><h2>Next up</h2><button data-home-go="plans">View plans</button></div>${nextPlan?planCardHtml(nextPlan,tasks,files):`<div class="empty"><span class="empty-icon">✈️</span><strong>No plans yet</strong><div>Create a trip, event or project when you need one place for everything.</div></div>`}</section>`:''}

    <section class="section"><div class="grid-2"><div class="mini-card"><div class="metric">${waiting.length}</div><div class="label">Waiting for</div></div><div class="mini-card"><div class="metric">${shoppingRemaining}</div><div class="label">${shopping?escapeHtml(shopping.name):'List items'}</div></div></div></section>
    <section class="section"><div class="section-head"><h2>Recent & pinned files</h2><button data-home-go="vault">Open Vault</button></div>${recentFiles.length?recentFiles.map(compactFileHtml).join(''):`<div class="empty"><span class="empty-icon">▣</span><strong>Your Vault is empty</strong><div>PDFs, screenshots and tickets can be stored locally here.</div></div>`}</section>`;

  app.querySelectorAll('[data-home-go]').forEach(el=>el.onclick=()=>setView(el.dataset.homeGo));
  document.getElementById('homeBackupStatus').onclick=()=>{state.view='settings';document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));render();};
  app.querySelectorAll('[data-home-schedule-plan]').forEach(btn=>btn.onclick=()=>{state.selectedPlanId=btn.dataset.homeSchedulePlan;state.planTab='itinerary';state.highlightItineraryItemId=btn.dataset.homeScheduleId;render();});
  const activeBtn=app.querySelector('[data-open-active-trip]');if(activeBtn)activeBtn.onclick=()=>{state.selectedPlanId=activeBtn.dataset.openActiveTrip;state.planTab='overview';render();};
  app.querySelectorAll('[data-trip-home-jump]').forEach(btn=>btn.onclick=()=>{state.selectedPlanId=activeTrip.id;state.planTab=btn.dataset.tripHomeJump;render();});
  wireTaskRows();wirePlanCards();wireFileCards();
}

function sortTasks(a,b) {
  if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
  return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') || (b.createdAt || '').localeCompare(a.createdAt || '');
}

function taskRowHtml(task, plans = []) {
  const plan=plans.find(p=>p.id===task.planId);
  const overdue=task.dueDate&&task.dueDate<todayKey()&&task.status!=='done';
  return `<div class="task-row" data-task-id="${task.id}">
    <input class="task-check" type="checkbox" data-task-toggle="${task.id}" ${task.status==='done'?'checked':''} aria-label="Mark task complete">
    <div class="task-main">
      <div class="task-title ${task.status==='done'?'done':''}">${escapeHtml(task.title)}</div>
      ${task.notes?`<div class="task-notes-preview">${escapeHtml(task.notes)}</div>`:''}
      <div class="meta">
        ${task.dueDate?`<span class="pill ${overdue?'overdue':''}">${overdue?'Overdue · ':''}${formatShortDate(task.dueDate)}</span>`:''}
        ${task.status==='waiting'?`<span class="pill waiting">Waiting</span>`:''}
        ${task.recurrence?`<span class="pill repeat">↻ ${recurrenceLabel(task.recurrence)}</span>`:''}
        ${plan?`<button class="pill plan" style="border:0" data-plan-open="${plan.id}">✈ ${escapeHtml(plan.title)}</button>`:''}
        ${task.category?`<span class="pill">${escapeHtml(task.category)}</span>`:''}
      </div>
    </div>
    <button class="text-btn small-btn" data-task-edit="${task.id}" aria-label="Edit task">•••</button>
  </div>`;
}

async function wireTaskRows() {
  app.querySelectorAll('[data-task-toggle]').forEach(el=>el.onchange=async()=>{
    const task=await LifeDB.get('tasks',el.dataset.taskToggle);if(!task)return;
    if(el.checked&&task.recurrence&&task.dueDate&&task.status!=='done'){
      task.lastCompletedAt=nowIso();task.dueDate=nextRecurringDate(task.dueDate,task.recurrence);task.status='todo';task.previousStatus='todo';task.updatedAt=nowIso();
      await LifeDB.put('tasks',task);toast(`Completed · next due ${formatDate(task.dueDate)}`);render();return;
    }
    const before=task.status;
    task.status=el.checked?'done':(task.previousStatus==='waiting'?'waiting':'todo');
    if(el.checked)task.previousStatus=before==='waiting'?'waiting':'todo';
    task.updatedAt=nowIso();await LifeDB.put('tasks',task);render();
  });
  app.querySelectorAll('[data-task-edit]').forEach(el=>el.onclick=()=>openTaskForm(el.dataset.taskEdit));
  app.querySelectorAll('[data-plan-open]').forEach(el=>el.onclick=e=>{e.stopPropagation();state.selectedPlanId=el.dataset.planOpen;state.planTab='tasks';render();});
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

async function openTaskForm(taskId=null,presetPlanId=null){
  const [plans,existing]=await Promise.all([LifeDB.getAll('plans'),taskId?LifeDB.get('tasks',taskId):Promise.resolve(null)]);
  const task=existing||{title:'',dueDate:'',status:'todo',category:'',planId:presetPlanId||'',notes:'',recurrence:''};
  showModal(taskId?'Edit task':'Add task',`<form id="taskForm" class="form-grid">
    <label>Task<input name="title" required maxlength="140" value="${escapeHtml(task.title)}" placeholder="e.g. Book Tallinn hotel"></label>
    <label>Due date<input name="dueDate" type="date" value="${escapeHtml(task.dueDate||'')}"></label>
    <div class="grid-2"><label>Status<select name="status"><option value="todo" ${task.status==='todo'?'selected':''}>To do</option><option value="waiting" ${task.status==='waiting'?'selected':''}>Waiting for</option><option value="done" ${task.status==='done'?'selected':''}>Complete</option></select></label><label>Repeat<select name="recurrence"><option value="">Does not repeat</option><option value="daily" ${task.recurrence==='daily'?'selected':''}>Daily</option><option value="weekly" ${task.recurrence==='weekly'?'selected':''}>Weekly</option><option value="monthly" ${task.recurrence==='monthly'?'selected':''}>Monthly</option><option value="yearly" ${task.recurrence==='yearly'?'selected':''}>Yearly</option></select></label></div>
    <label>Linked plan<select name="planId"><option value="">None</option>${plans.map(p=>`<option value="${p.id}" ${task.planId===p.id?'selected':''}>${escapeHtml(p.title)}</option>`).join('')}</select></label>
    <label>Category<input name="category" maxlength="60" value="${escapeHtml(task.category||'')}" placeholder="Household, School, Shopping…"></label>
    <label>Notes<textarea name="notes" placeholder="Optional details">${escapeHtml(task.notes||'')}</textarea></label>
    <div class="form-actions">${taskId?`<button type="button" id="deleteTask" class="danger-btn">Delete</button>`:''}<button type="button" class="secondary-btn" id="cancelTask">Cancel</button><button class="primary-btn">Save task</button></div>
  </form>`);
  document.getElementById('cancelTask').onclick=closeModal;
  if(taskId)document.getElementById('deleteTask').onclick=async()=>{if(confirm('Delete this task?')){const fs=await LifeDB.getAll('files');for(const file of fs.filter(f=>fileTaskIds(f).includes(taskId))){file.taskIds=fileTaskIds(file).filter(id=>id!==taskId);file.updatedAt=nowIso();await LifeDB.put('files',file);}await LifeDB.remove('tasks',taskId);closeModal();render();}};
  document.getElementById('taskForm').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.currentTarget);const status=form.get('status');const recurrence=form.get('recurrence')||'';if(recurrence&&!form.get('dueDate')){alert('Recurring tasks need a due date so Life Dashboard knows when the next one should occur.');return;}const record={...task,id:task.id||uid('task'),title:form.get('title').trim(),dueDate:form.get('dueDate'),status,previousStatus:status==='done'?(task.previousStatus||'todo'):status,planId:form.get('planId'),category:form.get('category').trim(),notes:form.get('notes').trim(),recurrence,createdAt:task.createdAt||nowIso(),updatedAt:nowIso()};await LifeDB.put('tasks',record);closeModal();toast('Task saved');render();};
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

async function openListForm(listId=null){
  const [existing,templates]=await Promise.all([listId?LifeDB.get('lists',listId):Promise.resolve(null),LifeDB.getAll('templates')]);
  const list=existing||{name:'',type:'general',items:[]};
  showModal(listId?'Edit list':'Create list',`<form id="listForm" class="form-grid"><label>Name<input name="name" required maxlength="80" value="${escapeHtml(list.name||'')}" placeholder="Tesco, Packing, Christmas ideas…"></label><label>Type<select name="type"><option value="general" ${list.type==='general'?'selected':''}>General checklist</option><option value="shopping" ${list.type==='shopping'?'selected':''}>Shopping / groceries</option></select></label>${!listId&&templates.length?`<label>Start from template <small>(optional)</small><select name="templateId"><option value="">Blank list</option>${templates.filter(t=>t.type==='checklist').map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></label>`:''}<div class="form-actions"><button type="button" class="secondary-btn" id="cancelList">Cancel</button><button class="primary-btn">${listId?'Save changes':'Create list'}</button></div></form>`);
  document.getElementById('cancelList').onclick=closeModal;
  document.getElementById('listForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);let items=list.items||[];if(!listId&&f.get('templateId')){const t=templates.find(x=>x.id===f.get('templateId'));items=(t?.items||[]).map(text=>({id:uid('item'),text,checked:false}));}const record={...list,id:list.id||uid('list'),name:f.get('name').trim(),type:f.get('type'),items,createdAt:list.createdAt||nowIso(),updatedAt:nowIso()};await LifeDB.put('lists',record);closeModal();state.selectedListId=record.id;render();};
}

async function renderListDetail(id){
  const list=await LifeDB.get('lists',id);if(!list){state.selectedListId=null;return renderLists();}
  setTitle(list.name);const items=list.items||[];
  app.innerHTML=`<div class="back-row"><button id="backLists">‹ Lists</button></div><section class="section"><div class="card"><div class="card-row"><div><div class="card-title">${list.type==='shopping'?'🛒':'☑'} ${escapeHtml(list.name)}</div><div class="card-subtitle">${items.filter(i=>!i.checked).length} remaining</div></div><div class="compact-actions"><button id="editList" class="secondary-btn small-btn">Rename</button><button id="saveListTemplate" class="secondary-btn small-btn">Template</button><button id="deleteList" class="text-btn small-btn">Delete</button></div></div><div style="margin-top:10px">${items.length?items.map(item=>`<div class="list-item-row ${item.checked?'checked':''}"><input class="task-check" type="checkbox" data-list-toggle="${item.id}" ${item.checked?'checked':''}><div class="list-item-text">${escapeHtml(item.text)}</div><button class="text-btn" data-list-delete="${item.id}">×</button></div>`).join(''):`<div class="empty"><strong>List is empty</strong><div>Add the first item below.</div></div>`}</div><form id="inlineListAdd" class="inline-add"><input name="text" required maxlength="120" autocomplete="off" placeholder="Add an item"><button class="primary-btn">Add</button></form></div></section>`;
  document.getElementById('backLists').onclick=()=>{state.selectedListId=null;state.view='lists';render();};
  document.getElementById('editList').onclick=()=>openListForm(id);
  document.getElementById('saveListTemplate').onclick=()=>saveChecklistTemplate(list.name,items.map(i=>i.text));
  document.getElementById('deleteList').onclick=async()=>{if(confirm(`Delete “${list.name}”?`)){await LifeDB.remove('lists',id);state.selectedListId=null;renderLists();}};
  app.querySelectorAll('[data-list-toggle]').forEach(el=>el.onchange=async()=>{const item=items.find(i=>i.id===el.dataset.listToggle);item.checked=el.checked;list.updatedAt=nowIso();await LifeDB.put('lists',list);render();});
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

function planCardHtml(plan,tasks=[],files=[]){
  const linkedTasks=tasks.filter(t=>t.planId===plan.id);const remaining=linkedTasks.filter(t=>t.status!=='done').length;
  const fileCount=files.filter(f=>fileLinkedToPlan(f,plan,linkedTasks)).length;const scheduleCount=(plan.itinerary||[]).length;
  const toBook=(plan.itinerary||[]).filter(i=>i.bookingStatus==='planned').length;
  const d=daysUntil(plan.startDate);const timing=d===null?'':d<0?(plan.endDate&&plan.endDate>=todayKey()?'Underway':'Complete'):d===0?'Today':`${d} day${d===1?'':'s'} away`;
  if(plan.type==='trip')return `<button class="trip-list-card ${planThemeClass(plan)}" data-plan-card="${plan.id}" style="width:100%;text-align:left"><div class="trip-list-top"><span class="trip-list-emoji">✈️</span><span class="trip-countdown">${escapeHtml(tripCountdownText(plan))}</span></div><div class="trip-list-title">${escapeHtml(plan.title)}</div><div class="trip-list-subtitle">${[plan.location,plan.startDate?formatDate(plan.startDate):'',plan.endDate?formatDate(plan.endDate):''].filter(Boolean).join(' · ')||'Add dates and destination'}</div><div class="trip-list-stats"><span>✓ ${remaining} to do</span>${toBook?`<span>○ ${toBook} to book</span>`:''}<span>🗓 ${scheduleCount}</span><span>📎 ${fileCount}</span></div></button>`;
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
  if(planId) document.getElementById('deletePlan').onclick=async()=>{if(confirm('Delete this plan? Linked tasks and files will remain but become unlinked.')){const [tasks,files]=await Promise.all([LifeDB.getAll('tasks'),LifeDB.getAll('files')]);const itineraryIds=new Set((p.itinerary||[]).map(i=>i.id));for(const t of tasks.filter(x=>x.planId===planId)){t.planId='';await LifeDB.put('tasks',t);}for(const file of files){file.planIds=filePlanIds(file).filter(id=>id!==planId);file.itineraryItemIds=fileItineraryIds(file).filter(id=>!itineraryIds.has(id));if(file.planId===planId)file.planId='';if(itineraryIds.has(file.itineraryItemId))file.itineraryItemId='';file.updatedAt=nowIso();await LifeDB.put('files',file);}await LifeDB.remove('plans',planId);state.selectedPlanId=null;closeModal();renderPlans();}};
  document.getElementById('planForm').onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);
    const startDate=f.get('startDate'),endDate=f.get('endDate');
    if(startDate && endDate && endDate<startDate){alert('The end date cannot be before the start date.');return;}
    const record={...p,id:p.id||uid('plan'),title:f.get('title').trim(),type:f.get('type'),startDate,endDate,location:f.get('location').trim(),notes:f.get('notes').trim(),itinerary:p.itinerary||[],checklist:p.checklist||[],links:p.links||[],createdAt:p.createdAt||nowIso(),updatedAt:nowIso()};
    await LifeDB.put('plans',record);closeModal();state.selectedPlanId=record.id;render();
  };
}

async function renderPlanDetail(id){
  const [plan,tasks,files]=await Promise.all([LifeDB.get('plans',id),LifeDB.getAll('tasks'),LifeDB.getAll('files')]);if(!plan){state.selectedPlanId=null;return renderPlans();}
  setTitle(plan.title);const linkedTasks=tasks.filter(t=>t.planId===id).sort(sortTasks);const linkedFiles=files.filter(f=>fileLinkedToPlan(f,plan,linkedTasks)).sort((a,b)=>(b.pinned===true)-(a.pinned===true)||(b.createdAt||'').localeCompare(a.createdAt||''));const itinerary=expandedItinerary(plan);const nextItem=nextItineraryItem(plan);const openCount=linkedTasks.filter(t=>t.status!=='done').length;const plannedCount=(plan.itinerary||[]).filter(i=>i.bookingStatus==='planned').length;const phase=planPhase(plan,openCount,plannedCount);const tabs=['overview','tasks','itinerary','checklist','files'];const isTrip=plan.type==='trip';const todayItems=itinerary.filter(i=>(i.displayDate||i.date)===todayKey());
  app.innerHTML=`<div class="back-row"><button id="backPlans">‹ Plans</button></div><section class="plan-hero ${isTrip?`trip-hero ${planThemeClass(plan)}`:''}"><div class="trip-hero-top"><div class="trip-hero-icon">${planEmoji(plan.type)}</div><button id="editPlan" class="${isTrip?'trip-edit-btn':'secondary-btn small-btn'}">Edit</button></div><h2>${escapeHtml(plan.title)}</h2><div class="${isTrip?'trip-location':'card-subtitle'}">${escapeHtml(plan.location||'')}</div><div class="${isTrip?'trip-dates':'card-subtitle'}">${[plan.startDate?formatDate(plan.startDate):'',plan.endDate?formatDate(plan.endDate):''].filter(Boolean).join(' — ')||'No dates set'}</div>${isTrip?`<div class="trip-hero-badges"><span>${escapeHtml(tripCountdownText(plan))}</span><span>${phase.label}</span>${plannedCount?`<span>${plannedCount} to book</span>`:''}</div>`:''}</section>${isTrip?`<div class="trip-progress"><span class="${phase.key==='planning'?'active':''}">Planning</span><span class="${phase.key==='ready'?'active':''}">Ready</span><span class="${phase.key==='travelling'?'active':''}">Travelling</span><span class="${phase.key==='complete'?'active':''}">Complete</span></div>`:''}<div class="plan-tabs">${tabs.map(t=>`<button data-plan-tab="${t}" class="${state.planTab===t?'active':''}">${t==='itinerary'?'Schedule':t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div><section id="planTabContent"></section>`;
  document.getElementById('backPlans').onclick=()=>{state.selectedPlanId=null;state.view='plans';render();};document.getElementById('editPlan').onclick=()=>openPlanForm(id);app.querySelectorAll('[data-plan-tab]').forEach(btn=>btn.onclick=()=>{state.planTab=btn.dataset.planTab;render();});const c=document.getElementById('planTabContent');
  if(state.planTab==='overview'){
    const travelling=phase.key==='travelling';
    c.innerHTML=`${travelling?`<section class="section"><div class="section-head"><h2>Today</h2><button data-trip-jump="itinerary">Full schedule</button></div>${todayItems.length?timelineHtml(plan,todayItems,linkedFiles):`<div class="empty"><strong>Nothing scheduled today</strong><div>Your next scheduled item will appear below.</div></div>`}</section>`:''}${isTrip&&nextItem?`<section class="section"><div class="section-head"><h2>${travelling?'Next':'Next up'}</h2><button id="openNextSchedule">Schedule</button></div>${nextUpHtml(nextItem,linkedFiles)}</section>`:isTrip&&travelling?`<section class="section"><div class="empty"><strong>No more scheduled items</strong><div>You’ve reached the end of the current itinerary.</div></div></section>`:''}${isTrip?`<section class="trip-quick-grid">${travelling?`<button data-trip-jump="files"><span>🎟️</span><strong>Tickets & files</strong><small>${linkedFiles.length} stored</small></button><button data-trip-jump="itinerary"><span>🗓️</span><strong>Schedule</strong><small>${(plan.itinerary||[]).length} items</small></button>`:`<button data-trip-jump="itinerary"><span>🗓️</span><strong>Schedule</strong><small>${(plan.itinerary||[]).length} items</small></button><button data-trip-jump="files"><span>🎟️</span><strong>Tickets & files</strong><small>${linkedFiles.length} stored</small></button>`}<button data-trip-jump="checklist"><span>🧳</span><strong>${travelling?'Checklist':'Packing'}</strong><small>${(plan.checklist||[]).filter(i=>!i.checked).length} left</small></button><button data-trip-jump="tasks"><span>✓</span><strong>Tasks</strong><small>${openCount} remaining</small></button></section>`:`<div class="grid-2"><div class="mini-card"><div class="metric">${openCount}</div><div class="label">Tasks remaining</div></div><div class="mini-card"><div class="metric">${linkedFiles.length}</div><div class="label">Files attached</div></div></div>`}${!travelling&&plannedCount?`<section class="section"><div class="section-head"><h2>Still to book</h2></div><div class="card">${(plan.itinerary||[]).filter(i=>i.bookingStatus==='planned').slice(0,5).map(i=>`<button class="booking-row" data-booking-open="${i.id}"><span>${itineraryEmoji(inferItineraryType(i))}</span><strong>${escapeHtml(i.title)}</strong><span>Planned ›</span></button>`).join('')}</div></section>`:''}<section class="section"><div class="section-head"><h2>Notes</h2></div><div class="card"><div class="card-subtitle" style="white-space:pre-wrap;color:var(--text)">${plan.notes?escapeHtml(plan.notes):'No notes yet. Use Edit to add an overview, addresses or booking references.'}</div></div></section><section class="section"><div class="section-head"><h2>Next tasks</h2><button id="overviewAddTask">Add</button></div><div class="card">${linkedTasks.filter(t=>t.status!=='done').slice(0,4).map(t=>taskRowHtml(t,[plan])).join('')||'<div class="empty"><strong>No open tasks</strong></div>'}</div></section>`;
    document.getElementById('overviewAddTask').onclick=()=>openTaskForm(null,id);wireTaskRows();c.querySelectorAll('[data-trip-jump]').forEach(btn=>btn.onclick=()=>{state.planTab=btn.dataset.tripJump;render();});c.querySelectorAll('[data-booking-open]').forEach(btn=>btn.onclick=()=>{state.planTab='itinerary';state.highlightItineraryItemId=btn.dataset.bookingOpen;render();});const nextBtn=document.getElementById('openNextSchedule');if(nextBtn)nextBtn.onclick=()=>{state.planTab='itinerary';state.highlightItineraryItemId=nextItem?.sourceId||nextItem?.id||null;render();};const nextCard=c.querySelector('[data-next-schedule]');if(nextCard)nextCard.onclick=()=>{state.planTab='itinerary';state.highlightItineraryItemId=nextCard.dataset.nextSchedule;render();};wireFileCards(c);
  }
  if(state.planTab==='tasks'){c.innerHTML=`<div class="section-head"><h2>${openCount} remaining</h2><button id="planAddTask">Add task</button></div><div class="card">${linkedTasks.length?linkedTasks.map(t=>taskRowHtml(t,[plan])).join(''):'<div class="empty"><strong>No linked tasks</strong><div>Tasks added here also appear in the main Tasks screen.</div></div>'}</div>`;document.getElementById('planAddTask').onclick=()=>openTaskForm(null,id);wireTaskRows();}
  if(state.planTab==='itinerary'){
    c.innerHTML=`<div class="section-head"><h2>Schedule</h2><button id="addItinerary">Add item</button></div>${itinerary.length?timelineHtml(plan,itinerary,linkedFiles):'<div class="empty"><strong>No schedule yet</strong><div>Add flights, trains, check-ins, ferries, activities or anything time-specific.</div></div>'}`;document.getElementById('addItinerary').onclick=()=>openItineraryForm(plan);c.querySelectorAll('[data-it-edit]').forEach(btn=>btn.onclick=()=>openItineraryForm(plan,btn.dataset.itEdit));c.querySelectorAll('[data-it-delete]').forEach(btn=>btn.onclick=async()=>{const itemId=btn.dataset.itDelete;if(!confirm('Remove this schedule item? Any attached files will stay in the trip Files area and Vault.'))return;plan.itinerary=(plan.itinerary||[]).filter(x=>x.id!==itemId);plan.updatedAt=nowIso();for(const f of linkedFiles.filter(f=>fileItineraryIds(f).includes(itemId))){f.itineraryItemIds=fileItineraryIds(f).filter(x=>x!==itemId);if(f.itineraryItemId===itemId)f.itineraryItemId='';f.updatedAt=nowIso();await LifeDB.put('files',f);}await LifeDB.put('plans',plan);render();});c.querySelectorAll('[data-it-add-file]').forEach(btn=>btn.onclick=()=>openAttachmentPicker(id,btn.dataset.itAddFile));wireFileCards(c);if(state.highlightItineraryItemId){const targetId=state.highlightItineraryItemId;state.highlightItineraryItemId=null;requestAnimationFrame(()=>{const target=c.querySelector(`[data-it-item="${targetId}"]`);if(target){target.classList.add('schedule-highlight');target.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>target.classList.remove('schedule-highlight'),1800);}});}
  }
  if(state.planTab==='checklist'){
    const items=plan.checklist||[];c.innerHTML=`<div class="section-head"><h2>${items.filter(i=>!i.checked).length} remaining</h2><div class="section-head-actions"><button id="useChecklistTemplate">Use template</button><button id="saveChecklistTemplate">Save template</button></div></div><div class="card">${items.length?items.map(i=>`<div class="list-item-row ${i.checked?'checked':''}"><input class="task-check" type="checkbox" data-plan-check="${i.id}" ${i.checked?'checked':''}><div class="list-item-text">${escapeHtml(i.text)}</div><button class="text-btn" data-plan-check-delete="${i.id}">×</button></div>`).join(''):'<div class="empty"><strong>No checklist yet</strong><div>Use a reusable template or add items below.</div></div>'}<form id="planChecklistAdd" class="inline-add"><input name="text" required maxlength="120" placeholder="Add checklist item"><button class="primary-btn">Add</button></form></div>`;c.querySelectorAll('[data-plan-check]').forEach(el=>el.onchange=async()=>{const item=items.find(i=>i.id===el.dataset.planCheck);item.checked=el.checked;plan.updatedAt=nowIso();await LifeDB.put('plans',plan);render();});c.querySelectorAll('[data-plan-check-delete]').forEach(el=>el.onclick=async()=>{plan.checklist=items.filter(i=>i.id!==el.dataset.planCheckDelete);await LifeDB.put('plans',plan);render();});document.getElementById('planChecklistAdd').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);plan.checklist=[...(plan.checklist||[]),{id:uid('check'),text:f.get('text').trim(),checked:false}];plan.updatedAt=nowIso();await LifeDB.put('plans',plan);render();};document.getElementById('useChecklistTemplate').onclick=()=>openChecklistTemplatePicker(plan);document.getElementById('saveChecklistTemplate').onclick=()=>saveChecklistTemplate(`${plan.title} checklist`,items.map(i=>i.text));
  }
  if(state.planTab==='files'){c.innerHTML=`<div class="section-head"><h2>${linkedFiles.length} file${linkedFiles.length===1?'':'s'}</h2><button id="planUploadFile">Add file</button></div>${linkedFiles.length?linkedFiles.map(f=>fileCardHtml(f,plan,[plan],tasks)).join(''):'<div class="empty"><span class="empty-icon">▣</span><strong>No files attached</strong><div>Add a new file or link one already in your Vault.</div></div>'}`;document.getElementById('planUploadFile').onclick=()=>openAttachmentPicker(id);wireFileCards(c);}
}

function nextUpHtml(item,files=[]){
  const sourceId=item.sourceId||item.id;const attached=filesForSchedule(files,sourceId);const type=inferItineraryType(item);const summary=itineraryMetaParts(item).slice(0,2).join(' · ');
  return `<button type="button" class="next-up-card" data-next-schedule="${sourceId}"><div class="next-up-icon">${itineraryEmoji(type)}</div><div class="next-up-body"><div class="next-up-kicker">${[item.displayDate?formatDate(item.displayDate):'',item.displayTime||'Anytime'].filter(Boolean).join(' · ')}</div><div class="next-up-title">${escapeHtml(item.displayTitle||item.title)}</div>${summary?`<div class="next-up-details">${escapeHtml(summary)}</div>`:item.details?`<div class="next-up-details">${escapeHtml(item.details)}</div>`:''}${attached.length?`<div class="next-up-file">📎 ${attached.length} file${attached.length===1?'':'s'} attached</div>`:''}</div><div class="next-up-chevron">›</div></button>`;
}

function timelineHtml(plan,itinerary,files){
  const groups=[];
  for(const item of itinerary){
    const key=item.displayDate||item.date||'No date'; let group=groups.find(g=>g.key===key);
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
  const sourceId=item.sourceId||item.id;const attached=filesForSchedule(files,sourceId);const type=inferItineraryType(item);const meta=itineraryMetaParts(item);
  return `<article class="timeline-item" data-it-item="${sourceId}"><div class="timeline-marker"><span>${itineraryEmoji(type)}</span></div><div class="timeline-content"><div class="timeline-time">${escapeHtml(item.displayTime||item.time||(item.virtualMode==='stay'?'All day':'Anytime'))}</div><div class="schedule-title-row"><div class="card-title">${escapeHtml(item.displayTitle||item.title)}</div>${(!item.virtualMode||item.virtualMode==='hotel')&&item.bookingStatus?`<span class="booking-pill ${item.bookingStatus==='booked'?'booked':'planned'}">${scheduleStatusLabel(item)}</span>`:''}</div>${meta.length?`<div class="schedule-meta">${meta.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div>`:''}${item.details?`<div class="card-subtitle schedule-note-preview">${escapeHtml(item.details)}</div>`:''}${attached.length?`<div class="schedule-files">${attached.map(f=>`<span class="schedule-file-wrap"><button class="schedule-file-chip" data-file-open="${f.id}">📎 ${escapeHtml(fileDisplayName(f))}</button><button class="schedule-file-rename" data-file-rename="${f.id}" aria-label="Rename ${escapeHtml(fileDisplayName(f))}">✎</button></span>`).join('')}</div>`:''}<div class="schedule-actions"><button class="secondary-btn small-btn" data-it-edit="${sourceId}">Edit</button><button class="secondary-btn small-btn" data-it-add-file="${sourceId}">📎 Add file</button><button class="text-btn small-btn" data-it-delete="${sourceId}">Remove</button></div></div></article>`;
}

function scheduleFieldsHtml(type,item,plan){
  const min=plan.startDate?`min="${escapeHtml(plan.startDate)}"`:'';const max=plan.endDate?`max="${escapeHtml(plan.endDate)}"`:'';const date=item.date||plan.startDate||'';const endDate=item.endDate||'';const arrivalDate=item.arrivalDate||'';
  const commonDateTime=(dateLabel='Date',timeLabel='Time')=>`<div class="grid-2"><label>${dateLabel}<input name="date" type="date" ${min} ${max} value="${escapeHtml(date)}"></label><label>${timeLabel}<input name="time" type="time" value="${escapeHtml(item.time||'')}"></label></div>`;
  const journeyFields=kind=>`${commonDateTime('Travel date','Departure')}<div class="grid-2"><label>From<input name="from" maxlength="100" value="${escapeHtml(item.from||'')}" placeholder="${kind==='flight'?'Airport / city':'Station / place'}"></label><label>To<input name="to" maxlength="100" value="${escapeHtml(item.to||'')}" placeholder="${kind==='flight'?'Airport / city':'Station / place'}"></label></div><div class="grid-2"><label>Arrival date <small>(optional)</small><input name="arrivalDate" type="date" ${min} ${max} value="${escapeHtml(arrivalDate)}"></label><label>Arrival time<input name="arrivalTime" type="time" value="${escapeHtml(item.arrivalTime||'')}"></label></div>${kind==='flight'?`<label>Flight number<input name="flightNumber" maxlength="30" value="${escapeHtml(item.flightNumber||'')}" placeholder="e.g. BA123"></label>`:(kind==='train'||kind==='ferry')?`<label>Service / train number <small>(optional)</small><input name="serviceNumber" maxlength="40" value="${escapeHtml(item.serviceNumber||'')}"></label>`:''}<label>Booking reference <small>(optional)</small><input name="bookingRef" maxlength="80" value="${escapeHtml(item.bookingRef||'')}"></label>`;
  if(type==='hotel')return `<div class="grid-2"><label>Check-in date<input name="date" type="date" ${min} ${max} value="${escapeHtml(date)}"></label><label>Check-in time<input name="time" type="time" value="${escapeHtml(item.time||'')}"></label></div><div class="grid-2"><label>Check-out date<input name="endDate" type="date" ${date?`min="${escapeHtml(date)}"`:min} ${max} value="${escapeHtml(endDate)}"></label><label>Check-out time<input name="endTime" type="time" value="${escapeHtml(item.endTime||'')}"></label></div><label>Address<input name="address" maxlength="180" value="${escapeHtml(item.address||'')}" placeholder="Hotel address"></label><label>Booking reference <small>(optional)</small><input name="bookingRef" maxlength="80" value="${escapeHtml(item.bookingRef||'')}"></label><div class="field-hint">One hotel booking appears across the stay: check-in, staying there, then check-out.</div>`;
  if(type==='flight'||type==='train'||type==='ferry')return journeyFields(type);
  if(type==='drive')return `${commonDateTime('Date','Departure / pickup')}<div class="grid-2"><label>From<input name="from" maxlength="100" value="${escapeHtml(item.from||'')}"></label><label>To<input name="to" maxlength="100" value="${escapeHtml(item.to||'')}"></label></div><label>Arrival time <small>(optional)</small><input name="arrivalTime" type="time" value="${escapeHtml(item.arrivalTime||'')}"></label><label>Booking reference <small>(optional)</small><input name="bookingRef" maxlength="80" value="${escapeHtml(item.bookingRef||'')}"></label>`;
  if(type==='food'||type==='activity')return `${commonDateTime('Date','Start time')}<label>${type==='food'?'Restaurant / venue':'Venue / location'}<input name="venue" maxlength="150" value="${escapeHtml(item.venue||'')}"></label><label>Booking reference <small>(optional)</small><input name="bookingRef" maxlength="80" value="${escapeHtml(item.bookingRef||'')}"></label>`;
  return `${commonDateTime('Date','Time')}<label>Location <small>(optional)</small><input name="venue" maxlength="150" value="${escapeHtml(item.venue||'')}"></label>`;
}

function openItineraryForm(plan,itemId=null){
  const existing=itemId?(plan.itinerary||[]).find(x=>x.id===itemId):null;let draft={...(existing||{id:'',date:plan.startDate||'',time:'',title:'',details:'',type:'other',bookingStatus:'planned'})};let selectedType=inferItineraryType(draft);
  showModal(itemId?'Edit schedule item':'Add schedule item',`<form id="itForm" class="form-grid"><label>Type<select id="itType" name="type">${itineraryTypeOptions.map(([value,label])=>`<option value="${value}" ${selectedType===value?'selected':''}>${itineraryEmoji(value)} ${label}</option>`).join('')}</select></label><label><span id="itTitleLabelText">${selectedType==='hotel'?'Hotel / accommodation name':'Title'}</span><input id="itTitleInput" name="title" required maxlength="100" value="${escapeHtml(draft.title||'')}" placeholder="${selectedType==='hotel'?'Hotel name':'Train to Newcastle'}"></label><label>Booking status<select name="bookingStatus"><option value="planned" ${draft.bookingStatus!=='booked'?'selected':''}>Planned / still to book</option><option value="booked" ${draft.bookingStatus==='booked'?'selected':''}>Booked / confirmed</option></select></label><div id="scheduleDynamicFields"></div><label>Notes <small>(optional)</small><textarea name="details" placeholder="Extra details, instructions or useful notes">${escapeHtml(draft.details||'')}</textarea></label><div class="form-actions"><button type="button" class="secondary-btn" id="cancelIt">Cancel</button><button class="primary-btn">${itemId?'Save changes':'Add'}</button></div></form>`);
  const form=document.getElementById('itForm'),dynamic=document.getElementById('scheduleDynamicFields'),typeSelect=document.getElementById('itType');
  const collectDynamic=()=>{dynamic.querySelectorAll('[name]').forEach(el=>{draft[el.name]=el.value;});draft.title=form.elements.title.value;draft.details=form.elements.details.value;};
  const renderDynamic=()=>{dynamic.innerHTML=scheduleFieldsHtml(typeSelect.value,draft,plan);const dateInput=dynamic.querySelector('[name="date"]'),endInput=dynamic.querySelector('[name="endDate"]'),arrivalInput=dynamic.querySelector('[name="arrivalDate"]');const sync=()=>{if(endInput){endInput.min=dateInput?.value||plan.startDate||'';if(dateInput?.value&&endInput.value&&endInput.value<dateInput.value)endInput.value=dateInput.value;}if(arrivalInput)arrivalInput.min=dateInput?.value||plan.startDate||'';};if(dateInput)dateInput.onchange=sync;sync();};
  renderDynamic();typeSelect.onchange=()=>{collectDynamic();selectedType=typeSelect.value;draft.type=selectedType;document.getElementById('itTitleLabelText').textContent=selectedType==='hotel'?'Hotel / accommodation name':'Title';document.getElementById('itTitleInput').placeholder=selectedType==='hotel'?'Hotel name':'Train to Newcastle';renderDynamic();};document.getElementById('cancelIt').onclick=closeModal;
  form.onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),type=f.get('type'),date=f.get('date')||'',endDate=f.get('endDate')||'',arrivalDate=f.get('arrivalDate')||'',time=f.get('time')||'',arrivalTime=f.get('arrivalTime')||'';
    if(plan.startDate&&date&&date<plan.startDate){alert('This schedule item is before the trip start date.');return;}if(plan.endDate&&date&&date>plan.endDate){alert('This schedule item is after the trip end date.');return;}if(type==='hotel'&&date&&endDate&&endDate<date){alert('Hotel check-out cannot be before check-in.');return;}if(plan.endDate&&endDate&&endDate>plan.endDate){alert('Hotel check-out is after the trip end date.');return;}if(arrivalDate&&date&&arrivalDate<date){alert('Arrival cannot be before departure.');return;}if(plan.endDate&&arrivalDate&&arrivalDate>plan.endDate){alert('Arrival is after the trip end date.');return;}if(arrivalDate&&date&&arrivalDate===date&&time&&arrivalTime&&arrivalTime<time){alert('Arrival time cannot be before departure time on the same date.');return;}
    const record={...draft,id:draft.id||uid('it'),type,title:f.get('title').trim(),details:f.get('details').trim(),bookingStatus:f.get('bookingStatus')||'planned',date,time,endDate,endTime:f.get('endTime')||'',from:f.get('from')||'',to:f.get('to')||'',arrivalDate,arrivalTime,bookingRef:(f.get('bookingRef')||'').trim(),flightNumber:(f.get('flightNumber')||'').trim(),serviceNumber:(f.get('serviceNumber')||'').trim(),address:(f.get('address')||'').trim(),venue:(f.get('venue')||'').trim()};if(existing)plan.itinerary=(plan.itinerary||[]).map(x=>x.id===existing.id?record:x);else plan.itinerary=[...(plan.itinerary||[]),record];plan.updatedAt=nowIso();await LifeDB.put('plans',plan);closeModal();render();
  };
}

function compactFileHtml(file){
  const icon=file.type?.includes('pdf')?'PDF':file.type?.startsWith('image/')?'IMG':'FILE';
  return `<button class="home-file-row" data-file-open="${file.id}"><div class="file-preview">${isImageFile(file)?`<img data-file-thumb="${file.id}" alt="">`:`<div class="file-icon">${icon}</div>`}</div><div><strong>${escapeHtml(fileDisplayName(file))}</strong><small>${file.pinned?'★ Pinned · ':''}${formatBytes(file.size)}</small></div><span>›</span></button>`;
}

function fileCardHtml(file,plan=null,allPlans=[],allTasks=[]){
  const icon=file.type?.includes('pdf')?'PDF':file.type?.startsWith('image/')?'IMG':'FILE';const displayName=fileDisplayName(file),original=originalFileName(file);const plans=allPlans.length?allPlans:(plan?[plan]:[]);const planLinks=plans.filter(p=>filePlanIds(file).includes(p.id)||fileItineraryIds(file).some(id=>(p.itinerary||[]).some(i=>i.id===id)));const taskLinks=allTasks.filter(t=>fileTaskIds(file).includes(t.id));
  return `<div class="card file-card ${file.pinned?'pinned':''}" data-file-card="${file.id}"><div class="file-row"><div class="file-preview">${isImageFile(file)?`<img data-file-thumb="${file.id}" alt="">`:`<div class="file-icon">${icon}</div>`}</div><div><div class="file-title-line"><div class="card-title">${escapeHtml(displayName)}</div>${file.pinned?'<span class="pin-mark">★</span>':''}</div><div class="card-subtitle">${formatBytes(file.size)} · stored locally${displayName!==original?` · Original: ${escapeHtml(original)}`:''}</div>${planLinks.length||taskLinks.length?`<div class="meta">${planLinks.slice(0,3).map(p=>`<span class="pill plan">✈ ${escapeHtml(p.title)}</span>`).join('')}${taskLinks.slice(0,2).map(t=>`<span class="pill">✓ ${escapeHtml(t.title)}</span>`).join('')}</div>`:''}</div></div><div class="card-actions"><button class="secondary-btn small-btn" data-file-open="${file.id}">Open</button><button class="secondary-btn small-btn" data-file-link="${file.id}">Link</button><button class="secondary-btn small-btn" data-file-pin="${file.id}">${file.pinned?'Unpin':'Pin'}</button><button class="secondary-btn small-btn" data-file-rename="${file.id}">Rename</button><button class="secondary-btn small-btn" data-file-download="${file.id}">Save copy</button><button class="text-btn small-btn" data-file-delete="${file.id}">Delete</button></div></div>`;
}

async function renderVault(){
  setTitle('Vault');const [files,plans,tasks]=await Promise.all([LifeDB.getAll('files'),LifeDB.getAll('plans'),LifeDB.getAll('tasks')]);files.sort((a,b)=>(b.pinned===true)-(a.pinned===true)||(b.createdAt||'').localeCompare(a.createdAt||''));
  app.innerHTML=`<div class="notice">Files stay in this device’s IndexedDB. V2 lets one file link to several plans, schedule items and tasks without creating duplicate copies.</div><section class="section"><div class="section-head"><h2>${files.length} stored file${files.length===1?'':'s'}</h2><button id="vaultUpload">Add file</button></div>${files.length?files.map(f=>fileCardHtml(f,null,plans,tasks)).join(''):'<div class="empty"><span class="empty-icon">▣</span><strong>Vault is empty</strong><div>Add a PDF, screenshot, ticket or other useful file.</div></div>'}</section>`;document.getElementById('vaultUpload').onclick=()=>openAttachmentPicker();wireFileCards();
}

async function storeFiles(fileList,planId='',itineraryItemId='',displayNames=[]){
  const files=Array.from(fileList||[]);if(!files.length)return;for(let i=0;i<files.length;i++){const file=files[i],friendly=String(displayNames[i]||'').trim();await LifeDB.put('files',{id:uid('file'),name:file.name,originalName:file.name,displayName:friendly&&friendly!==file.name?friendly:'',type:file.type||'application/octet-stream',size:file.size,blob:file,planId,itineraryItemId,planIds:planId?[planId]:[],itineraryItemIds:itineraryItemId?[itineraryItemId]:[],taskIds:[],pinned:false,category:'',createdAt:nowIso(),updatedAt:nowIso()});}toast(`${files.length} file${files.length===1?'':'s'} stored locally`);render();
}

function openFileNamingForm(fileList,planId='',itineraryItemId=''){
  const files=Array.from(fileList||[]);if(!files.length)return;
  showModal(files.length===1?'Name attachment':'Name attachments',`<form id="fileNameForm" class="form-grid"><div class="field-hint">Give files a useful name now, or leave the original filename unchanged. You can rename them later too.</div>${files.map((file,i)=>`<label>Display name${files.length>1?` ${i+1}`:''}<input name="fileName${i}" maxlength="140" value="${escapeHtml(file.name)}"><small>Original: ${escapeHtml(file.name)}</small></label>`).join('')}<div class="form-actions"><button type="button" class="secondary-btn" id="cancelFileNames">Cancel</button><button class="primary-btn">Store locally</button></div></form>`);
  document.getElementById('cancelFileNames').onclick=closeModal;
  const form=document.getElementById('fileNameForm');
  form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);const names=files.map((_,i)=>f.get(`fileName${i}`));closeModal();await storeFiles(files,planId,itineraryItemId,names);};
}

async function openExistingFilePicker(planId='',itineraryItemId='',taskId=''){
  const files=(await LifeDB.getAll('files')).sort((a,b)=>(b.pinned===true)-(a.pinned===true)||(b.createdAt||'').localeCompare(a.createdAt||''));
  showModal('Link existing file',files.length?`<div class="existing-file-list">${files.map(f=>`<button class="existing-file-choice" data-existing-file="${f.id}"><span>${f.pinned?'★':isImageFile(f)?'🖼️':f.type?.includes('pdf')?'📄':'▣'}</span><div><strong>${escapeHtml(fileDisplayName(f))}</strong><small>${formatBytes(f.size)}</small></div><b>Link</b></button>`).join('')}</div>`:`<div class="empty"><strong>Vault is empty</strong><div>Upload or share a file into Life Dashboard first.</div></div>`);
  modalRoot.querySelectorAll('[data-existing-file]').forEach(btn=>btn.onclick=async()=>{const file=await LifeDB.get('files',btn.dataset.existingFile);if(!file)return;file.planIds=uniq([...filePlanIds(file),planId]);file.itineraryItemIds=uniq([...fileItineraryIds(file),itineraryItemId]);file.taskIds=uniq([...fileTaskIds(file),taskId]);if(planId&&!file.planId)file.planId=planId;if(itineraryItemId&&!file.itineraryItemId)file.itineraryItemId=itineraryItemId;file.updatedAt=nowIso();await LifeDB.put('files',file);closeModal();toast('Existing file linked');render();});
}

function openAttachmentPicker(planId='',itineraryItemId=''){
  showModal('Add attachment',`<div class="quick-grid attachment-picker-grid">
    <button class="quick-option" id="attachmentCameraButton"><span>📷</span><strong>Take photo</strong><small>Open the camera for a new photo</small></button>
    <button class="quick-option" id="attachmentGalleryButton"><span>🖼️</span><strong>Photos & images</strong><small>Ask Android for photos or screenshots</small></button>
    <button class="quick-option" id="attachmentFilesButton"><span>📁</span><strong>Browse files</strong><small>PDFs, email files and text documents</small></button>
    ${planId||itineraryItemId?`<button class="quick-option" id="attachmentExistingButton"><span>🔗</span><strong>Link existing</strong><small>Use a file already stored in your Vault</small></button>`:''}
  </div>
  <div class="share-tip"><strong>Faster from Samsung Gallery</strong><span>If Life Dashboard appears in Android’s Share sheet, you can select a photo in Gallery → Share → Life Dashboard. Shared files land in the Vault and can then be renamed or linked.</span></div>
  <input id="attachmentCameraInput" type="file" hidden accept="image/*" capture="environment">
  <input id="attachmentGalleryInput" type="file" hidden accept="image/*" multiple>
  <input id="attachmentFilesInput" type="file" hidden accept=".pdf,.txt,.eml,image/*,application/pdf,text/plain,message/rfc822" multiple>`);

  const bindPicker=(buttonId,inputId)=>{
    const input=document.getElementById(inputId);
    document.getElementById(buttonId).onclick=()=>{if(typeof input.showPicker==='function'){try{input.showPicker();return;}catch(e){}}input.click();};
    input.onchange=e=>{const chosen=e.target.files;if(!chosen?.length)return;openFileNamingForm(chosen,planId,itineraryItemId);};
  };
  bindPicker('attachmentCameraButton','attachmentCameraInput');
  bindPicker('attachmentGalleryButton','attachmentGalleryInput');
  bindPicker('attachmentFilesButton','attachmentFilesInput');
  const existingButton=document.getElementById('attachmentExistingButton');if(existingButton)existingButton.onclick=()=>openExistingFilePicker(planId,itineraryItemId);
}

async function openFileLinkManager(fileId){
  const [file,plans,tasks]=await Promise.all([LifeDB.get('files',fileId),LifeDB.getAll('plans'),LifeDB.getAll('tasks')]);if(!file)return;
  const existingPlanIds=filePlanIds(file),existingItIds=fileItineraryIds(file),existingTaskIds=fileTaskIds(file);
  const linkSummary=()=>{const rows=[];for(const id of existingPlanIds){const p=plans.find(x=>x.id===id);if(p)rows.push(`<div class="link-row"><span>✈ ${escapeHtml(p.title)}</span><button type="button" data-unlink-type="plan" data-unlink-id="${id}">×</button></div>`);}for(const p of plans){for(const it of p.itinerary||[]){if(existingItIds.includes(it.id))rows.push(`<div class="link-row"><span>${itineraryEmoji(inferItineraryType(it))} ${escapeHtml(it.title)} <small>· ${escapeHtml(p.title)}</small></span><button type="button" data-unlink-type="itinerary" data-unlink-id="${it.id}">×</button></div>`);}}for(const id of existingTaskIds){const t=tasks.find(x=>x.id===id);if(t)rows.push(`<div class="link-row"><span>✓ ${escapeHtml(t.title)}</span><button type="button" data-unlink-type="task" data-unlink-id="${id}">×</button></div>`);}return rows.join('')||'<div class="field-hint">No links yet. The file is only in the global Vault.</div>';};
  showModal('Link file',`<div class="file-link-head"><strong>${escapeHtml(fileDisplayName(file))}</strong><small>One stored file can appear in several useful places.</small></div><div id="existingFileLinks" class="link-list">${linkSummary()}</div><form id="fileLinkForm" class="form-grid"><label>Plan<select id="fileLinkPlan"><option value="">No plan</option>${plans.map(p=>`<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('')}</select></label><label>Schedule item<select id="fileLinkSchedule"><option value="">None</option></select></label><label>Task<select id="fileLinkTask"><option value="">None</option>${tasks.filter(t=>t.status!=='done').map(t=>`<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('')}</select></label><div class="form-actions"><button type="button" class="secondary-btn" id="closeFileLinks">Done</button><button class="primary-btn">Add link</button></div></form>`);
  const planSelect=document.getElementById('fileLinkPlan'),scheduleSelect=document.getElementById('fileLinkSchedule'),taskSelect=document.getElementById('fileLinkTask');const refreshSchedule=()=>{const p=plans.find(x=>x.id===planSelect.value);scheduleSelect.innerHTML='<option value="">None</option>'+((p?.itinerary||[]).map(i=>`<option value="${i.id}">${itineraryEmoji(inferItineraryType(i))} ${escapeHtml(i.title)}</option>`).join(''));};planSelect.onchange=refreshSchedule;refreshSchedule();document.getElementById('closeFileLinks').onclick=closeModal;
  const saveFile=async()=>{file.planIds=uniq(existingPlanIds);file.itineraryItemIds=uniq(existingItIds);file.taskIds=uniq(existingTaskIds);file.planId=file.planIds[0]||'';file.itineraryItemId=file.itineraryItemIds[0]||'';file.updatedAt=nowIso();await LifeDB.put('files',file);};
  document.getElementById('fileLinkForm').onsubmit=async e=>{e.preventDefault();const pId=planSelect.value,itId=scheduleSelect.value,tId=taskSelect.value;if(!pId&&!itId&&!tId){toast('Choose something to link');return;}if(pId&&!existingPlanIds.includes(pId))existingPlanIds.push(pId);if(itId&&!existingItIds.includes(itId))existingItIds.push(itId);if(tId&&!existingTaskIds.includes(tId))existingTaskIds.push(tId);const linkedTask=tasks.find(t=>t.id===tId);if(linkedTask?.planId&&!existingPlanIds.includes(linkedTask.planId))existingPlanIds.push(linkedTask.planId);if(itId){const parent=plans.find(p=>(p.itinerary||[]).some(i=>i.id===itId));if(parent&&!existingPlanIds.includes(parent.id))existingPlanIds.push(parent.id);}await saveFile();closeModal();toast('File linked');render();};
  document.getElementById('existingFileLinks').querySelectorAll('[data-unlink-type]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.unlinkId,type=btn.dataset.unlinkType;if(type==='plan'){const i=existingPlanIds.indexOf(id);if(i>=0)existingPlanIds.splice(i,1);}if(type==='itinerary'){const i=existingItIds.indexOf(id);if(i>=0)existingItIds.splice(i,1);}if(type==='task'){const i=existingTaskIds.indexOf(id);if(i>=0)existingTaskIds.splice(i,1);}await saveFile();closeModal();toast('Link removed');render();});
}

async function openRenameFile(fileId){
  const file=await LifeDB.get('files',fileId);if(!file)return;
  showModal('Rename file',`<form id="renameFileForm" class="form-grid"><label>Display name<input name="displayName" required maxlength="140" value="${escapeHtml(fileDisplayName(file))}"><small>Original file: ${escapeHtml(originalFileName(file))}</small></label><div class="form-actions"><button type="button" class="secondary-btn" id="cancelRenameFile">Cancel</button><button class="primary-btn">Save name</button></div></form>`);
  document.getElementById('cancelRenameFile').onclick=closeModal;
  document.getElementById('renameFileForm').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.currentTarget).get('displayName').trim();file.originalName=file.originalName||file.name;file.displayName=name===file.originalName?'':name;file.updatedAt=nowIso();await LifeDB.put('files',file);closeModal();toast('File renamed');render();};
}

function wireFileCards(root=app){
  root.querySelectorAll('[data-file-thumb]').forEach(async img=>{const f=await LifeDB.get('files',img.dataset.fileThumb);if(!f?.blob)return;const url=URL.createObjectURL(f.blob);img.onload=()=>URL.revokeObjectURL(url);img.src=url;});
  root.querySelectorAll('[data-file-open]').forEach(btn=>btn.onclick=async()=>{const f=await LifeDB.get('files',btn.dataset.fileOpen);if(!f)return;const url=URL.createObjectURL(f.blob);const w=window.open(url,'_blank');if(!w){const a=document.createElement('a');a.href=url;a.target='_blank';a.click();}setTimeout(()=>URL.revokeObjectURL(url),60000);});
  root.querySelectorAll('[data-file-link]').forEach(btn=>btn.onclick=()=>openFileLinkManager(btn.dataset.fileLink));
  root.querySelectorAll('[data-file-pin]').forEach(btn=>btn.onclick=async()=>{const f=await LifeDB.get('files',btn.dataset.filePin);if(!f)return;f.pinned=!f.pinned;f.updatedAt=nowIso();await LifeDB.put('files',f);toast(f.pinned?'File pinned':'File unpinned');render();});
  root.querySelectorAll('[data-file-rename]').forEach(btn=>btn.onclick=()=>openRenameFile(btn.dataset.fileRename));
  root.querySelectorAll('[data-file-download]').forEach(btn=>btn.onclick=async()=>{const f=await LifeDB.get('files',btn.dataset.fileDownload);if(!f)return;const url=URL.createObjectURL(f.blob);const a=document.createElement('a');a.href=url;a.download=downloadFileName(f);a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});
  root.querySelectorAll('[data-file-delete]').forEach(btn=>btn.onclick=async()=>{if(confirm('Delete this locally stored file?')){await LifeDB.remove('files',btn.dataset.fileDelete);render();}});
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

async function openListItem(listId){
  const list=await LifeDB.get('lists',listId);if(!list)return;
  showModal('Add list item',`<form id="listFabForm" class="form-grid"><label>Item<input name="text" required maxlength="120" placeholder="Add item"></label><div class="form-actions"><button type="button" class="secondary-btn" id="cancelListFab">Cancel</button><button class="primary-btn">Add</button></div></form>`);
  document.getElementById('cancelListFab').onclick=closeModal;
  document.getElementById('listFabForm').onsubmit=async e=>{e.preventDefault();const text=new FormData(e.currentTarget).get('text').trim();list.items=[...(list.items||[]),{id:uid('item'),text,checked:false}];list.updatedAt=nowIso();await LifeDB.put('lists',list);closeModal();render();};
}

async function openPlanChecklistItem(planId){
  const plan=await LifeDB.get('plans',planId);if(!plan)return;
  showModal('Add checklist item',`<form id="planFabChecklist" class="form-grid"><label>Item<input name="text" required maxlength="120" placeholder="Add packing or checklist item"></label><div class="form-actions"><button type="button" class="secondary-btn" id="cancelPlanFabChecklist">Cancel</button><button class="primary-btn">Add</button></div></form>`);
  document.getElementById('cancelPlanFabChecklist').onclick=closeModal;
  document.getElementById('planFabChecklist').onsubmit=async e=>{e.preventDefault();const text=new FormData(e.currentTarget).get('text').trim();plan.checklist=[...(plan.checklist||[]),{id:uid('check'),text,checked:false}];plan.updatedAt=nowIso();await LifeDB.put('plans',plan);closeModal();render();};
}

async function saveChecklistTemplate(defaultName,items){
  const clean=(items||[]).map(x=>String(x||'').trim()).filter(Boolean);if(!clean.length){toast('Add at least one checklist item first');return;}
  showModal('Save checklist template',`<form id="templateSaveForm" class="form-grid"><label>Template name<input name="name" required maxlength="80" value="${escapeHtml(defaultName||'Checklist')}"></label><div class="field-hint">${clean.length} item${clean.length===1?'':'s'} will be saved as a reusable local template.</div><div class="form-actions"><button type="button" class="secondary-btn" id="cancelTemplateSave">Cancel</button><button class="primary-btn">Save template</button></div></form>`);document.getElementById('cancelTemplateSave').onclick=closeModal;document.getElementById('templateSaveForm').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.currentTarget).get('name').trim();await LifeDB.put('templates',{id:uid('template'),type:'checklist',name,items:clean,createdAt:nowIso(),updatedAt:nowIso()});closeModal();toast('Template saved');};
}
async function openChecklistTemplatePicker(plan){
  const templates=(await LifeDB.getAll('templates')).filter(t=>t.type==='checklist').sort((a,b)=>a.name.localeCompare(b.name));
  showModal('Use checklist template',templates.length?`<div class="template-list">${templates.map(t=>`<button class="template-choice" data-template-use="${t.id}"><div><strong>${escapeHtml(t.name)}</strong><small>${(t.items||[]).length} items</small></div><span>›</span></button>`).join('')}</div>`:`<div class="empty"><strong>No templates yet</strong><div>Save any list or trip checklist as a template first.</div></div>`);
  modalRoot.querySelectorAll('[data-template-use]').forEach(btn=>btn.onclick=async()=>{const t=templates.find(x=>x.id===btn.dataset.templateUse);if(!t)return;const existing=new Set((plan.checklist||[]).map(i=>i.text.toLowerCase()));const additions=(t.items||[]).filter(text=>!existing.has(text.toLowerCase())).map(text=>({id:uid('check'),text,checked:false}));plan.checklist=[...(plan.checklist||[]),...additions];plan.updatedAt=nowIso();await LifeDB.put('plans',plan);closeModal();toast(`${additions.length} checklist item${additions.length===1?'':'s'} added`);render();});
}

async function openTemplateManager(){
  const templates=(await LifeDB.getAll('templates')).filter(t=>t.type==='checklist').sort((a,b)=>a.name.localeCompare(b.name));
  showModal('Checklist templates',templates.length?`<div class="template-list">${templates.map(t=>`<div class="template-manage-row"><div><strong>${escapeHtml(t.name)}</strong><small>${(t.items||[]).length} items</small></div><button class="text-btn" data-template-delete="${t.id}">Delete</button></div>`).join('')}</div>`:`<div class="empty"><strong>No templates saved</strong><div>Save a list or trip checklist as a template.</div></div>`);
  modalRoot.querySelectorAll('[data-template-delete]').forEach(btn=>btn.onclick=async()=>{if(confirm('Delete this checklist template?')){await LifeDB.remove('templates',btn.dataset.templateDelete);closeModal();toast('Template deleted');renderSettings();}});
}

async function renderSettings(){
  setTitle('Settings');
  let usage='Unavailable', quota='';
  if(navigator.storage?.estimate){const est=await navigator.storage.estimate();usage=formatBytes(est.usage||0);quota=formatBytes(est.quota||0);}
  const persisted=navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const [backupMeta,templates]=await Promise.all([LifeDB.get('settings','backupMeta'),LifeDB.getAll('templates')]);
  app.innerHTML=`<div class="back-row"><button id="backSettings">‹ Home</button></div>
    <section class="section"><div class="card">
      <div class="settings-row"><h3>App version</h3><p>Running <strong>v${APP_VERSION}</strong> · ${RELEASE_NAME}. Use this to confirm exactly which release Samsung Internet has loaded.</p><button id="checkVersion" class="secondary-btn">Check deployed version</button> <button id="reloadLatest" class="secondary-btn">Reload latest</button></div>
      <div class="settings-row"><h3>Local storage</h3><p>Browser storage currently uses about <strong>${usage}</strong>${quota?` of ${quota} available`:''}. Persistent storage requested: <strong>${persisted?'Yes':'No'}</strong>.</p><button id="requestPersist" class="secondary-btn">Protect local storage</button></div>
      <div class="settings-row"><h3>Encrypted backup</h3><p><strong>${escapeHtml(relativeBackupText(backupMeta?.lastBackupAt))}</strong>. Export tasks, lists, plans, templates, Inbox items and attachments into one encrypted <code>.lifedash</code> file. Keep the password safe: it is not recoverable.</p><button id="exportBackup" class="primary-btn">Export everything</button> <button id="importBackup" class="secondary-btn">Restore backup</button><input type="file" id="backupInput" hidden accept=".lifedash,application/octet-stream"></div>
      <div class="settings-row"><h3>Cache controls</h3><p>Clearing the app cache does <strong>not</strong> delete your IndexedDB data or attachments. It only forces the app code to be downloaded again.</p><button id="clearCache" class="secondary-btn">Clear app cache</button></div>
      <div class="settings-row"><h3>Checklist templates</h3><p><strong>${templates.length}</strong> reusable template${templates.length===1?'':'s'} stored locally.</p><button id="manageTemplates" class="secondary-btn">Manage templates</button></div>
      <div class="settings-row"><h3>Data model</h3><p>Database schema <strong>v${LifeDB.DB_VERSION}</strong>. V2 adds a templates store and connected file-link metadata while migrating your existing V1 data in place.</p></div><div class="settings-row"><h3>Privacy</h3><p>Your personal content is stored locally in this browser profile. Someone opening the public GitHub Pages URL on another device gets a fresh empty dashboard. Clearing site data, uninstalling browser data, or changing phones without a backup can remove local content.</p></div>
    </div></section>`;
  document.getElementById('backSettings').onclick=()=>setView('home');
  document.getElementById('checkVersion').onclick=checkDeployedVersion;
  document.getElementById('reloadLatest').onclick=reloadLatest;
  document.getElementById('requestPersist').onclick=async()=>{if(!navigator.storage?.persist){toast('Persistent storage is not supported by this browser');return;}const ok=await navigator.storage.persist();toast(ok?'Persistent storage granted':'Browser did not grant persistent storage');renderSettings();};
  document.getElementById('manageTemplates').onclick=openTemplateManager;
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
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`LifeDashboard-${todayKey()}-v${APP_VERSION}.lifedash`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    await LifeDB.put('settings',{id:'backupMeta',lastBackupAt:nowIso(),lastBackupVersion:APP_VERSION});toast('Encrypted backup created');
    if(state.view==='settings')renderSettings();
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

async function openGlobalSearch(){
  showModal('Search Life Dashboard',`<div class="search-box"><span>⌕</span><input id="globalSearchInput" type="search" autocomplete="off" placeholder="Search tasks, trips, schedule, files, lists…" value="${escapeHtml(state.searchQuery||'')}"></div><div id="globalSearchResults" class="search-results"><div class="empty"><strong>Search everything stored locally</strong><div>Try a place, booking name, task, note or filename.</div></div></div>`);
  const input=document.getElementById('globalSearchInput'),results=document.getElementById('globalSearchResults');
  const run=async()=>{const q=input.value.trim().toLowerCase();state.searchQuery=input.value;if(q.length<2){results.innerHTML='<div class="empty"><strong>Type at least 2 characters</strong></div>';return;}const [tasks,plans,lists,files,inbox,templates]=await Promise.all(['tasks','plans','lists','files','inbox','templates'].map(LifeDB.getAll));const hits=[];const match=(...parts)=>parts.filter(Boolean).join(' ').toLowerCase().includes(q);
    for(const t of tasks)if(match(t.title,t.notes,t.category))hits.push({type:'task',id:t.id,title:t.title,sub:'Task',icon:'✓'});
    for(const p of plans){if(match(p.title,p.location,p.notes))hits.push({type:'plan',id:p.id,title:p.title,sub:`${planEmoji(p.type)} Plan`,icon:planEmoji(p.type)});for(const it of p.itinerary||[])if(match(it.title,it.details,it.from,it.to,it.venue,it.address,it.bookingRef))hits.push({type:'schedule',id:it.id,planId:p.id,title:it.title,sub:`Schedule · ${p.title}`,icon:itineraryEmoji(inferItineraryType(it))});}
    for(const l of lists)if(match(l.name,...(l.items||[]).map(i=>i.text)))hits.push({type:'list',id:l.id,title:l.name,sub:'List',icon:l.type==='shopping'?'🛒':'☑'});
    for(const f of files)if(match(fileDisplayName(f),originalFileName(f),f.category))hits.push({type:'file',id:f.id,title:fileDisplayName(f),sub:'Vault file',icon:f.pinned?'★':'▣'});
    for(const i of inbox)if(match(i.text))hits.push({type:'inbox',id:i.id,title:i.text,sub:'Inbox',icon:'📥'});
    for(const t of templates)if(match(t.name,...(t.items||[])))hits.push({type:'template',id:t.id,title:t.name,sub:'Checklist template',icon:'♻'});
    results.innerHTML=hits.length?hits.slice(0,40).map((h,i)=>`<button class="search-result" data-search-index="${i}"><span>${h.icon}</span><div><strong>${escapeHtml(h.title)}</strong><small>${escapeHtml(h.sub)}</small></div><b>›</b></button>`).join(''):`<div class="empty"><strong>No matches</strong><div>Nothing in Life Dashboard contains “${escapeHtml(input.value.trim())}”.</div></div>`;
    results.querySelectorAll('[data-search-index]').forEach(btn=>btn.onclick=async()=>{const h=hits[Number(btn.dataset.searchIndex)];closeModal();if(h.type==='task')return openTaskForm(h.id);if(h.type==='plan'){state.selectedPlanId=h.id;state.planTab='overview';return render();}if(h.type==='schedule'){state.selectedPlanId=h.planId;state.planTab='itinerary';state.highlightItineraryItemId=h.id;return render();}if(h.type==='list'){state.selectedListId=h.id;return render();}if(h.type==='file'){const f=await LifeDB.get('files',h.id);if(f){const url=URL.createObjectURL(f.blob);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000);}return;}if(h.type==='inbox'){state.view='inbox';return render();}if(h.type==='template'){state.view='lists';return render();}});
  };
  input.oninput=()=>{clearTimeout(input._timer);input._timer=setTimeout(run,120);};requestAnimationFrame(()=>{input.focus();if(input.value)run();});
}

document.querySelectorAll('.nav-item').forEach(btn=>btn.onclick=()=>setView(btn.dataset.view));
document.getElementById('quickAddButton').onclick=openQuickAdd;
document.getElementById('searchButton').onclick=openGlobalSearch;
document.getElementById('inboxButton').onclick=()=>{state.view='inbox';state.selectedListId=null;state.selectedPlanId=null;document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));render();};
document.getElementById('settingsButton').onclick=()=>{state.view='settings';state.selectedListId=null;state.selectedPlanId=null;document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));render();};

async function init(){
  await LifeDB.open();
  const schemaMeta=await LifeDB.get('settings','schemaMeta');if(!schemaMeta||schemaMeta.version!==LifeDB.DB_VERSION)await LifeDB.put('settings',{id:'schemaMeta',version:LifeDB.DB_VERSION,migratedAt:nowIso(),appVersion:APP_VERSION});
  const params=new URLSearchParams(location.search);const shared=params.get('shared');if(shared){history.replaceState({},'',location.pathname+location.hash);}
  render();
  if(shared)setTimeout(()=>toast(shared==='files'?'Shared file added to Vault':'Shared item added to Life Dashboard'),500);
  if('serviceWorker' in navigator){
    try{await navigator.serviceWorker.register('./sw.js');}catch(error){console.warn('Service worker registration failed',error);}
  }
}

init();
