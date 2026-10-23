// A Bun mock of atc's HTTP API for atc.test.ts and the screenshot fixture:
// two machines (`studio`, this server, and `laptop`, a peer), a live list
// in atc's shape with every state and kind the extension tells apart (a
// permission prompt, a question, a plan, your turn, working with a server,
// a terminal session, a stopped one, a parked one), the transcripts, the
// outputs, the folders per machine, and the history. The writes (start,
// resume, send, stop, remove, rename/pin/park, upload) are recorded and
// change the list as atc would. `/api/events` streams the list on connect
// and again on `emit()`; `/api/sessions/{id}/attach` is the terminal's
// websocket, which says the size it has and records what is written. A
// token other than `t-test` is a 401. The sessions and their work are
// invented.
import { now } from "../.pal/sdk/src/clock.ts";
import type { Dir, Message, Outputs, Session } from "../atc/api.ts";

export const TOKEN = "t-test";
/** "Now" on the SDK's clock (`PAL_NOW` when the fixture pins it), so ages read the same every run. */
export const T0 = Math.floor(now() / 60_000) * 60_000;
export const iso = (minsAgo: number) => new Date(T0 - minsAgo * 60_000).toISOString();

export const PARSER = "6f1d2a40-1c2e-4d55-9a10-0b7c3e5d9a01", RELEASE = "7a2e3b51-2d3f-4e66-8b21-1c8d4f6eab12", PLAN = "8b3f4c62-3e40-4f77-9c32-2d9e5a7fbc23", NOTES = "9c405d73-4f51-4088-8d43-3eaf6b80cd34";
export const CHANGELOG = "ad516e84-5062-4199-9e54-4fb07c91de45", MIGRATE = "be627f95-6173-42aa-8f65-50c18da2ef56", TERMINAL = "cf738aa6-7284-43bb-9a76-61d29eb3f067", SPIKE = "d0849bb7-8395-44cc-8b87-72e3afc40178", PARKED = "e195acc8-94a6-45dd-9c98-83f4b0d51289";

const base = (o: Partial<Session> & Pick<Session, "sessionId" | "title" | "state" | "cwd">): Session => ({
  kind: "background", attachable: true, host: "studio", model: "claude-opus-5-5", permissionMode: "default", context: 48_000, startedAt: iso(180), updated: iso(5), ...o,
});

export function initial(): Session[] {
  return [
    base({ sessionId: PARSER, id: "6f1d2a40", title: "Fix the flaky parser test", state: "needs-you", cwd: "/home/ana/proj/parser", branch: "fix-flaky-parser", activity: "Bash  go test ./parser/... -count=20", lastPrompt: "the parser test fails one run in ten, find out why", promptAt: iso(4), updated: iso(1), context: 92_400, pid: 4101 }),
    base({ sessionId: RELEASE, id: "7a2e3b51", host: "laptop", title: "Cut the 2.4 release", state: "needs-you", cwd: "/Users/ana/proj/app", branch: "main", activity: "AskUserQuestion", lastPrompt: "get 2.4 out today", promptAt: iso(12), updated: iso(2), pid: 812 }),
    base({ sessionId: CHANGELOG, id: "ad516e84", title: "Write the changelog", state: "your-turn", cwd: "/home/ana/proj/app", branch: "release-2.4", lastPrompt: "write the changelog for 2.4 from the merged pull requests", lastReply: "The changelog for 2.4 is in CHANGELOG.md: 14 entries under Added, Changed and Fixed.", promptAt: iso(30), updated: iso(22), context: 61_000, pid: 4102 }),
    base({ sessionId: MIGRATE, id: "be627f95", title: "Move the sessions table to Postgres", state: "working", cwd: "/home/ana/proj/api", branch: "postgres", activity: "Edit  internal/db/migrate.go", lastPrompt: "move the sessions table from sqlite to postgres, keep the old reads working", promptAt: iso(9), updated: iso(0), context: 140_000, servers: [5173], pid: 4103 }),
    base({ sessionId: PLAN, id: "8b3f4c62", title: "Plan the search rewrite", state: "needs-you", cwd: "/home/ana/proj/search", activity: "ExitPlanMode", promptAt: iso(15), updated: iso(3), pid: 4104 }),
    base({ sessionId: TERMINAL, kind: "interactive", attachable: false, host: "laptop", title: "notes", state: "your-turn", cwd: "/Users/ana", branch: "HEAD", lastReply: "Done: the notes are sorted by date.", promptAt: iso(60), updated: iso(55), pid: 900 }),
    base({ sessionId: SPIKE, id: "d0849bb7", attachable: false, title: "Spike: streaming exports", state: "stopped", cwd: "/home/ana/proj/api", promptAt: iso(300), updated: iso(290) }),
    base({ sessionId: PARKED, id: "e195acc8", title: "Upgrade the CI runners", state: "your-turn", cwd: "/home/ana/proj/infra", parked: true, promptAt: iso(600), updated: iso(590), pid: 4105 }),
  ];
}

