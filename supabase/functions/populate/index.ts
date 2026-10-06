// Supabase Edge Function: reads a recipe from a web link for the Add a recipe form.
// Free: no API keys needed. Most recipe sites publish their recipe as structured
// data (schema.org "Recipe"); this reads that. If a page has none, it returns the
// page text and the app picks the recipe out of it.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "–", mdash: "—", deg: "°", frac12: "½", frac14: "¼", frac34: "¾", hellip: "…" };
const decode = (s: string) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+\d*);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();

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

function duration(iso: string): string {
  const m = String(iso || "").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return "";
  const h = (+m[1] || 0) * 24 + (+m[2] || 0), min = +m[3] || 0;
  if (!h && !min) return "";
  return h ? `${h} hr${min ? " " + min : ""}` : `${min} min`;
}

// deno-lint-ignore no-explicit-any
function steps(ins: any): { name: string; steps: string[] }[] {
  if (!ins) return [];
  if (typeof ins === "string") return [{ name: "", steps: decode(ins).split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean) }];
  if (!Array.isArray(ins)) ins = [ins];
  const sections: { name: string; steps: string[] }[] = [];
  let loose: string[] = [];
  for (const it of ins) {
    if (typeof it === "string") loose.push(decode(it));
    else if (it && it["@type"] === "HowToSection") {
      if (loose.length) { sections.push({ name: "", steps: loose }); loose = []; }
      sections.push({ name: decode(it.name || ""), steps: steps(it.itemListElement).flatMap((s) => s.steps) });
    } else if (it) loose.push(decode(it.text || it.name || ""));
  }
  if (loose.length) sections.push({ name: "", steps: loose });
  return sections.map((s) => ({ ...s, steps: s.steps.filter(Boolean) }));
}

function fromSchema(r: any) {
  const secs = steps(r.recipeInstructions);
  const tmSec = secs.find((s) => /thermomix|tm\d/i.test(s.name));
  const convSec = secs.find((s) => /conventional|stovetop|stove top|oven/i.test(s.name));
  const method = tmSec ? tmSec.steps : convSec && secs.length > 1 ? secs.filter((s) => s !== convSec).flatMap((s) => s.steps) : secs.flatMap((s) => s.steps);
  const all = JSON.stringify(r).toLowerCase();
  const yieldv = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
  const desc = decode(r.description || "");
  return {
    title: decode(r.name || ""),
    intro: desc.length > 160 ? desc.split(/(?<=[.!?])\s/)[0] : desc,
    prep: duration(r.prepTime),
    cook: duration(r.cookTime),
    serves: decode(String(yieldv ?? "")).replace(/\s*(servings?|serves|people|portions?)\s*/gi, " ").trim(),
    ingredients: (r.recipeIngredient || r.ingredients || []).map(decode).filter(Boolean),
    method,
    notes: "",
    thermomix: !!tmSec || /thermomix|\bspeed \d|\bmc on\b|varoma/.test(all),
  };
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
    const { key, url } = await req.json();
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ok = await fetch(`${sbUrl}/rest/v1/rpc/cookbook_check`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key }),
    }).then((r) => r.json()).catch(() => false);
    if (ok !== true) return json({ error: "not_allowed" }, 403);
    if (!url) return json({ error: "no_url" }, 400);

    let html = "";
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", Accept: "text/html" } });
      if (!r.ok) throw new Error(String(r.status));
      html = await r.text();
    } catch { return json({ error: "fetch_failed" }, 502); }

    let schema = null;
    for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try { schema = findRecipe(JSON.parse(m[1].trim())); if (schema) break; } catch { /* keep looking */ }
    }
    let photoUrl = "";
    if (schema) {
      const im = schema.image;
      photoUrl = typeof im === "string" ? im : Array.isArray(im) ? (typeof im[0] === "string" ? im[0] : im[0]?.url) : im?.url || "";
    }
    if (!photoUrl) {
      const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (og) photoUrl = og[1];
    }
    const photo = photoUrl ? await imageAsDataUrl(new URL(photoUrl, url).toString()) : null;

    if (schema) return json({ recipe: fromSchema(schema), photo });
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
    return json({ text: decode(text.replace(/\n/g, " ⏎ ")).replace(/ ?⏎ ?/g, "\n").slice(0, 60000), photo });
  } catch (e) {
    return json({ error: "server", detail: String(e) }, 500);
  }
});
