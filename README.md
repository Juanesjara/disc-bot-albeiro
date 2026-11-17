# coipia-albeiro

Bot de Discord con reproductor de música y quiz musical. Reproduce canciones de YouTube y Spotify en tu canal de voz usando comandos de prefijo (por defecto `=`), o mencionándolo y pidiéndole las cosas con tus palabras.

## Características

- Reproducción desde YouTube (streaming directo con yt-dlp) y enlaces de Spotify
- Cola con controles completos: saltar, quitar, mezclar, repetir, volumen
- Precarga de la siguiente canción para que no haya silencio entre temas
- Quiz musical: adivina el artista y/o título de canciones de una playlist de Spotify
- Órdenes en lenguaje natural mencionando al bot
- Prefijo configurable

## Comandos

Todos los comandos se escriben en un canal de texto del servidor. Usa `=help <comando>` para ver el detalle de cualquiera.

### Música

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `=play <nombre o URL>` | `=p` | Reproduce una canción o playlist (YouTube / Spotify) |
| `=search <nombre>` | `=sc` | Busca y te deja escoger qué reproducir |
| `=pause` | — | Pausa la música |
| `=resume` | `=r` | Reanuda la música pausada |
| `=skip` | `=s` | Salta la canción actual |
| `=stop` | — | Detiene la música y limpia la cola |
| `=queue [página]` | `=q` | Muestra la cola |
| `=nowplaying` | `=np` | Muestra la canción actual |
| `=remove <número>` | `=rm`, `=quit` | Quita una canción de la cola (el número que muestra `=queue`) |
| `=clear` | `=clearqueue` | Limpia la cola sin detener la canción actual |
| `=loop [off\|track\|queue]` | `=repeat` | Cambia el modo de repetición |
| `=shuffle` | — | Mezcla la cola |
| `=volume <1-100>` | `=vol` | Ajusta el volumen |

Mientras hay un quiz en el servidor, los comandos de música no están disponibles (salvo `=volume`).

### Quiz musical

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `=quiz <url_playlist> <canciones> [artist\|title\|both]` | `=mq`, `=musicquiz` | Inicia un quiz con una playlist de Spotify |

```
=quiz https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF 10 both
```

- Debes estar en un canal de voz. Solo puede haber un quiz activo por servidor.
- `canciones`: entre 1 y 30.
- Modo: `artist` (3 pts), `title` (2 pts) o `both` (por defecto, se pueden ganar ambos).
- Cada canción empieza en el 0:45 y hay 60 segundos para adivinar. Las respuestas se escriben en el chat; no importan mayúsculas, tildes ni comillas.
- Durante el quiz: `=stop` lo termina y `=vskip` vota para saltar la canción (requiere unanimidad).
- Al final se muestra la tabla de puntos.

### Hablarle en lenguaje natural

También puedes mencionar al bot y pedirle las cosas con tus palabras:

- `@bot pon Tusa de Karol G`
- `@bot salta esta`
- `@bot qué está sonando`
- `@bot para la música`
- `@bot haz un quiz de 10 canciones con esta playlist <url de Spotify>`

Ejecuta los mismos comandos de arriba, con las mismas respuestas. Las frases comunes se entienden con reglas, gratis y al instante; solo las que no encajan se mandan a la IA (DeepSeek), y solo si configuraste `DEEPSEEK_API_KEY`. Durante un quiz no toca la música ni revela la canción: usa `=stop` o `=vskip`.

### Info

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `=help [comando]` | `=h` | Lista los comandos o detalla uno |
| `=ping` | — | Latencia del bot |
| `=debug` | — | Ping, servidores, RAM, uptime y estado de la cola |

## Requisitos

