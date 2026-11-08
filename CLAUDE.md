# Armario Atelier — guía para Claude Code

App personal de Polete (estudiante de ingeniería, Girona) para clasificar su armario, montar outfits con las fotos reales de sus prendas, sacar su estilo de un tablero de Pinterest y decidir qué comprar y dónde. Funciona como **APK de Android** (Capacitor) y como **PWA instalable en el ordenador** (GitHub Pages), con el mismo código.

## Idioma y tono
- Toda la interfaz, los mensajes de error y los comentarios del código en **español**.
- Mensajes de error: dicen qué ha pasado y qué hacer, sin disculpas. Nunca mostrar textos técnicos al usuario.

## Especificación y fases
**`ESPECIFICACION.md` manda**: son las decisiones de Polete. Se construye por fases y cada una se enseña y se aprueba antes de empezar la siguiente:
1. Armario (aprobada el 8/11) · 2. Outfits del día (aprobada el 8/11; extras propuestos aplazados) · 3. Estilo (aprobada el 8/11, con recrear pin, varios tableros y revisión automática) · 4. Compras (construida el 8/11, pendiente de su revisión: dos listas de huecos, modelos reales, lista de deseos, modo tienda).
Sin claves ni cuentas nuevas para Polete: servicios gratis sin clave (Open-Meteo, BigDataCloud) y lo que ya hay (Firebase, Worker con Gemini/NVIDIA).

## Estructura
```
index.html              Carcasa: acceso, navegación (abajo en el móvil, lateral en el ordenador), #view, #onboarding
src/main.js             Arranque, acceso, bienvenida, rutas por hash (#/hoy #/armario #/compras #/perfil), botón atrás de Android
src/i18n.js             Todos los textos (t("clave")). Idioma nuevo = copiar el bloque es
src/catalog.js          Tipos, colores, estampados, materiales, ajustes, temporadas, tallas. Se guardan claves; worker CATALOG_FOR_AI debe coincidir
src/data.js             Firestore: prendas, imágenes, perfil (store + subscribe), normaliza prendas del formato antiguo
src/ui.js               $/esc/toast/hojas/fotos/inclinación 3D/halo de color/iconos
src/pinterest.js        Lee el tablero desde el dispositivo. En el APK: tablero entero por páginas con la API interna de la web (BoardResource + BoardFeedResource, hasta 300), luego widget, RSS y página. En la web, el widget público de Pinterest (JSONP widgets.pinterest.com/v3/pidgets/boards/{u}/{t}/pins/): Pinterest bloquea a los servidores. Orden en style.js: móvil lee → /api/style/pins → (si falla la descarga) el móvil baja las fotos → /api/style/images → (si el widget falla) /api/style/pinterest en el servidor
src/lens.js             Google Lens sin claves: en Android comparte la foto (@capacitor/share + filesystem) para elegir Lens; en el ordenador abre lens.google.com/v3/upload con la foto. Después el usuario pega el enlace de la tienda → /api/product
src/places.js           GPS (@capacitor/geolocation o navegador) + Open-Meteo (buscar ciudad) + BigDataCloud (nombre de la ciudad)
src/views/today.js      Hoy (tiempo + plan → /api/outfits, outfit con las fotos (board.js), cómo llevarlo, me gusta, "me lo pongo"), Calendario (wear por día, sin estrenar) y Maleta (/api/packing)
src/views/picker.js     Elegir prendas del armario (apuntar lo que llevaste)
src/weather.js          Open-Meteo sin clave: hoy por horas, viaje (previsión ≤16 días; más lejos, mismos días del año pasado con archive-api)
src/views/closet.js     Armario: búsqueda, grupos, filtros, orden, cuadrícula
src/views/item.js       Ficha: estado disponible/sucia/prestada, editar, eliminar (doble pulsación)
src/views/add.js        Añadir/editar: foto o enlace de la tienda (/api/product → elegir foto → mismo flujo), recorte + IA en paralelo, foto de etiqueta → busca la foto oficial de la marca (findOfficial) y deja elegirla; guarda officialImage/officialUrl/officialRef/photoSource
src/views/form.js       Formulario de prenda con marcas "Leído por la IA"
src/views/shop.js       Compras (#/compras): pestañas Te falta (/api/gaps → dos listas combine/style; cada hueco «Buscar modelos» → /api/shop, resultados guardados por hueco), Deseos (wishlist; añadir por enlace con /api/product, «Ver precio» vuelve a leer la ficha, «Ya lo tengo» lo abre en Añadir con su foto) y Modo tienda (foto + precio opcional → /api/shop/check). sizeFor(type) saca la talla del perfil
src/views/profile.js    Perfil y bienvenida: tallas, ubicaciones, idioma, cuenta
src/stylesync.js        Leer tablero + sacar estilo (readBoardPins/analyzePins) y autoRefresh(): cada 3 días (main.js, 6 s tras arrancar) mira si cada tablero tiene pines nuevos (pinSig) y, si cambia, lo vuelve a analizar; se desactiva por tablero con autoOff
src/views/style.js      Mi estilo (#/estilo, desde Perfil y Hoy): pestañas de tableros (principal + extra con su uso: salir, eventos…); tocar un pin = «Recréame este pin» (/api/style/recreate); enlace del tablero → /api/style/pinterest o capturas → /api/style/images; moodboard, paleta, fórmulas, prendas clave, detalles; "Tu armario y tu estilo" (/api/style/match); ajustes propios (notes) que mandan sobre la IA. data.styleText() lo resume para outfits, maleta y compras
src/views/board.js      Outfit = lienzo limpio (estilo Whering) con las fotos de las prendas, rectas y de la cabeza a los pies (autoLayout por capa). Modo "Colocar a mi gusto": arrastrar, tamaño (esquina, pellizco, rueda), traer al frente; se guarda en users/{uid}/layouts/{ids ordenados} {boxes:{id:[l,t,w,h,z]}}. Sin maniquí por decisión de Polete (8/11/2026); el 3D quedó en el historial de git
src/cutout.js           Quita el fondo en el dispositivo; devuelve también tone (color para el halo) y thumb (miniatura dataURL)
src/firebase.js, api.js, config.js, styles.css (tokens claro/oscuro; halo con @property)
worker/src/index.js     Cloudflare Worker (ver API)
```
La carpeta `android/` no se versiona: la genera CI con `npx cap add android`.

