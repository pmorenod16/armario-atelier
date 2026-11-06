# Armario Atelier

App para Android y ordenador para clasificar tu armario, montar outfits en un maniquí 3D con las fotos reales de tus prendas, analizar tu estilo de Pinterest y saber qué te falta comprar y dónde.

## Cómo está montada

| Pieza | Qué hace | Coste |
|---|---|---|
| App (`src/`, Vite + Capacitor) | Interfaz, cámara, recorte de fondo en el móvil, maniquí 3D (three.js) | Gratis |
| Firebase (Auth + Firestore) | Tu cuenta, tus prendas, fotos recortadas, outfits y perfil de estilo | Gratis (plan Spark) |
| Cloudflare Worker (`worker/`) | Guarda la clave de Claude y hace las llamadas a la IA | Gratis |
| API de Claude | Clasificar fotos, outfits, Pinterest, lista de compra, búsqueda en tiendas | Pago por uso |
| GitHub Actions | Compila el APK cada vez que subes cambios | Gratis |

No usa Firebase Storage (exige el plan Blaze): las fotos recortadas se guardan comprimidas en Firestore.

---

## Puesta en marcha (unos 30 minutos)

### 1. Firebase
1. En <https://console.firebase.google.com> crea un proyecto nuevo (por ejemplo `armario-atelier`).
2. **Authentication → Método de inicio de sesión → Correo electrónico/contraseña** → activar.
3. **Firestore Database → Crear base de datos** → modo producción → región `eur3 (Europe)`.
4. En **Firestore → Reglas**, pega el contenido de `firestore.rules` y publica.
5. **Configuración del proyecto → Tus apps → icono web `</>`** → registra una app → copia `apiKey`, `authDomain`, `projectId` y `appId` en `src/config.js`.

### 2. Clave de la API de Claude
1. Entra en <https://console.anthropic.com>, añade saldo y crea una clave en **API Keys**.
2. Guárdala: solo se muestra una vez. No la pongas nunca en la app ni en GitHub.

### 3. Servidor (Cloudflare Worker)
Necesitas Node 22 en tu ordenador.
```bash
cd worker
npm install
npx wrangler login                       # abre el navegador para entrar en Cloudflare (cuenta gratis)
# edita wrangler.toml: FIREBASE_PROJECT_ID = "el projectId de tu Firebase"
npx wrangler secret put ANTHROPIC_API_KEY  # pega tu clave de Claude
npx wrangler deploy
```
Copia la dirección que te da (`https://armario-api.<algo>.workers.dev`) en `API_URL` de `src/config.js`.

### 4. Compilar el APK con GitHub
1. Crea un repositorio en GitHub y sube esta carpeta (con `src/config.js` ya rellenado; esos datos de Firebase no son secretos).
2. Pestaña **Actions → APK de Android**. Se ejecuta solo al subir cambios a `main` (o pulsa *Run workflow*). Tarda unos 6 minutos.
3. Al terminar, abre la ejecución y descarga **armario-atelier-apk** (es un .zip con `app-debug.apk` dentro).
4. Pasa el APK al móvil y ábrelo. Android te pedirá permitir instalar apps de ese origen.

### 5. Autorizar tu cuenta en el servidor
1. Abre la app, crea tu cuenta con correo y contraseña.
2. **Ajustes → Copiar** tu identificador.
3. En `worker/wrangler.toml` pon `ALLOWED_UIDS = "tu-identificador"` y vuelve a ejecutar `npx wrangler deploy`.

A partir de aquí, solo tu cuenta puede usar la IA (y gastar tu saldo de la API).

---

## En el ordenador (Windows, Mac o Linux)
La misma app se instala en el ordenador como aplicación (PWA), sin tienda y sin compilar nada:
1. En GitHub: **Settings → Pages → Source: GitHub Actions**. Desde ese momento, cada vez que subes cambios a `main` se publica sola (Actions → *Versión de ordenador y web*).
2. Añade la dirección que te da (`https://TU_USUARIO.github.io/NOMBRE_REPO`) a `ALLOWED_ORIGINS` en `worker/wrangler.toml` y ejecuta `npx wrangler deploy`.
3. Ábrela en **Chrome o Edge** → botón **Instalar** de la app (o el icono de instalar en la barra de direcciones). Queda con su propio icono y ventana, como cualquier programa.

Usa la misma cuenta que en el móvil: el armario se sincroniza entre los dos. En el ordenador puedes **arrastrar** fotos a la zona de foto o **pegarlas con Ctrl+V** (por ejemplo, una imagen copiada de la web de una tienda o de Pinterest). `Esc` cierra el editor.

## Uso

- **Fotos de prendas:** extiéndela sobre un fondo liso (sábana, suelo claro), de frente y con buena luz. La primera vez el móvil descarga el modelo de recorte (unos 40 MB, con wifi mejor); después recorta sin conexión.
- **Probador 3D:** la foto recortada se coloca sobre el maniquí y los lados y la espalda toman el color de la prenda. Arrastra para girar, pellizca para acercar.
- **Pinterest:** pega el enlace de un tablero **público** (`pinterest.com/usuario/tablero`). Se analizan los 12 pines más recientes. Si es secreto o Pinterest no responde, sube capturas.
- **Qué comprar:** primero *Analizar qué me falta*; luego, en cada prenda, *Buscar modelos ahora* busca en las webs de Zara, Massimo Dutti, H&M, Mango, Pull&Bear, Bershka, Uniqlo y COS y te enseña modelos con precio y enlace.

## Coste de la IA
Se paga a Anthropic por uso, aparte de tu suscripción de Claude. Clasificar una prenda usa el modelo rápido y es lo más barato; analizar el armario o un tablero cuesta algo más por llevar más texto o imágenes. *Buscar modelos ahora* hace hasta 5 búsquedas web, que se cobran aparte. En la consola de Anthropic puedes poner un límite de gasto mensual.

## Desarrollo
```bash
npm install
npm run dev        # versión web en http://localhost:5173
npm run android    # compila y abre el proyecto en Android Studio (si lo tienes)
```
La versión web también se puede instalar como PWA: Actions → **Versión web (GitHub Pages)** (activa antes Pages en Settings → Pages → Source: GitHub Actions) y añade la dirección de Pages a `ALLOWED_ORIGINS` del Worker.

## Licencias
El recorte de fondo usa `@imgly/background-removal`, con licencia AGPL-3.0. Para uso personal no tienes que hacer nada; si algún día publicas la app para otras personas, esa licencia obliga a publicar también su código fuente (o a comprar la licencia comercial de IMG.LY).