- Node.js 22 o superior
- Una aplicación de [Discord](https://discord.com/developers/applications) con el intent **Message Content** activado
- Opcional: una aplicación de [Spotify](https://developer.spotify.com/dashboard) (Client ID y Secret), solo para `=play` con enlaces de Spotify
- Opcional: una API key de [DeepSeek](https://platform.deepseek.com/), solo para las menciones que las reglas no entienden

yt-dlp y FFmpeg **no** hace falta instalarlos aparte: vienen con `youtube-dl-exec` y `ffmpeg-static` al hacer `npm install`.

## Configuración

Crea un archivo `.env` en la raíz:

```env
# Obligatoria
DISCORD_TOKEN=tu_token_de_discord

# Opcionales
PREFIX==

# Spotify: solo para `=play` con enlaces de Spotify (hacen falta las dos).
# Sin ellas el bot arranca igual y el quiz funciona (lee las playlists sin credenciales).
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret

# IA (DeepSeek) para las frases que las reglas no entienden al mencionar al bot.
# Sin ella las menciones entienden las frases comunes y los comandos con prefijo funcionan igual.
DEEPSEEK_API_KEY=

# Cookies de YouTube en base64 (ver abajo)
YOUTUBE_COOKIES_B64=
```

El bot no arranca si falta `DISCORD_TOKEN`.

### Cookies de YouTube

YouTube suele bloquear streams desde IPs de servidores cloud. Para evitarlo, exporta tus cookies en formato Netscape y:

- **Local:** guárdalas como `cookies.txt` en la raíz del proyecto (está en `.gitignore`).
- **Cloud:** pásalas en base64 por variable de entorno; el bot crea `cookies.txt` al arrancar.

  ```bash
  base64 -w0 cookies.txt   # pega el resultado en YOUTUBE_COOKIES_B64
  ```

Si no hay cookies, el bot lo avisa en consola pero sigue funcionando.

## Instalación y ejecución

```bash
npm install
npm run build   # compila src/ → dist/
npm start
```

Desarrollo con recarga automática (recompila al cambiar cualquier `.ts`):

```bash
npm run dev
```

Pruebas (compila y corre los `*.test.ts` con el runner de Node):

```bash
npm test
```

## Deploy

### Docker

```bash
docker build -t coipia-albeiro .
docker run --env-file .env coipia-albeiro
```

La imagen es multi-stage: no lleva devDependencies, herramientas de compilación ni secretos, y corre sin root. Actualiza yt-dlp a la última versión en el build, porque YouTube rompe versiones viejas con frecuencia: si la música deja de sonar, reconstruir la imagen suele arreglarlo.

### Heroku / Railway

El `Procfile` ya define el proceso como worker (`node dist/index.js`). Configura las variables de entorno en el dashboard del proveedor.

### CI

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) instala dependencias y compila en cada push o PR a `master`/`main`.

## Estructura

```
src/
├── index.ts          # Arranque: cliente, player, extractores y carga de comandos/eventos
├── config/           # Lectura y validación de variables de entorno
├── commands/         # Un archivo por comando, agrupados por categoría (info, music, quiz)
├── events/           # Eventos de Discord (messageCreate, clientReady)
├── player/           # Eventos de discord-player (playerStart, emptyQueue, ...)
├── quiz/             # Lógica del quiz musical y comparación de respuestas
├── ai/               # Menciones en lenguaje natural: reglas + DeepSeek
├── services/         # Lectura de playlists de Spotify
├── streamer.ts       # Streaming de YouTube con yt-dlp + precarga
├── utils/            # Utilidades compartidas
└── types/            # Tipos compartidos (Command, BotClient, ...)
```

Los comandos y eventos se cargan automáticamente desde sus carpetas. Para añadir un comando, crea un `.ts` en `src/commands/<categoría>/` que exporte un objeto `Command` con `module.exports` (ver [src/types/index.ts](src/types/index.ts)).

## Stack

- [Discord.js v14](https://discord.js.org/)
- [discord-player v7](https://discord-player.js.org/) + [discord-player-youtubei](https://github.com/retrouser955/discord-player-youtubei)
- [youtube-dl-exec](https://github.com/microlinkhq/youtube-dl-exec) (yt-dlp) + [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- TypeScript + Node.js 22
