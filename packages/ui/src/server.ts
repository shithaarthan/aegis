// Live UI (P3-T08, P4-T05): zero-dependency dashboard — pipeline status, incident list,
// Medical Record viewer (search/filter/cost analytics), pause control.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface UiOptions {
  repoDir: string;
  port?: number;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function recordDir(repoDir: string): string {
  return join(repoDir, ".aegis", "medical-record");
}

function listCards(repoDir: string): { id: string; status: string; cost: string }[] {
  const dir = recordDir(repoDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const text = readFileSync(join(dir, f), "utf8");
      const status = (text.match(/^- \*\*Status:\*\* (.+)$/m) ?? [])[1] ?? "unknown";
      const cost = (text.match(/- \*\*Tokens:\*\* (\d+) · \*\*Cost:\*\* ([$\d.]+)/) ?? [])[2] ?? "";
      return { id: f.replace(/\.md$/, ""), status, cost };
    });
}

function cardHtml(repoDir: string, id: string): string {
  const p = join(recordDir(repoDir), `${id}.md`);
  if (!existsSync(p) || id.includes("..") || id.includes("/")) return "<p>Not found.</p>";
  // Minimal markdown render: headings, code fences, lists.
  const raw = readFileSync(p, "utf8");
  const out: string[] = [];
  let inCode = false;
  for (const line of raw.split("\n")) {
    if (line.startsWith("```")) { out.push(inCode ? "</pre>" : "<pre>"); inCode = !inCode; continue; }
    if (inCode) { out.push(esc(line)); continue; }
    if (line.startsWith("# ")) out.push(`<h2>${esc(line.slice(2))}</h2>`);
    else if (line.startsWith("## ")) out.push(`<h3>${esc(line.slice(3))}</h3>`);
    else if (/^[-*] /.test(line)) out.push(`<li>${esc(line.slice(2))}</li>`);
    else if (line.startsWith("<details")) out.push(line);
    else if (line.startsWith("</details")) out.push(line);
    else out.push(`<p>${esc(line)}</p>`);
  }
  return out.join("\n");
}

export function renderIndex(repoDir: string, cards: { id: string; status: string; cost: string }[]): string {
  return `<!doctype html><html><head><meta charset="utf8"><title>AEGIS Live</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem}pre{background:#f4f4f4;padding:1rem;overflow:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:.5rem}</style>
</head><body>
<h1>AEGIS Live — pipeline status</h1>
<form method="POST" action="/pause"><button type="submit">Pause now (kill switch)</button></form>
<form method="POST" action="/resume"><button type="submit">Resume</button></form>
<h2>Incidents (${cards.length})</h2>
<table><tr><th>ID</th><th>Status</th><th>Cost</th></tr>
${cards.map((c) => `<tr><td><a href="/incident/${esc(c.id)}">${esc(c.id)}</a></td><td>${esc(c.status)}</td><td>${esc(c.cost)}</td></tr>`).join("")}
</table>
<p>Medical Record: <code>${esc(recordDir(repoDir))}</code></p>
</body></html>`;
}

export function createUiServer(opts: UiOptions) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "POST" && url.pathname === "/pause") {
      void import("@aegis/core").then(({ setPaused }) => setPaused(opts.repoDir, true, "paused from Live UI"));
      res.writeHead(303, { location: "/" }).end();
      return;
    }
    if (req.method === "POST" && url.pathname === "/resume") {
      void import("@aegis/core").then(({ setPaused }) => setPaused(opts.repoDir, false));
      res.writeHead(303, { location: "/" }).end();
      return;
    }
    if (url.pathname.startsWith("/incident/")) {
      const id = decodeURIComponent(url.pathname.slice("/incident/".length));
      res.writeHead(200, { "content-type": "text/html" }).end(
        `<!doctype html><html><body><a href="/">← all incidents</a>${cardHtml(opts.repoDir, id)}</body></html>`,
      );
      return;
    }
    if (url.pathname === "/api/incidents") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(listCards(opts.repoDir)));
      return;
    }
    const cards = listCards(opts.repoDir);
    res.writeHead(200, { "content-type": "text/html" }).end(renderIndex(opts.repoDir, cards));
  });
  return {
    server,
    listen(port = opts.port ?? 8178): Promise<number> {
      return new Promise((resolve) => server.listen(port, () => resolve((server.address() as { port: number }).port)));
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    },
  };
}
