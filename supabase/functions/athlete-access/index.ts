import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://dane789.github.io", "http://127.0.0.1:8892"]);
const headers = (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://dane789.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
};
const respond = (request: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: headers(request) });
const normalizeCode = (value: unknown) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCode = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const makeCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `MW-${[...bytes].map((byte) => alphabet[byte & 31]).join("")}`;
};
const authPassword = (code: string, pin: string) => `Matwork-${code}-${pin}!`;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(request) });
  if (request.method !== "POST") return respond(request, 405, { error: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !anonKey || !serviceKey) return respond(request, 503, { error: "Athlete sign-in is not configured yet." });

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await request.json();
    const action = body?.action;

    if (action === "login") {
      const code = normalizeCode(body?.code);
      const pin = String(body?.pin || "");
      if (code.length < 12 || code.length > 20 || !/^\d{8}$/.test(pin)) {
        return respond(request, 200, { error: "Check the Athlete code and 8-digit PIN, then try again." });
      }
      const codeHash = await hashCode(code);
      const { data: credential } = await service.from("athlete_login_credentials").select("auth_email").eq("code_hash", codeHash).maybeSingle();
      if (!credential) return respond(request, 200, { error: "That code and PIN didn’t work. Check them with your parent and try again." });
      const { data: status, error: throttleError } = await service.rpc("athlete_login_throttle", { p_code_hash: codeHash, p_succeeded: null }).maybeSingle();
      if (throttleError) return respond(request, 503, { error: "Athlete sign-in is temporarily unavailable. Try again later." });
      if (status?.is_locked) return respond(request, 200, { error: "Too many tries. Ask your parent to reset Athlete access, then try again." });
      const loginClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await loginClient.auth.signInWithPassword({
        email: credential.auth_email,
        password: authPassword(code, pin)
      });
      if (error || !data.session) {
        const { error: attemptError } = await service.rpc("athlete_login_throttle", { p_code_hash: codeHash, p_succeeded: false });
        if (attemptError) return respond(request, 503, { error: "Athlete sign-in is temporarily unavailable. Try again later." });
        return respond(request, 200, { error: "That code and PIN didn’t work. Check them with your parent and try again." });
      }
      const { error: resetError } = await service.rpc("athlete_login_throttle", { p_code_hash: codeHash, p_succeeded: true });
      if (resetError) return respond(request, 503, { error: "Athlete sign-in is temporarily unavailable. Try again later." });
      return respond(request, 200, {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
    }

    if (action !== "setup") return respond(request, 400, { error: "Choose a valid Athlete access action." });
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return respond(request, 401, { error: "Sign in to the Parent workspace first." });
    const parentClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: identity, error: identityError } = await parentClient.auth.getUser();
    if (identityError || !identity.user) return respond(request, 401, { error: "Your sign-in has expired. Sign in again." });

    const wrestlerId = typeof body?.wrestler_id === "string" ? body.wrestler_id : "";
    const pin = String(body?.pin || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(wrestlerId) || !/^\d{8}$/.test(pin)) {
      return respond(request, 400, { error: "Choose an athlete and an 8-digit PIN." });
    }
    const { data: isParent, error: accessError } = await parentClient.rpc("is_parent_for", { target_wrestler: wrestlerId });
    if (accessError || !isParent) return respond(request, 403, { error: "Only a parent linked to this Athlete can set up access." });
    const { data: athlete, error: athleteError } = await parentClient.from("wrestlers").select("id,family_id,active").eq("id", wrestlerId).maybeSingle();
    if (athleteError || !athlete?.active) return respond(request, 404, { error: "That Athlete profile is unavailable." });

    const code = makeCode();
    const normalized = normalizeCode(code);
    const codeHash = await hashCode(normalized);
    const authEmail = `athlete-${crypto.randomUUID()}@athlete-login.matwork.invalid`;
    const password = authPassword(normalized, pin);
    const { data: prior, error: priorError } = await service.from("athlete_login_credentials")
      .select("code_hash").eq("wrestler_id", wrestlerId).maybeSingle();
    if (priorError) return respond(request, 503, { error: "Athlete access could not be checked. Please try again." });

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      password,
      user_metadata: { matwork_role: "athlete" }
    });
    if (createError || !created.user) return respond(request, 503, { error: "Athlete sign-in could not be created. Please try again." });
    const authUserId = created.user.id;

    const { data: oldMembership, error: membershipReadError } = await service.from("family_memberships")
      .select("id,user_id").eq("wrestler_id", wrestlerId).eq("role", "wrestler").maybeSingle();
    if (membershipReadError) {
      await service.auth.admin.deleteUser(authUserId);
      return respond(request, 503, { error: "Athlete access could not be saved. Please try again." });
    }
    const membershipWrite = oldMembership
      ? await service.from("family_memberships").update({ user_id: authUserId, family_id: athlete.family_id }).eq("id", oldMembership.id)
      : await service.from("family_memberships").insert({ family_id: athlete.family_id, user_id: authUserId, role: "wrestler", wrestler_id: wrestlerId });
    if (membershipWrite.error) {
      await service.auth.admin.deleteUser(authUserId);
      return respond(request, 503, { error: "Athlete access could not be saved. Please try again." });
    }

    const { error: credentialError } = await service.from("athlete_login_credentials").upsert({
      wrestler_id: wrestlerId,
      auth_user_id: authUserId,
      code_hash: codeHash,
      auth_email: authEmail,
      updated_at: new Date().toISOString()
    }, { onConflict: "wrestler_id" });
    if (credentialError) {
      if (oldMembership) await service.from("family_memberships").update({ user_id: oldMembership.user_id }).eq("id", oldMembership.id);
      else await service.from("family_memberships").delete().eq("wrestler_id", wrestlerId).eq("role", "wrestler");
      await service.auth.admin.deleteUser(authUserId);
      return respond(request, 503, { error: "Athlete access could not be saved. Please try again." });
    }
    if (prior?.code_hash) await service.from("athlete_login_attempts").delete().eq("code_hash", prior.code_hash);
    return respond(request, 200, { access_code: code });
  } catch {
    return respond(request, 500, { error: "Matwork could not complete that request. Please try again." });
  }
});