## Comandos
```bash
npm install && npm run dev      # web en http://localhost:5173
npm run build                   # dist/ (lo usan Capacitor y Pages)
npm run android                 # build + cap sync + abrir Android Studio
cd worker && npx wrangler dev   # servidor local en :8787
cd worker && npx wrangler deploy
```

## Modelo de datos (Firestore)
- `users/{uid}/items/{id}`: `name, type (clave de catalog.js), layer, colors[{k,hex}], pattern, brand, size, material (texto de la etiqueta), materialKey, fit, seasons[], formality 1-5, styleTags[], care, notes, status (disponible|sucia|prestada), thumb (dataURL webp ~10 KB), tone (#hex), hasImage, aspect, imageVersion, cutMethod, createdAt, updatedAt`. Las prendas antiguas (category/shape/colorHex) se adaptan al leer (data.js normalizeItem).
- `users/{uid}/images/{id}`: `data` (WebP en base64), `mime, width, height`. **Límite de 1 MiB por documento**: recorte ≤600 KB y se rechaza base64 > 980 000.
- `users/{uid}/meta/profile`: `onboarded, sizes{camiseta,camisa,jersey,americana,pantalon,vaquero,calzado}, places[{id,name,region,lat,lon}], activePlace, language`
- `users/{uid}/wear/{AAAA-MM-DD}`: `date, itemIds[], title, plan, how[], weather{t,min,max,code}`. Al apuntar se suma `wearCount` y `lastWorn` en cada prenda.
- `users/{uid}/feedback/{ids ordenados}`: `itemIds, liked, title, plan, at` (me gusta / no me gusta).
- `users/{uid}/meta/today`: propuestas del día (`date, plan, placeId, weather, outfits[{title,itemIds,why,how[],tucked[],repeats[]}], missing`).
- `users/{uid}/trips/{id}`: `dest{name,region,lat,lon}, start, days, plan, weather{source,days[]}, pack[], outfits[{day,title,itemIds,how}], tips, missing, packed[]`.
- `users/{uid}/layouts/{ids ordenados}`: `boxes{itemId:[left,top,width,height,z]}` en % del lienzo 4:5, `at`.
- `users/{uid}/meta/style`: tablero principal en los campos de arriba + `extra[{id,use,…mismos campos}]` (otros tableros; data.boardsOf/saveBoard/addBoard/removeBoard; styleText los manda todos con su uso y la IA elige según el plan) + `pinSig, checkedAt, autoOff` por tablero. Campos: `name, mix[{name,share,look}], summary, keywords[], palette[{name,hex}], keyPieces[], formulas[], fabrics, silhouettes, footwear, avoid, notes (de Polete), source (pinterest|capturas), boardUrl, pins[{img,link}] (URLs de pinimg o miniaturas dataURL), pinCount, analyzed, analyzedAt, match{score,fits[],off[],note,at,items}`.
- `users/{uid}/meta/shopping`: `advice, combine[GAP], style[GAP], at, items, results{gapId:{products[],links[],size,searched}}`; GAP = `{id,kind,piece,type,color,colorHex,why,priority,searchTerm,priceMin,priceMax,pairsWith[ids],newOutfits,stores[]}`.
- `users/{uid}/wishlist/{id}`: `name, store, price, priceNum, oldPrice, url, image (URL o dataURL del modo tienda), color, gap, pairsWith[], verdict (justo|caro|barato), size, bought, boughtAt, addedAt, checkedAt`.
- `users/{uid}/outfits/`: de la versión anterior, sin uso.
- No se usa Firebase Storage a propósito (exige plan Blaze).