export const transcripts: Record<string, Message[]> = {
  [PARSER]: [
    { role: "user", text: "the parser test fails one run in ten, find out why", time: iso(4) },
    { role: "tool", tool: "Read", detail: "parser/parser_test.go", time: iso(4) },
    { role: "assistant", text: "The test shares a **global buffer** between subtests that run in parallel, so two of them sometimes write into it at once.\n\nI changed each subtest to get its own buffer. Running it 20 times to be sure:", time: iso(3) },
  ],
  [CHANGELOG]: [
    { role: "user", text: "write the changelog for 2.4 from the merged pull requests", time: iso(30) },
    { role: "tool", tool: "Bash", detail: "gh pr list --state merged --base main", time: iso(29) },
    { role: "assistant", text: "The changelog for 2.4 is in `CHANGELOG.md`:\n\n- **Added**: 6 entries\n- **Changed**: 5\n- **Fixed**: 3", time: iso(22) },
  ],
};

export const outputs: Record<string, Outputs> = {
  [MIGRATE]: {
    servers: [{ url: "http://studio:5173", port: 5173, running: true }],
    files: [{ path: "/home/ana/proj/api/internal/db/migrate.go", kind: "code", op: "edited", at: iso(1), size: 4200, url: "/api/sessions/x/o/tok/home/ana/proj/api/internal/db/migrate.go" }],
    links: [{ url: "https://www.postgresql.org/docs/current/sql-copy.html", at: iso(6) }],
  },
};

export const dirs: Record<string, Dir[]> = {
  studio: [{ path: "/home/ana/proj/api", recent: true, git: true }, { path: "/home/ana/proj/parser", recent: true, git: true }, { path: "/home/ana/scratch" }],
  laptop: [{ path: "/Users/ana/proj/app", recent: true, git: true }],
};

type Sock = { data: { id: string }; send: (d: string | Uint8Array) => void; close: () => void };

export class AtcMock {
  sessions = initial();
  history: Session[] = [...initial(), base({ sessionId: "f2a6bdd9-a5b7-4eee-8d09-94a5c1e6239a", kind: "transcript", title: "Rename the config keys", state: "past", cwd: "/home/ana/proj/app", updated: iso(3000), lastPrompt: "rename max_conns to max_connections everywhere" })];
  calls: { method: string; path: string; body?: unknown }[] = [];
  /** What was written into each session's terminal, by background id. */
  keys: Record<string, string[]> = {};
  resized: { cols: number; rows: number }[] = [];
  /** The terminal's size, as the viewer already on it set it. */
  size = { cols: 157, rows: 52 };
  /** Every request answers this status instead (a 500, a 503). */
  failWith = 0;
  private streams = new Set<ReadableStreamDefaultController<string>>();
  private server: ReturnType<typeof Bun.serve>;
  private seq = 0;

  constructor(port = 0) {
    const self = this;
    this.server = Bun.serve<{ id: string }, never>({
      port,
      async fetch(req, srv) {
        const u = new URL(req.url);
        const auth = req.headers.get("authorization");
        if (auth !== `Bearer ${TOKEN}`) return new Response("unauthorized", { status: 401 });
        const attach = u.pathname.match(/^\/api\/sessions\/([^/]+)\/attach$/);
        if (attach) return srv.upgrade(req, { data: { id: attach[1] } }) ? undefined : new Response("upgrade failed", { status: 400 });
        if (self.failWith) return new Response("broken", { status: self.failWith });
        return self.route(req, u);
      },
      websocket: {
        open(ws: Sock) { ws.send(JSON.stringify({ type: "size", cols: self.size.cols, rows: self.size.rows, viewers: 2 })); },
        message(ws: Sock, msg: string | Uint8Array) {
          if (typeof msg === "string") { const c = JSON.parse(msg); if (c.type === "resize") self.resized.push({ cols: c.cols, rows: c.rows }); return; }
          (self.keys[ws.data.id] ??= []).push(new TextDecoder().decode(msg));
        },
      },
    });
  }

