# CLAUDE.md

Bot de Discord (música + quiz musical) en TypeScript sobre Discord.js v14 y discord-player v7. Comandos de prefijo (`=` por defecto), no slash commands, más órdenes en lenguaje natural al mencionar al bot. El [README.md](README.md) documenta comandos, `.env`, cookies y deploy; aquí va lo que no está ahí.

## Comandos de desarrollo

```bash
npm run build   # limpia dist/ y compila con tsc
npm test        # build + node --test sobre dist/**/*.test.js
npm start       # node dist/index.js
npm run dev     # nodemon: recompila y reinicia al cambiar src/**/*.ts
```

- Verifica cambios con `npm run build && npm test`. No hay linter. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) solo hace `npm ci && npm run build`: **no corre los tests**.
- Tests con `node:test` + `node:assert/strict`, en `*.test.ts` junto al código (p. ej. [src/quiz/answers.test.ts](src/quiz/answers.test.ts), [src/ai/intents.test.ts](src/ai/intents.test.ts)). Solo cubren lógica pura (comparar respuestas, reglas de intents). **No pongas tests dentro de `commands/`, `events/` ni `player/`**: el loader cargaría el `.test.js` como si fuera un comando o evento.
- SonarCloud ([.sonarcloud.properties](.sonarcloud.properties)) trata `*.test.ts` como pruebas.
- `tsconfig` con `strict: false` y `noImplicitAny: false`; abunda `any`, no hace falta tiparlo todo.
- Probar de verdad requiere `.env` válido y un servidor de Discord con canal de voz.

## Arquitectura

[src/index.ts](src/index.ts) arranca todo y carga módulos **por nombre de archivo** desde `dist/`:

- `commands/<categoria>/*.js` → se registran por `name` y cada `alias` en `client.commands`.
- `events/<evento>.js` → `client.on('<evento>', (...args) => handler(client, ...args))`. El nombre del archivo ES el nombre del evento de Discord.
- `player/<evento>.js` → `player.events.on('<evento>', handler)`. Igual: el nombre del archivo es el evento de discord-player (`playerStart`, `emptyQueue`, `playerError`...). Estos handlers **no** reciben `client`.

Todos estos módulos exportan con `module.exports = ...` (no `export default`), porque el loader usa `require()`. Un comando nuevo: crea `src/commands/<categoria>/x.ts` con un objeto `Command` ([src/types/index.ts](src/types/index.ts)) y `module.exports = command`. `help` lo lista solo, agrupado por `category`.

[src/events/messageCreate.ts](src/events/messageCreate.ts) parsea prefijo + args y llama a `command.execute(client, message, args)`. Si el mensaje no tiene prefijo pero menciona al bot, lo pasa a `handleMention` ([src/ai/assistant.ts](src/ai/assistant.ts)). El log `[CMD]` registra solo autor y nombre del comando: **nunca registres el contenido de los mensajes ni los argumentos**.

Errores: el proceso captura `unhandledRejection`/`uncaughtException` y sigue vivo; solo un fallo en el arranque hace `process.exit(1)` (para que Railway reinicie). Los `channel.send` que no deben cortar la música ni el quiz llevan `.catch(logSendError)` ([src/utils/safeSend.ts](src/utils/safeSend.ts)).

### Config ([src/config/config.ts](src/config/config.ts))

Solo `DISCORD_TOKEN` es obligatoria. `config.spotify` es `null` si falta cualquiera de las dos credenciales de Spotify: entonces no se registra `SpotifyExtractor` y `=play` rechaza URLs de Spotify con un aviso. `config.deepseekApiKey` vacío = las menciones solo usan reglas.

### Streaming de YouTube ([src/streamer.ts](src/streamer.ts))

El `YoutubeExtractor` de discord-player-youtubei se usa para **buscar**, pero el audio lo produce yt-dlp (`youtube-dl-exec`) pipeando su stdout. No uses el stream propio del extractor: daba 403 desde IPs de datacenter.

- El punto de entrada es el hook global `onBeforeCreateStream` en `index.ts`: es el único sitio donde discord-player da track + cola juntos, así que ahí se sabe el servidor (precarga por servidor y seek del quiz solo en su servidor). El `createStream` del extractor solo se usa para tracks puenteados (Spotify → YouTube).
- `spawnStream(url, title, seekSeconds)`: con `seekSeconds > 0` encadena `yt-dlp | ffmpeg -ss N -c copy` para que el audio ya empiece en ese segundo (lo usa el quiz). Evita `queue.node.seek()`, que re-crea el stream y causa doble silencio.
- Precarga **por servidor**: `prefetchTrack(guildId, url, title, seek)` y `takePrefetched(guildId, url, seek)`. Máx. 2 entradas por servidor, TTL 15 min. En `index.ts`, `playerStart` precarga el siguiente de la cola (salvo en quiz, que precarga él mismo con su seek); `emptyQueue` y `queueDelete` limpian las de ese servidor.
- Si yt-dlp falla después de entregar el stream, el hook emite `playerError` en la cola para que música y quiz reaccionen.
- `extractorArgs: 'youtube:player_client=tv,web_safari,mweb'` está probado en Railway con cookies; el historial de git muestra que cambiarlo rompió cosas. No lo toques sin motivo.
- Los subprocesos se matan en el `close` del PassThrough y los rechazos de yt-dlp se capturan para que un track roto no tumbe el proceso. Mantén ambas cosas si refactorizas.

