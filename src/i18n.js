// Textos de la interfaz. Para añadir un idioma: copia el bloque `es` con otra clave (ca, en, de…)
// y traduce los valores. Las etiquetas del catálogo de prendas están en catalog.js (campo por idioma).

const DICT = {
  es: {
    "app.name": "Armario Atelier",
    "app.tagline": "Tu ropa, tu estilo, lo que falta",

    "nav.today": "Hoy",
    "nav.closet": "Armario",
    "nav.add": "Añadir",
    "nav.shop": "Compras",
    "nav.looks": "Outfits",
    "under.title": "Debajo",
    "socks.title": "Calcetines",
    "where.title": "Dónde buscar",
    "where.summary": "{s} tiendas · {b} marcas",
    "where.hint": "Tiendas, grandes almacenes y marcas en las que se buscan los modelos",
    "where.change": "Cambiar",
    "where.done": "Listo",
    "where.saved": "Se buscará en {x}",
    "stores.title": "Tiendas",
    "stores.hint": "Solo se buscan modelos en las tiendas y marcas marcadas. Vienen marcadas las que tienen tienda física en Girona o alrededores (centro y Espai Gironès); cambia las que quieras.",
    "stores.reset": "Volver a las de Girona",
    "stores.all": "Marcar todas",
    "stats.btn": "Estadísticas",
    "share.btn": "Compartir",
    "washc.braFree": "{n} usos · tú decides cuándo lavarlo",
    "offline.toast": "Sin conexión: tu armario, el calendario y los outfits de la app siguen funcionando. La IA y las tiendas vuelven cuando haya internet.",
    "photo.add": "Foto del look",
    "photo.change": "Cambiar foto",
    "photo.see": "Ver foto",
    "photo.remove": "Quitar foto",
    "photo.alt": "Tu foto con el outfit",
    "photo.saving": "Guardando la foto…",
    "photo.saved": "Foto guardada en el calendario",
    "photo.fail": "No se ha podido guardar la foto. Vuelve a intentarlo.",
    "backup.title": "Copia de seguridad",
    "backup.hint": "Guarda en un archivo todo tu armario: prendas con sus fotos, outfits, calendario, estilo, compras y ajustes. Guárdalo en Drive o mándatelo por correo; con «Restaurar» lo recuperas en esta cuenta o en otra.",
    "backup.download": "Descargar copia",
    "backup.restore": "Restaurar copia",
    "backup.making": "Preparando la copia…",
    "backup.step": "Copiando {c}…",
    "backup.done": "Copia lista: {name} ({mb} MB).",
    "backup.fail": "No se ha podido completar. Revisa la conexión y vuelve a intentarlo.",
    "backup.confirm": "Se añadirá todo lo de la copia a tu cuenta (lo que tenga el mismo nombre se sustituye; no se borra nada). ¿Seguir?",
    "backup.restoring": "Restaurando…",
    "backup.restStep": "Restaurando {c} ({n})…",
    "backup.restored": "Listo: {n} elementos restaurados.",
    "backup.badFile": "Ese archivo no es una copia de Armario Atelier.",
    "share.making": "Preparando la imagen…",
    "share.fail": "No se ha podido crear la imagen. Vuelve a intentarlo.",
    "stats.title": "Tu armario en números",
    "stats.items": "prendas",
    "stats.used30": "usado en 30 días",
    "stats.used90": "usado en 90 días",
    "stats.daysMonth": "días apuntados este mes",
    "stats.goodUse": "Usas casi todo tu armario: muy bien aprovechado.",
    "stats.midUse": "Usas una parte del armario; abajo tienes lo que se queda olvidado.",
    "stats.lowUse": "Hay bastante ropa que no sale del armario: mira abajo qué podrías donar, vender o volver a combinar.",
    "stats.forgotten": "Seis meses sin ponértelo ({n})",
    "stats.forgottenHint": "¿Donar, vender o darle otra oportunidad? Toca una prenda y pulsa «¿Con qué lo combino?».",
    "stats.noForgotten": "Nada lleva más de seis meses olvidado.",
    "stats.unworn": "Sin estrenar ({n})",
    "stats.unwornHint": "Prendas que tienes pero aún no has apuntado como puestas.",
    "stats.top": "Lo que más te pones",
    "stats.uses": "{n} usos",
    "stats.lastWorn": "última vez {d}",
    "stats.never": "nunca puesta",
    "stats.byGroup": "Qué usas de cada tipo (90 días)",
    "stats.byGroupHint": "Barra llena = has usado todo lo de ese tipo en los últimos tres meses.",
    "stats.colors": "Colores que más te pones",
    "stores.none": "Quitar todas",
    "stores.multi": "Grandes almacenes, multimarca y outlets",
    "stores.multiHint": "Tiendas con muchas marcas a la vez. Cerca de Girona, en Espai Gironès (Salt) hay varias cadenas y tiendas de deporte; El Corte Inglés y La Roca Village (outlet de marcas, junto a Barcelona) quedan a una hora. Márcalas si te vienen bien.",
    "brands.title": "Marcas",
    "brands.hint": "Marcas para ir descubriendo, agrupadas por estilo. Se buscan en su web oficial (muchas se venden en tiendas multimarca). Marca las que te gusten y saldrán en Compras.",
    "stores.atLeastOne": "Deja al menos una tienda marcada",
    "under.suggest": "no tienes, te iría",
    "socks.length": "Largo",
    "under.section": "Qué llevar debajo",
    "under.sheer": "¿Transparenta?",
    "under.sheerHint": "Para elegir un sujetador que no se vea a través",
    "under.neckline": "Escote y espalda",
    "under.braSection": "Sujetador",
    "under.finish": "Acabado",
    "under.finishHint": "El encaje y las costuras se marcan con ropa ajustada o fina",
    "lens.clear": "Cristales transparentes",
    "lens.undo": "Volver a la foto con cristales",
    "lens.working": "Quitando los cristales…",
    "lens.done": "Listo: los cristales ya son transparentes",
    "lens.notFound": "No he distinguido los cristales de la montura en esta foto. Prueba con una foto sobre fondo liso y claro",
    "lens.undone": "Vuelve a estar la foto de antes",
    "lens.noBackup": "No hay una foto anterior guardada",
    "nav.style": "Estilo",
    "profile.tab.me": "Tú",
    "profile.tab.settings": "Ajustes",
    "profile.tab.account": "Cuenta",
    "nav.profile": "Perfil",

    "auth.google": "Entrar con Google",
    "auth.or": "o con tu correo",
    "auth.email": "Correo",
    "auth.password": "Contraseña",
    "auth.login": "Entrar",
    "auth.signup": "Crear cuenta",
    "auth.toSignup": "Crear cuenta nueva",
    "auth.toLogin": "Ya tengo cuenta",
    "auth.forgot": "He olvidado la contraseña",
    "auth.opening": "Abriendo Google…",
    "auth.entering": "Entrando…",
    "auth.creating": "Creando la cuenta…",
    "auth.resetSent": "Te hemos enviado un correo para cambiar la contraseña.",
    "auth.resetNeedsEmail": "Escribe tu correo y vuelve a pulsar.",
    "auth.notConfigured": "Falta la configuración de Firebase en src/config.js.",

    "onb.welcome.title": "Vamos a conocerte",
    "onb.welcome.body": "Dos preguntas rápidas para que las recomendaciones sean de tu talla y el tiempo sea el de donde estás. Puedes cambiarlo todo después en Perfil.",
    "onb.start": "Empezar",
    "onb.next": "Siguiente",
    "onb.back": "Atrás",
    "onb.finish": "Listo, ir a mi armario",
    "onb.sizes.title": "Tus tallas",
    "onb.sizes.body": "Las usaremos para recomendarte prendas de tu talla. Deja en blanco lo que no sepas.",
    "onb.places.title": "Dónde estás",
    "onb.places.body": "Para mirar el tiempo. Puedes guardar varios sitios y elegir cada día.",
    "onb.step": "Paso {n} de {total}",


    "size.camiseta": "Camiseta / polo",
    "size.camisa": "Camisa",
    "size.jersey": "Jersey / sudadera",
    "size.americana": "Americana / abrigo",
    "size.pantalon": "Pantalón",
    "size.vaquero": "Vaquero (W/L)",
    "size.calzado": "Calzado",
    "size.placeholder.camisa": "M o 39/40",
    "size.placeholder.americana": "50",
    "size.placeholder.pantalon": "42",
    "size.placeholder.vaquero": "W32 L32",

    "places.useGps": "Usar mi ubicación",
    "places.locating": "Buscando tu ubicación…",
    "places.search": "Buscar una ciudad",
    "places.searchPh": "Barcelona, Madrid, Toulouse…",
    "places.active": "En uso",
    "places.use": "Usar",
    "places.remove": "Quitar",
    "places.gpsDenied": "No hay permiso para usar la ubicación. Actívalo en los ajustes del móvil o añade la ciudad a mano.",
    "places.gpsFail": "No se ha podido obtener tu ubicación. Prueba otra vez o añade la ciudad a mano.",
    "places.noResults": "No he encontrado esa ciudad.",
    "places.current": "Mi ubicación",

    "closet.title": "Armario",
    "closet.count": "{n} prendas",
    "closet.countOne": "1 prenda",
    "closet.empty.title": "Tu armario está vacío",
    "closet.empty.body": "Haz una foto a una prenda extendida sobre un fondo liso. La app quita el fondo y rellena los datos por ti.",
    "closet.empty.cta": "Añadir la primera prenda",
    "closet.noMatch": "Ninguna prenda cumple estos filtros.",
    "closet.clearFilters": "Quitar filtros",
    "closet.search": "Buscar por nombre, marca, material…",
    "closet.filters": "Filtros",
    "closet.all": "Todo",
    "closet.sort": "Ordenar",
    "closet.sort.recent": "Recientes",
    "closet.sort.color": "Color",
    "closet.sort.type": "Tipo",
    "closet.sort.brand": "Marca",
    "closet.apply": "Ver {n} prendas",

    "filter.color": "Color",
    "filter.size": "Talla",
    "filter.pattern": "Estampado",
    "filter.brand": "Marca",
    "filter.material": "Material",
    "filter.season": "Temporada",
    "filter.fit": "Ajuste",
    "filter.status": "Estado",
    "filter.formality": "Formalidad",

    "item.name": "Nombre",
    "item.type": "Tipo",
    "item.colors": "Colores",
    "item.colorsHint": "Hasta 3, el primero es el principal",
    "item.pattern": "Estampado",
    "item.brand": "Marca",
    "item.size": "Talla",
    "item.material": "Composición",
    "item.materialPh": "100% algodón",
    "item.fit": "Ajuste",
    "item.season": "Temporada",
    "item.formality": "Formalidad",
    "item.style": "Estilo",
    "item.stylePh": "minimal, clásico…",
    "item.care": "Lavado y cuidado",
    "item.carePh": "Lavar a 30 °C, no secadora…",
    "item.notes": "Notas",
    "item.notesPh": "Regalo, la uso para el trabajo…",
    "item.status": "Estado",
    "item.materialKey": "Tejido principal",
    "item.yourSize": "Tu talla: {s}",
    "item.madeIn": "Hecha en {c}",
    "item.allYear": "Todo el año",
    "item.section.basic": "Lo básico",
    "item.section.details": "Detalles",
    "item.section.use": "Cuándo ponértela",
    "item.section.care": "Cuidado",
    "item.ai": "Leído por la IA",
    "item.edit": "Editar",
    "item.save": "Guardar",
    "item.saveAndAnother": "Guardar y otra",
    "item.saved": "Prenda guardada",
    "item.delete": "Eliminar prenda",
    "item.deleteConfirm": "Pulsa otra vez para eliminarla",
    "item.deleted": "Prenda eliminada",
    "item.changePhoto": "Cambiar foto",
    "item.addLabel": "Añadir foto de la etiqueta",
    "item.labelHint": "La etiqueta interior da marca, talla, composición y lavado exactos.",
    "item.labelReading": "Leyendo la etiqueta…",
    "item.labelDone": "Etiqueta leída. Revisa los datos marcados.",
    "item.labelFail": "No se ha podido leer la etiqueta. Prueba con una foto más cerca y con luz.",
    "item.needName": "Ponle un nombre a la prenda.",
    "item.tooBig": "La foto es demasiado grande. Prueba con otra.",
    "item.saveFail": "No se ha podido guardar. Inténtalo de nuevo.",
    "item.notFound": "Esta prenda ya no existe.",

    "add.title": "Nueva prenda",
    "add.pick": "Hacer foto o elegir imagen",
    "add.pickHint": "Prenda extendida, de frente, sobre un fondo liso y con buena luz.",
    "add.pickDesktop": "También puedes arrastrarla aquí o pegarla con Ctrl+V.",
    "add.orLink": "o pega el enlace de la tienda online",
    "add.fromLink": "Enlace de la prenda en la tienda",
    "add.cutting": "Quitando el fondo…",
    "add.downloading": "Preparando el recorte (solo la primera vez)…",
    "add.reading": "La IA está mirando la prenda…",
    "add.readDone": "Datos rellenados. Revísalos y guarda.",
    "add.readFail": "No se ha podido leer la prenda: rellena los datos a mano.",
    "add.cutIa": "Fondo quitado.",
    "add.cutFlat": "Fondo quitado por color. Si ves restos, repite la foto sobre un fondo más liso.",
    "add.cutNone": "No se ha podido quitar el fondo; se usará la foto tal cual.",
    "add.badImage": "No se ha podido leer esa imagen. Prueba con un JPG o PNG.",
    "add.cameraFail": "No se ha podido abrir la cámara. Revisa los permisos de la app.",

    "official.findShort": "Buscar en la marca",
    "official.paste": "Pegar enlace",
    "official.linkPh": "https://… enlace de la prenda en la tienda",
    "official.go": "Usar",
    "official.reading": "Leyendo la página de la prenda…",
    "official.noPhoto": "Primero haz la foto de la prenda.",
    "official.lensHint": "En Google Lens toca la prenda que coincide, abre la tienda, copia el enlace y pégalo aquí.",
    "official.lensFail": "No se ha podido abrir Google Lens.",
    "official.needBrand": "Escribe la marca (o haz foto a la etiqueta) para buscar la foto oficial.",
    "official.searching": "Buscando la prenda en la web de {brand}…",
    "official.title": "Foto oficial",
    "official.pick": "Toca una para usarla",
    "official.view": "Ver en la web",
    "official.use": "Usar esta foto",
    "official.loading": "Preparando la foto oficial…",
    "official.used": "Usando la foto oficial de la marca.",
    "official.none": "No he encontrado esta prenda en la web de la marca. Se queda tu foto.",
    "official.noSearch": "Para esta marca todavía no puedo buscar en su web. Se queda tu foto.",
    "official.fail": "No se ha podido buscar la foto oficial. Inténtalo más tarde.",

    "status.disponible": "Disponible",
    "status.sucia": "Sucia",
    "status.prestada": "Prestada",
    "status.tintoreria": "Tintorería",
    "status.arreglo": "En arreglo",
    "washc.title": "¿Qué va a lavar de {when}?",
    "washc.sub": "Lo que te pusiste. Marca lo que va a la lavadora o a la tintorería; lo demás sigue disponible.",
    "washc.uses": "{n} de {max} usos",
    "washc.usesFree": "{n} usos",
    "washc.clean": "Sigue limpia",
    "washc.wash": "A lavar",
    "washc.dry": "Tintorería",
    "washc.ok": "Guardar",
    "washc.yesterday": "ayer",
    "washc.skip": "Ahora no",
    "washc.done": "Hecho: {n} prendas a lavar",
    "washc.allClean": "Todo sigue limpio",
    "wash.itemTitle": "Lavado",
    "wash.itemEvery": "cada {n} usos",
    "wash.never": "no se lava",
    "wash.itemUses": "Usos antes de lavar (0 = nunca)",
    "wash.itemDry": "Va a la tintorería",
    "wash.itemHint": "Lleva {n} usos desde el último lavado.",
    "wash.itemDefault": "Volver a lo de su tipo",
    "wash.check": "Preguntarme al día siguiente qué va a lavar",
    "wash.checkHint": "En Hoy te sale lo que llevaste con lo que toca lavar ya marcado; cada prenda puede tener sus propios usos en su ficha.",

    "formality.1": "Muy casual",
    "formality.2": "Casual",
    "formality.3": "Smart casual",
    "formality.4": "Arreglado",
    "formality.5": "Formal",

    "season.primavera": "Primavera",
    "season.verano": "Verano",
    "season.otono": "Otoño",
    "season.invierno": "Invierno",

    "today.title": "Hoy",
    "today.tab.hoy": "Hoy",
    "today.tab.outfits": "Outfits",
    "today.calAuto": "Plan sacado de tu calendario (puedes cambiarlo)",
    "conn.title": "Conexiones",
    "conn.cal": "Calendario del móvil",
    "conn.calOn": "Conectado: el plan de Hoy y Mañana se rellena solo con tus eventos",
    "conn.calOff": "Conéctalo para que el plan del día se rellene solo",
    "conn.pinOn": "Conectado a {board} · revisado el {date}. Lo mira cada vez que abres la app y, si hay pines nuevos, actualiza tu estilo.",
    "conn.pinOff": "Pega tu tablero en Mi estilo para conectarlo",
    "conn.connect": "Conectar",
    "conn.disconnect": "Desconectar",
    "conn.checkNow": "Revisar ahora",
    "conn.checking": "Mirando tu tablero…",
    "conn.checked": "Tablero revisado",
    "conn.calConnected": "Calendario conectado",
    "conn.calDisconnected": "Calendario desconectado",
    "day.today": "Hoy",
    "day.tomorrow": "Mañana",
    "day.hint": "¿Lo dejas preparado? Mira los de mañana",
    "today.planTomorrow": "¿Qué vas a hacer mañana?",
    "day.wear": "Me lo pongo mañana",
    "day.ready": "Preparado para mañana",
    "day.saved": "Preparado: lo tienes apuntado para mañana",
    "day.readyNote": "Mañana te pondrás: {title}",
    "today.fromCal": "Calendario",
    "today.voice": "Dictar el plan",
    "today.calDone": "Plan sacado de tu calendario",
    "today.calEmpty": "No tienes nada en el calendario hoy",
    "today.calFail": "No he podido leer el calendario",
    "today.voiceFail": "No te he entendido. Prueba otra vez.",
    "remind.title": "Aviso por la mañana",
    "remind.on": "Avisarme cada día para elegir el outfit",
    "remind.time": "Hora",
    "remind.set": "Te avisaré cada día a las {time}",
    "remind.off": "Aviso quitado",
    "combine.title": "¿Con qué lo combino?",
    "combine.sub": "Outfits con «{name}» y tu ropa disponible, para el tiempo de hoy.",
    "combine.thinking": "Buscando combinaciones…",
    "combine.none": "No he encontrado combinaciones: añade más prendas.",
    "combine.weather": "Pensado para hoy: entre {min} y {max} °C.",
    "wash.all": "Lo he lavado todo ({n})",
    "wash.done": "Hecho: {n} prendas vuelven a estar disponibles",
    "wash.auto": "Marcar como sucia sola después de usarla",
    "wash.edit": "Cambiar cuántos usos aguanta cada prenda",
    "wash.editHint": "Número de veces que te la pones antes de que pase a «Sucia». 0 = nunca.",
    "wash.reset": "Volver a los de serie",
    "looks.title": "Mis outfits",
    "looks.sub": "Los que guardas de las propuestas y los que montas tú.",
    "looks.create": "Crear outfit",
    "looks.pick": "Elige las prendas del outfit",
    "looks.editItems": "Cambiar prendas",
    "looks.editTitle": "Tu outfit",
    "looks.nameIt": "Ponle nombre",
    "looks.name": "Nombre",
    "looks.namePh": "Ej. Viernes de cena",
    "looks.note": "Nota (opcional)",
    "looks.notePh": "Ej. con la camisa por dentro",
    "looks.saveIt": "Guardar outfit",
    "looks.save": "Guardar",
    "looks.saved": "Guardado",
    "looks.savedToast": "Outfit guardado en Mis outfits",
    "looks.removed": "Outfit quitado de Mis outfits",
    "looks.untitled": "Mi outfit",
    "looks.byYou": "Tuyo",
    "looks.delete": "Borrar",
    "looks.deleteSure": "¿Seguro? Pulsa otra vez",
    "looks.emptyTitle": "Aún no tienes outfits guardados",
    "looks.emptyBody": "Guarda los que te gusten desde Hoy con el botón Guardar, o crea uno con tus prendas.",
    "today.tab.calendario": "Calendario",
    "today.tab.maleta": "Maleta",
    "today.wx.loading": "Mirando el tiempo…",
    "today.wx.fail": "No se ha podido cargar el tiempo. Los outfits se propondrán sin él.",
    "today.wx.line": "Máx {max}° · Mín {min}° · Sensación {feels}°",
    "today.placesHint": "Añade o quita sitios en Perfil → Ubicaciones.",
    "today.plan": "¿Qué vas a hacer hoy?",
    "today.planPh": "Clase por la mañana, por la tarde al trabajo y cena con amigos…",
    "today.quick": "Clase|Trabajo|Reunión|Cena|Cita|Deporte|Salir de fiesta|Día en casa|Boda o evento",
    "today.go": "Proponer outfits",
    "today.defaultPlan": "día normal, nada especial",
    "today.thinking": "Combinando tu ropa con el tiempo y tu plan…",
    "today.fail": "No se han podido preparar los outfits. Inténtalo de nuevo.",
    "today.needItems": "Añade al menos una prenda de arriba, una de abajo y calzado para que te proponga outfits.",
    "today.pick": "Elige tu outfit",
    "today.options": "{n} opciones",
    "today.optionN": "Opción {n} de {total}",
    "today.more": "Otras ideas",
    "today.how": "Cómo llevarlo",
    "today.extras": "Le iría bien (no lo tienes)",
    "today.repeats": "Repite {names}: no tienes otra opción igual de buena para hoy.",
    "today.like": "Me gusta",
    "today.dislike": "No me gusta",
    "today.liked": "Apuntado: más como este",
    "today.disliked": "Apuntado: menos como este",
    "today.wear": "Me lo pongo hoy",
    "today.unwear": "Ya no me lo pongo",
    "day.unwear": "Ya no me lo pongo mañana",
    "today.cancelWear": "Cancelar",
    "today.wearCancelled": "Cancelado: las prendas vuelven a estar como antes",
    "today.wornSaved": "Apuntado en tu calendario",
    "today.wornToday": "Hoy llevas «{title}»",
    "today.yourOutfit": "tu outfit",

    "style.title": "Mi estilo",
    "style.sub": "Lo saca de tu tablero de Pinterest y lo usa para tus outfits, la maleta y las compras.",
    "style.from": "Sacado de {src} el {date}",
    "style.fromShots": "tus capturas",
    "style.board": "Enlace de tu tablero de Pinterest",
    "style.howLink": "En Pinterest abre el tablero, toca Compartir → Copiar enlace y pégalo aquí. El tablero tiene que ser público.",
    "style.go": "Analizar",
    "style.reread": "Volver a leer",
    "style.shots": "O sube capturas de looks que te gusten",
    "style.needUrl": "Pega el enlace de tu tablero.",
    "style.reading": "Leyendo tu tablero y analizando los pines…",
    "style.readingShots": "Analizando {n} imágenes…",
    "style.done": "Estilo sacado de {n} pines",
    "engine.label": "Quién propone",
    "engine.ia": "IA",
    "engine.app": "La app",
    "engine.iaHint": "Usará la IA (Gemini); si falla o tarda, lo hará la app al momento.",
    "engine.appHint": "Lo hará la app con sus reglas de estilismo: al instante y sin depender de Gemini.",
    "engine.fallback": "Gemini no responde: te lo he preparado con el motor de la app.",
    "engine.byApp": "hecho por la app",
    "engine.gapsByApp": "Calculado por la app (sin IA): básicos que te faltan y prendas clave de tu estilo que no tienes.",
    "shop.title": "Compras",
    "shop.sub": "Lo que te falta, a buen precio, en tu talla y que combine con lo tuyo",
    "shop.tabGaps": "Te falta",
    "shop.tabWish": "Deseos",
    "shop.tabStore": "Modo tienda",
    "shop.emptyTitle": "¿Qué te falta?",
    "shop.emptyBody": "Miro tu armario y tu estilo y te digo qué prendas te darían más outfits y cuáles te acercan a tu Pinterest. Luego busco modelos reales a buen precio.",
    "shop.needItems": "Añade al menos 3 prendas a tu armario para que pueda ver qué te falta.",
    "shop.analyze": "Ver qué me falta",
    "shop.analyzing": "Mirando tu armario y tu estilo…",
    "shop.reanalyze": "Volver a analizar",
    "shop.diagnosis": "Tu armario",
    "shop.analyzedAt": "Analizado el {date} con {n} prendas",
    "shop.stale": "has cambiado prendas desde entonces",
    "shop.listCombine": "Para combinar mejor",
    "shop.listCombineSub": "Las prendas que más outfits nuevos te dan con lo que ya tienes.",
    "shop.listStyle": "Para llegar a tu estilo",
    "shop.listStyleSub": "Lo que te acerca a «{name}» y además combina con tu armario.",
    "shop.listStyleNoStyle": "Saca tu estilo de Pinterest en Perfil → Mi estilo para que esta lista sea tuya de verdad.",
    "shop.range": "Precio razonable {min}–{max} €",
    "shop.yourSize": "Tu talla {s}",
    "shop.newOutfits": "Unos {n} outfits nuevos.",
    "shop.pairs": "Combina con",
    "shop.prio.alta": "Alta",
    "shop.prio.media": "Media",
    "shop.prio.baja": "Baja",
    "shop.search": "Buscar modelos",
    "profile.translatingStart": "Cambiando el idioma…",
    "profile.translatingBg": "Terminando de traducir la app en segundo plano…",
    "style.urlPh": "https://pin.it/… o pinterest.com/usuario/tablero",
    "shop.liveSearching": "Buscando en las tiendas y revisando cada foto…",
    "shop.liveFound": "{n} encontrados hasta ahora · sigo buscando…",
    "shop.rechecked": "{piece}: quitados {n} resultados antiguos que no cumplían los filtros nuevos",
    "shop.searching": "Buscando…",
    "shop.seeModels": "Ver modelos",
    "shop.searchAgain": "Buscar otra vez",
    "shop.searchedAt": "Buscado el {date}",
    "shop.noPrice": "Precio en la web",
    "shop.vJusto": "Precio justo",
    "shop.vCaro": "Caro para lo que es",
    "shop.vBarato": "Sospechosamente barato",
    "shop.noProducts": "No he encontrado modelos que encajen. Mira directamente en las tiendas:",
    "shop.noProductsToast": "Sin modelos que encajen: te dejo los enlaces a las tiendas",
    "shop.sizeNote": "Elige tu talla {s} en la web y comprueba que queda en stock.",
    "shop.inStores": "Buscar en",
    "shop.diag": "Detalle de la búsqueda en otras tiendas",
    "shop.moreInApp": "Desde la app del móvil busco también en el resto de tiendas y marcas que tengas marcadas en «Dónde buscar».",
    "shop.toWish": "Guardar en deseos",
    "shop.wishAdded": "Guardado en tu lista de deseos",
    "shop.wishRemoved": "Quitado de tu lista de deseos",
    "shop.fail": "No ha salido bien. Vuelve a intentarlo.",
    "shop.wishLink": "Añadir por enlace",
    "shop.wishLinkPh": "Pega el enlace de una prenda de cualquier tienda",
    "shop.add": "Añadir",
    "shop.product": "Prenda",
    "shop.wishCount": "{n} en tu lista",
    "shop.total": "Total {v}",
    "shop.wishEmpty": "Tu lista de deseos está vacía",
    "shop.wishEmptyBody": "Guarda aquí los modelos que te gusten desde «Te falta», el modo tienda o pegando un enlace.",
    "shop.forGap": "para {g}",
    "shop.open": "Ver en la tienda",
    "shop.updatePrice": "Ver precio",
    "shop.priceChanged": "El precio ha cambiado: {from} → {to}",
    "shop.priceSame": "Mismo precio que cuando lo guardaste",
    "shop.gotIt": "Ya lo tengo",
    "shop.bought": "Comprado",
    "shop.boughtList": "Comprado",
    "shop.remove": "Quitar",
    "shop.removeSure": "Pulsa otra vez para quitarlo",
    "shop.storeTitle": "¿Me lo compro?",
    "shop.storeBody": "Hazle una foto a la prenda en la tienda (mejor si se ve la etiqueta) y te digo si encaja con tu estilo, con qué la combinas y si el precio es razonable.",
    "shop.priceSeen": "Precio (opcional)",
    "shop.pricePh": "Ej. 39,95",
    "shop.takePhoto": "Hacer foto",
    "shop.otherPhoto": "Otra prenda",
    "shop.checking": "Mirando si encaja con tu armario y tu estilo…",
    "shop.vSi": "Cómpralo",
    "shop.vQuizas": "Piénsatelo",
    "shop.vNo": "Mejor no",
    "shop.priceLabel": "Precio",
    "shop.trySize": "Pruébate la",
    "shop.similar": "Ya tienes algo muy parecido:",
    "shop.checkIn": "Antes de pagar, mira",
    "shop.combos": "Con qué lo combinas",
    "shop.thisOne": "Esta",
    "shop.inStore": "Visto en tienda",
    "style.mix": "Tu mezcla",
    "style.mainBoard": "Principal",
    "style.addBoard": "Otro tablero",
    "style.newBoard": "Nuevo tablero",
    "style.newBoardBody": "Para cuando te vistes distinto: salir, eventos, deporte… La app usará este tablero cuando tu plan del día encaje con él.",
    "style.useOther": "¿Para qué es?",
    "style.usePh": "Ej. Salir de noche",
    "style.createBoard": "Crear y pegar su enlace",
    "style.boardFor": "Para {use}",
    "style.boardExtra": "Enlace de este tablero",
    "style.removeBoard": "Quitar",
    "style.removeSure": "¿Seguro? Pulsa otra vez",
    "style.removed": "Tablero quitado",
    "style.emptyExtra": "Pega el enlace de este tablero",
    "style.emptyExtraBody": "Cuando lo lea, los outfits para «{use}» saldrán con este estilo.",
    "style.auto": "Revisar el tablero solo",
    "style.autoLast": " · cada 3 días; última vez el {date}",
    "style.autoNew": "Tu tablero «{board}» tiene {n} pines nuevos: estilo actualizado",
    "style.autoChanged": "Tu tablero «{board}» ha cambiado: estilo actualizado",
    "style.tapPin": "Toca un pin para recrearlo con tu ropa",
    "style.allPins": "Ver los {n}",
    "style.lessPins": "Ver menos",
    "style.recreate": "Recrear este look con mi ropa",
    "style.recreateTitle": "Recréame este pin",
    "style.recreating": "Buscando en tu armario lo más parecido…",
    "style.recreateAgain": "Otra versión",
    "style.openPin": "Ver en Pinterest",
    "style.likeness": "Se parece un {n}%",
    "style.inPin": "En el pin:",
    "style.toNail": "Para clavarlo te falta",
    "style.nothingMissing": "Tienes todo lo necesario para este look.",
    "style.fromPin": "Look de Pinterest",
    "style.analyzedOf": "Analizados {a} de {n} pines, repartidos por todo el tablero.",
    "style.notesReread": "Si escribes aquí cómo es tu estilo (p. ej. «mezcla de starboy y old money») y pulsas Volver a leer, la IA lo tendrá en cuenta.",
    "style.cantRead": "No he podido leer el tablero «{board}». Comprueba que tu perfil no es privado (Pinterest → Ajustes → Visibilidad del perfil → desactiva «Perfil privado») y que el tablero no está en secreto. Si sigue sin ir, mándale a Claude este detalle: [{why}]. Mientras tanto puedes subir capturas.",
    "style.analyzing": "He leído {n} pines. Analizando tu estilo…",
    "style.noImages": "He leído el tablero pero no he podido descargar las fotos de los pines. Prueba con capturas.",
    "style.fail": "No se ha podido analizar. Inténtalo de nuevo.",
    "style.emptyTitle": "Aún no sé qué estilo buscas",
    "style.emptyBody": "Pega el enlace de tu tablero de Pinterest y la app sacará tu estilo: colores, prendas clave y fórmulas de outfit.",
    "style.yours": "Tu estilo",
    "style.palette": "Paleta",
    "style.formulas": "Fórmulas de outfit",
    "style.pieces": "Prendas clave",
    "style.details": "Detalles",
    "style.silhouettes": "Siluetas",
    "style.fabrics": "Materiales",
    "style.footwear": "Calzado",
    "style.avoid": "Evitar",
    "style.match": "Tu armario y tu estilo",
    "style.recalc": "Recalcular",
    "style.matching": "Comparando tu armario con tu estilo…",
    "style.fits": "Lo que más encaja",
    "style.off": "Lo que menos encaja",
    "style.stale": "Has cambiado el armario desde la última comparación: pulsa Recalcular.",
    "style.noItems": "Añade prendas para ver cuánto se parece tu armario a tu estilo.",
    "style.notes": "Tus ajustes",
    "style.notesHint": "Lo que escribas aquí manda sobre lo que saque la IA del tablero.",
    "style.notesPh": "Nada de camisas de cuadros, me gustan los pantalones anchos, evito el amarillo…",
    "today.styleOn": "Con tu estilo «{name}»",
    "today.styleOff": "Añade tu Pinterest para outfits a tu estilo",

    "board.edit": "Colocar a mi gusto",
    "board.done": "Guardar",
    "board.reset": "Recolocar",
    "board.hint": "Arrastra para mover · esquina, pellizco o rueda para el tamaño · tocar trae al frente",
    "board.saved": "Composición guardada",

    "cal.prev": "Mes anterior",
    "cal.next": "Mes siguiente",
    "cal.monthCount": "{n} días apuntados este mes. Toca un día para ver o apuntar lo que llevaste.",
    "cal.never": "Sin estrenar",
    "cal.neverHint": "Prendas que todavía no has apuntado nunca. La app las tiene en cuenta al proponerte outfits.",
    "cal.since": "añadida hace {n} días",
    "cal.today": "añadida hoy",
    "cal.yesterday": "añadida ayer",
    "cal.allUsed": "Has usado todas tus prendas.",
    "cal.empty": "No apuntaste nada este día.",
    "cal.log": "Apuntar lo que llevé",
    "cal.change": "Cambiar prendas",
    "cal.delete": "Borrar",
    "cal.pickTitle": "¿Qué llevaste?",

    "picker.title": "Elige prendas",
    "picker.ok": "Guardar ({n})",

    "trip.title": "Hacer la maleta",
    "trip.dest": "Destino",
    "trip.change": "Cambiar",
    "trip.start": "Salida",
    "trip.days": "Días",
    "trip.plan": "¿Qué vas a hacer allí?",
    "trip.planPh": "Turismo, una cena elegante, playa…",
    "trip.go": "Preparar la maleta",
    "trip.needDest": "Elige el destino.",
    "trip.weather": "Mirando el tiempo del destino…",
    "trip.thinking": "Eligiendo la ropa justa…",
    "trip.fail": "No se ha podido preparar la maleta. Inténtalo de nuevo.",
    "trip.saved": "Tus maletas",
    "trip.nDays": "{n} días",
    "trip.delete": "Borrar maleta",
    "trip.back": "Volver",
    "trip.lastYear": "Tiempo de referencia: mismos días del año pasado",
    "trip.pack": "En la maleta ({n})",
    "trip.packHint": "Toca cada prenda al meterla en la maleta.",
    "trip.daysTitle": "Día a día",
    "trip.day": "Día {n}",
    "trip.tips": "Consejos",


    "profile.title": "Perfil",
    "profile.sizes": "Tus tallas",
    "profile.places": "Ubicaciones",
    "profile.language": "Idioma",
    "profile.language.note": "La primera vez que eliges catalán o inglés, la IA traduce la app (unos segundos). Las respuestas de la IA también saldrán en ese idioma.",
    "profile.translating": "Traduciendo la app… {d} de {n}",
    "profile.translateFail": "No se ha podido traducir ahora. Inténtalo en un rato.",
    "profile.account": "Cuenta",
    "profile.uid": "Tu identificador (para autorizar tu cuenta en el servidor)",
"profile.version": "Versión de la app",
    "access.waitTitle": "Tu cuenta está pendiente",
    "access.waitBody": "Ya has pedido acceso. En cuanto Polete lo apruebe, la app se abrirá sola aquí.",
    "access.deniedTitle": "Sin acceso",
    "access.deniedBody": "Esta cuenta no tiene acceso a la app. Si crees que es un error, habla con Polete.",
    "access.as": "Has entrado como {who}",
    "access.title": "Quién usa la app",
    "access.adminHint": "Cualquiera puede crear una cuenta, pero solo entra cuando tú la apruebas. Cada persona tiene su propio armario.",
    "access.none": "Aún no ha pedido acceso nadie.",
    "access.approve": "Aprobar",
    "access.deny": "Denegar",
    "access.revoke": "Quitar acceso",
    "access.remove": "Borrar petición",
    "access.saved": "Hecho",
    "access.rulesMissing": "No puedo leer las peticiones: faltan las reglas nuevas de Firestore.",
    "access.st.pendiente": "Pendiente",
    "access.st.aprobado": "Aprobada",
    "access.st.denegado": "Denegada",
    "profile.section": "Sección de ropa",
    "profile.sectionHint": "Cambia lo que busca la app en las tiendas y cómo te aconseja la IA. Para otra persona, mejor que use su propia cuenta.",
    "section.hombre": "Hombre",
    "section.mujer": "Mujer",
    "profile.wash": "Ropa sucia",
    "recut.title": "Recortes de tus prendas",
    "recut.body": "Vuelve a recortar las fotos que ya tienes con el recorte nuevo: deja solo la prenda y quita restos de fondo. Si alguna no sale mejor, se queda como estaba, y puedes deshacerlo.",
    "recut.go": "Mejorar los recortes ({n})",
    "recut.undo": "Deshacer",
    "recut.progress": "Recortando {done} de {total}… {name}",
    "recut.done": "Listo: {ok} mejoradas, {kept} se quedan como estaban y {failed} con error.",
    "recut.undoing": "Volviendo a las fotos de antes…",
    "recut.undone": "Hecho: {n} prendas con su foto de antes.",
    "profile.checkUpdate": "Buscar actualización",
        "profile.copy": "Copiar",
    "profile.copied": "Copiado",
    "profile.signOut": "Cerrar sesión",
    "profile.saved": "Guardado",

    "common.retry": "Reintentar",
    "common.cancel": "Cancelar",
    "common.close": "Cerrar",
    "common.offline": "Sin conexión: mostrando lo guardado en el móvil.",
    "common.loading": "Cargando…",
    "common.loadFail": "No se ha podido cargar tu armario. Revisa tu conexión.",
    "common.install": "Instalar",
  },
};

