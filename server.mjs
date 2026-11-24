// Agent Runner: a tiny dashboard that fires Claude Code routines (scheduled tasks)
// through their API trigger and shows the resulting session, PR, and check status.
// No dependencies. Node 18+.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
await loadDotEnv(path.join(ROOT, ".env"));

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const RUNS_FILE = path.join(DATA_DIR, "runs.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const PASSWORD = process.env.DASHBOARD_PASSWORD;
const DEMO = process.env.DEMO === "1";
const FIRE_URL_RE = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

if (!PASSWORD) { console.error("Missing DASHBOARD_PASSWORD (set it in .env)"); process.exit(1); }

// ---------- storage ----------
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJson(file, data, mode = 0o600) {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode });
  await fs.rename(tmp, file);
}
const readRuns = () => readJson(RUNS_FILE, []);
const writeRuns = (runs) => writeJson(RUNS_FILE, runs.slice(0, 200));

async function readConfig() {
  const c = await readJson(CONFIG_FILE, null);
  if (c) return c;
  // First start: seed from .env if values are there.
  const seed = { githubToken: process.env.GITHUB_TOKEN || "", projects: [] };
  if (process.env.ROUTINE_FIRE_URL && process.env.ROUTINE_TOKEN) {
    seed.projects.push({ id: crypto.randomUUID(), name: "Default", fireUrl: process.env.ROUTINE_FIRE_URL,
      token: process.env.ROUTINE_TOKEN, repo: process.env.GITHUB_REPO || "" });
  }
  await writeJson(CONFIG_FILE, seed);
  return seed;
}
const hint = (s) => (s ? "…" + s.slice(-4) : "");
function publicConfig(c) {
  return {
    demo: DEMO,
    github: { set: !!c.githubToken, hint: hint(c.githubToken) },
    projects: c.projects.map((p) => ({ id: p.id, name: p.name, fireUrl: p.fireUrl, repo: p.repo, tokenSet: !!p.token, tokenHint: hint(p.token) })),
  };
}
function validateProject(p, { requireToken }) {
  if (!p.name?.trim()) return "Name is required";
  if (!DEMO && !FIRE_URL_RE.test(p.fireUrl || "")) return "Fire URL must look like https://api.anthropic.com/v1/claude_code/routines/trig_…/fire";
  if (requireToken && !DEMO && !p.token) return "Token is required";
  if (p.token && !DEMO && !p.token.startsWith("sk-ant-oat01-")) return "Token should start with sk-ant-oat01-";
  if (p.repo && !REPO_RE.test(p.repo)) return "Repo must be owner/name";
  return null;
}

// ---------- routine fire ----------
async function fireRoutine(project, text) {
  if (DEMO) {
    const id = "session_DEMO" + crypto.randomBytes(6).toString("hex");
    return { sessionId: id, sessionUrl: `https://claude.ai/code/${id}` };
  }
  const r = await fetch(project.fireUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${project.token}`,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    let msg = body?.error?.message || `Routine fire failed (HTTP ${r.status})`;
    if (r.status === 429) msg = `Rate limited. Retry after ${r.headers.get("retry-after") || "a while"}s.`;
    if (r.status === 401) msg = "Routine token rejected. Regenerate it on claude.ai/code/routines and update it in Settings.";
    const err = new Error(msg); err.status = r.status === 429 ? 429 : 502; throw err;
  }
  return { sessionId: body.claude_code_session_id, sessionUrl: body.claude_code_session_url };
}

// ---------- GitHub ----------
const prCache = new Map(); // repo -> { at, data }
async function gh(token, p) {
  const r = await fetch(`https://api.github.com${p}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}${r.status === 401 ? " (token rejected)" : r.status === 404 ? " (repo not found or no access)" : ""}`);
  return r.json();
}
async function checksFor(token, repo, sha, prUrl) {
  const { check_runs = [] } = await gh(token, `/repos/${repo}/commits/${sha}/check-runs?per_page=100`);
  let state = "none";
  if (check_runs.length) {
    if (check_runs.some((c) => c.status !== "completed")) state = "pending";
    else if (check_runs.some((c) => ["failure", "timed_out", "cancelled", "action_required"].includes(c.conclusion))) state = "failure";
    else state = "success";
  }
  return { state, url: `${prUrl}/checks` };
}
async function openPrs(token, repo) {
  if (!token || !repo) return null;
  const c = prCache.get(repo);
  if (c && Date.now() - c.at < 20_000) return c.data;
  // state=all so runs can show "merged"/"closed"; checks are fetched only for open PRs.
  const list = await gh(token, `/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=30`);
  const prs = await Promise.all(list.map(async (p) => ({
    repo, number: p.number, title: p.title, url: p.html_url, draft: p.draft, branch: p.head.ref,
    state: p.merged_at ? "merged" : p.state, body: p.body || "", createdAt: p.created_at, updatedAt: p.updated_at,
    checks: p.state === "open" ? await checksFor(token, repo, p.head.sha, p.html_url).catch(() => null) : null,
  })));
  prCache.set(repo, { at: Date.now(), data: prs });
  return prs;
}
// Claude Code on the web links its session in the PR body; match on session id.
function prForSession(prs, sessionId) {
  if (!prs || !sessionId) return null;
  const p = prs.find((x) => x.body.includes(sessionId));
  return p ? { number: p.number, url: p.url, draft: p.draft, state: p.state, checks: p.checks } : null;
}

// ---------- http ----------
function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}
function authed(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const pass = Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":");
  const a = Buffer.from(pass), b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw new Error("Body too large"); }
  return JSON.parse(raw || "{}");
}
const clean = (s) => String(s ?? "").trim();

