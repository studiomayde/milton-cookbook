// Supabase Edge Function: reads a recipe from a link, pasted text or photos
// and returns it as structured fields for the Add a recipe form.
// Needs the secret ANTHROPIC_API_KEY (Edge Functions > Secrets).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PROMPT = `Turn this recipe into JSON with exactly these keys:
"title" (string), "intro" (one short sentence or ""), "prep" (like "10 min" or ""), "cook" (like "30 min" or ""),
"serves" (string or ""), "ingredients" (array of strings, one ingredient each with its quantity first in metric, e.g. "500g potato gnocchi"; leave out section headings),
"method" (array of strings, one step each, no numbering; if there are Thermomix and conventional versions, use the Thermomix steps),
"notes" (short tips as one string, or ""), "thermomix" (true if the recipe is written for a Thermomix, otherwise false).
Use Australian English. If there is no recipe, return {"title":""}. Return only the JSON.`;

// deno-lint-ignore no-explicit-any
function findRecipe(node: any): any {
  if (!node) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
  if (typeof node === "object") {
    const t = node["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return node;
    if (node["@graph"]) return findRecipe(node["@graph"]);
  }
  return null;
}

function readPage(html: string) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const r = findRecipe(JSON.parse(m[1].trim())); if (r) return { recipe: r, text: "" }; } catch { /* keep looking */ }
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "'")
    .replace(/\s+/g, " ").trim();
  return { recipe: null, text: text.slice(0, 40000) };
}

async function imageAsDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(s)}`;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { key, text, url, images } = await req.json();
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ok = await fetch(`${sbUrl}/rest/v1/rpc/cookbook_check`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key }),
    }).then((r) => r.json()).catch(() => false);
    if (ok !== true) return json({ error: "not_allowed" }, 403);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "no_key" }, 500);

    let source = "";
    let photoUrl = "";
    if (url) {
      let html = "";
      try {
        const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", Accept: "text/html" } });
        if (!r.ok) throw new Error(String(r.status));
        html = await r.text();
      } catch { return json({ error: "fetch_failed" }, 502); }
      const page = readPage(html);
      if (page.recipe) {
        source = "Recipe data from the web page:\n" + JSON.stringify(page.recipe).slice(0, 40000);
        const im = page.recipe.image;
        photoUrl = typeof im === "string" ? im : Array.isArray(im) ? (typeof im[0] === "string" ? im[0] : im[0]?.url) : im?.url || "";
      } else {
        source = "Text of the web page:\n" + page.text;
      }
      if (!photoUrl) {
        const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (og) photoUrl = og[1];
      }
    } else if (text) {
      source = "Recipe text:\n" + String(text).slice(0, 30000);
    }

    // deno-lint-ignore no-explicit-any
    const content: any[] = [];
    for (const im of (images || []).slice(0, 4)) {
      content.push({ type: "image", source: { type: "base64", media_type: im.media_type || "image/jpeg", data: im.data } });
    }
    content.push({ type: "text", text: PROMPT + "\n\n" + (source || "The recipe is in the attached photo(s), in order. Read any handwriting carefully.") });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: "ai_failed", detail: data?.error?.message }, 502);
    // deno-lint-ignore no-explicit-any
    const out = (data.content || []).map((c: any) => c.text || "").join("");
    // deno-lint-ignore no-explicit-any
    let recipe: any;
    try { recipe = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)); }
    catch { return json({ error: "parse_failed" }, 502); }
    if (photoUrl && url) recipe.photo = await imageAsDataUrl(new URL(photoUrl, url).toString());
    return json(recipe);
  } catch (e) {
    return json({ error: "server", detail: String(e) }, 500);
  }
});