let lang = "es";
export const LANGUAGES = [{ k: "es", label: "Castellano" }, { k: "ca", label: "Català" }, { k: "en", label: "English" }];
// Catalán e inglés: los textos se traducen con la IA la primera vez y se guardan en el dispositivo.
// Si se añade o cambia un texto en castellano, solo se traduce lo nuevo.
const LS = (l) => `i18n:${l}`;
const readCache = (l) => { try { return JSON.parse(localStorage.getItem(LS(l)) || "{}"); } catch { return {}; } };
function load(l) {
  const c = readCache(l), d = {};
  for (const [k, [src, tr]] of Object.entries(c)) if (src === (DICT.es[k] ?? k.slice(1))) d[k] = tr;
  DICT[l] = d;
}
export const setLanguage = (l) => {
  if (!LANGUAGES.some((x) => x.k === l)) l = "es";
  if (l !== "es") { load(l); loadDyn(l); }
  lang = l; document.documentElement.lang = l;
};

/* ---------- textos libres del motor de la app (sin IA): outfits, maleta, huecos, calcetines… ----------
   Los escribe en castellano; en catalán o inglés se traducen con la IA la primera vez y se guardan en el dispositivo. */
const DL = (l) => `i18n-dyn:${l}`;
let dyn = {};
function loadDyn(l) { try { dyn = JSON.parse(localStorage.getItem(DL(l)) || "{}"); } catch { dyn = {}; } }
function saveDyn() { try { const k = Object.keys(dyn); if (k.length > 3000) k.slice(0, k.length - 3000).forEach((x) => delete dyn[x]); localStorage.setItem(DL(lang), JSON.stringify(dyn)); } catch {} }
const isText = (s) => typeof s === "string" && s.length > 2 && /[a-záéíóúñ]{3}/i.test(s);
/* La traducción va en segundo plano y no se pierde: antes se esperaba 12 s y, si la IA tardaba más (Gemini lento → reserva),
   se abandonaba y el texto se quedaba en castellano para siempre. Ahora cada frase se pide una sola vez (aunque la pidan
   varias pantallas), cada petición tiene 45 s, lo que falla se reintenta (10 s, 30 s, 90 s…) y al llegar se avisa (onTranslated)
   para que las pantallas se repinten. Quien quiere esperar (localize antes de guardar) espera como mucho ms. */
