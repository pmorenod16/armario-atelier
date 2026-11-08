// Armario Atelier — servidor (Cloudflare Worker)
// Guarda la clave de la API de Gemini y solo atiende a las cuentas de Firebase que autorices.
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const STORE_DOMAINS = {
  zara: "zara.com", massimo: "massimodutti.com", hm: "hm.com", mango: "mango.com",
  pull: "pullandbear.com", bershka: "bershka.com", uniqlo: "uniqlo.com", cos: "cos.com",
};
const STORE_NAMES = { zara: "Zara", massimo: "Massimo Dutti", hm: "H&M", mango: "Mango", pull: "Pull&Bear", bershka: "Bershka", uniqlo: "Uniqlo", cos: "COS" };
// Mantener en sincronía con src/catalog.js
const MATERIAL_KEYS = "algodon, lino, lana, cachemira, seda, denim, poliester, nylon, viscosa, cuero, ante, punto, mezcla, otro";
const CATALOG_FOR_AI = `tipo: camiseta, camiseta-ml, polo, tirantes, camisa, camisa-mc, sobrecamisa, jersey, cardigan, sudadera, sudadera-capucha, chaleco-punto, cazadora, chaqueta, americana, abrigo, gabardina, plumifero, parka, chaleco (acolchado), pantalon, chino, vaquero, traje-pantalon, jogger, bermuda, falda, vestido, mono, zapatillas, zapatos, mocasines, botas, botines, sandalias, gorra, gorro, bufanda, cinturon, corbata, reloj, gafas, mochila, bolso, joya, otro
color: blanco, crudo, beige, camel, marron, gris-claro, gris, antracita, negro, azul-marino, azul, celeste, denim, verde, oliva, caqui, rojo, burdeos, rosa, morado, amarillo, mostaza, naranja, multicolor
estampado: liso, rayas, cuadros, estampado, grafico, texturizado, degradado
material: ${MATERIAL_KEYS}
ajuste: slim, regular, relaxed, oversize
temporada: primavera, verano, otono, invierno`;
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

/* ---------- fotos oficiales ---------- */
const BROWSER = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "accept-language": "es-ES,es;q=0.9" };
const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
function parseJsonLoose(text) { try { return JSON.parse(String(text).replace(/^[^{]*/, "").replace(/[^}]*$/, "")); } catch { return null; } }

// Zara (catálogo de Inditex). El formato de la respuesta no está documentado: se recorre buscando productos con fotos.
async function zara(q) {
  const u = `https://www.zara.com/itxrest/1/search/store/10701/query?query=${encodeURIComponent(q)}&locale=es_ES&deviceType=desktop&deviceOs=Windows&deviceOsVersion=10&catalogue=0&session=armario&offset=0&limit=12&scope=default&origin=default&section=MAN`;
  const r = await fetch(u, { headers: { ...BROWSER, accept: "application/json" } });
  if (!r.ok) throw new Error("zara " + r.status);
  return inditexProducts(await r.json(), "https://www.zara.com/es/es/");
}
function inditexImage(m) {
  if (m?.url) return m.url.replace("{width}", "1024").replace(/&?w=\{?width\}?/, "");
  if (m?.path && m?.name) return `https://static.zara.net/photos///${m.path}/w/1024/${m.name}.jpg?ts=${m.timestamp || ""}`;
  return null;
}
function inditexProducts(data, base) {
  const out = [], seen = new Set();
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 9) return;
    if (Array.isArray(o)) return o.forEach((x) => walk(x, depth + 1));
    const c = o.content && typeof o.content === "object" ? o.content : o;
    if (typeof c.name === "string" && (c.xmedia || c.detail?.colors)) {
      const colors = c.detail?.colors?.length ? c.detail.colors : [{ name: c.colorName || "", xmedia: c.xmedia }];
      for (const col of colors) {
        const media = col.xmedia || c.xmedia || [];
        const images = media.map(inditexImage).filter(Boolean).slice(0, 8);
        const id = `${c.id}-${col.id || col.name}`;
        if (!images.length || seen.has(id)) continue;
        seen.add(id);
        out.push({
          name: c.name, color: col.name || "", ref: c.detail?.displayReference || col.reference || null,
          price: (col.price ?? c.price) ? `${((col.price ?? c.price) / 100).toFixed(2).replace(".", ",")} €` : null,
          url: c.seo?.keyword ? `${base}${c.seo.keyword}-p${c.seo.seoProductId || ""}.html` : null, images,
        });
      }
      return;
    }
    Object.values(o).forEach((v) => walk(v, depth + 1));
  };
  walk(data);
  return out;
}
const OFFICIAL = { zara };

