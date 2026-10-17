const $ = (selector) => document.querySelector(selector);
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const shortDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Date not set";
const notice = (message, kind = "info") => { const node = $("#notice"); node.textContent = message; node.dataset.kind = kind; node.hidden = !message; };
const hide = (selector, value = true) => { $(selector).hidden = value; };
let client;
let session;
let user;
let memberships = [];
let coachAssignments = [];
let wrestlers = [];
let role = "";
let selectedWrestler = "";
let busy = false;
let lessonDraft = null;
let coachProfiles = new Map();
let ownCoachProfile = null;
let coachProfilesAvailable = true;
let reflectionSharingAvailable = true;

function isCoachProfilesMissing(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /coach_profiles.*(not found|does not exist)/i.test(error?.message || "");
}

function setCoachProfilesUnavailable() {
  coachProfilesAvailable = false;
  const form = $("#coach-profile-form");
  const status = $("#coach-profile-status");
  if (form) form.hidden = true;
  if (status) {
    status.textContent = "Coach name attribution is waiting for a database update. Until then, coach notes appear as “Coach.”";
    status.hidden = false;
  }
}

function isReflectionSharingMissing(error) {
  return (error?.code === "42703" || error?.code === "PGRST204") && /author_role|share_with_coach/i.test(error?.message || "");
}

function configReady() {
  const cfg = window.MATWORK_SUPABASE_CONFIG || {};
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url || "") && /^(sb_publishable_|eyJ)/.test(cfg.publishableKey || "");
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll("button[type=submit]").forEach((button) => { button.disabled = value; });
}

function showSignedOut() {
  session = null; user = null;
  hide("#signin-panel", false); hide("#onboarding-panel"); hide("#workspace-panel"); hide("#sign-out");
  $("#account-label").textContent = "";
}

function roleLabels(available) {
  return { parent: "Parent dashboard", wrestler: "Wrestler view", coach: "Coach workspace" }[available];
}

async function loadIdentity() {
  if (!user) return showSignedOut();
  $("#account-label").textContent = user.email || "Signed in";
  hide("#signin-panel"); hide("#sign-out", false);
  const [{ data: memberRows, error: memberError }, { data: coachRows, error: coachError }] = await Promise.all([
    client.from("family_memberships").select("family_id,role,wrestler_id").eq("user_id", user.id),
    client.from("coach_assignments").select("family_id,wrestler_id,revoked_at").eq("coach_user_id", user.id).is("revoked_at", null)
  ]);
  if (memberError || coachError) throw memberError || coachError;
  memberships = memberRows || [];
  coachAssignments = coachRows || [];
  const available = [];
  if (memberships.some((item) => item.role === "parent")) available.push("parent");
  if (memberships.some((item) => item.role === "wrestler")) available.push("wrestler");
  if (coachAssignments.length) available.push("coach");
  if (!available.length) {
    hide("#workspace-panel"); hide("#onboarding-panel", false);
    notice("You’re signed in. Create a parent workspace or use a one-time access code from a parent.", "good");
    return;
  }
  if (available.includes("coach")) {
    const { data: profile, error: profileError } = await client.from("coach_profiles").select("user_id,display_name").eq("user_id", user.id).maybeSingle();
    if (profileError && isCoachProfilesMissing(profileError)) setCoachProfilesUnavailable();
    else {
      if (profileError) throw profileError;
      coachProfilesAvailable = true;
      ownCoachProfile = profile;
      const nameInput = $("#coach-display-name");
      if (nameInput) nameInput.value = profile?.display_name || "";
      $("#coach-profile-form").hidden = false;
      $("#coach-profile-status").hidden = true;
    }
  } else ownCoachProfile = null;
  if (!available.includes(role)) role = available.includes("parent") ? "parent" : available[0];
  const roleSelect = $("#role-switch");
  roleSelect.replaceChildren(...available.map((entry) => { const option = document.createElement("option"); option.value = entry; option.textContent = roleLabels(entry); return option; }));
  hide("#role-switch-wrap", available.length < 2);
  hide("#onboarding-panel"); hide("#workspace-panel", false);
  await loadWorkspace();
}