## API del Worker (POST, `Authorization: Bearer <idToken de Firebase>`)
| Ruta | Entrada | Salida |
|---|---|---|
| `/api/classify` | `{image}` JPEG base64 | `{name,type,colors[{k,hex}],pattern,materialKey,fit,seasons,formality,styleTags,brand}` con claves del catálogo |
| `/api/label` | `{image}` foto de la etiqueta | `{brand,size,material,materialKey,care,madeIn,ref}` |
| `/api/official` | `{brand, ref, name, type, color}` | `{source, products:[{name,color,ref,price,url,images[]}], reason?}`. Zara: catálogo público `itxrest` de Inditex (tienda 10701 = España; respondió 200 desde un servidor el 8/11/2026, formato de productos sin verificar: se recorre el JSON buscando objetos con `name` + `xmedia`). Otras marcas: búsqueda de Google vía Gemini (necesita crédito) + JSON-LD/og:image de la ficha. H&M, COS y Mango bloquean servidores (403/429) |
| `/api/product` | `{url}` ficha de producto (p. ej. copiada de Google Lens) | `{source:"enlace", products:[…]}` desde JSON-LD/og:image |
| `/api/image` | `{url}` | `{image, mime}`: descarga la foto oficial (la app no puede por CORS) |
| `/api/outfits` | `{wardrobe[{id,name,type,colors,pattern,material,fit,formality,seasons,styleTags,wears}], plan, weather (texto), style, likes, dislikes, recent[{date,itemIds}], exclude, count}` | `{outfits:[{title,itemIds,why,how[],tucked[],repeats[]}], missing}` (ids filtrados al armario) |
| `/api/packing` | `{wardrobe, destination, days, plan, weather, style}` | `{pack[], days[{day,title,itemIds,how}], tips[], missing}` |
| `/api/style/images` | `{images[]}` (hasta 12) | `{style}` |
| `/api/style/pinterest` | `{url}` tablero público (también pin.it) → widget público `widgets.pinterest.com/v3/pidgets/boards/{u}/{t}/pins/` (hasta 50) y, si falla, `{u}/{t}.rss`; analiza hasta 40 pines repartidos (MAX_ANALYZE, a 236x); STYLE_FORMAT incluye mix[{name,share,look}] (mezcla de estéticas) y las notas de Polete se mandan como pista (hint) | `{style, pins[{img,link}], pinCount, analyzed, board}`. Sin probar en real desde un servidor |
| `/api/style/resolve` | `{url}` pin.it | `{url}` del tablero |
| `/api/style/pins` | `{board, pins[{img,link}], titles}` leídos por el móvil (src/pinterest.js, widget JSONP) | `{style, analyzed}`; si no puede bajar las fotos responde 424 "IMAGENES" y la app las baja ella y usa `/api/style/images` |
| `/api/style/recreate` | `{image (base64) o url (pinimg), wardrobe, style}` | `{title, look[], itemIds, likeness 0-100, why, how[], missing[{piece,why}]}` |
| `/api/style/match` | `{style (texto), wardrobe}` | `{score 0-100, fits[], off[], note}` |
| `/api/gaps` | `{wardrobe, style (texto), sizes}` | `{advice, combine[GAP], style[GAP]}` (ver meta/shopping); precio razonable min-max por prenda |
| `/api/shop` | `{piece, searchTerm, color, priceMin, priceMax, stores, size}` → Zara (buscador itxrest, sección hombre) + búsqueda de Google con Gemini para el resto (solo si hay crédito; si no, se ignora) + ficha (productFromPage) para fotos/precio; la IA (FAST) descarta lo que no es esa prenda y ordena; `verdict` por precio: barato (< 0,6·min), caro (> 1,35·max), justo | `{products[{store,name,price,priceNum,color,url,image,verdict}], links[{store,url}] (buscador de cada tienda), size, searched}`. TAVILY ya no se usa |
| `/api/shop/check` | `{image, price?, wardrobe, style, sizes}` (modo tienda) | `{name,type,verdict si|quizas|no,score,headline,styleFit,outfits[{title,itemIds,how}],similar[],price,priceMin,priceMax,priceNote,check[],size}` |