/** Ficha de producto de cualquier web: nombre e imágenes desde JSON-LD u og:image. */
async function productFromPage(url) {
  const r = await fetch(url, { headers: BROWSER, redirect: "follow" });
  if (!r.ok) return null;
  const html = (await r.text()).slice(0, 1_500_000);
  const images = new Set(); let name = null, price = null, brand = null, color = "";
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const j = parseJsonLoose(m[1]); const list = [].concat(j?.["@graph"] || j || []);
    for (const x of list) if (/Product/i.test([].concat(x?.["@type"]).join())) {
      name ||= x.name; [].concat(x.image || []).forEach((i) => images.add(typeof i === "string" ? i : i?.url));
      brand ||= typeof x.brand === "string" ? x.brand : x.brand?.name || null; color ||= x.color || "";
      const off = [].concat(x.offers || [])[0]; if (off?.price) price ||= `${off.price} ${off.priceCurrency || "€"}`;
    }
  }
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1];
  if (og) images.add(og.replace(/&amp;/g, "&"));
  name ||= html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] || null;
  const imgs = [...images].filter(Boolean).map((i) => new URL(i, url).href).slice(0, 8);
  brand ||= html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1] || null;
  return imgs.length ? { name, brand, color, ref: null, price, url, images: imgs } : null;
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

const SEARCH_UNAVAILABLE = "La búsqueda de modelos necesita la clave gratuita de Tavily (TAVILY_API_KEY) o facturación en Gemini. Mientras, usa los botones de las tiendas de arriba.";

/** Llamada a la API de Gemini. `content` es texto o lista de partes; `search` activa la búsqueda de Google. */
async function askGemini(env, { model, content, maxTokens = 2000, search = false }) {
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
  if (res.status === 429) {
    console.warn("Gemini 429", model, search ? "(búsqueda)" : "", (await res.text()).slice(0, 500));
    throw new HttpError(429, search ? SEARCH_UNAVAILABLE : "Has llegado al límite de peticiones de Gemini por ahora. Espera un rato e inténtalo de nuevo.");
  }
  if (res.status === 400 || res.status === 403) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || "";
    if (/api key|API_KEY/i.test(msg)) throw new HttpError(500, "La clave de Gemini no es válida. Revisa GEMINI_API_KEY en Cloudflare.");
    if (/not found|is not supported/i.test(msg)) throw new HttpError(500, "El modelo de Gemini configurado no existe. Revisa MODEL_MAIN en wrangler.toml.");
    console.error(err); throw new HttpError(502, "Gemini no ha aceptado la petición.");
  }
  if (!res.ok) {
    console.warn("Gemini", res.status, model, (await res.text()).slice(0, 300));
    throw new HttpError(search ? 429 : 502, search ? SEARCH_UNAVAILABLE : "Gemini no está disponible ahora. Inténtalo en un rato.");
  }
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
/**
 * IA con reserva: primero Gemini; si no hay clave, se agota el límite o Gemini falla,
 * pasa a NVIDIA (build.nvidia.com, gratis). La búsqueda en tiendas solo existe en Gemini.
 */
async function askAI(env, opts) {
  const hasNvidia = !!env.NVIDIA_API_KEY;
  if (!env.GEMINI_API_KEY) {
    if (hasNvidia && !opts.search) return askNvidia(env, opts);
    throw new HttpError(500, "Falta la clave de Gemini en el servidor (GEMINI_API_KEY).");
  }
  try {
    return await askGemini(env, opts);
  } catch (e) {
    // La búsqueda con Google tiene cupos gratuitos distintos según el modelo: probar el de reserva
    if (opts.search && e instanceof HttpError && e.status === 429 && env.MODEL_SEARCH_FALLBACK && env.MODEL_SEARCH_FALLBACK !== opts.model) {
      return askGemini(env, { ...opts, model: env.MODEL_SEARCH_FALLBACK });
    }
    const retryable = e instanceof HttpError && [429, 500, 502].includes(e.status);
    if (!hasNvidia || opts.search || !retryable) throw e;
    console.warn("Gemini falló, uso NVIDIA:", e.message);
    return askNvidia(env, opts);
  }
}