const queued = new Set(), dynListeners = new Set();
let dynJob = null, retryN = 0, retryTimer = null;
export const onTranslated = (fn) => { dynListeners.add(fn); return () => dynListeners.delete(fn); };
function pump() {
  if (dynJob || !queued.size || lang === "es") return dynJob || Promise.resolve();
  const l = lang;
  dynJob = (async () => {
    const { api } = await import("./api.js");
    let got = 0, failed = false;
    while (queued.size && lang === l) {
      const parts = [];
      const all = [...queued].filter((x) => !dyn[x]); queued.clear();
      for (let i = 0; i < all.length; i += 40) parts.push(all.slice(i, i + 40));
      await Promise.all([0, 1, 2].map(async () => {
        for (let part; (part = parts.shift());) {
          const entries = Object.fromEntries(part.map((x, j) => [`d${j}`, x]));
          try {
            const r = await api("/api/translate", { lang: l, entries }, { timeout: 45000, retries: 1 });
            part.forEach((x, j) => { const v = r.entries?.[`d${j}`]; if (typeof v === "string" && v) { dyn[x] = v; got++; } });
          } catch { failed = true; }
          if (lang !== l) return;
          part.filter((x) => !dyn[x]).forEach((x) => failedSet.add(x));
        }
      }));
    }
    if (lang === l) saveDyn();
    if (got) dynListeners.forEach((f) => { try { f(); } catch {} });
    // lo que no ha salido se vuelve a pedir más tarde (sin bucles: cada vez espera más)
    if ((failed || failedSet.size) && lang === l && retryN < 6) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { failedSet.forEach((x) => queued.add(x)); failedSet.clear(); retryN++; pump(); }, [10, 30, 90, 180, 300, 600][retryN] * 1000);
    } else if (!failed) retryN = 0;
  })().finally(() => { dynJob = null; if (queued.size) pump(); });
  return dynJob;
}
const failedSet = new Set();
/** Pide traducir frases (sin esperar). */
export function requestTexts(list) {
  if (lang === "es") return;
  for (const x of list) if (isText(x) && !dyn[x]) queued.add(x);
  pump();
}
/** Traduce frases sueltas: espera como mucho ms; lo que no llegue a tiempo sigue traduciéndose en segundo plano. */
export async function translateTexts(list, ms = 15000) {
  if (lang === "es") return list;
  requestTexts(list);
  if (list.some((x) => isText(x) && !dyn[x])) await Promise.race([new Promise((r) => setTimeout(r, ms)), (async () => { while (dynJob) await dynJob; })()]);
  return list.map((x) => dyn[x] || x);
}
// Campos de texto libre (del motor, de la IA o del análisis de estilo) que se traducen; los del usuario (notes) no.
const FREE = new Set(["title", "why", "how", "missing", "advice", "tips", "note", "suggest", "warn", "piece", "fits", "off", "headline", "extras",
  "summary", "keywords", "formulas", "keyPieces", "fabrics", "silhouettes", "footwear", "avoid", "look", "styleFit", "priceNote", "check", "similar", "verdictText"]);