  get url() { return `http://127.0.0.1:${this.server.port}`; }
  stop() { for (const c of this.streams) try { c.close(); } catch { /* gone */ } this.server.stop(true); }
  find(key: string) { return this.sessions.find((s) => s.sessionId === key || s.id === key); }
  /** The stream's next event: the list as it is now. */
  emit() { const b = `event: sessions\ndata: ${JSON.stringify(this.sessions)}\n\n`; for (const c of this.streams) try { c.enqueue(b); } catch { this.streams.delete(c); } }
  get streaming() { return this.streams.size; }
  posted(path: string) { return this.calls.filter((c) => c.method !== "GET" && c.path === path); }

  private async route(req: Request, u: URL): Promise<Response> {
    const p = u.pathname, m = req.method;
    let body: unknown;
    if (m !== "GET" && req.headers.get("content-type")?.startsWith("application/json")) body = await req.json();
    if (req.headers.get("content-type")?.startsWith("multipart/")) { const f = (await req.formData()).get("file") as File; body = { name: f.name, size: f.size }; }
    this.calls.push({ method: m, path: p + (u.searchParams.get("host") ? `?host=${u.searchParams.get("host")}` : ""), body });
    const json = (v: unknown) => Response.json(v);
    const sid = p.match(/^\/api\/sessions\/([^/]+)/)?.[1] ?? "";
    if (m === "GET" && p === "/api/me") return json({ host: "studio", home: "/home/ana", hosts: ["studio", "laptop"], peers: [{ name: "laptop" }] });
    if (m === "GET" && p === "/api/sessions") return json(this.sessions);
    if (m === "GET" && p === "/api/history") { const q = (u.searchParams.get("q") ?? "").toLowerCase(); return json(this.history.filter((s) => !q || s.title.toLowerCase().includes(q))); }
    if (m === "GET" && p === "/api/dirs") return json(dirs[u.searchParams.get("host") ?? "studio"] ?? []);
    if (m === "GET" && p === "/api/events") {
      let ctl!: ReadableStreamDefaultController<string>;
      const stream = new ReadableStream<string>({ start: (c) => { ctl = c; this.streams.add(c); c.enqueue(`event: sessions\ndata: ${JSON.stringify(this.sessions)}\n\n`); }, cancel: () => { this.streams.delete(ctl); } });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    }
    if (m === "GET" && p.endsWith("/transcript")) { const t = transcripts[sid]; return t ? json({ messages: t, start: sid === PARSER ? 512 : 0, size: 4096 }) : new Response("no transcript", { status: 404 }); }
    if (m === "GET" && p.endsWith("/outputs")) return json(outputs[sid] ?? { servers: null, links: null, files: null });
    if (m === "POST" && p === "/api/sessions") {
      const b = body as { dir: string; name: string; prompt: string };
      const id = `5e55${String(++this.seq).padStart(4, "0")}`;
      this.sessions.push(base({ sessionId: `${id}-0000-4000-8000-000000000000`, id, title: b.name || b.dir.split("/").pop()!, state: "working", cwd: b.dir, host: u.searchParams.get("host") ?? "studio" }));
      return json({ id });
    }
    if (m === "POST" && p.endsWith("/resume")) {
      const s = this.find(sid);
      if (!s) return new Response(`unknown session ${sid}`, { status: 404 });
      s.id ??= sid.slice(0, 8);
      s.attachable = true;
      s.state = "your-turn";
      return json({ id: s.id });
    }
    if (m === "POST" && p.endsWith("/send")) { const s = this.find(sid); if (s) { s.state = "working"; s.lastPrompt = (body as { text: string }).text; } return json({ id: sid }); }
    if (m === "POST" && p.endsWith("/stop")) { const s = this.find(sid); if (s) { s.state = "stopped"; s.attachable = false; } return json({ id: sid }); }
    if (m === "POST" && p.endsWith("/upload")) return json({ path: `/home/ana/.cache/atc/uploads/${sid}/101500-${(body as { name: string }).name}` });
    if (m === "DELETE") { this.sessions = this.sessions.filter((s) => s.id !== sid); return json({ id: sid }); }
    if (m === "PATCH") { const s = this.find(sid); if (s) Object.assign(s, body); return json({ id: sid }); }
    return new Response("not found", { status: 404 });
  }
}