/** Llamada a NVIDIA (formato compatible con OpenAI). Los modelos de visión admiten pocas imágenes por petición. */
async function askNvidia(env, { content, maxTokens = 2000 }) {
  const parts = typeof content === "string" ? [{ text: content }] : content;
  const maxImages = Number(env.NVIDIA_MAX_IMAGES || 1);
  const images = parts.filter((p) => p.inline_data).slice(0, maxImages);
  const text = parts.filter((p) => p.text).map((p) => p.text).join("\n\n")
    + (parts.filter((p) => p.inline_data).length > images.length ? `\n\n(Solo se adjunta${images.length > 1 ? "n" : ""} ${images.length} de las imágenes.)` : "")
    + "\n\nResponde solo con el JSON pedido, sin texto antes ni después.";
  const model = images.length ? (env.NVIDIA_VISION_MODEL || "meta/llama-3.2-90b-vision-instruct") : (env.NVIDIA_TEXT_MODEL || "meta/llama-3.3-70b-instruct");
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.NVIDIA_API_KEY}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.5,
      messages: [{ role: "user", content: [{ type: "text", text }, ...images.map((p) => ({ type: "image_url", image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } }))] }],
    }),
  });
  if (res.status === 429) throw new HttpError(429, "Se ha agotado el límite gratuito de la IA por ahora. Espera un rato e inténtalo de nuevo.");
  if (res.status === 401 || res.status === 403) throw new HttpError(500, "La clave de NVIDIA no es válida o el modelo no está activado en tu cuenta. Revisa NVIDIA_API_KEY.");
  if (!res.ok) throw new HttpError(502, "La IA no está disponible ahora. Inténtalo en un rato.");
  const data = await res.json();
  const out = data.choices?.[0]?.message?.content;
  if (!out) throw new HttpError(502, "La IA ha devuelto una respuesta vacía. Vuelve a intentarlo.");
  return out;
}
const MAIN = (env) => env.MODEL_MAIN || "gemini-3.5-flash";
const FAST = (env) => env.MODEL_FAST || "gemini-3.5-flash";

const wardrobeText = (w = []) => w.slice(0, 300).map((i) => `${i.id} | ${i.name} | ${i.category}/${i.shape} | ${i.color} | ${i.season} | formalidad ${i.formality} | ${(i.tags || []).join(", ")}`).join("\n");
const styleText = (s) => s ? `Resumen: ${s.summary}\nPalabras clave: ${(s.keywords || []).join(", ")}\nPaleta: ${(s.palette || []).map((p) => p.name).join(", ")}\nPrendas clave: ${(s.keyPieces || []).join(", ")}\nSiluetas: ${s.silhouettes || "-"}\nEvitar: ${s.avoid || "-"}` : "(Todavía no hay perfil de estilo: usa un estilo versátil y actual.)";