const NAMED = new Set(["palette", "mix"]); // dentro de estas listas también se traduce «name» (nombre del color o de la estética)
function collect(obj, skip = new Set(), named = false) {
  const slots = [];
  const walk = (o, named) => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, named));
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (skip.has(k) || k === "notes" || k === "_lang") continue;
      const free = FREE.has(k) || (named && k === "name");
      if (free && typeof v === "string") slots.push([o, k]);
      else if (free && Array.isArray(v) && v.every((x) => typeof x === "string")) v.forEach((_, i) => slots.push([v, i]));
      else if (v && typeof v === "object") walk(v, NAMED.has(k));
    }
  };
  walk(obj, named);
  return slots;
}
/** Traduce los textos libres de un resultado (in situ, esperando a la IA si hace falta) antes de guardarlo o enseñarlo. */
export async function localize(obj) {
  if (lang === "es" || !obj) return obj;
  const slots = collect(obj);
  const out = await translateTexts(slots.map(([o, k]) => o[k]));
  slots.forEach(([o, k], i) => { o[k] = out[i]; });
  return obj;
}
/** Copia traducida con lo que ya está en la caché, al momento; missing = frases que aún hay que pedir. */
/** named = traducir también «name» de arriba (nombre del estilo). */
export function localizeNow(obj, skip, named) {
  if (lang === "es" || !obj) return { obj, missing: [] };
  const c = structuredClone(obj), missing = [];
  for (const [o, k] of collect(c, skip, named)) { const v = o[k]; if (!isText(v)) continue; if (dyn[v]) o[k] = dyn[v]; else missing.push(v); }
  return { obj: c, missing };
}
/** Traduce frases sueltas con lo que hay en la caché (las que falten se quedan igual). */
export const fromCache = (list) => list.map((x) => (lang !== "es" && dyn[x]) || x);
/** ¿Ya hay traducción de esta frase? */
export const hasTranslation = (x) => !isText(x) || !!dyn[x];
/** Para textos del motor que se calculan al pintar: si ya está traducido sale traducido; si no, se pide y se cambia en pantalla al llegar. */
export function tx(s) {
  if (lang === "es" || !isText(s)) return s;
  if (dyn[s]) return dyn[s];
  txWanted.add(s); requestTexts([s]);
  return s;
}
// cambio en el sitio cuando llega la traducción: sin repintar la pantalla (no salta ni vuelve arriba)
const txWanted = new Set();
onTranslated(() => {
  const done = [...txWanted].filter((x) => dyn[x]); if (!done.length) return;
  done.forEach((x) => txWanted.delete(x));
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { let v = n.nodeValue; for (const x of done) if (v.includes(x)) v = v.split(x).join(dyn[x]); if (v !== n.nodeValue) n.nodeValue = v; }
});
export const getLanguage = () => lang;
/** Formato regional de fechas, horas y números del idioma elegido (y del dictado por voz). */
export const locale = () => ({ es: "es-ES", ca: "ca-ES", en: "en-GB" }[lang] || "es-ES");
/**
 * Traduce lo que falte del idioma l. onProgress(hechas, total). Devuelve cuántas ha traducido.
 * Tandas de 50, tres a la vez (antes 80 de una en una: con la IA lenta tardaba minutos y parecía que no respondía).
 * Si ya se está traduciendo ese idioma, se engancha a la misma tarea en vez de empezar otra.
 */
