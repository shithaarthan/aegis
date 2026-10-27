import { createServer } from "node:http";

export function total(items) {
  // Seeded bug: items.reduce crashes when items is undefined.
  return items.reduce((a, b) => a + b.price * b.qty, 0);
}

if (process.argv[1]?.endsWith("server.js")) {
  if (process.env.AEGIS_SEED_FAULT === "1") total(undefined);
  createServer((req, res) => res.writeHead(200).end("ok")).listen(process.env.PORT ?? 18082);
}
