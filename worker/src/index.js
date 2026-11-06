// Armario Atelier — servidor (Cloudflare Worker)
// Guarda la clave de la API de Gemini y solo atiende a las cuentas de Firebase que autorices.
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const STORE_DOMAINS = {
  zara: "zara.com", massimo: "massimodutti.com", hm: "hm.com", mango: "mango.com",
  pull: "pullandbear.com", bershka: "bershka.com", uniqlo: "uniqlo.com", cos: "cos.com",
};
const STORE_NAMES = { zara: "Zara", massimo: "Massimo Dutti", hm: "H&M", mango: "Mango", pull: "Pull&Bear", bershka: "Bershka", uniqlo: "Uniqlo", cos: "COS" };
const SHAPES = "top: camiseta/camisa/jersey/sudadera/top; outer: chaqueta/abrigo/blazer/cazadora; bottom: pantalon/vaquero/falda/shorts; dress: vestido/mono; shoes: zapatillas/zapatos/botas; accessory: bolso/gorro/bufanda/cinturon/otro";
const STYLE_FORMAT = `Responde SOLO con JSON: {"summary": 2-3 frases que describan el estilo, "keywords": 5-7 palabras clave, "palette": [{"name": color en español, "hex": "#rrggbb"}] (5-7 colores), "keyPieces": 6-10 prendas concretas que definen el estilo, "silhouettes": una frase sobre siluetas y proporciones, "avoid": una frase sobre qué no encaja}`;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (req.method !== "POST") throw new HttpError(405, "Método no permitido.");
      await verifyUser(req, env);
      const body = await req.json().catch(() => { throw new HttpError(400, "Petición no válida."); });
      const path = new URL(req.url).pathname;
      const handler = ROUTES[path];
      if (!handler) throw new HttpError(404, "Ruta desconocida.");
      return json(await handler(body, env), 200, cors);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json({ error: e instanceof HttpError ? e.message : "Ha fallado algo en el servidor. Inténtalo de nuevo." }, status, cors);
    }
  },
};

