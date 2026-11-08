// Prueba temporal: qué buscadores y tiendas responden desde un servidor (se ejecuta en GitHub Actions)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const H = { "user-agent": UA, "accept-language": "es-ES,es;q=0.9", accept: "text/html,application/json,*/*" };
async function probe(name, url, pick) {
  try {
    const r = await fetch(url, { headers: H, redirect: "follow", signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    console.log(`\n### ${name} → ${r.status} ${t.length}B`);
    console.log(pick ? pick(t) : t.slice(0, 300).replace(/\s+/g, " "));
  } catch (e) { console.log(`\n### ${name} → ERROR ${e.message}`); }
}
const q = "camisa oxford hombre";
const m = (re, n = 5) => (t) => [...t.matchAll(re)].slice(0, n).map((x) => x[1]).join("\n");
await probe("bing rss", `https://www.bing.com/search?format=rss&q=${encodeURIComponent("site:zara.com " + q)}`, m(/<link>([^<]+)<\/link>/g, 6));
await probe("bing images", `https://www.bing.com/images/async?q=${encodeURIComponent("zara " + q)}&first=0&count=10`, m(/murl&quot;:&quot;([^&]+)&quot;/g));
await probe("ddg html", `https://html.duckduckgo.com/html/?q=${encodeURIComponent("site:zara.com " + q)}`, m(/class="result__a" href="([^"]+)"/g));
await probe("zara search ajax", `https://www.zara.com/es/es/search/home?searchTerm=${encodeURIComponent(q)}&ajax=true`);
await probe("zara itxrest", `https://www.zara.com/itxrest/1/search/store/10701/query?query=${encodeURIComponent(q)}&locale=es_ES&deviceType=desktop&deviceOs=Windows&deviceOsVersion=10&catalogue=0&session=x&offset=0&limit=5&scope=default&origin=default`);
await probe("massimo", `https://www.massimodutti.com/es/search?term=${encodeURIComponent(q)}`);
await probe("hm", `https://www2.hm.com/es_es/search-results.html?q=${encodeURIComponent(q)}`, m(/"(https:\/\/image\.hm\.com[^"]+)"/g));
await probe("mango", `https://shop.mango.com/es/es/search/hombre?q=${encodeURIComponent(q)}`);
await probe("uniqlo api", `https://www.uniqlo.com/es/api/commerce/v5/es/products?q=${encodeURIComponent("camisa oxford")}&limit=3`, (t) => t.slice(0, 400));
await probe("cos", `https://www.cos.com/es-es/search?q=${encodeURIComponent(q)}`);
await probe("google", `https://www.google.com/search?q=${encodeURIComponent("zara " + q)}&tbm=isch`);
