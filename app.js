(() => {
  const KEY = 'matwork-journal-v2';
  const LEGACY_KEY = 'matwork-journal-v1';
  const blankJournal = name => ({ id: crypto.randomUUID(), name: name || '', sessions: [], milestones: [], reflections: [] });
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanName = value => String(value || '').trim().replace(/[^a-zA-ZÀ-ÿ' -]/g, '').slice(0, 30);
  function normalizeJournal(value = {}) {
    return { ...blankJournal(cleanName(value.name)), ...value, id: value.id || crypto.randomUUID(), name: cleanName(value.name), sessions: Array.isArray(value.sessions) ? value.sessions : [], milestones: Array.isArray(value.milestones) ? value.milestones : [], reflections: Array.isArray(value.reflections) ? value.reflections : [], lessons: Array.isArray(value.lessons) ? value.lessons : [], practiceItems: Array.isArray(value.practiceItems) ? value.practiceItems : [] };
  }
  function readStore() {
    try {
      const current = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (current?.format === 'matwork-profiles-v1' && Array.isArray(current.profiles) && current.profiles.length) {
        const profiles = current.profiles.map(normalizeJournal);
        return { profiles, activeProfileId: profiles.some(p => p.id === current.activeProfileId) ? current.activeProfileId : profiles[0].id };
      }
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      const profile = normalizeJournal(old || {});
      return { profiles: [profile], activeProfileId: profile.id };
    } catch {
      const profile = blankJournal();
      return { profiles: [profile], activeProfileId: profile.id };
    }
  }
  let store = readStore();
  let data = store.profiles.find(p => p.id === store.activeProfileId) || store.profiles[0];
  let renamingProfileId = '';
  const save = () => { store.activeProfileId = data.id; localStorage.setItem(KEY, JSON.stringify({ format: 'matwork-profiles-v1', ...store })); };
  const todayISO = () => new Date().toLocaleDateString('en-CA');
  const niceDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) : '';
  const symbols = { 'Wrestling practice':'◈', 'Private lesson':'◎', 'Strength training':'↗', 'Strength':'↗', Conditioning:'⌁', 'Recovery / mobility':'◌', Recovery:'◌', Competition:'✳' };
  const toast = msg => { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400); };
  $('#today').textContent = new Date().toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }).toUpperCase();
  $('#reflection-date').value = todayISO(); $('#entry-date').value = todayISO(); $('#milestone-date').value = todayISO();
  function renderProfile() {
    const name = String(data.name || '').trim();
    const profileNumber = store.profiles.indexOf(data) + 1;
    $('#profile-name').textContent = name || `Athlete ${profileNumber}`;
    $('#profile-avatar').textContent = name ? name[0].toUpperCase() : 'A';
    $('.welcome-row h1').innerHTML = `${name ? `${escapeHTML(name)}’s` : 'Your'} journey<span class="period">.</span>`;
    $('#profile-list').innerHTML = store.profiles.map((profile, index) => `<div class="profile-row ${profile.id === data.id ? 'selected' : ''}"><button class="profile-select" type="button" data-switch-profile="${escapeHTML(profile.id)}"><span class="avatar">${escapeHTML(profile.name ? profile.name[0].toUpperCase() : 'A')}</span><span><b>${escapeHTML(profile.name || `Athlete ${index + 1}`)}</b><small>${profile.id === data.id ? 'Currently selected' : 'Local profile'}</small></span></button>${renamingProfileId === profile.id ? `<div class="profile-rename-editor"><input data-profile-name maxlength="30" value="${escapeHTML(profile.name)}" aria-label="First name"><button type="button" data-save-profile="${escapeHTML(profile.id)}">Save</button><button type="button" data-cancel-profile aria-label="Cancel rename">×</button></div>` : `<button class="profile-rename" type="button" data-rename-profile="${escapeHTML(profile.id)}">${profile.name ? 'Rename' : 'Add name'}</button>`}</div>`).join('');
  }
  renderProfile();
  const views = ['home','training','lessons','milestones','mindset'];
  function navigate(view) {
    if (!views.includes(view)) view = 'home';
    $$('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
    $$('.nav-link').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    $('#crumb').textContent = ({home:'OVERVIEW',training:'TRAINING LOG',lessons:'LESSONS & PLANS',milestones:'MILESTONES',mindset:'MINDSET'})[view];
    history.replaceState(null, '', `#${view}`); window.scrollTo({ top:0, behavior:'smooth' });
  }
  $$('[data-view]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.view); }));
  $$('[data-go]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.go); }));
  if (location.hash) navigate(location.hash.slice(1));
  function entryMarkup(item, full = false) {
    const cls = item.type.toLowerCase().includes('strength') ? 'strength' : item.type === 'Competition' ? 'competition' : '';
    return `<div class="entry-row"><div class="entry-icon ${cls}">${symbols[item.type] || '◈'}</div><div class="entry-info"><b>${escapeHTML(item.focus || item.type)}</b><small>${escapeHTML(item.type)}${item.duration ? ` · ${item.duration} min` : ''}${full && item.note ? ` · ${escapeHTML(item.note)}` : ''}</small>${full && item.focus && item.focus !== item.type ? `<div class="entry-detail">${escapeHTML(item.focus)}</div>` : ''}</div><time class="entry-date">${niceDate(item.date)}</time>${full ? `<button class="entry-actions" data-delete-session="${escapeHTML(item.id)}" title="Delete session" aria-label="Delete session">×</button>`:''}</div>`;
  }
  function render() {
    const sessions = [...data.sessions].sort((a,b) => b.date.localeCompare(a.date));
    const milestones = [...data.milestones].sort((a,b) => b.date.localeCompare(a.date));
    $('#stat-sessions').textContent = sessions.length;
    $('#stat-hours').textContent = Math.floor(sessions.reduce((n,x) => n + (Number(x.duration)||0), 0) / 60);
    $('#stat-milestones').textContent = milestones.length;
    const weeks = Array(7).fill(0);
    sessions.forEach(s => { const days = (Date.now() - new Date(`${s.date}T12:00:00`).getTime()) / 864e5; if (days >= 0 && days < 49) weeks[6-Math.floor(days/7)]++; });
    const max = Math.max(1,...weeks);
    $('#session-bars').innerHTML = weeks.map((v,i)=>`<i title="${v} sessions" style="--h:${Math.max(5, (v/max)*29)}px"></i>`).join('');
    $('#hours-line').style.width = `${Math.min(100, (sessions.reduce((n,x)=>n+(Number(x.duration)||0),0)/1800)*100)}%`;
    $('#recent-list').innerHTML = sessions.length ? sessions.slice(0,3).map(x=>entryMarkup(x)).join('') : '<div class="empty-state">Your story starts with showing up.<br>Log the first session to begin building your season.</div>';
    const filter = $('.filter.active')?.dataset.filter || 'all';
    const shown = filter === 'all' ? sessions : sessions.filter(x => filter === 'strength' ? x.type.toLowerCase().includes('strength') : filter === 'recovery' ? /recovery|mobility/i.test(x.type) : /wrestling|private|competition/i.test(x.type));
    $('#training-list').innerHTML = shown.length ? shown.map(x=>entryMarkup(x,true)).join('') : '<div class="empty-state">No sessions here yet.<br>Each entry helps tell the whole story.</div>';
    $('#milestone-list').innerHTML = milestones.length ? milestones.map(m=>`<article class="milestone-card"><button data-delete-milestone="${escapeHTML(m.id)}" title="Delete milestone" aria-label="Delete milestone">×</button><span class="category">${escapeHTML(m.category.toUpperCase())}</span><h4>${escapeHTML(m.title)}</h4><p>${escapeHTML(m.note)}</p><time>${niceDate(m.date)}</time></article>`).join('') : '<div class="empty-state" style="grid-column:1/-1;background:#fff;border:1px solid #ecefe9;border-radius:11px;padding:42px">Your milestones will live here.<br>Start with a first, a breakthrough, or a moment you are proud of.</div>';
    $('#reflection-list').innerHTML = [...data.reflections].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<div class="reflection-item"><time>${niceDate(r.date)}</time><p>${escapeHTML(r.text)}</p><small>${escapeHTML(r.mood)}</small></div>`).join('');
    $('#lesson-list').innerHTML = [...data.lessons].sort((a,b)=>b.date.localeCompare(a.date)).map(lesson=>`<article class="lesson-card"><div class="lesson-card-top"><div><span class="category">${niceDate(lesson.date)}${lesson.coach ? ` · ${escapeHTML(lesson.coach)}` : ''}</span><h4>${escapeHTML(lesson.title)}</h4></div><button class="entry-actions" data-delete-lesson="${escapeHTML(lesson.id)}" title="Delete lesson" aria-label="Delete lesson">×</button></div>${lesson.cues ? `<div class="lesson-section"><b>COACH CUES</b><p>${escapeHTML(lesson.cues)}</p></div>` : ''}${lesson.priorities ? `<div class="lesson-section"><b>DEVELOPMENT PRIORITIES</b><p>${escapeHTML(lesson.priorities)}</p></div>` : ''}${lesson.parentNotes ? `<div class="lesson-section parent-summary"><b>PARENT SUMMARY / INTERPRETATION</b><p>${escapeHTML(lesson.parentNotes)}</p></div>` : ''}</article>`).join('') || '<div class="empty-state">No lessons yet.<br>Capture the instruction so the next session can build on it.</div>';
    const lessonOptions = [...data.lessons].sort((a,b)=>b.date.localeCompare(a.date)).map(lesson=>`<option value="${escapeHTML(lesson.id)}">${escapeHTML(lesson.title)} · ${niceDate(lesson.date)}</option>`).join('');
    $('#practice-lesson').innerHTML = '<option value="">No lesson selected</option>' + lessonOptions;
    $('#practice-list').innerHTML = [...data.practiceItems].sort((a,b)=>Number(a.complete)-Number(b.complete)||a.createdAt.localeCompare(b.createdAt)).map(item=>`<div class="practice-item ${item.complete?'complete':''}"><input type="checkbox" data-complete-practice="${escapeHTML(item.id)}" aria-label="Mark ${escapeHTML(item.title)} complete" ${item.complete?'checked':''}><span class="practice-item-copy"><b>${escapeHTML(item.title)}</b>${item.details?`<small>${escapeHTML(item.details)}</small>`:''}<span class="practice-meta"><i>${escapeHTML(item.source)}</i> · For ${item.audience === 'Wrestler' ? 'Athlete' : escapeHTML(item.audience)}${item.lessonId ? ` · ${escapeHTML(data.lessons.find(l=>l.id===item.lessonId)?.title || 'Lesson')}` : ''}${item.completeAt?` · Done ${niceDate(item.completeAt.slice(0,10))}`:''}</span></span><button type="button" class="entry-actions" data-delete-practice="${escapeHTML(item.id)}" title="Remove checklist item" aria-label="Remove checklist item">×</button></div>`).join('') || '<div class="empty-state">The checklist is ready for coach assignments and parent recommendations.</div>';
    $$('[data-delete-session]').forEach(b=>b.addEventListener('click',()=>{data.sessions=data.sessions.filter(x=>x.id!==b.dataset.deleteSession);save();render();toast('Session removed');}));
    $$('[data-delete-milestone]').forEach(b=>b.addEventListener('click',()=>{data.milestones=data.milestones.filter(x=>x.id!==b.dataset.deleteMilestone);save();render();toast('Milestone removed');}));
    $$('[data-delete-lesson]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.deleteLesson;data.lessons=data.lessons.filter(x=>x.id!==id);data.practiceItems=data.practiceItems.map(item=>item.lessonId===id?{...item,lessonId:''}:item);save();render();toast('Lesson removed');}));
    $$('[data-delete-practice]').forEach(b=>b.addEventListener('click',()=>{data.practiceItems=data.practiceItems.filter(x=>x.id!==b.dataset.deletePractice);save();render();toast('Checklist item removed');}));
    $$('[data-complete-practice]').forEach(box=>box.addEventListener('change',()=>{const item=data.practiceItems.find(x=>x.id===box.dataset.completePractice);if(!item)return;item.complete=box.checked;item.completeAt=box.checked?new Date().toISOString():'';save();render();toast(box.checked?'Practice checked off':'Practice reset');}));
  }
  const open = id => { $(id).showModal(); };
  const close = id => $(id).close();
  ['#quick-add','#add-training'].forEach(sel=>$(sel).addEventListener('click',()=>open('#entry-dialog')));
  ['#add-milestone','#add-milestone-shortcut'].forEach(sel=>$(sel).addEventListener('click',()=>open('#milestone-dialog')));
  $('#add-lesson').addEventListener('click',()=>{ $('#lesson-date').value=todayISO(); open('#lesson-dialog'); });
  $('#add-practice-item').addEventListener('click',()=>{ $('#practice-form').reset(); render(); open('#practice-dialog'); });
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.toggle('active',x===b));render();}));
  $('#entry-form').addEventListener('submit',e=>{e.preventDefault();const entry={id:crypto.randomUUID(),type:$('#entry-type').value,date:$('#entry-date').value,duration:$('#entry-duration').value,focus:$('#entry-focus').value.trim(),note:$('#entry-note').value.trim()};data.sessions.push(entry);save();render();e.target.reset();$('#entry-date').value=todayISO();close('#entry-dialog');toast('Session added to the journey');});
  $('#milestone-form').addEventListener('submit',e=>{e.preventDefault();data.milestones.push({id:crypto.randomUUID(),title:$('#milestone-title').value.trim(),date:$('#milestone-date').value,category:$('#milestone-category').value,note:$('#milestone-note').value.trim()});save();render();e.target.reset();$('#milestone-date').value=todayISO();close('#milestone-dialog');toast('Milestone saved');});
  $('#lesson-form').addEventListener('submit',e=>{e.preventDefault();data.lessons.push({id:crypto.randomUUID(),title:$('#lesson-title').value.trim(),date:$('#lesson-date').value,coach:$('#lesson-coach').value.trim(),cues:$('#lesson-cues').value.trim(),priorities:$('#lesson-priorities').value.trim(),parentNotes:$('#lesson-parent-notes').value.trim()});save();render();e.target.reset();close('#lesson-dialog');toast('Lesson saved to this device');});
  $('#practice-form').addEventListener('submit',e=>{e.preventDefault();data.practiceItems.push({id:crypto.randomUUID(),title:$('#practice-title').value.trim(),details:$('#practice-details').value.trim(),source:$('#practice-source').value,audience:$('#practice-audience').value,lessonId:$('#practice-lesson').value,complete:false,completeAt:'',createdAt:new Date().toISOString()});save();render();e.target.reset();close('#practice-dialog');toast('Checklist item added');});
  $('#reflection-form').addEventListener('submit',e=>{e.preventDefault();data.reflections.push({id:crypto.randomUUID(),date:$('#reflection-date').value,text:$('#reflection-text').value.trim(),mood:$('#mood-select').value});save();render();$('#reflection-text').value='';toast('Reflection saved');});
  $$('#privacy-info').forEach(b=>b.addEventListener('click',()=>open('#info-dialog')));
  $('#name-button').addEventListener('click',()=>{renderProfile();open('#profiles-dialog');});
  $('#profile-list').addEventListener('click', e => {
    const switchButton = e.target.closest('[data-switch-profile]');
    const renameButton = e.target.closest('[data-rename-profile]');
    const saveButton = e.target.closest('[data-save-profile]');
    const cancelButton = e.target.closest('[data-cancel-profile]');
    if (switchButton) { data = store.profiles.find(p => p.id === switchButton.dataset.switchProfile); store.activeProfileId = data.id; save(); renderProfile(); render(); close('#profiles-dialog'); toast(`Switched to ${data.name || 'athlete profile'}`); }
    if (renameButton) { renamingProfileId = renameButton.dataset.renameProfile; renderProfile(); $('[data-profile-name]')?.focus(); }
    if (saveButton) { const profile = store.profiles.find(p => p.id === saveButton.dataset.saveProfile); profile.name = cleanName($('[data-profile-name]')?.value); renamingProfileId = ''; save(); renderProfile(); toast(profile.name ? 'Profile name saved on this device' : 'Generic profile label restored'); }
    if (cancelButton) { renamingProfileId = ''; renderProfile(); }
  });
  $('#create-profile').addEventListener('click',()=>{const profile=blankJournal(cleanName($('#new-profile-name').value));store.profiles.push(profile);data=profile;save();$('#new-profile-name').value='';renderProfile();render();close('#profiles-dialog');toast('New athlete profile added');});
  $('#export-button').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({format:'matwork-backup-v2',exportedAt:new Date().toISOString(),profiles:store.profiles,activeProfileId:data.id},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='matwork-journal-backup.json';a.click();URL.revokeObjectURL(url);toast('Profile backup downloaded');});
  $('#import-button').addEventListener('click',async()=>{const file=$('#import-file').files?.[0];if(!file){toast('Choose a backup file first');return;}try{const backup=JSON.parse(await file.text());let profiles, activeProfileId;if(backup.format==='matwork-backup-v1'&&backup.journal){profiles=[normalizeJournal(backup.journal)];activeProfileId=profiles[0].id;}else if(backup.format==='matwork-backup-v2'&&Array.isArray(backup.profiles)&&backup.profiles.length){profiles=backup.profiles.map(normalizeJournal);activeProfileId=profiles.some(p=>p.id===backup.activeProfileId)?backup.activeProfileId:profiles[0].id;}else throw new Error('Not a Matwork backup');if(!confirm('Import this backup and replace all athlete profiles currently saved in this browser?'))return;store={profiles,activeProfileId};data=profiles.find(p=>p.id===activeProfileId)||profiles[0];save();renderProfile();render();$('#import-file').value='';close('#info-dialog');toast('Backup restored');}catch{toast('That file is not a valid Matwork backup');}});
  const quotes=[['“Once you’ve wrestled, everything else in life is easy.”','DAN GABLE','https://www.themat.com/news/2007/march/31/day-2-notes-from-the-asics-usa-16506'],['Show up curious. Leave with one thing to practice.','MATWORK REMINDER',null],['A hard day can still be a useful day.','MATWORK REMINDER',null]];
  $('#quote-list').innerHTML=quotes.map(([q,a,url])=>`<div class="quote-item"><blockquote>${q}</blockquote><cite>— ${url?`<a href="${url}" target="_blank" rel="noopener">${a} · USA WRESTLING</a>`:a}</cite></div>`).join('');
  save(); renderProfile(); render();
})();

