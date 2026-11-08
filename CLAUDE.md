# Armario Atelier — guía para Claude Code

App personal de Polete (estudiante de ingeniería, Girona) para clasificar su armario, montar outfits con las fotos reales de sus prendas, sacar su estilo de un tablero de Pinterest y decidir qué comprar y dónde. Funciona como **APK de Android** (Capacitor) y como **PWA instalable en el ordenador** (GitHub Pages), con el mismo código.

## Idioma y tono
- Toda la interfaz, los mensajes de error y los comentarios del código en **español**.
- Mensajes de error: dicen qué ha pasado y qué hacer, sin disculpas. Nunca mostrar textos técnicos al usuario.

## Especificación y fases
**`ESPECIFICACION.md` manda**: son las decisiones de Polete. Se construye por fases y cada una se enseña y se aprueba antes de empezar la siguiente:
1. Armario (aprobada el 8/11) · 2. Outfits del día (aprobada el 8/11; extras propuestos aplazados) · 3. Estilo (Pinterest; construida, pendiente de su revisión) · 4. Compras (huecos, recomendaciones reales, lista de deseos, modo tienda).
Sin claves ni cuentas nuevas para Polete: servicios gratis sin clave (Open-Meteo, BigDataCloud) y lo que ya hay (Firebase, Worker con Gemini/NVIDIA).

## Estructura
```
index.html              Carcasa: acceso, navegación (abajo en el móvil, lateral en el ordenador), #view, #onboarding
src/main.js             Arranque, acceso, bienvenida, rutas por hash (#/hoy #/armario #/compras #/perfil), botón atrás de Android
src/i18n.js             Todos los textos (t("clave")). Idioma nuevo = copiar el bloque es
src/catalog.js          Tipos, colores, estampados, materiales, ajustes, temporadas, tallas. Se guardan claves; worker CATALOG_FOR_AI debe coincidir
src/data.js             Firestore: prendas, imágenes, perfil (store + subscribe), normaliza prendas del formato antiguo
src/ui.js               $/esc/toast/hojas/fotos/inclinación 3D/halo de color/iconos
src/pinterest.js        Lee el tablero desde el dispositivo con el widget público de Pinterest (JSONP widgets.pinterest.com/v3/pidgets/boards/{u}/{t}/pins/): Pinterest bloquea a los servidores. Orden en style.js: móvil lee → /api/style/pins → (si falla la descarga) el móvil baja las fotos → /api/style/images → (si el widget falla) /api/style/pinterest en el servidor
src/lens.js             Google Lens sin claves: en Android comparte la foto (@capacitor/share + filesystem) para elegir Lens; en el ordenador abre lens.google.com/v3/upload con la foto. Después el usuario pega el enlace de la tienda → /api/product
src/places.js           GPS (@capacitor/geolocation o navegador) + Open-Meteo (buscar ciudad) + BigDataCloud (nombre de la ciudad)
src/views/today.js      Hoy (tiempo + plan → /api/outfits, outfit con las fotos (board.js), cómo llevarlo, me gusta, "me lo pongo"), Calendario (wear por día, sin estrenar) y Maleta (/api/packing)
src/views/picker.js     Elegir prendas del armario (apuntar lo que llevaste)
src/weather.js          Open-Meteo sin clave: hoy por horas, viaje (previsión ≤16 días; más lejos, mismos días del año pasado con archive-api)
src/views/closet.js     Armario: búsqueda, grupos, filtros, orden, cuadrícula
src/views/item.js       Ficha: estado disponible/sucia/prestada, editar, eliminar (doble pulsación)
src/views/add.js        Añadir/editar: foto o enlace de la tienda (/api/product → elegir foto → mismo flujo), recorte + IA en paralelo, foto de etiqueta → busca la foto oficial de la marca (findOfficial) y deja elegirla; guarda officialImage/officialUrl/officialRef/photoSource
src/views/form.js       Formulario de prenda con marcas "Leído por la IA"
src/views/profile.js    Perfil y bienvenida: tallas, ubicaciones, idioma, cuenta
src/views/style.js      Mi estilo (#/estilo, desde Perfil y Hoy): enlace del tablero → /api/style/pinterest o capturas → /api/style/images; moodboard, paleta, fórmulas, prendas clave, detalles; "Tu armario y tu estilo" (/api/style/match); ajustes propios (notes) que mandan sobre la IA. data.styleText() lo resume para outfits, maleta y compras
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
- `users/{uid}/meta/style`: `name, summary, keywords[], palette[{name,hex}], keyPieces[], formulas[], fabrics, silhouettes, footwear, avoid, notes (de Polete), source (pinterest|capturas), boardUrl, pins[{img,link}] (URLs de pinimg o miniaturas dataURL), pinCount, analyzed, analyzedAt, match{score,fits[],off[],note,at,items}`.
- `users/{uid}/meta/shopping`, `outfits/`: de la versión anterior; se rehacen en la fase 4.
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
| `/api/style/pinterest` | `{url}` tablero público (también pin.it) → widget público `widgets.pinterest.com/v3/pidgets/boards/{u}/{t}/pins/` (hasta 50) y, si falla, `{u}/{t}.rss`; analiza 16 pines repartidos | `{style, pins[{img,link}], pinCount, analyzed, board}`. Sin probar en real desde un servidor |
| `/api/style/resolve` | `{url}` pin.it | `{url}` del tablero |
| `/api/style/pins` | `{board, pins[{img,link}], titles}` leídos por el móvil (src/pinterest.js, widget JSONP) | `{style, analyzed}`; si no puede bajar las fotos responde 424 "IMAGENES" y la app las baja ella y usa `/api/style/images` |
| `/api/style/match` | `{style (texto), wardrobe}` | `{score 0-100, fits[], off[], note}` |
| `/api/gaps` | `{wardrobe, style, budget, section}` | `{advice, gaps}` |
| `/api/shop` | `{piece, searchTerm, colorHint, section, budget, stores}` → si hay `TAVILY_API_KEY`: Tavily (`include_domains` = tiendas, gratis 1.000/mes) + Gemini sin búsqueda elige productos por índice; si no, Gemini con búsqueda de Google; enlaces filtrados a los dominios de las tiendas (si no, se usa el enlace de la fuente de Google) | `{products:[{store,name,price,url,color}]}` |

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
Fase 3 construida y probada con datos simulados (8/11/2026). Fase 2 construida y probada con datos simulados (8/11/2026). Fase 1 (Armario) construida: bienvenida, perfil, añadir con recorte + IA + etiqueta, armario con filtros, ficha con estado. Probada con datos simulados en móvil/ordenador y claro/oscuro. Pendiente: revisión de Polete; probar en real la clasificación, la etiqueta y el GPS en el APK.
Funciona de antes: login con Google en web, `/api/gaps` con Gemini, APK firmado en Actions, web en https://pmorenod16.github.io/armario-atelier/.
