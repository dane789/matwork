const $ = (selector) => document.querySelector(selector);
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const shortDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Date not set";

function serializeLessonSections(sections = []) {
  return sections.map((section) => [
    `Section: ${section.title || "Lesson focus"}`,
    section.objective ? `Objective:\n${section.objective}` : "",
    section.key_coaching_points?.length ? `Key coaching points:\n${section.key_coaching_points.map((point) => `- ${point}`).join("\n")}` : "",
    section.lesson_takeaway ? `Lesson takeaway:\n${section.lesson_takeaway}` : ""
  ].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
}

function parseLessonRecap(content) {
  const cueMatch = content.match(/(?:^|\n\n)Coach cue wording:\s*([\s\S]*?)$/i);
  const cues = cueMatch?.[1]?.trim() || "";
  const recap = cueMatch ? content.slice(0, cueMatch.index).trim() : content.trim();
  const blocks = recap.match(/(?:^|\n\n)Section:\s*[^\n]+[\s\S]*?(?=\n\nSection:\s*|$)/gi);
  const parseBlock = (block, fallbackTitle = "") => {
    const title = block.match(/(?:^|\n)Section:\s*([^\n]+)/i)?.[1]?.trim() || fallbackTitle;
    const objective = block.match(/(?:^|\n)Objective:\s*([\s\S]*?)(?=\nKey coaching points:|\nLesson takeaway:|$)/i)?.[1]?.trim() || "";
    const points = block.match(/(?:^|\n)Key coaching points:\s*([\s\S]*?)(?=\nLesson takeaway:|$)/i)?.[1]?.trim() || "";
    const list = points.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
    const takeaway = block.match(/(?:^|\n)Lesson takeaway:\s*([\s\S]*?)$/i)?.[1]?.trim() || "";
    return { title, objective, list, takeaway };
  };
  if (blocks?.length) return { sections: blocks.map((block) => parseBlock(block)), cues };
  const legacy = parseBlock(recap);
  return { sections: legacy.objective || legacy.list.length || legacy.takeaway ? [legacy] : [], cues };
}

function renderLessonItem(item, coachName, coachSource) {
  const attribution = coachName ? ` · ${esc(coachName)}` : "";
  const origin = item.ai_assisted
    ? coachSource ? "AI ORGANIZED · COACH APPROVED" : "PARENT NOTES · AI ORGANIZED"
    : coachSource ? "COACH NOTES" : "PARENT NOTES";
  const label = `${origin} · ${esc(item.kind.replaceAll("_", " "))}${attribution}`;
  const { sections, cues } = parseLessonRecap(item.content || "");
  const labelClass = item.kind.includes("parent") ? "parent" : item.kind.startsWith("coach") ? "coach" : "";
  if (!sections.length && !cues) return `<div class="record-label ${labelClass}">${label}</div><p>${esc(item.content)}</p>`;
  const sectionHtml = sections.map((section) => `<section class="recap-topic">${section.title ? `<h5>${esc(section.title)}</h5>` : ""}${section.objective ? `<div class="recap-section"><b>Objective</b><p>${esc(section.objective)}</p></div>` : ""}${section.list.length ? `<div class="recap-section"><b>Key coaching points</b><ul>${section.list.map((point) => `<li>${esc(point)}</li>`).join("")}</ul></div>` : ""}${section.takeaway ? `<div class="recap-takeaway"><b>Lesson takeaway</b><p>${esc(section.takeaway)}</p></div>` : ""}</section>`).join("");
  return `<div class="record-label ${labelClass}">${label}</div><div class="lesson-recap">${sectionHtml}${cues ? `<details class="recap-cues"><summary>${coachSource ? "Coach’s words from the lesson" : "Coach’s words reported in parent notes"}</summary><p>${esc(cues)}</p></details>` : ""}</div>`;
}
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
let parentLessonDraft = null;
const parentCaptureByAthlete = new Map();
let coachProfiles = new Map();
let ownCoachProfile = null;
let coachProfilesAvailable = true;
let assignedCoachIds = [];
let assignedCoachNames = [];
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

function rememberParentCapture(wrestlerId) {
  if (!wrestlerId) return;
  parentCaptureByAthlete.set(wrestlerId, {
    coachNotes: $("#parent-coach-notes").value,
    observations: $("#parent-observations").value,
    date: $("#parent-capture-date").value,
    number: $("#parent-capture-number").value
  });
}

function restoreParentCapture(wrestlerId) {
  const saved = parentCaptureByAthlete.get(wrestlerId);
  $("#parent-coach-notes").value = saved?.coachNotes || "";
  $("#parent-observations").value = saved?.observations || "";
  $("#parent-capture-date").value = saved?.date || new Date().toISOString().slice(0, 10);
  $("#parent-capture-number").value = saved?.number || "";
  $("#parent-share-coach").checked = false;
  parentLessonDraft = null;
  $("#parent-draft-review").replaceChildren();
  hide("#parent-draft-review");
}

function showSignedOut() {
  session = null; user = null;
  hide("#signin-panel", false); hide("#onboarding-panel"); hide("#workspace-panel"); hide("#sign-out");
  $("#account-label").textContent = "";
}

function roleLabels(available) {
  return { parent: "Parent", wrestler: "Athlete", coach: "Coach" }[available];
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
  roleSelect.value = role;
  hide("#role-switch-wrap", available.length < 2);
  hide("#onboarding-panel"); hide("#workspace-panel", false);
  await loadWorkspace();
  const statusText = $("#notice").textContent.trim();
  if (statusText === "Checking workspace setup…" || statusText === "Use your Matwork email. Parents use the family account email; wrestlers and coaches use their invited email.") notice("");
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
  const title = { parent: "Parent view", wrestler: "Athlete view", coach: "Coach view" }[role];
  const intro = {
    parent: "Review the lesson, support at-home practice, and share your perspective when useful.",
    wrestler: "See your next practice steps and check them off when you do the work.",
    coach: "Capture lesson notes and review the practice progress shared with you."
  }[role];
  $("#role-title").textContent = title;
  $("#role-eyebrow").textContent = role === "parent" ? "FAMILY VIEW" : role === "wrestler" ? "ATHLETE VIEW" : "COACH VIEW";
  $("#role-summary").textContent = intro;
  const ownedFamilies = memberships.filter((item) => item.role === "parent").map((item) => item.family_id);
  hide("#athlete-setup", role !== "parent" || wrestlers.length > 0);
  hide("#connect-role-card", role !== "coach");
  hide("#athlete-picker-card", wrestlers.length === 0);
  hide("#author-panel", role === "wrestler" || wrestlers.length === 0);
  hide("#feedback-panel", wrestlers.length === 0);
  configureReflectionForm();
  hide("#coach-profile-panel", role !== "coach");
  hide("#coach-capture", role !== "coach" || wrestlers.length === 0);
  hide("#parent-capture", role !== "parent" || wrestlers.length === 0);
  hide("#assignment-share-coach", role !== "parent");
  if (!$("#parent-capture-date").value) $("#parent-capture-date").value = new Date().toISOString().slice(0, 10);
  hide("#invite-actions", role !== "parent" || wrestlers.length === 0);
  $("#author-eyebrow").textContent = role === "coach" ? "COACH WORKSPACE" : "FAMILY SUPPORT";
  $("#author-title").textContent = role === "coach" ? "Add lesson notes" : "Build the next plan";
  $("#author-summary").textContent = role === "coach"
    ? "Capture the key cues and follow-up steps for this athlete."
    : "Add the coach’s notes and your perspective. Review the draft and choose the athlete steps to save.";
  if (!wrestlers.length) {
    $("#lesson-list").innerHTML = `<div class="empty-state">${role === "parent" ? "Add your first athlete profile to start the journal." : "No athlete profile is linked to this account yet. Ask a parent for an access code."}</div>`;
    $("#practice-list").innerHTML = "";
    if (role === "parent") hide("#athlete-setup", false);
    return;
  }
  if (!wrestlers.some((item) => item.id === selectedWrestler)) selectedWrestler = wrestlers[0].id;
  const picker = $("#athlete-picker");
  picker.replaceChildren(...wrestlers.map((wrestler) => { const option = document.createElement("option"); option.value = wrestler.id; option.textContent = wrestler.first_name || "Athlete"; return option; }));
  picker.value = selectedWrestler;
  await loadRecords();
}

async function loadRecords() {
  const athleteId = selectedWrestler;
  if (!athleteId) return;
  const [lessonResult, itemResult, assignmentResult, eventResult, initialReflectionResult, activeCoachResult] = await Promise.all([
    client.from("lessons").select("id,lesson_number,lesson_date,focus,instructor_label,created_by").eq("wrestler_id", athleteId).order("lesson_date", { ascending: false }),
    client.from("lesson_items").select("id,lesson_id,wrestler_id,kind,content,audience,authored_by,created_at,ai_assisted").eq("wrestler_id", athleteId).order("created_at", { ascending: true }),
    client.from("practice_assignments").select("id,wrestler_id,lesson_id,title,instructions,source,coach_origin,share_with_coach,audience,due_date,active,created_at").eq("wrestler_id", athleteId).eq("active", true).order("created_at", { ascending: false }),
    client.from("checklist_events").select("assignment_id,completed,recorded_at,note").eq("wrestler_id", athleteId).order("recorded_at", { ascending: false }),
    client.from("reflections").select("id,reflection_date,content,mood,audience,author_role,share_with_coach,created_by,created_at").eq("wrestler_id", athleteId).order("created_at", { ascending: false }),
    client.from("coach_assignments").select("coach_user_id").eq("wrestler_id", athleteId).is("revoked_at", null)
  ]);
  let reflectionResult = initialReflectionResult;
  if (isReflectionSharingMissing(reflectionResult.error)) {
    reflectionSharingAvailable = false;
    reflectionResult = await client.from("reflections").select("id,reflection_date,content,mood,audience,created_by,created_at").eq("wrestler_id", athleteId).order("created_at", { ascending: false });
    configureReflectionForm();
  } else if (!reflectionResult.error) { reflectionSharingAvailable = true; configureReflectionForm(); }
  const error = [lessonResult, itemResult, assignmentResult, eventResult, reflectionResult, activeCoachResult].find((result) => result.error)?.error;
  if (error) throw error;
  const lessons = lessonResult.data || [];
  const items = itemResult.data || [];
  const assignments = assignmentResult.data || [];
  assignedCoachIds = [...new Set((activeCoachResult.data || []).map((row) => row.coach_user_id).filter(Boolean))];
  const authorIds = [...new Set([...lessons.map((row) => row.created_by), ...items.map((row) => row.authored_by), ...assignments.map((row) => row.created_by), ...assignedCoachIds].filter(Boolean))];
  coachProfiles = new Map();
  if (authorIds.length && coachProfilesAvailable) {
    const { data: profiles, error: profileError } = await client.from("coach_profiles").select("user_id,display_name").in("user_id", authorIds);
    if (profileError && isCoachProfilesMissing(profileError)) setCoachProfilesUnavailable();
    else {
      if (profileError) throw profileError;
      coachProfiles = new Map((profiles || []).map((profile) => [profile.user_id, profile.display_name]));
    }
  }
  assignedCoachNames = assignedCoachIds.map((id) => coachProfiles.get(id)).filter(Boolean);
  updateCoachSharingCopy();
  const latest = new Map();
  for (const event of eventResult.data || []) if (!latest.has(event.assignment_id)) latest.set(event.assignment_id, event);
  const visibleAssignments = assignments.filter((assignment) => role !== "wrestler" || assignment.audience === "wrestler");
  const athleteAssignments = visibleAssignments.filter((assignment) => assignment.audience === "wrestler");
  const athleteCompleted = athleteAssignments.filter((assignment) => latest.get(assignment.id)?.completed).length;
  $("#practice-heading").textContent = role === "wrestler" ? "At-home practice checklist" : "At-home practice";
  $("#practice-intro").textContent = role === "wrestler"
    ? "Tap each step after you practice it. Your coach can see your check-ins and use them to plan what comes next."
    : role === "coach" ? "Review the athlete’s check-ins before planning the next session." : "See what is being practiced between lessons. Coach assignments and parent recommendations are labeled separately.";
  hide("#practice-progress", role !== "wrestler" || athleteAssignments.length === 0);
  if (role === "wrestler" && athleteAssignments.length) {
    $("#practice-progress-label").textContent = `${athleteCompleted} of ${athleteAssignments.length} practiced`;
    $("#practice-progress-bar").style.width = `${Math.round((athleteCompleted / athleteAssignments.length) * 100)}%`;
  }
  $("#lesson-list").innerHTML = lessons.length ? lessons.map((lesson) => {
    const notes = items.filter((item) => item.lesson_id === lesson.id);
    const coachName = coachProfiles.get(lesson.created_by);
    const instructor = lesson.instructor_label === "Coach" ? (coachName || "Coach") : lesson.instructor_label;
    return `<article class="record-card"><div class="record-meta">${esc(shortDate(lesson.lesson_date))}${lesson.lesson_number ? ` · Lesson ${esc(lesson.lesson_number)}` : ""}${instructor ? ` · Coach: ${esc(instructor)}` : ""}</div><h4>${esc(lesson.focus)}</h4>${notes.map((item) => renderLessonItem(item, coachProfiles.get(item.authored_by), lesson.instructor_label === "Coach")).join("")}</article>`;
  }).join("") : `<div class="empty-state">No lessons have been recorded here yet.</div>`;
  $("#practice-list").innerHTML = visibleAssignments.length ? visibleAssignments.map((assignment) => {
    const event = latest.get(assignment.id);
    const checked = Boolean(event?.completed);
    const canComplete = role === "wrestler";
    const origin = assignment.coach_origin === "parent_suggestion" ? "PARENT RECOMMENDATION · AI ORGANIZED" : assignment.coach_origin === "ai_suggestion_approved" ? "AI SUGGESTION · COACH APPROVED" : assignment.source === "coach" ? "COACH ASSIGNMENT" : "PARENT RECOMMENDATION";
    const coachAuthor = assignment.source === "coach" ? coachProfiles.get(assignment.created_by) : "";
    return `<div class="practice-row ${checked ? "done" : ""}"><input type="checkbox" data-complete="${esc(assignment.id)}" aria-label="Mark ${esc(assignment.title)} practiced" ${checked ? "checked" : ""} ${canComplete ? "" : "disabled"}><div class="practice-copy"><b>${esc(assignment.title)}</b><p>${esc(assignment.instructions || "Use the lesson cues and reset if your position breaks down.")}</p><small>${origin}${coachAuthor ? ` · ${esc(coachAuthor)}` : ""} · ${assignment.audience === "wrestler" ? "ATHLETE" : "PARENT"}${assignment.due_date ? ` · DUE ${esc(shortDate(assignment.due_date))}` : ""}${event?.recorded_at ? ` · UPDATED ${esc(shortDate(event.recorded_at.slice(0, 10)))}` : ""}</small></div></div>`;
  }).join("") : `<div class="empty-state">${role === "wrestler" ? "Your coach will add practice steps here after a lesson. When your checklist is ready, mark each step after you practice it." : "No active practice items yet. A parent or coach can add a clear next step after a lesson."}</div>`;
  const reflections = reflectionResult.data || [];
  $("#reflection-list-intro").textContent = !reflectionSharingAvailable
    ? "Check-in sharing is being connected. Use the lesson and practice forms above for now."
    : role === "coach"
    ? "Family and athlete notes explicitly shared with you, ready to inform the next session."
    : role === "parent"
      ? "Your perspective stays with the family unless you choose to share it."
      : "Your check-ins stay yours unless you choose to share them with your coach.";
  $("#reflection-list").innerHTML = reflections.length ? reflections.map((entry) => {
    const author = entry.author_role === "parent" ? "PARENT PERSPECTIVE" : entry.author_role === "wrestler" ? "ATHLETE CHECK-IN" : "FAMILY CHECK-IN";
    const audience = entry.audience === "parent" && !entry.share_with_coach ? "FAMILY ONLY" : entry.share_with_coach || entry.audience === "coach" ? "SHARED WITH COACH" : "ATHLETE VIEW";
    return `<article class="reflection-card"><div class="reflection-meta">${esc(shortDate(entry.reflection_date))} · ${author}</div><div class="record-label">${role === "coach" ? "SHARED WITH COACH" : audience}</div><p>${esc(entry.content)}</p>${entry.mood ? `<small class="fine-print">How it felt: ${esc(entry.mood)}</small>` : ""}</article>`;
  }).join("") : `<div class="empty-state">No check-ins yet. A short note can help the next conversation start in the right place.</div>`;
  const completed = assignments.filter((assignment) => latest.get(assignment.id)?.completed).length;
  const coachAssigned = assignments.filter((assignment) => assignment.source === "coach");
  const coachCompleted = coachAssigned.filter((assignment) => latest.get(assignment.id)?.completed).length;
  const athlete = wrestlers.find((item) => item.id === athleteId);
  $("#role-summary").textContent = `${athlete?.first_name || "Athlete"} · ${introForRole()}${role === "coach" ? ` ${coachCompleted} of ${coachAssigned.length} coach-assigned items marked complete.` : role === "parent" ? ` ${completed} of ${assignments.length} practice items marked complete.` : ""}`;
}

function updateCoachSharingCopy() {
  const count = assignedCoachIds.length;
  const named = assignedCoachNames.length;
  const parentInput = $("#parent-share-coach");
  const parentCopy = $("#parent-share-coach-copy");
  const assignmentInput = $("#assignment-share-coach-input");
  const assignmentCopy = $("#assignment-share-coach-copy");
  if (!count) {
    if (parentCopy) parentCopy.textContent = "No coach is connected yet. This recap and its check-ins will stay in the family workspace.";
    if (assignmentCopy) assignmentCopy.textContent = "No coach is connected yet. This recommendation and its check-ins will stay in the family workspace.";
  } else if (named !== count) {
    const missing = count - named;
    const who = `${assignedCoachNames.map((name) => `Coach ${name}`).join(", ")}${named ? " and " : ""}${missing} coach${missing === 1 ? "" : "es"} without a display name`;
    const message = `${who} ${count === 1 ? "is" : "are"} assigned. Sharing stays off until each coach has a display name.`;
    if (parentCopy) parentCopy.textContent = message;
    if (assignmentCopy) assignmentCopy.textContent = message;
  } else {
    const recipients = assignedCoachNames.map((name) => `Coach ${name}`).join(", ");
    const all = count > 1 ? "all assigned coaches" : "the assigned coach";
    if (parentCopy) parentCopy.textContent = `Share this recap and practice check-ins with ${all}: ${recipients}.`;
    if (assignmentCopy) assignmentCopy.textContent = `Share this recommendation and its check-ins with ${all}: ${recipients}.`;
  }
  const disabled = !count || named !== count;
  if (parentInput) { parentInput.disabled = disabled; if (disabled) parentInput.checked = false; }
  if (assignmentInput) { assignmentInput.disabled = disabled; if (disabled) assignmentInput.checked = false; }
  configureReflectionForm();
}

function configureReflectionForm() {
  const select = $("#reflection-sharing");
  if (!select) return;
  const count = assignedCoachIds.length;
  const hasNamedCoaches = count > 0 && assignedCoachNames.length === count;
  const recipients = assignedCoachNames.map((name) => `Coach ${name}`).join(", ");
  const coachTarget = count === 1 ? recipients : `all assigned coaches (${recipients})`;
  const options = role === "parent"
    ? [["family", "Family only"], ...(hasNamedCoaches ? [["coach", `Share with ${coachTarget}`], ["both", `Share with athlete and ${coachTarget}`]] : [])]
    : role === "wrestler"
      ? [["private", "Only me and my family"], ...(hasNamedCoaches ? [["coach", `Share with ${coachTarget}`]] : [])]
      : [];
  select.replaceChildren(...options.map(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; return option; }));
  const help = $("#reflection-sharing-help");
  if (help) help.textContent = !count
    ? role === "parent" ? "No coach is connected. This check-in stays in your family workspace." : "No coach is connected. This check-in stays with you and your family."
    : !hasNamedCoaches ? "Coach sharing is unavailable until every assigned coach has a display name."
    : `Coach sharing sends this check-in to ${coachTarget}.`;
  hide("#reflection-compose", role === "coach" || !reflectionSharingAvailable);
  $("#reflection-title").textContent = role === "parent" ? "What are you noticing?" : "Your check-in";
  $("#reflection-prompt").textContent = role === "parent"
    ? "What have you noticed since the last lesson? What would you like the coach to know before the next one? This is your perspective; the coach’s lesson notes stay separate."
    : "What went well? What felt hard? What do you want to work on next? Short answers are fine.";
  $("#reflection-content-label").firstChild.textContent = role === "parent" ? "Your observations" : "What would you like your support team to know?";
  hide("#reflection-mood-label", role !== "wrestler");
  if (!$("#reflection-date").value) $("#reflection-date").value = new Date().toISOString().slice(0, 10);
}