async function handle(req, res, url) {
  const m = req.method, p = url.pathname;

  if (m === "GET" && (p === "/" || p === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(await fs.readFile(path.join(ROOT, "public", "index.html")));
  }

  if (m === "GET" && p === "/manifest.webmanifest") {
    res.writeHead(200, { "content-type": "application/manifest+json" });
    return res.end(JSON.stringify({ name: "Agent Runner", short_name: "Agents", start_url: "/", display: "standalone",
      background_color: "#0d0f13", theme_color: "#0d0f13", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }] }));
  }
  if (m === "GET" && p === "/icon.svg") {
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=86400" });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#f26b2a"/><path fill="#fff" d="M282 96 132 300h116l-18 116 150-204H264z"/></svg>`);
  }

  // Vendored front-end libraries (e.g. Motion). Only plain *.js files in public/vendor.
  const vm = m === "GET" && p.match(/^\/vendor\/([\w.-]+\.js)$/);
  if (vm) {
    try {
      const js = await fs.readFile(path.join(ROOT, "public", "vendor", vm[1]));
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" });
      return res.end(js);
    } catch { return send(res, 404, { error: "Not found" }); }
  }

  // Mutations must be JSON: blocks cross-site form posts riding on cached Basic auth.
  if (m !== "GET" && !(req.headers["content-type"] || "").startsWith("application/json")) {
    return send(res, 415, { error: "Expected application/json" });
  }

  if (m === "GET" && p === "/api/config") return send(res, 200, publicConfig(await readConfig()));

  if (m === "PUT" && p === "/api/config/github") {
    const { token } = await body(req);
    const c = await readConfig();
    c.githubToken = clean(token);
    await writeJson(CONFIG_FILE, c); prCache.clear();
    return send(res, 200, publicConfig(c));
  }

  if (m === "POST" && p === "/api/github/test") {
    const c = await readConfig();
    if (!c.githubToken) return send(res, 400, { error: "No GitHub token saved" });
    try { await gh(c.githubToken, "/rate_limit"); } catch (e) { return send(res, 400, { error: e.message }); }
    const repos = [...new Set(c.projects.map((x) => x.repo).filter(Boolean))];
    const results = await Promise.all(repos.map(async (repo) => {
      try { await gh(c.githubToken, `/repos/${repo}/pulls?per_page=1`); return { repo, ok: true }; }
      catch (e) { return { repo, ok: false, error: e.message }; }
    }));
    return send(res, 200, { results });
  }

  if (m === "POST" && p === "/api/projects") {
    const b = await body(req);
    const proj = { id: crypto.randomUUID(), name: clean(b.name), fireUrl: clean(b.fireUrl), token: clean(b.token), repo: clean(b.repo) };
    const err = validateProject(proj, { requireToken: true });
    if (err) return send(res, 400, { error: err });
    const c = await readConfig(); c.projects.push(proj);
    await writeJson(CONFIG_FILE, c);
    return send(res, 200, publicConfig(c));
  }

  const pm = p.match(/^\/api\/projects\/([\w-]+)$/);
  if (pm && (m === "PUT" || m === "DELETE")) {
    const c = await readConfig();
    const i = c.projects.findIndex((x) => x.id === pm[1]);
    if (i < 0) return send(res, 404, { error: "Project not found" });
    if (m === "DELETE") c.projects.splice(i, 1);
    else {
      const b = await body(req);
      const next = { ...c.projects[i], name: clean(b.name), fireUrl: clean(b.fireUrl), repo: clean(b.repo) };
      if (clean(b.token)) next.token = clean(b.token); // blank = keep existing
      const err = validateProject(next, { requireToken: true });
      if (err) return send(res, 400, { error: err });
      c.projects[i] = next;
    }
    await writeJson(CONFIG_FILE, c); prCache.clear();
    return send(res, 200, publicConfig(c));
  }

  if (m === "POST" && p === "/api/run") {
    const b = await body(req);
    const text = clean(b.prompt);
    if (!text) return send(res, 400, { error: "Prompt is empty" });
    if (text.length > 65_536) return send(res, 400, { error: "Prompt exceeds 65,536 characters" });
    const c = await readConfig();
    const proj = c.projects.find((x) => x.id === b.projectId);
    if (!proj) return send(res, 400, { error: "Pick a project (add one in Settings)" });
    const run = { id: crypto.randomUUID(), projectId: proj.id, project: proj.name, repo: proj.repo, prompt: text, createdAt: new Date().toISOString() };
    try { Object.assign(run, await fireRoutine(proj, text)); }
    catch (e) { run.error = e.message; await writeRuns([run, ...(await readRuns())]); return send(res, e.status || 502, { error: e.message }); }
    await writeRuns([run, ...(await readRuns())]);
    return send(res, 200, run);
  }

  if (m === "GET" && p === "/api/runs") {
    const runs = (await readRuns()).slice(0, 100);
    const c = await readConfig();
    const repos = [...new Set(runs.map((r) => r.repo).filter(Boolean))];
    const byRepo = Object.fromEntries(await Promise.all(repos.map(async (r) => [r, await openPrs(c.githubToken, r).catch(() => null)])));
    return send(res, 200, { runs: runs.map((r) => ({ ...r, pr: prForSession(byRepo[r.repo], r.sessionId) })) });
  }

  const rm = p.match(/^\/api\/runs\/([\w-]+)$/);
  if (rm && m === "DELETE") {
    const runs = await readRuns();
    const next = runs.filter((r) => r.id !== rm[1]);
    if (next.length === runs.length) return send(res, 404, { error: "Run not found" });
    await writeRuns(next);
    return send(res, 200, { ok: true });
  }

  if (m === "GET" && p === "/api/prs") {
    const c = await readConfig();
    const repos = [...new Set(c.projects.map((x) => x.repo).filter(Boolean))];
    if (!c.githubToken || !repos.length) return send(res, 200, { prs: [], configured: false });
    const errors = [];
    const lists = await Promise.all(repos.map((r) => openPrs(c.githubToken, r).catch((e) => { errors.push(`${r}: ${e.message}`); return []; })));
    const prs = lists.flat().filter((x) => x.state === "open").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ body, ...x }) => x);
    return send(res, 200, { prs, configured: true, errors });
  }

  send(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  if (!authed(req)) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="Agent Runner"' });
    return res.end("Authentication required");
  }
  try { await handle(req, res, new URL(req.url, "http://x")); }
  catch (e) { console.error(e); send(res, 500, { error: e.message }); }
});
server.listen(PORT, HOST, () => console.log(`Agent Runner on http://${HOST}:${PORT}${DEMO ? " (DEMO mode: runs are faked)" : ""}`));

async function loadDotEnv(file) {
  let txt; try { txt = await fs.readFile(file, "utf8"); } catch { return; }
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
