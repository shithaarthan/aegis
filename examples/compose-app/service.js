import { createServer } from "node:http";

export function parsePort(raw) {
  // Seeded bug: raw.split crashes when PORT is unset (undefined).
  const port = raw.split(":")[0];
  return Number(port);
}

if (process.argv[1]?.endsWith("service.js")) {
  if (process.env.AEGIS_SEED_FAULT === "1") parsePort(undefined);
  createServer((req, res) => res.writeHead(200).end("ok")).listen(8080);
}
