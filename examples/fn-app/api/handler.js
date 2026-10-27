// Seeded serverless function (P2-T09): crashes on missing query param.
export async function handler(req) {
  const url = new URL(req.url ?? "https://x/?", "https://x");
  const id = url.searchParams.get("id");
  // Seeded bug: id.trim() throws when id is null.
  const key = id.trim().toLowerCase();
  return { statusCode: 200, body: JSON.stringify({ key }) };
}