async function loadWorkspace() {
  const ids = role === "parent"
    ? memberships.filter((item) => item.role === "parent").map((item) => item.family_id)
    : role === "wrestler"
      ? memberships.filter((item) => item.role === "wrestler").map((item) => item.wrestler_id)
      : coachAssignments.map((item) => item.wrestler_id);
  let query = client.from("wrestlers").select("id,family_id,first_name,active").eq("active", true);
  if (role === "parent") query = query.in("family_id", ids);
  else query = query.in("id", ids);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  wrestlers = data || [];
  const title = { parent: "Parent dashboard", wrestler: "Wrestler view", coach: "Coach workspace" }[role];
  const intro = {
    parent: "Everything for your wrestler, including lesson details and parent-only notes.",
    wrestler: "Your focus, practice checklist, lesson cues, and progress.",
    coach: "Assigned athletes, coaching notes, and at-home practice follow-through."
  }[role];
  $("#role-title").textContent = title;
  $("#role-eyebrow").textContent = role === "parent" ? "FAMILY VIEW" : role === "wrestler" ? "WRESTLER VIEW" : "COACH VIEW";
  $("#role-summary").textContent = intro;
  const ownedFamilies = memberships.filter((item) => item.role === "parent").map((item) => item.family_id);
  hide("#athlete-setup", role === "parent" && ownedFamilies.length === 0);
  hide("#athlete-picker-card", wrestlers.length === 0);
  hide("#author-panel", role === "wrestler" || wrestlers.length === 0);
  hide("#feedback-panel", wrestlers.length === 0);
  configureReflectionForm();
  hide("#coach-profile-panel", role !== "coach");
  hide("#coach-capture", role !== "coach" || wrestlers.length === 0);
  hide("#invite-actions", role !== "parent" || wrestlers.length === 0);
  if (!wrestlers.length) {
    $("#lesson-list").innerHTML = `<div class="empty-state">${role === "parent" ? "Add your first wrestler profile to start the journal." : "No wrestler profile is linked to this account yet. Ask a parent for an access code."}</div>`;
    $("#practice-list").innerHTML = "";
    if (role === "parent") hide("#athlete-setup", false);
    return;
  }
  if (!wrestlers.some((item) => item.id === selectedWrestler)) selectedWrestler = wrestlers[0].id;
  const picker = $("#athlete-picker");
  picker.replaceChildren(...wrestlers.map((wrestler) => { const option = document.createElement("option"); option.value = wrestler.id; option.textContent = wrestler.first_name || "Wrestler"; return option; }));
  picker.value = selectedWrestler;
  await loadRecords();
}