/* ---------- seguridad ---------- */
function corsHeaders(req, env) {
  const origin = req.headers.get("origin") || "";
  const allowed = ["https://localhost", "http://localhost", "capacitor://localhost", "http://localhost:5173", ...(env.ALLOWED_ORIGINS || "").split(",")].map((s) => s.trim()).filter(Boolean);
  return {
    "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0],
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}
async function verifyUser(req, env) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Inicia sesión en la app.");
  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`, audience: env.FIREBASE_PROJECT_ID }));
  } catch { throw new HttpError(401, "Tu sesión ha caducado. Vuelve a entrar."); }
  const allowed = (env.ALLOWED_UIDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) throw new HttpError(403, "Falta autorizar tu cuenta: copia tu identificador desde Ajustes y ponlo en ALLOWED_UIDS del servidor.");
  if (!allowed.includes(payload.sub)) throw new HttpError(403, "Esta cuenta no tiene acceso a la IA de la app.");
  return payload;
}

/* ---------- utilidades ---------- */
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
const imageBlock = (data, mime_type = "image/jpeg") => ({ inline_data: { mime_type, data } });
const textBlock = (text) => ({ text });
function b64(buf) {
  const bytes = new Uint8Array(buf); let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function parseJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fence ? fence[1] : text;
  const a = src.indexOf("{"), b = src.lastIndexOf("}");
  if (a < 0 || b < a) throw new HttpError(502, "La respuesta de la IA ha salido incompleta. Vuelve a intentarlo.");
  try { return JSON.parse(src.slice(a, b + 1)); } catch { throw new HttpError(502, "La respuesta de la IA ha salido incompleta. Vuelve a intentarlo."); }
}
const cleanImg = (s) => {
  if (typeof s !== "string" || s.length < 100) throw new HttpError(400, "Imagen no válida.");
  if (s.length > 7_000_000) throw new HttpError(413, "La imagen es demasiado grande.");
  return s;
};

/** Llamada a la API de Gemini. `content` es texto o lista de partes; `search` activa la búsqueda de Google. */
async function askAI(env, { model, content, maxTokens = 2000, search = false }) {
  const parts = typeof content === "string" ? [{ text: content }] : content;
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6, ...(search ? {} : { responseMimeType: "application/json" }) },
    ...(search ? { tools: [{ google_search: {} }] } : {}),
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new HttpError(429, "Has llegado al límite de peticiones de Gemini por ahora. Espera un rato e inténtalo de nuevo.");
  if (res.status === 400 || res.status === 403) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || "";
    if (/api key|API_KEY/i.test(msg)) throw new HttpError(500, "La clave de Gemini no es válida. Revisa GEMINI_API_KEY en Cloudflare.");
    if (/not found|is not supported/i.test(msg)) throw new HttpError(500, "El modelo de Gemini configurado no existe. Revisa MODEL_MAIN en wrangler.toml.");
    console.error(err); throw new HttpError(502, "Gemini no ha aceptado la petición.");
  }
  if (!res.ok) throw new HttpError(502, "Gemini no está disponible ahora. Inténtalo en un rato.");
  const data = await res.json();
  const cand = data.candidates?.[0];
  if (!cand?.content?.parts?.length) {
    if (data.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") throw new HttpError(422, "Gemini no ha querido analizar esa imagen. Prueba con otra foto.");
    throw new HttpError(502, "Gemini ha devuelto una respuesta vacía. Vuelve a intentarlo.");
  }
  const text = cand.content.parts.map((p) => p.text || "").join("");
  if (search) return { text, sources: (cand.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter(Boolean) };
  return text;
}
const MAIN = (env) => env.MODEL_MAIN || "gemini-3.5-flash";
const FAST = (env) => env.MODEL_FAST || "gemini-3.5-flash";

const wardrobeText = (w = []) => w.slice(0, 300).map((i) => `${i.id} | ${i.name} | ${i.category}/${i.shape} | ${i.color} | ${i.season} | formalidad ${i.formality} | ${(i.tags || []).join(", ")}`).join("\n");
const styleText = (s) => s ? `Resumen: ${s.summary}\nPalabras clave: ${(s.keywords || []).join(", ")}\nPaleta: ${(s.palette || []).map((p) => p.name).join(", ")}\nPrendas clave: ${(s.keyPieces || []).join(", ")}\nSiluetas: ${s.silhouettes || "-"}\nEvitar: ${s.avoid || "-"}` : "(Todavía no hay perfil de estilo: usa un estilo versátil y actual.)";

/* ---------- rutas ---------- */
const ROUTES = {
  // Foto de una prenda → datos para el armario
  async "/api/classify"({ image }, env) {
    const text = await askAI(env, {
      model: FAST(env), maxTokens: 500,
      content: [imageBlock(cleanImg(image)), textBlock(`Eres estilista. La imagen es una prenda o complemento. Responde SOLO con JSON:
{"name": nombre corto en español (ej. "Camisa oxford azul claro"), "category": top|outer|bottom|dress|shoes|accessory, "shape": la forma dentro de su categoría (${SHAPES}), "colorName": color principal en español, "colorHex": "#rrggbb", "season": "todo el año"|"primavera-verano"|"otoño-invierno", "formality": entero 1 (muy casual) a 5 (muy formal), "tags": 3-4 estilos en español}`)],
    });
    return parseJson(text);
  },

  // Armario + estilo + ocasión → 3 outfits
  async "/api/outfits"({ wardrobe, style, occasion, weather }, env) {
    const text = await askAI(env, {
      model: MAIN(env), maxTokens: 1800,
      content: `Eres estilista personal. Propón 3 outfits usando SOLO prendas de este armario (ids exactos).
Ocasión: ${String(occasion || "día a día").slice(0, 200)}. Tiempo: ${String(weather || "no indicado").slice(0, 100)}.
Estilo objetivo:
${styleText(style)}

Armario (id | nombre | tipo/forma | color | temporada | formalidad | estilo):
${wardrobeText(wardrobe)}

Reglas: como máximo una prenda por tipo; o vestido, o parte de arriba + de abajo; incluye calzado si hay. Respeta la temporada y el tiempo. Acerca cada outfit al estilo objetivo.
Responde SOLO con JSON: {"outfits":[{"title": nombre corto, "itemIds":[ids], "why": 1-2 frases de por qué funciona, "tip": un consejo para llevarlo}]}`,
    });
    return parseJson(text);
  },

  // Capturas de pines → perfil de estilo
  async "/api/style/images"({ images }, env) {
    if (!Array.isArray(images) || !images.length) throw new HttpError(400, "Sube al menos una imagen.");
    const blocks = images.slice(0, 10).map((i) => imageBlock(cleanImg(i)));
    const text = await askAI(env, {
      model: MAIN(env), maxTokens: 1500,
      content: [...blocks, textBlock(`Estas imágenes son pines de un tablero de Pinterest con el estilo de ropa que la persona quiere llevar. Analiza el estilo común (prendas, colores, siluetas, ambiente). ${STYLE_FORMAT}`)],
    });
    return { style: parseJson(text) };
  },

  // Enlace de un tablero público → lee su RSS, descarga las imágenes de los pines y las analiza
  async "/api/style/pinterest"({ url }, env) {
    let board = String(url || "").trim();
    if (!/^https?:\/\/(([a-z]+\.)?pinterest\.[a-z.]+\/|pin\.it\/)/i.test(board)) throw new HttpError(400, "Ese enlace no es de Pinterest.");
    const UA = { "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" };
    if (/pin\.it\//i.test(board)) { const r = await fetch(board, { headers: UA, redirect: "follow" }); board = r.url; }
    const u = new URL(board);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) throw new HttpError(400, "Pega el enlace de un tablero (pinterest.com/usuario/tablero), no de tu perfil ni de un pin.");
    const rssUrl = `https://www.pinterest.com/${parts[0]}/${parts[1]}.rss`;
    const rss = await fetch(rssUrl, { headers: UA });
    if (!rss.ok) throw new HttpError(404, "No he podido leer el tablero. Comprueba que es público, o sube capturas.");
    const xml = await rss.text();
    const imgs = [...new Set([...xml.matchAll(/https:\/\/i\.pinimg\.com\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp)/gi)].map((m) => m[0].replace(/\/(236x|474x|170x|75x75_RS|originals)\//, "/564x/")))].slice(0, 12);
    if (!imgs.length) throw new HttpError(404, "El tablero no tiene pines legibles. Comprueba que es público, o sube capturas.");
    const titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?([^<\]]*)/g)].map((m) => m[1]).slice(1, 25).join(" · ");
    const blocks = (await Promise.all(imgs.map(async (src) => {
      try {
        const r = await fetch(src, { headers: UA }); if (!r.ok) return null;
        const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
        if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
        const buf = await r.arrayBuffer(); if (buf.byteLength > 3_500_000) return null;
        return imageBlock(b64(buf), type);
      } catch { return null; }
    }))).filter(Boolean);
    if (!blocks.length) throw new HttpError(502, "No he podido descargar las imágenes de los pines. Prueba subiendo capturas.");
    const text = await askAI(env, {
      model: MAIN(env), maxTokens: 1500,
      content: [...blocks, textBlock(`Estas imágenes son los pines más recientes de un tablero de Pinterest con el estilo de ropa que la persona quiere llevar. Títulos de los pines: ${titles.slice(0, 1500)}
Analiza el estilo común (prendas, colores, siluetas, ambiente). ${STYLE_FORMAT}`)],
    });
    return { style: parseJson(text), pinCount: blocks.length };
  },

  // Armario + estilo → qué falta comprar
  async "/api/gaps"({ wardrobe, style, budget, section }, env) {
    const text = await askAI(env, {
      model: MAIN(env), maxTokens: 2500,
      content: `Eres estilista y personal shopper en España. Compara el armario con el estilo objetivo y decide qué falta comprar para crear más outfits de ese estilo con lo que ya hay. Prioriza básicos versátiles que combinen con muchas prendas existentes. Presupuesto: ${budget || "medio"}. Sección: ${section || "cualquiera"}.
Tiendas posibles (todas con tiendas físicas en España): ${Object.keys(STORE_DOMAINS).join(", ")}. Elige 2-3 por prenda según encaje de estilo y presupuesto.

Estilo objetivo:
${styleText(style)}

Armario (id | nombre | tipo/forma | color | temporada | formalidad | estilo):
${wardrobeText(wardrobe) || "(vacío)"}

Responde SOLO con JSON: {"advice": 2 frases de consejo general, "gaps":[{"piece": prenda concreta, "category": top|outer|bottom|dress|shoes|accessory, "why": 1-2 frases, "priority": "alta"|"media"|"baja", "searchTerm": término corto para buscar en la tienda, "colorHex": "#rrggbb", "priceRange": rango en euros, "stores": [ids de tienda], "combinesWith": [ids de prendas del armario]}]} con 4-7 prendas ordenadas por prioridad.`,
    });
    const r = parseJson(text);
    r.gaps = (r.gaps || []).slice(0, 8).map((g) => ({
      ...g, priority: ["alta", "media", "baja"].includes(g.priority) ? g.priority : "media",
      stores: (g.stores || []).filter((k) => STORE_DOMAINS[k]), colorHex: /^#[0-9a-f]{6}$/i.test(g.colorHex || "") ? g.colorHex : "#888888",
    }));
    return r;
  },

  // Una prenda → modelos reales ahora mismo en las webs de las tiendas (búsqueda web de Claude)
  async "/api/shop"({ piece, searchTerm, colorHint, section, budget, stores }, env) {
    const keys = (stores || []).filter((k) => STORE_DOMAINS[k]);
    const use = keys.length ? keys : ["zara", "massimo", "hm", "mango"];
    const domains = Object.values(STORE_DOMAINS);
    const { text, sources } = await askAI(env, {
      model: MAIN(env), maxTokens: 2500, search: true,
      content: `Busca en Google productos a la venta ahora en las webs españolas de estas tiendas: ${use.map((k) => `${STORE_NAMES[k]} (${STORE_DOMAINS[k]})`).join(", ")}. Solo de esos dominios: ${domains.join(", ")}.
Prenda: "${String(piece).slice(0, 120)}". Búsqueda sugerida: "${String(searchTerm || piece).slice(0, 80)}". Color orientativo ${colorHint || "libre"}, sección ${section || "cualquiera"}, presupuesto ${budget || "medio"}.
Devuelve hasta 6 productos distintos. Usa solo nombres, precios y enlaces que aparezcan en los resultados; si no ves el precio, deja "price" vacío. No inventes productos.
Responde al final SOLO con JSON: {"products":[{"store": nombre de la tienda, "name": nombre del producto, "price": "29,95 €", "url": enlace a la ficha, "color": color si aparece}]}`,
    });
    const r = parseJson(text);
    const okHost = (h) => domains.some((d) => h === d || h.endsWith("." + d));
    const sourceFor = (store) => sources.find((w) => domains.some((d) => (w.title || "").includes(d)) && (w.title || "").toLowerCase().includes(String(STORE_DOMAINS[Object.keys(STORE_NAMES).find((k) => STORE_NAMES[k] === store)] || "~").split(".")[0]));
    r.products = (r.products || []).map((p) => {
      try { const u = new URL(p.url); if (u.protocol === "https:" && okHost(u.hostname)) return p; } catch {}
      const src = sourceFor(p.store); return src ? { ...p, url: src.uri } : null;
    }).filter(Boolean).slice(0, 6);
    return r;
  },
};
