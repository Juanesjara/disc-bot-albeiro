# coipia-albeiro

Bot de Discord con reproductor de música y quiz musical. Reproduce canciones de YouTube y Spotify en tu canal de voz usando comandos de prefijo (por defecto `=`).

## Características

- Reproducción desde YouTube (streaming directo con yt-dlp), Spotify y archivos adjuntos
- Cola con controles completos: saltar, quitar, mezclar, repetir, volumen
- Precarga de la siguiente canción para que no haya silencio entre temas
- Quiz musical: adivina el artista y/o título de canciones de una playlist de Spotify
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

### Quiz musical

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `=quiz <url_playlist> <canciones> [artist\|title\|both]` | `=mq`, `=musicquiz` | Inicia un quiz con una playlist de Spotify |

```
=quiz https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF 10 both
```

- Debes estar en un canal de voz. Solo puede haber un quiz activo por servidor, y no arranca si hay música sonando o en cola (usa `=stop` primero).
- `canciones`: entre 1 y 30. La playlist debe ser pública (los Blend de Spotify son privados y no funcionan).
- Modo: `artist` (3 pts), `title` (2 pts) o `both` (por defecto, se pueden ganar ambos).
- Cada canción empieza en el 0:45 y hay 60 segundos para adivinar.
- Solo puntúa quien está en el canal de voz. La respuesta se escribe en el chat y cuenta si el título o el artista aparecen como palabras completas en el mensaje ("creo que es tusa" acierta "Tusa"; "yoyo" no acierta "Yo"). No importan mayúsculas, tildes, comillas ni signos.
- Durante el quiz: `=stop` lo termina y `=vskip` vota para saltar la canción (requiere unanimidad de quienes están en el canal de voz). Los demás comandos de música quedan bloqueados, salvo `=volume`.
- Si una canción no se encuentra en YouTube o su audio falla, el quiz pasa solo a la siguiente.
- La tabla de puntos incluye a quien puntuó aunque ya se haya ido del canal.

### Info

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `=help [comando]` | `=h` | Lista los comandos o detalla uno |
| `=ping` | — | Latencia del bot |
| `=debug` | — | Ping, servidores, RAM y uptime |

## Requisitos

- Node.js 22.12 o superior
- Una aplicación de [Discord](https://discord.com/developers/applications) con el intent **Message Content** activado
- Una aplicación de [Spotify](https://developer.spotify.com/dashboard) (opcional, solo para `=play` con enlaces de Spotify)

yt-dlp y FFmpeg **no** hace falta instalarlos aparte: vienen con `youtube-dl-exec` y `ffmpeg-static` al instalar dependencias.

## Configuración

Crea un archivo `.env` en la raíz:

```env
# Obligatoria
DISCORD_TOKEN=tu_token_de_discord

# Opcionales
PREFIX==
YOUTUBE_COOKIES_B64=

# Spotify: solo para `=play` con enlaces de Spotify (hacen falta las dos).
# Sin ellas el bot arranca igual y el quiz funciona (lee las playlists sin credenciales).
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret
```

El bot no arranca sin `DISCORD_TOKEN`, y si el token es inválido el proceso termina con error (así el proveedor de hosting lo reinicia).

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
npm ci
npm run build   # compila src/ → dist/
npm start
```

Desarrollo con recarga automática (recompila al cambiar cualquier `.ts`):

```bash
npm run dev
```

Pruebas (compila y corre los `*.test.ts` con el runner integrado de Node):

```bash
npm test
```

## Deploy

### Docker

```bash
docker build -t coipia-albeiro .
docker run --env-file .env coipia-albeiro
```

La imagen es multi-stage: la final solo lleva las dependencias de producción, no incluye herramientas de compilación y corre con el usuario `node` (no root). `.env` y `cookies.txt` nunca entran en la imagen. En el build se actualiza yt-dlp a la última versión, porque YouTube rompe versiones viejas con frecuencia: si la música deja de sonar, reconstruir la imagen suele arreglarlo.

### Railway

Railway construye con el `Dockerfile`. Configura las variables de entorno (`DISCORD_TOKEN`, `YOUTUBE_COOKIES_B64`, opcionalmente las de Spotify) en el dashboard.

Cada merge a `master` dispara un despliegue nuevo y reinicia el bot, así que corta la música que esté sonando. Para redesplegar a mano el último commit usa `railway redeploy --from-source` (sin `--from-source` puede reutilizar un despliegue viejo).

### CI

En cada push o PR a `master`/`main`:

- GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) instala con `npm ci` y compila.
- SonarCloud analiza el código nuevo (la configuración está en [.sonarcloud.properties](.sonarcloud.properties)).

## Estructura

```
src/
├── index.ts          # Arranque: cliente, player, extractores, hook de stream y carga de comandos/eventos
├── config/           # Lectura y validación de variables de entorno
├── commands/         # Un archivo por comando, agrupados por categoría (info, music, quiz)
├── events/           # Eventos de Discord (messageCreate, clientReady)
├── player/           # Eventos de discord-player (playerStart, emptyQueue, ...)
├── quiz/             # Lógica del quiz (MusicQuiz) y evaluación de respuestas (answers + tests)
├── services/         # Lectura de playlists de Spotify
├── streamer.ts       # Streaming de YouTube con yt-dlp + precarga por servidor
├── utils/            # Utilidades compartidas
└── types/            # Tipos compartidos (Command, BotClient, ...)
```

Los comandos y eventos se cargan automáticamente desde sus carpetas. Para añadir un comando, crea un `.ts` en `src/commands/<categoría>/` que exporte un objeto `Command` con `module.exports` (ver [src/types/index.ts](src/types/index.ts)).

## Stack

- [Discord.js v14](https://discord.js.org/)
- [discord-player v7](https://discord-player.js.org/) + [discord-player-youtubei](https://github.com/retrouser955/discord-player-youtubei)
- [youtube-dl-exec](https://github.com/microlinkhq/youtube-dl-exec) (yt-dlp) + [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- TypeScript + Node.js 22