async function loadRecords() {
  const athleteId = selectedWrestler;
  if (!athleteId) return;
  const [lessonResult, itemResult, assignmentResult, eventResult, initialReflectionResult] = await Promise.all([
    client.from("lessons").select("id,lesson_number,lesson_date,focus,instructor_label,created_by").eq("wrestler_id", athleteId).order("lesson_date", { ascending: false }),
    client.from("lesson_items").select("id,lesson_id,wrestler_id,kind,content,audience,authored_by,created_at,ai_assisted").eq("wrestler_id", athleteId).order("created_at", { ascending: true }),
    client.from("practice_assignments").select("id,wrestler_id,lesson_id,title,instructions,source,coach_origin,audience,due_date,active,created_at").eq("wrestler_id", athleteId).eq("active", true).order("created_at", { ascending: false }),
    client.from("checklist_events").select("assignment_id,completed,recorded_at,note").eq("wrestler_id", athleteId).order("recorded_at", { ascending: false }),
    client.from("reflections").select("id,reflection_date,content,mood,audience,author_role,share_with_coach,created_by,created_at").eq("wrestler_id", athleteId).order("created_at", { ascending: false })
  ]);
  let reflectionResult = initialReflectionResult;
  if (isReflectionSharingMissing(reflectionResult.error)) {
    reflectionSharingAvailable = false;
    reflectionResult = await client.from("reflections").select("id,reflection_date,content,mood,audience,created_by,created_at").eq("wrestler_id", athleteId).order("created_at", { ascending: false });
    configureReflectionForm();
  } else if (!reflectionResult.error) { reflectionSharingAvailable = true; configureReflectionForm(); }
  const error = [lessonResult, itemResult, assignmentResult, eventResult, reflectionResult].find((result) => result.error)?.error;
  if (error) throw error;
  const lessons = lessonResult.data || [];
  const items = itemResult.data || [];
  const assignments = assignmentResult.data || [];
  const authorIds = [...new Set([...lessons.map((row) => row.created_by), ...items.map((row) => row.authored_by), ...assignments.map((row) => row.created_by)].filter(Boolean))];
  coachProfiles = new Map();
  if (authorIds.length && coachProfilesAvailable) {
    const { data: profiles, error: profileError } = await client.from("coach_profiles").select("user_id,display_name").in("user_id", authorIds);
    if (profileError && isCoachProfilesMissing(profileError)) setCoachProfilesUnavailable();
    else {
      if (profileError) throw profileError;
      coachProfiles = new Map((profiles || []).map((profile) => [profile.user_id, profile.display_name]));
    }
  }
  const latest = new Map();
  for (const event of eventResult.data || []) if (!latest.has(event.assignment_id)) latest.set(event.assignment_id, event);
  $("#lesson-list").innerHTML = lessons.length ? lessons.map((lesson) => {
    const notes = items.filter((item) => item.lesson_id === lesson.id);
    const coachName = coachProfiles.get(lesson.created_by);
    const instructor = lesson.instructor_label === "Coach" ? (coachName || "Coach") : lesson.instructor_label;
    return `<article class="record-card"><div class="record-meta">${esc(shortDate(lesson.lesson_date))}${lesson.lesson_number ? ` · Lesson ${esc(lesson.lesson_number)}` : ""}${instructor ? ` · Coach: ${esc(instructor)}` : ""}</div><h4>${esc(lesson.focus)}</h4>${notes.map((item) => { const itemCoach = coachProfiles.get(item.authored_by); const attribution = itemCoach ? ` · ${esc(itemCoach)}` : ""; return `<div class="record-label ${item.kind.includes("parent") ? "parent" : item.kind.startsWith("coach") ? "coach" : ""}">${item.ai_assisted ? "AI ORGANIZED · COACH APPROVED · " : ""}${esc(item.kind.replaceAll("_", " "))}${attribution}</div><p>${esc(item.content)}</p>`; }).join("")}</article>`;
  }).join("") : `<div class="empty-state">No lessons have been recorded here yet.</div>`;
  $("#practice-list").innerHTML = assignments.length ? assignments.map((assignment) => {
    const event = latest.get(assignment.id);
    const checked = Boolean(event?.completed);
    const canComplete = role === "wrestler";
    const origin = assignment.coach_origin === "ai_suggestion_approved" ? "AI SUGGESTION · COACH APPROVED" : assignment.source === "coach" ? "COACH ASSIGNMENT" : "PARENT RECOMMENDATION";
    const coachAuthor = assignment.source === "coach" ? coachProfiles.get(assignment.created_by) : "";
    return `<div class="practice-row ${checked ? "done" : ""}"><input type="checkbox" data-complete="${esc(assignment.id)}" aria-label="Mark ${esc(assignment.title)} complete" ${checked ? "checked" : ""} ${canComplete ? "" : "disabled"}><div class="practice-copy"><b>${esc(assignment.title)}</b><p>${esc(assignment.instructions || "Use the lesson cues and reset if your position breaks down.")}</p><small>${origin}${coachAuthor ? ` · ${esc(coachAuthor)}` : ""} · ${assignment.audience === "wrestler" ? "WRESTLER" : "PARENT"}${assignment.due_date ? ` · DUE ${esc(shortDate(assignment.due_date))}` : ""}${event?.recorded_at ? ` · UPDATED ${esc(shortDate(event.recorded_at.slice(0, 10)))}` : ""}</small></div></div>`;
  }).join("") : `<div class="empty-state">No active practice items yet. A parent or coach can add a clear next step after a lesson.</div>`;
  const reflections = reflectionResult.data || [];
  $("#reflection-list-intro").textContent = !reflectionSharingAvailable
    ? "Check-in sharing is being connected. Use the lesson and practice forms above for now."
    : role === "coach"
    ? "Family and wrestler notes explicitly shared with you, ready to inform the next session."
    : role === "parent"
      ? "Your perspective stays with the family unless you choose to share it."
      : "Your check-ins stay yours unless you choose to share them with your coach.";
  $("#reflection-list").innerHTML = reflections.length ? reflections.map((entry) => {
    const author = entry.author_role === "parent" ? "PARENT PERSPECTIVE" : entry.author_role === "wrestler" ? "WRESTLER CHECK-IN" : "FAMILY CHECK-IN";
    const audience = entry.audience === "parent" && !entry.share_with_coach ? "FAMILY ONLY" : entry.share_with_coach || entry.audience === "coach" ? "SHARED WITH COACH" : "WRESTLER VIEW";
    return `<article class="reflection-card"><div class="reflection-meta">${esc(shortDate(entry.reflection_date))} · ${author}</div><div class="record-label">${role === "coach" ? "SHARED WITH COACH" : audience}</div><p>${esc(entry.content)}</p>${entry.mood ? `<small class="fine-print">How it felt: ${esc(entry.mood)}</small>` : ""}</article>`;
  }).join("") : `<div class="empty-state">No check-ins yet. A short note can help the next conversation start in the right place.</div>`;
  const completed = assignments.filter((assignment) => latest.get(assignment.id)?.completed).length;
  const coachAssigned = assignments.filter((assignment) => assignment.source === "coach");
  const coachCompleted = coachAssigned.filter((assignment) => latest.get(assignment.id)?.completed).length;
  const athlete = wrestlers.find((item) => item.id === athleteId);
  $("#role-summary").textContent = `${athlete?.first_name || "Wrestler"} · ${introForRole()}${role === "coach" ? ` ${coachCompleted} of ${coachAssigned.length} coach-assigned items marked complete.` : role === "parent" ? ` ${completed} of ${assignments.length} practice items marked complete.` : ""}`;
}