/* ---------- rutas ---------- */
const ROUTES = {
  // Foto de una prenda → datos para el armario (claves del catálogo de src/catalog.js)
  async "/api/classify"({ image }, env) {
    const text = await askAI(env, {
      model: FAST(env), maxTokens: 700,
      content: [imageBlock(cleanImg(image)), textBlock(`Eres estilista y experto en ropa de hombre. La imagen es una prenda o complemento. Usa SOLO estas claves:
${CATALOG_FOR_AI}
Responde SOLO con JSON:
{"name": nombre corto en español (ej. "Camisa oxford azul claro"), "type": clave de tipo, "colors": [{"k": clave de color, "hex": "#rrggbb" tono exacto}] (1-3, el principal primero), "pattern": clave de estampado, "materialKey": clave de material o null si no se distingue, "fit": clave de ajuste o null, "seasons": [claves de temporada en que se puede llevar], "formality": entero 1 (muy casual) a 5 (formal), "styleTags": 2-4 estilos en español en minúscula (ej. "minimal", "clásico", "workwear"), "brand": marca solo si se ve un logo o etiqueta legible, si no null}`)],
    });
    return parseJson(text);
  },

  // Foto de la etiqueta interior → marca, talla, composición y cuidado
  async "/api/label"({ image }, env) {
    const text = await askAI(env, {
      model: FAST(env), maxTokens: 500,
      content: [imageBlock(cleanImg(image)), textBlock(`La imagen es la etiqueta interior de una prenda (marca, talla, composición, lavado). Lee solo lo que se vea; lo que no se lea, null. Claves de material: ${MATERIAL_KEYS}.
Responde SOLO con JSON: {"brand": marca o null, "size": talla tal cual (ej. "M", "42", "W32 L32") o null, "material": composición en español tal cual (ej. "98% algodón, 2% elastano") o null, "materialKey": clave del material mayoritario o null, "care": instrucciones de lavado en español resumidas a partir de los símbolos o el texto (ej. "Lavar a 30 °C, no usar secadora, planchar a temperatura baja") o null, "madeIn": país de fabricación o null, "ref": referencia o modelo del producto tal cual si aparece (ej. "1234/567/800", "MOD 0123/456") o null}`)],
    });
    return parseJson(text);
  },

  // Marca + referencia/nombre → productos de la web oficial con sus fotos
  async "/api/official"({ brand, ref, name, type, color }, env) {
    const b = norm(brand);
    const terms = [ref && String(ref).replace(/^(ref|mod)\.?\s*/i, "").trim(), [name || type, color].filter(Boolean).join(" ")].filter(Boolean);
    if (!terms.length) throw new HttpError(400, "Faltan datos para buscar la prenda.");
    const shop = Object.entries(OFFICIAL).find(([k]) => b.includes(k))?.[1];
    if (shop) {
      for (const q of terms) {
        const found = await shop(q).catch((e) => { console.warn("tienda", brand, e.message); return []; });
        if (found.length) return { source: "tienda", products: found.slice(0, 6) };
      }
    }
    // otras marcas: búsqueda de Google a través de Gemini (necesita crédito en la cuenta de Gemini)
    try {
      const { text, sources } = await askGemini(env, {
        model: env.MODEL_SEARCH_FALLBACK || FAST(env), maxTokens: 800, search: true,
        content: `Busca en la web oficial de la marca "${String(brand || "").slice(0, 60)}" la ficha del producto: ${terms.map((x) => `"${String(x).slice(0, 80)}"`).join(" o ")}. Responde SOLO con JSON {"urls": [hasta 3 enlaces a fichas de producto de la web oficial]}.`,
      });
      const urls = [...new Set([...(parseJsonLoose(text)?.urls || []), ...sources.map((x) => x.uri)])].slice(0, 4);
      const products = (await Promise.all(urls.map((u) => productFromPage(u).catch(() => null)))).filter(Boolean);
      return { source: "busqueda", products };
    } catch (e) {
      return { source: null, products: [], reason: shop ? "no-encontrada" : "sin-busqueda" };
    }
  },

  // Enlace de una ficha de producto (p. ej. copiado de Google Lens) → nombre y fotos oficiales
  async "/api/product"({ url }) {
    let u; try { u = new URL(String(url).trim().match(/https?:\/\/\S+/)?.[0] || ""); } catch { throw new HttpError(400, "Ese enlace no es válido. Copia el enlace completo de la prenda."); }
    const p = await productFromPage(u.href).catch(() => null);
    if (!p) throw new HttpError(422, "No he podido leer esa página. Algunas tiendas no dejan; prueba con el enlace de otra tienda que la venda.");
    return { source: "enlace", products: [p] };
  },

  // Descarga una foto oficial (la app no puede por CORS) y la devuelve en base64
  async "/api/image"({ url }) {
    let u; try { u = new URL(url); } catch { throw new HttpError(400, "Enlace no válido."); }
    if (u.protocol !== "https:") throw new HttpError(400, "Enlace no válido.");
    const r = await fetch(u, { headers: BROWSER });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) throw new HttpError(502, "No se ha podido descargar la foto oficial.");
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 6_000_000) throw new HttpError(413, "La foto oficial es demasiado grande.");
    return { image: b64(buf), mime: type.split(";")[0] };
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
    const okHost = (h) => domains.some((d) => h === d || h.endsWith("." + d));
    const okUrl = (url) => { try { const u = new URL(url); return u.protocol === "https:" && okHost(u.hostname); } catch { return false; } };
    const storeOf = (url) => { try { const h = new URL(url).hostname; const k = Object.keys(STORE_DOMAINS).find((k) => h === STORE_DOMAINS[k] || h.endsWith("." + STORE_DOMAINS[k])); return STORE_NAMES[k] || h; } catch { return ""; } };
    const term = String(searchTerm || piece).slice(0, 80);

    // 1) Gratis: Tavily busca solo en las webs de las tiendas y la IA (sin búsqueda) extrae los productos
    // Limpia la clave: espacios, saltos de línea o comillas que se cuelan al copiarla
    const tavilyKey = String(env.TAVILY_API_KEY || "").replace(/[\s"'`]/g, "");
    if (tavilyKey) {
      if (!tavilyKey.startsWith("tvly-")) throw new HttpError(500, "La clave de Tavily no tiene el formato correcto (debe empezar por tvly-). Vuelve a copiarla de app.tavily.com y guárdala otra vez en TAVILY_API_KEY.");
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${tavilyKey}` },
        body: JSON.stringify({
          query: `${term} ${section === "mujer" ? "mujer" : section === "hombre" ? "hombre" : ""} comprar`.trim(),
          include_domains: use.map((k) => STORE_DOMAINS[k]), max_results: 12, search_depth: "basic", country: "spain", language: "es",
        }),
      });
      if (res.status === 401 || res.status === 403) {
        console.warn("Tavily", res.status, `clave ${tavilyKey.slice(0, 9)}… (${tavilyKey.length} caracteres)`, (await res.text()).slice(0, 300));
        throw new HttpError(500, `Tavily ha rechazado la clave (empieza por ${tavilyKey.slice(0, 9)}… y tiene ${tavilyKey.length} caracteres). Comprueba en app.tavily.com que coincide y guárdala de nuevo en TAVILY_API_KEY.`);
      }
      if (res.status === 429 || res.status === 432 || res.status === 433) throw new HttpError(429, "Se han acabado las búsquedas gratuitas de este mes. Usa los botones de las tiendas.");
      if (!res.ok) { console.warn("Tavily", res.status, (await res.text()).slice(0, 300)); throw new HttpError(502, "El buscador de tiendas no responde ahora. Usa los botones de las tiendas."); }
      const found = ((await res.json()).results || []).filter((x) => okUrl(x.url)).slice(0, 12);
      if (!found.length) return { products: [] };
      const list = found.map((x, i) => `[${i}] ${storeOf(x.url)} | ${x.title} | ${x.url}\n${String(x.content || "").slice(0, 400)}`).join("\n\n");
      const r = parseJson(await askAI(env, {
        model: FAST(env), maxTokens: 1500,
        content: `Estos son resultados de búsqueda en webs de tiendas de ropa. Elige hasta 6 que sean fichas de producto (no categorías ni ayuda) y encajen con: "${String(piece).slice(0, 120)}" (color orientativo ${colorHint || "libre"}, presupuesto ${budget || "medio"}).
Usa solo datos que aparezcan en el texto; si no aparece el precio, deja "price" vacío. No inventes nada.
Responde SOLO con JSON: {"products":[{"i": número del resultado, "name": nombre del producto, "price": "29,95 €", "color": color si aparece}]}

${list}`,
      }));
      return {
        products: (r.products || []).map((p) => { const x = found[Number(p.i)]; return x ? { store: storeOf(x.url), name: String(p.name || x.title).slice(0, 120), price: String(p.price || ""), color: String(p.color || ""), url: x.url } : null; })
          .filter(Boolean).slice(0, 6),
      };
    }

    // 2) Con facturación en Gemini: búsqueda de Google integrada
    const { text, sources } = await askAI(env, {
      model: MAIN(env), maxTokens: 2500, search: true,
      content: `Busca en Google productos a la venta ahora en las webs españolas de estas tiendas: ${use.map((k) => `${STORE_NAMES[k]} (${STORE_DOMAINS[k]})`).join(", ")}. Solo de esos dominios: ${domains.join(", ")}.
Prenda: "${String(piece).slice(0, 120)}". Búsqueda sugerida: "${term}". Color orientativo ${colorHint || "libre"}, sección ${section || "cualquiera"}, presupuesto ${budget || "medio"}.
Devuelve hasta 6 productos distintos. Usa solo nombres, precios y enlaces que aparezcan en los resultados; si no ves el precio, deja "price" vacío. No inventes productos.
Responde al final SOLO con JSON: {"products":[{"store": nombre de la tienda, "name": nombre del producto, "price": "29,95 €", "url": enlace a la ficha, "color": color si aparece}]}`,
    });
    const r = parseJson(text);
    const sourceFor = (store) => sources.find((w) => domains.some((d) => (w.title || "").includes(d)) && (w.title || "").toLowerCase().includes(String(STORE_DOMAINS[Object.keys(STORE_NAMES).find((k) => STORE_NAMES[k] === store)] || "~").split(".")[0]));
    r.products = (r.products || []).map((p) => {
      if (okUrl(p.url)) return p;
      const src = sourceFor(p.store); return src ? { ...p, url: src.uri } : null;
    }).filter(Boolean).slice(0, 6);
    return r;
  },
};