IA: **Gemini** (decisión de Polete: coste cero; tiene Google AI Pro con 10 $/mes de crédito de Cloud). Modelos en `wrangler.toml`: `MODEL_MAIN` y `MODEL_FAST` = `gemini-3.5-flash`. Llamadas REST a `generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent` con `x-goog-api-key`; JSON forzado con `responseMimeType` salvo en la búsqueda (no se puede combinar con `google_search`). La clave va como secreto `GEMINI_API_KEY`, nunca en el código. **Reserva:** `askAI` prueba Gemini (`askGemini`) y, si no hay clave o falla con 429/5xx, usa NVIDIA (`askNvidia`, `integrate.api.nvidia.com/v1/chat/completions`, formato OpenAI; visión `meta/llama-3.2-90b-vision-instruct` con 1 imagen por petición, texto `meta/llama-3.3-70b-instruct`; secreto `NVIDIA_API_KEY`). La búsqueda en tiendas (`search: true`) no tiene reserva y **no funciona en el plan gratuito de Gemini** (429 RESOURCE_EXHAUSTED, comprobado el 6/11/2026): necesita facturación/créditos; si falla devuelve SEARCH_UNAVAILABLE y la app muestra los enlaces de las tiendas. Probado en real: `/api/gaps` funciona con Gemini gratis. Tiendas: zara, massimo, hm, mango, pull, bershka, uniqlo, cos (todas con tiendas físicas en España); los ids coinciden en `worker/src/index.js` (STORE_DOMAINS).

## Detalles que hay que respetar
- El origen de Capacitor 8 en Android es `https://localhost`; la web de Pages debe estar en `ALLOWED_ORIGINS` del Worker.
- Google en Android: `android-config/google-services.json` (lo copia `patch-android.mjs`), `rgcfaIncludeGoogle` en variables.gradle, y firma fija desde el secreto `ANDROID_DEBUG_KEYSTORE` (SHA-1 `CF:0F:B5:87:4C:53:9B:50:39:DB:3A:A8:C0:06:71:48:FB:DB:1C:94` registrada en Firebase). Firebase JS fijado en 12.x por compatibilidad con el plugin.
- `ALLOWED_UIDS` vacío = el Worker rechaza a todos (a propósito). El usuario copia su uid desde Perfil → Cuenta.
- Las fotos van siempre por `shrinkPhoto` antes de procesarlas o enviarlas.
- `@imgly/background-removal` es AGPL-3.0: bien para uso personal; avisar si se plantea publicar la app.
- Antes de dar algo por terminado: `npm run build` sin errores y mirar las pantallas tocadas en móvil y ordenador, claro y oscuro.

## Pruebas sin conexión a Firebase
Para probar la interfaz en local sin cuenta: un vite.config aparte con un plugin `resolveId` que sustituya `firebase.js` y `api.js` por versiones en memoria (ver historial). No dejar ese archivo en el repo.

## Estado
Fase 4 (Compras) construida y probada con datos simulados (8/11/2026); /api/shop probado con respuestas simuladas de Zara. Sin probar en real: el formato de la búsqueda de Zara y la búsqueda de Google con Gemini (necesita crédito). Fase 3 construida y probada con datos simulados (8/11/2026). Fase 2 construida y probada con datos simulados (8/11/2026). Fase 1 (Armario) construida: bienvenida, perfil, añadir con recorte + IA + etiqueta, armario con filtros, ficha con estado. Probada con datos simulados en móvil/ordenador y claro/oscuro. Pendiente: revisión de Polete; probar en real la clasificación, la etiqueta y el GPS en el APK.
Funciona de antes: login con Google en web, `/api/gaps` con Gemini, APK firmado en Actions, web en https://pmorenod16.github.io/armario-atelier/.