function configureReflectionForm() {
  const select = $("#reflection-sharing");
  if (!select) return;
  const options = role === "parent"
    ? [["family", "Family only"], ["coach", "Share with coach"], ["both", "Share with wrestler and coach"]]
    : role === "wrestler"
      ? [["private", "Only me and my family"], ["coach", "Share with coach"]]
      : [];
  select.replaceChildren(...options.map(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; return option; }));
  hide("#reflection-compose", role === "coach" || !reflectionSharingAvailable);
  $("#reflection-title").textContent = role === "parent" ? "What are you noticing?" : "Your check-in";
  $("#reflection-prompt").textContent = role === "parent"
    ? "Share what you are seeing, what you hope to reinforce, or what would help the coach plan. Keep coaching cues and your own perspective clearly separate."
    : "What went well? What felt hard? What do you want to work on next? Short answers are fine.";
  $("#reflection-content-label").firstChild.textContent = role === "parent" ? "Your perspective for the support team" : "What would you like your support team to know?";
  hide("#reflection-mood-label", role !== "wrestler");
  if (!$("#reflection-date").value) $("#reflection-date").value = new Date().toISOString().slice(0, 10);
}

$("#reflection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (!user || !selectedWrestler || !["parent", "wrestler"].includes(role)) throw new Error("Choose a family or wrestler view to add a check-in.");
    const content = $("#reflection-content").value.trim();
    if (content.length < 3) throw new Error("Add a short check-in before sharing.");
    const choice = $("#reflection-sharing").value;
    const audience = role === "parent"
      ? ({ family: "parent", coach: "coach", both: "wrestler" }[choice] || "parent")
      : "wrestler";
    const shareWithCoach = role === "parent" ? choice === "both" : choice === "coach";
    const { error } = await client.from("reflections").insert({
      wrestler_id: selectedWrestler,
      reflection_date: $("#reflection-date").value,
      content,
      mood: role === "wrestler" ? $("#reflection-mood").value : "",
      audience,
      author_role: role,
      share_with_coach: shareWithCoach,
      created_by: user.id
    });
    if (error) throw error;
    event.target.reset();
    $("#reflection-date").value = new Date().toISOString().slice(0, 10);
    configureReflectionForm();
    notice(shareWithCoach ? "Check-in shared with the coach for the next conversation." : "Check-in saved with the sharing choice you selected.", "good");
    await loadRecords();
  });
});