$("#reflection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (!user || !selectedWrestler || !["parent", "wrestler"].includes(role)) throw new Error("Choose a family or athlete view to add a check-in.");
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
  const taskHtml = tasks.length ? tasks.map((task, index) => `<label class="draft-task"><input type="checkbox" data-task-selected="${index}" ${task.selected ? "checked" : ""}><span><b>${esc(task.origin)}</b><input type="text" data-task-title="${index}" maxlength="140" value="${esc(task.title || "")}" aria-label="Practice item title"><textarea data-task-instructions="${index}" rows="2" aria-label="Practice item instructions">${esc(task.instructions || "")}</textarea><select data-task-audience="${index}" aria-label="Practice item audience"><option value="wrestler" ${task.audience !== "parent" ? "selected" : ""}>Athlete</option><option value="parent" ${task.audience === "parent" ? "selected" : ""}>Parent</option></select></span></label>`).join("") : `<p class="muted">No assignments or suggestions were found in the note. You can add one in the existing practice form below.</p>`;
  const questions = draft.clarification_questions?.length ? `<div class="record-label">CHECK BEFORE SHARING</div><ul>${draft.clarification_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : "";
  const node = $("#draft-review");
  node.innerHTML = `<h4>Quick review before sharing</h4><p class="muted">Check the short lesson recap and practice steps. Nothing is saved or shared until you approve. AI suggestions stay separate from work stated in your note.</p>${draftField("Lesson focus", "focus", draft.focus, 2)}${draftField("Parent lesson recap · edit as needed", "parent_recap", serializeLessonSections(draft.lesson_sections), 9)}${draftField("Coach cue wording from the note", "coach_cues", draft.coach_cues)}${draftField("Observations and development priorities from the note", "observations", draft.observations)}${draftField("Athlete focus", "wrestler_focus", draft.wrestler_focus)}${draftField("Parent support", "parent_support", draft.parent_support)}${draftField("Possible next lesson topics", "follow_up_topics", draft.follow_up_topics)}<h4>Practice checklist</h4>${taskHtml}${questions}<div class="draft-actions"><button type="button" class="primary-button" id="approve-draft">Approve and share plan</button><button type="button" class="secondary-button" id="discard-draft">Discard draft</button></div>`;
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
    p_coach_cues: [value("parent_recap"), value("coach_cues") ? `Coach cue wording:\n${value("coach_cues")}` : ""].filter(Boolean).join("\n\n"),
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

function renderParentDraftReview(draft) {
  parentLessonDraft = draft;
  const suggestions = (draft.practice_suggestions || []).slice(0, 12).map((item) => ({ ...item, selected: false }));
  const taskHtml = suggestions.length ? suggestions.map((task, index) => `<label class="draft-task"><input type="checkbox" data-parent-task-selected="${index}"><span><b>Parent recommendation · review before adding</b><input type="text" data-parent-task-title="${index}" maxlength="140" value="${esc(task.title || "")}" aria-label="Practice item title"><textarea data-parent-task-instructions="${index}" rows="2" aria-label="Practice item instructions">${esc(task.instructions || "")}</textarea></span></label>`).join("") : `<p class="muted">No practice steps were clearly supported by these notes. You can save the recap without a checklist.</p>`;
  const node = $("#parent-draft-review");
  node.innerHTML = `<h4>Review the draft plan</h4><p class="muted">This plan is based on the notes you submitted. Coach wording remains reported wording; suggested steps will be labeled as parent recommendations. The coach has not approved them.</p>${draftField("Lesson focus", "parent_focus", draft.focus, 2)}${draftField("Lesson recap · edit as needed", "parent_recap", serializeLessonSections(draft.lesson_sections), 10)}${draftField("Coach wording reported in the notes", "parent_reported_cues", draft.coach_cues, 4)}${draftField("Parent observations · edit as needed", "parent_observations_review", draft.observations, 4)}<h4>Possible athlete steps</h4><p class="muted">Choose only the steps you want to add. No practice quantity or intensity is added unless it appeared in your notes.</p>${taskHtml}<div class="draft-actions"><button type="button" class="primary-button" id="save-parent-plan">Save recap and selected steps</button><button type="button" class="secondary-button" id="discard-parent-draft">Discard draft</button></div>`;
  node.hidden = false;
  node.querySelector("#discard-parent-draft").addEventListener("click", () => { parentLessonDraft = null; node.replaceChildren(); node.hidden = true; });
  node.querySelector("#save-parent-plan").addEventListener("click", () => run(async () => saveParentPlan(suggestions)));
}

async function saveParentPlan(suggestions) {
  if (!parentLessonDraft || role !== "parent") throw new Error("A parent must review and save this plan.");
  const node = $("#parent-draft-review");
  const value = (key) => node.querySelector(`[data-draft-field="${key}"]`).value.trim();
  const tasks = suggestions.map((task, index) => ({
    selected: node.querySelector(`[data-parent-task-selected="${index}"]`).checked,
    title: node.querySelector(`[data-parent-task-title="${index}"]`).value.trim(),
    instructions: node.querySelector(`[data-parent-task-instructions="${index}"]`).value.trim()
  })).filter((task) => task.selected && task.title);
  if (!value("parent_focus")) throw new Error("Add a lesson focus before saving.");
  if (!value("parent_recap") && !value("parent_observations_review")) throw new Error("Keep at least a short recap or parent observation.");
  const shareWithCoach = $("#parent-share-coach").checked;
  const { error } = await client.rpc("save_parent_lesson_plan", {
    p_wrestler_id: selectedWrestler,
    p_lesson_date: $("#parent-capture-date").value,
    p_lesson_number: $("#parent-capture-number").value ? Number($("#parent-capture-number").value) : null,
    p_focus: value("parent_focus"),
    p_recap: value("parent_recap"),
    p_reported_cues: value("parent_reported_cues"),
    p_parent_observations: value("parent_observations_review"),
    p_share_with_coach: shareWithCoach,
    p_tasks: tasks,
    p_ai_model: "gpt-5.4-mini"
  });
  if (error) throw error;
  parentLessonDraft = null;
  parentCaptureByAthlete.delete(selectedWrestler);
  $("#parent-coach-notes").value = "";
  $("#parent-observations").value = "";
  $("#parent-capture-number").value = "";
  $("#parent-share-coach").checked = false;
  node.replaceChildren(); node.hidden = true;
  notice(shareWithCoach ? "Parent recap saved and shared with the coach. Selected steps are labeled parent recommendations." : "Parent recap saved for the family. Selected steps are labeled parent recommendations.", "good");
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
    else { showSignedOut(); notice(""); }
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
    notice("Your Matwork sign-in link is on its way. Open it on this device to continue; you’ll stay signed in here until you sign out or your session expires.", "good");
  });
});

$("#sign-out").addEventListener("click", () => run(async () => { const { error } = await client.auth.signOut(); if (error) throw error; showSignedOut(); notice("You’re signed out.", "good"); }));
$("#role-switch").addEventListener("change", () => run(async () => { if (role === "parent") rememberParentCapture(selectedWrestler); role = $("#role-switch").value; selectedWrestler = ""; $("#parent-share-coach").checked = false; parentLessonDraft = null; $("#parent-draft-review").replaceChildren(); hide("#parent-draft-review"); await loadWorkspace(); if (role === "parent" && selectedWrestler) restoreParentCapture(selectedWrestler); }));
$("#athlete-picker").addEventListener("change", () => run(async () => { if (role === "parent") rememberParentCapture(selectedWrestler); selectedWrestler = $("#athlete-picker").value; if (role === "parent") restoreParentCapture(selectedWrestler); hide("#invite-result"); await loadRecords(); }));

$("#family-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const { error } = await client.rpc("create_family", { family_label: $("#family-label").value.trim() || "My family" });
    if (error) throw error;
    role = "parent";
    notice("Parent workspace created. Add the athlete profile next.", "good");
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
    notice("Athlete profile added.", "good");
    await loadWorkspace();
  });
});

$("#accept-invite-form").addEventListener("submit", (event) => { event.preventDefault(); run(() => acceptInvite($("#invite-code").value)); });
$("#workspace-accept-invite-form").addEventListener("submit", (event) => { event.preventDefault(); run(() => acceptInvite($("#workspace-invite-code").value, "#workspace-invite-code")); });

document.querySelectorAll("[data-create-invite]").forEach((button) => button.addEventListener("click", () => run(async () => {
  const { data, error } = await client.rpc("create_access_invite", { target_wrestler: selectedWrestler, invite_role: button.dataset.createInvite });
  if (error) throw error;
  const node = $("#invite-result"); node.hidden = false;
  node.innerHTML = `<b>${button.dataset.createInvite === "coach" ? "Coach" : "Athlete"} access code</b><code>${esc(data)}</code>Share this one-time code privately. It expires in seven days and can be used once.`;
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
    notice(`Lesson saved for ${athlete?.first_name || "athlete"}.`, "good");
    await loadRecords();
  });
});

$("#coach-capture-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (role !== "coach" || !selectedWrestler) throw new Error("Select an assigned athlete in the Coach workspace first.");
    if (coachProfilesAvailable && !ownCoachProfile?.display_name) throw new Error("Save your coach display name first so families can see who wrote the lesson.");
    const note = $("#capture-note").value.trim();
    if (note.length < 12) throw new Error("Add a little more detail before organizing the note.");
    let data;
    try {
      const response = await client.functions.invoke("coach-session-draft", { body: { wrestler_id: selectedWrestler, coach_note: note, source_role: "coach" } });
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

$("#parent-note-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (role !== "parent" || !selectedWrestler) throw new Error("Select an athlete in the Parent dashboard first.");
    const coachNotes = $("#parent-coach-notes").value.trim();
    const parentNotes = $("#parent-observations").value.trim();
    const source = [coachNotes ? `COACH NOTES (provided by parent):\n${coachNotes}` : "", parentNotes ? `PARENT OBSERVATIONS:\n${parentNotes}` : ""].filter(Boolean).join("\n\n");
    if (source.length < 12) throw new Error("Add a little more detail before organizing the notes.");
    let data;
    try {
      const response = await client.functions.invoke("coach-session-draft", { body: { wrestler_id: selectedWrestler, coach_note: source, source_role: "parent" } });
      if (response.error) throw response.error;
      data = response.data;
    } catch (error) {
      if (error?.context && typeof error.context.json === "function") {
        try { const detail = await error.context.json(); if (detail?.error) { notice(detail.error, "bad"); return; } } catch { /* Use the general function message below. */ }
      }
      const details = `${error?.message || ""} ${error?.name || ""}`;
      if (/functionsfetcherror|failed to fetch|not found|404|503/i.test(details)) {
        notice("Parent AI planning is still being connected. Your notes remain in these boxes. You can save a parent note without AI below.", "info");
        return;
      }
      throw error;
    }
    if (!data?.draft) throw new Error("The organized draft was empty. Please try again.");
    renderParentDraftReview(data.draft);
    notice("Draft action plan ready. Review the recap and choose any parent-recommended steps to include.", "good");
  });
});

$("#assignment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    if (role === "coach" && coachProfilesAvailable && !ownCoachProfile?.display_name) throw new Error("Save your coach display name first so the athlete and parent can see who assigned this.");
    const { error } = await client.from("practice_assignments").insert({ wrestler_id: selectedWrestler, title: $("#assignment-title").value.trim(), instructions: $("#assignment-instructions").value.trim(), source: role === "coach" ? "coach" : "parent", audience: $("#assignment-audience").value, created_by: user.id, due_date: $("#assignment-due").value || null, coach_origin: role === "parent" ? "parent_suggestion" : "coach_stated", share_with_coach: role === "parent" && $("#assignment-share-coach-input").checked });
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
    notice(checkbox.checked ? "Practice check-in saved for your coach." : "Practice check-in updated.", "good");
    await loadRecords();
  });
});

$("#lesson-date").value = new Date().toISOString().slice(0, 10);
$("#capture-date").value = new Date().toISOString().slice(0, 10);
initialize();

