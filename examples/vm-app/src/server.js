// Seeded example app (P1-T12): a long-running Node server with ONE seeded crash.
// Bug: getUserName crashes when the user record has no `name` (undefined.name).
// Suite is green except the seeded path; AEGIS reproduces, locks a symptom test, patches, verifies.
import { createServer } from "node:http";

const USERS = {
  alice: { name: "Alice", role: "admin" },
  ghost: { role: "ghost" }, // seeded bug: missing `name`
};

export function getUserName(id) {
  const user = USERS[id];
  if (!user) throw new Error(`Unknown user: ${id}`);
  return user.name.trim(); // TypeError when name is undefined
}

export function createApp() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      res.writeHead(200).end("ok");
      return;
    }
    if (url.pathname === "/user") {
      const name = getUserName(url.searchParams.get("id") ?? "alice");
      res.writeHead(200).end(`hello ${name}`);
      return;
    }
    res.writeHead(404).end("not found");
  });
}

if (process.argv[1]?.endsWith("server.js")) {
  // Boot path used by the direct-boot repro adapter. Crashes on the seeded fault
  // when AEGIS_SEED_FAULT=1 so the sandbox observes the real stack trace.
  if (process.env.AEGIS_SEED_FAULT === "1") {
    getUserName("ghost");
  }
  const port = Number(process.env.PORT ?? 18080);
  createApp().listen(port, () => console.log(`vm-app on :${port}`));
}