$("#coach-profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (role !== "coach" || !user) throw new Error("Sign in with an assigned coach account to set this name.");
    if (!coachProfilesAvailable) throw new Error("Coach name attribution is waiting for a database update.");
    const displayName = $("#coach-display-name").value.trim();
    if (!displayName) throw new Error("Enter the name you want families to see.");
    const { data, error } = await client.from("coach_profiles").upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" }).select("user_id,display_name").single();
    if (error) throw error;
    ownCoachProfile = data;
    notice("Coach name saved. It will appear with your notes and assignments.", "good");
    if (selectedWrestler) await loadRecords();
  });
});

function introForRole() { return { parent: "Full family record.", wrestler: "Your work, one step at a time.", coach: "Assigned coaching view." }[role]; }

function draftField(label, key, value, rows = 3) {
  return `<label>${esc(label)}<textarea data-draft-field="${esc(key)}" rows="${rows}">${esc(value || "")}</textarea></label>`;
}

function renderDraftReview(draft) {
  lessonDraft = draft;
  const originalTasks = (draft.coach_assigned_tasks || []).map((item) => ({ ...item, selected: true, origin: "Coach assignment captured" }));
  const suggestedTasks = (draft.practice_suggestions || []).map((item) => ({ ...item, selected: false, origin: "AI suggestion — select only if you want to assign it" }));
  const tasks = [...originalTasks, ...suggestedTasks];
  const taskHtml = tasks.length ? tasks.map((task, index) => `<label class="draft-task"><input type="checkbox" data-task-selected="${index}" ${task.selected ? "checked" : ""}><span><b>${esc(task.origin)}</b><input type="text" data-task-title="${index}" maxlength="140" value="${esc(task.title || "")}" aria-label="Practice item title"><textarea data-task-instructions="${index}" rows="2" aria-label="Practice item instructions">${esc(task.instructions || "")}</textarea><select data-task-audience="${index}" aria-label="Practice item audience"><option value="wrestler" ${task.audience !== "parent" ? "selected" : ""}>Wrestler</option><option value="parent" ${task.audience === "parent" ? "selected" : ""}>Parent</option></select></span></label>`).join("") : `<p class="muted">No assignments or suggestions were found in the note. You can add one in the existing practice form below.</p>`;
  const questions = draft.clarification_questions?.length ? `<div class="record-label">CHECK BEFORE SHARING</div><ul>${draft.clarification_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : "";
  const node = $("#draft-review");
  node.innerHTML = `<h4>Review the organized draft</h4><p class="muted">Nothing is saved or shared until you approve. AI suggestions are clearly separated from assignments captured in your note.</p>${draftField("Primary focus", "focus", draft.focus, 2)}${draftField("Coach cues from the note", "coach_cues", draft.coach_cues)}${draftField("Observations and development priorities from the note", "observations", draft.observations)}${draftField("Wrestler focus", "wrestler_focus", draft.wrestler_focus)}${draftField("Parent support", "parent_support", draft.parent_support)}${draftField("Possible next lesson topics", "follow_up_topics", draft.follow_up_topics)}<h4>Practice checklist</h4>${taskHtml}${questions}<div class="draft-actions"><button type="button" class="primary-button" id="approve-draft">Approve and share plan</button><button type="button" class="secondary-button" id="discard-draft">Discard draft</button></div>`;
  node.hidden = false;
  node.querySelector("#discard-draft").addEventListener("click", () => { lessonDraft = null; node.replaceChildren(); node.hidden = true; });
  node.querySelector("#approve-draft").addEventListener("click", () => run(async () => saveApprovedDraft(tasks)));
}

async function saveApprovedDraft(tasks) {
  if (!lessonDraft || role !== "coach") throw new Error("Coach review is required before sharing this plan.");
  const node = $("#draft-review");
  const value = (key) => node.querySelector(`[data-draft-field="${key}"]`).value.trim();
  const selectedTasks = tasks.map((task, index) => ({
    selected: node.querySelector(`[data-task-selected="${index}"]`).checked,
    title: node.querySelector(`[data-task-title="${index}"]`).value.trim(),
    instructions: node.querySelector(`[data-task-instructions="${index}"]`).value.trim(),
    audience: node.querySelector(`[data-task-audience="${index}"]`).value,
    coach_origin: tasks[index].selected ? "coach_stated" : "ai_suggestion_approved"
  })).filter((task) => task.selected && task.title);
  const payload = {
    p_wrestler_id: selectedWrestler,
    p_lesson_date: $("#capture-date").value,
    p_lesson_number: $("#capture-number").value ? Number($("#capture-number").value) : null,
    p_focus: value("focus"),
    p_source_note: $("#capture-note").value.trim(),
    p_coach_cues: value("coach_cues"),
    p_observations: value("observations"),
    p_wrestler_focus: value("wrestler_focus"),
    p_parent_support: value("parent_support"),
    p_follow_up_topics: value("follow_up_topics"),
    p_tasks: selectedTasks,
    p_ai_model: "gpt-5.4-mini"
  };
  if (!payload.p_focus) throw new Error("Add a primary focus before approving.");
  const { error } = await client.rpc("save_coach_lesson_bundle", payload);
  if (error) throw error;
  lessonDraft = null;
  $("#capture-note").value = "";
  $("#capture-number").value = "";
  node.replaceChildren(); node.hidden = true;
  notice("Reviewed lesson and coach-approved checklist saved for the family.", "good");
  await loadRecords();
}

async function run(action) {
  if (busy) return;
  setBusy(true);
  try { await action(); }
  catch (error) { const message = error?.message || "Something went wrong. Please try again."; notice(/email rate limit exceeded|rate limit|too many requests/i.test(message) ? "Matwork’s shared email service has reached its hourly limit. No new link was sent. Use the newest email link or try again later." : message, "bad"); }
  finally { setBusy(false); }
}

async function acceptInvite(code, fieldSelector = "#invite-code") {
  const { error } = await client.rpc("accept_access_invite", { p_invite_code: code.trim() });
  if (error) throw error;
  $(fieldSelector).value = "";
  notice("You’re connected. Your workspace is ready.", "good");
  await loadIdentity();
}

async function initialize() {
  if (!configReady()) {
    hide("#signin-panel"); hide("#onboarding-panel"); hide("#workspace-panel");
    notice("Shared sign-in is ready for setup. Add your Supabase Project URL and publishable key to supabase-config.js, then apply the database migration before entering any wrestler records.");
    return;
  }
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const config = window.MATWORK_SUPABASE_CONFIG;
    client = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    session = data.session;
    user = session?.user || null;
    if (user && new URLSearchParams(location.search).has("invite")) {
      const code = new URLSearchParams(location.search).get("invite");
      await acceptInvite(code);
      history.replaceState({}, "", location.pathname);
    } else if (user) await loadIdentity();
    else { showSignedOut(); notice("Use your Matwork email. Parents use the family account email; wrestlers and coaches use their invited email."); }
    client.auth.onAuthStateChange((_event, newSession) => {
      session = newSession; user = newSession?.user || null;
      queueMicrotask(() => run(() => user ? loadIdentity() : showSignedOut()));
    });
  } catch (error) {
    notice(`Shared workspace could not start: ${error?.message || "connection error"}`, "bad");
  }
}

$("#signin-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const email = $("#signin-email").value.trim();
    const invite = new URLSearchParams(location.search).get("invite");
    const redirect = new URL(location.pathname, location.origin);
    if (invite) redirect.searchParams.set("invite", invite);
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true } });
    if (error) throw error;
    notice("Check your inbox for a sign-in link. Open it on this device to continue.", "good");
  });
});

$("#sign-out").addEventListener("click", () => run(async () => { const { error } = await client.auth.signOut(); if (error) throw error; showSignedOut(); notice("You’re signed out.", "good"); }));
$("#role-switch").addEventListener("change", () => run(async () => { role = $("#role-switch").value; selectedWrestler = ""; await loadWorkspace(); }));
$("#athlete-picker").addEventListener("change", () => run(async () => { selectedWrestler = $("#athlete-picker").value; hide("#invite-result"); await loadRecords(); }));

$("#family-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const { error } = await client.rpc("create_family", { family_label: $("#family-label").value.trim() || "My family" });
    if (error) throw error;
    role = "parent";
    notice("Parent workspace created. Add the wrestler profile next.", "good");
    await loadIdentity();
  });
});

$("#wrestler-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const familyId = memberships.find((item) => item.role === "parent")?.family_id;
    if (!familyId) throw new Error("Create the parent workspace first.");
    const { data, error } = await client.rpc("create_wrestler", { target_family: familyId, wrestler_first_name: $("#wrestler-first-name").value.trim() });
    if (error) throw error;
    $("#wrestler-first-name").value = "";
    selectedWrestler = data;
    notice("Wrestler profile added.", "good");
    await loadWorkspace();
  });
});

$("#accept-invite-form").addEventListener("submit", (event) => { event.preventDefault(); run(() => acceptInvite($("#invite-code").value)); });
$("#workspace-accept-invite-form").addEventListener("submit", (event) => { event.preventDefault(); run(() => acceptInvite($("#workspace-invite-code").value, "#workspace-invite-code")); });

document.querySelectorAll("[data-create-invite]").forEach((button) => button.addEventListener("click", () => run(async () => {
  const { data, error } = await client.rpc("create_access_invite", { target_wrestler: selectedWrestler, invite_role: button.dataset.createInvite });
  if (error) throw error;
  const node = $("#invite-result"); node.hidden = false;
  node.innerHTML = `<b>${button.dataset.createInvite === "coach" ? "Coach" : "Wrestler"} access code</b><code>${esc(data)}</code>Share this one-time code privately. It expires in seven days and can be used once.`;
  notice("Access code created. Share it only with the intended person.", "good");
})));

$("#lesson-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (role === "coach" && coachProfilesAvailable && !ownCoachProfile?.display_name) throw new Error("Save your coach display name first so families can see who wrote the lesson.");
    const athlete = wrestlers.find((item) => item.id === selectedWrestler);
    const numberValue = $("#lesson-number").value;
    const { data: lesson, error } = await client.from("lessons").insert({ wrestler_id: selectedWrestler, lesson_number: numberValue ? Number(numberValue) : null, lesson_date: $("#lesson-date").value, focus: $("#lesson-focus").value.trim(), instructor_label: role === "coach" ? "Coach" : null, created_by: user.id }).select("id").single();
    if (error) throw error;
    const rows = [];
    const cues = $("#lesson-cues").value.trim();
    const observations = $("#lesson-observations").value.trim();
    const parentNotes = $("#lesson-parent-notes").value.trim();
    if (cues) rows.push({ lesson_id: lesson.id, wrestler_id: selectedWrestler, kind: "coach_cue", content: cues, audience: role === "coach" ? ["coach", "wrestler"] : ["parent", "wrestler"], authored_by: user.id });
    if (observations) rows.push({ lesson_id: lesson.id, wrestler_id: selectedWrestler, kind: role === "coach" ? "coach_observation" : "development_priority", content: observations, audience: role === "coach" ? ["coach", "wrestler"] : ["parent", "wrestler"], authored_by: user.id });
    if (parentNotes && role === "parent") rows.push({ lesson_id: lesson.id, wrestler_id: selectedWrestler, kind: "parent_interpretation", content: parentNotes, audience: ["parent"], authored_by: user.id });
    if (rows.length) { const { error: itemError } = await client.from("lesson_items").insert(rows); if (itemError) throw itemError; }
    event.target.reset();
    $("#lesson-date").value = new Date().toISOString().slice(0, 10);
    notice(`Lesson saved for ${athlete?.first_name || "wrestler"}.`, "good");
    await loadRecords();
  });
});

$("#coach-capture-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (role !== "coach" || !selectedWrestler) throw new Error("Select an assigned wrestler in the Coach workspace first.");
    if (coachProfilesAvailable && !ownCoachProfile?.display_name) throw new Error("Save your coach display name first so families can see who wrote the lesson.");
    const note = $("#capture-note").value.trim();
    if (note.length < 12) throw new Error("Add a little more detail before organizing the note.");
    let data;
    try {
      const response = await client.functions.invoke("coach-session-draft", { body: { wrestler_id: selectedWrestler, coach_note: note } });
      if (response.error) throw response.error;
      data = response.data;
    } catch (error) {
      if (error?.context && typeof error.context.json === "function") {
        try {
          const detail = await error.context.json();
          if (detail?.error) { notice(detail.error, "bad"); return; }
        } catch { /* Fall through to the general function error below. */ }
      }
      const details = `${error?.message || ""} ${error?.name || ""}`;
      if (/functionsfetcherror|failed to fetch|not found|404|503/i.test(details)) {
        notice("The secure lesson organizer is still being connected. Your note remains in this box and has not been saved. You can use the lesson form below for now.", "info");
        return;
      }
      throw error;
    }
    if (!data?.draft) throw new Error("The organized draft was empty. Please try again.");
    renderDraftReview(data.draft);
    notice("Draft ready. Review each section and choose which practice items to assign.", "good");
  });
});

$("#assignment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (role === "coach" && coachProfilesAvailable && !ownCoachProfile?.display_name) throw new Error("Save your coach display name first so the wrestler and parent can see who assigned this.");
    const { error } = await client.from("practice_assignments").insert({ wrestler_id: selectedWrestler, title: $("#assignment-title").value.trim(), instructions: $("#assignment-instructions").value.trim(), source: role === "coach" ? "coach" : "parent", audience: $("#assignment-audience").value, created_by: user.id, due_date: $("#assignment-due").value || null });
    if (error) throw error;
    event.target.reset();
    notice("Practice item added with its source and intended audience.", "good");
    await loadRecords();
  });
});

$("#practice-list").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-complete]");
  if (!checkbox || role !== "wrestler") return;
  run(async () => {
    const { error } = await client.from("checklist_events").insert({ assignment_id: checkbox.dataset.complete, wrestler_id: selectedWrestler, completed: checkbox.checked, note: "", recorded_by: user.id });
    if (error) throw error;
    await loadRecords();
    notice(checkbox.checked ? "Practice completion saved." : "Practice marked as not complete yet.", "good");
  });
});

$("#lesson-date").value = new Date().toISOString().slice(0, 10);
$("#capture-date").value = new Date().toISOString().slice(0, 10);
initialize();