const running = {};
export function ensureLanguage(l, onProgress = () => {}) {
  if (l === "es") return Promise.resolve(0);
  if (!running[l]) { const job = runTranslate(l); running[l] = job; job.catch(() => {}).finally(() => { delete running[l]; }); }
  running[l].listeners.add(onProgress);
  return running[l];
}
function runTranslate(l) {
  const listeners = new Set();
  const p = (async () => {
    const cat = await import("./catalog.js"), { api } = await import("./api.js");
    const src = { ...DICT.es };
    // todas las listas del catálogo con texto (también sujetador, transparencia, escote y calcetines)
    for (const list of Object.values(cat)) if (Array.isArray(list)) for (const e of list) if (e?.es) src["~" + e.es] = e.es;
    // «Dónde buscar»: descripción de multimarca, grupos de marcas y «cómo es» de cada marca
    const ss = await import("./storesearch.js");
    for (const d of [...Object.values(ss.MULTI), ...ss.BRAND_GROUPS.map(([, g]) => g), ...ss.BRANDS.map((b) => b.desc)]) if (d) src["~" + d] = d;
    for (const [, es] of (await import("./weather.js")).CODES) src["~" + es] = es; // el tiempo («Lluvia», «Nublado»…)
    const cache = readCache(l);
    const missing = Object.entries(src).filter(([k, v]) => cache[k]?.[0] !== v);
    const parts = []; for (let i = 0; i < missing.length; i += 50) parts.push(Object.fromEntries(missing.slice(i, i + 50)));
    let done = 0, failed = 0, lastErr = null, next = 0;
    listeners.forEach((f) => f(0, missing.length));
    // por tandas; si una falla se sigue con las demás (lo que falte se vuelve a pedir la próxima vez) y se guarda lo hecho
    await Promise.all([0, 1, 2].map(async () => {
      while (next < parts.length) {
        const part = parts[next++];
        try {
          const r = await api("/api/translate", { lang: l, entries: part }, { timeout: 45000 });
          for (const [k, v] of Object.entries(part)) if (typeof r.entries?.[k] === "string" && r.entries[k]) cache[k] = [v, r.entries[k]];
          try { localStorage.setItem(LS(l), JSON.stringify(cache)); } catch {}
        } catch (e) { failed++; lastErr = e; }
        done += Object.keys(part).length;
        listeners.forEach((f) => f(Math.min(done, missing.length), missing.length));
      }
    }));
    if (lang === l) load(l);
    // si no ha salido casi nada, se avisa; si falta poco, se usa así (lo que falte sale en castellano y se completa luego)
    const ok = Object.keys(src).filter((k) => cache[k]?.[0] === src[k]).length;
    if (failed && ok < Object.keys(src).length * 0.8) throw lastErr || { message: "No se ha podido traducir." };
    return missing.length;
  })();
  p.listeners = listeners;
  return p;
}
/** ¿Cuánto del idioma l está ya traducido? (0-1) */
export function languageReady(l) {
  if (l === "es") return 1;
  const c = readCache(l), keys = Object.keys(DICT.es);
  return keys.filter((k) => c[k]?.[0] === DICT.es[k]).length / keys.length;
}
/** Texto libre en castellano del catálogo → idioma actual. */
export const tr = (es) => (lang === "es" ? es : DICT[lang]?.["~" + es] ?? es);

/** t("closet.count", {n: 3}) → "3 prendas" */
export function t(key, vars) {
  let s = DICT[lang]?.[key] ?? DICT.es[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Rellena los elementos con data-t="clave" (texto) y data-t-ph="clave" (placeholder). */
export function translateDom(root = document) {
  root.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
  root.querySelectorAll("[data-t-ph]").forEach((el) => { el.placeholder = t(el.dataset.tPh); });
  root.querySelectorAll("[data-t-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.tAria)); });
}