### Quiz ([src/quiz/MusicQuiz.ts](src/quiz/MusicQuiz.ts))

- Saca canciones de una playlist pública de Spotify con `spotify-url-info` (scrapea la página embed, **sin credenciales**; [src/services/spotify.ts](src/services/spotify.ts)).
- Cada canción se busca en YouTube como `"<título> <artista>"`, se elige la versión más vista sin remixes, suena desde 0:45 (`QUIZ_SEEK_SECONDS`), hay 60 s para adivinar y 1.5 s de pausa entre canciones (`SONG_GAP_MS`). Título 2 pts, artista 3 pts.
- Comparar respuestas y armar el marcador es lógica pura en [src/quiz/answers.ts](src/quiz/answers.ts) (con tests). Cambios ahí → añade casos al test.
- Respuestas: un `MessageCollector` sobre el canal. `=stop` y `=vskip` dentro del quiz los maneja el collector, **no** el sistema de comandos (`vskip` no existe como comando).
- `quizGuilds` (exportado) es el estado global de "hay quiz en este servidor". Los comandos que tocan la cola usan `rejectIfQuizActive(message)` al inicio, y los eventos `playerStart`/`emptyQueue`/`emptyChannel` consultan `quizGuilds` para no interferir ni revelar la canción. Si añades un comando o evento de cola, haz lo mismo. Si el comando hace algo lento antes de tocar la cola (búsqueda, esperar al usuario), vuelve a llamar `rejectIfQuizActive` justo antes (ver `play.ts` y `search.ts`).
- `cleanup()` llama a `clearPrefetched(guildId)` porque las precargas del quiz traen seek a 0:45 y contaminarían un `=play` normal.
- En [src/commands/quiz/quiz.ts](src/commands/quiz/quiz.ts), `activeQuizzes` protege mientras se carga la playlist; durante la partida protege `quizGuilds`.

### Menciones en lenguaje natural ([src/ai/](src/ai/))

- Primero reglas ([intents.ts](src/ai/intents.ts), con tests): frases comunes → comando + args, gratis y al instante. Si no encajan y hay `DEEPSEEK_API_KEY`, va a DeepSeek ([assistant.ts](src/ai/assistant.ts)) vía `fetch` (API compatible con OpenAI, sin SDK) con tool calling, máx. 4 vueltas.
- Cada herramienta mapea a un **comando existente** y lo ejecuta con el mensaje original: validación y mensajes al canal son los mismos que con prefijo. Para una acción nueva por mención, crea el comando y añade la herramienta/regla; no dupliques lógica.
- Durante un quiz no se interpreta nada, y antes de cada acción se re-comprueba `quizGuilds`.
- El texto que devuelve la IA se envía con `allowedMentions: { parse: [] }` para que no pueda mencionar a @everyone, roles ni usuarios. Mantenlo.

## Deploy

[Dockerfile](Dockerfile) multi-stage: `npm ci --ignore-scripts` y solo se re-ejecutan los scripts de `ffmpeg-static` y `youtube-dl-exec` (descargan binarios); actualiza yt-dlp en el build; imagen final sin devDeps ni build-essential y con usuario `node`. Si añades una dependencia que necesite su script de instalación, añádela al `npm rebuild` del stage `deps`.

## Convenciones

- Todo en español: mensajes al usuario, comentarios, logs y commits.
- Mensajes al usuario: `message.channel.send(':warning: ...')` para errores y `:white_check_mark:` para éxito; embeds con `EmbedBuilder` (verde `0x1DB954` para música).
- Logs de consola con prefijo entre corchetes: `[Player]`, `[Stream]`, `[Prefetch]`, `[Quiz]`, `[yt-dlp]`, `[IA]`, `[Proceso]`.
- Commits: Conventional Commits con scope, p. ej. `feat(quiz): ...`, `fix(music): ...`. Cambios a `master` por PR con squash merge.
- Nunca subas `.env` ni `cookies.txt` (están en `.gitignore`, pero existen en local).
