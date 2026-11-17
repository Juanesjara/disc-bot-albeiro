# CLAUDE.md

Bot de Discord (música + quiz musical) en TypeScript sobre Discord.js v14 y discord-player v7. Comandos de prefijo (`=` por defecto), no slash commands. El [README.md](README.md) documenta comandos, `.env`, cookies y deploy; aquí va lo que no está ahí.

## Comandos de desarrollo

```bash
npm run build   # limpia dist/ y compila con tsc
npm test        # build + node --test sobre dist/**/*.test.js
npm start       # node dist/index.js
npm run dev     # nodemon: recompila y reinicia al cambiar src/**/*.ts
```

- Solo hay pruebas para la evaluación de respuestas del quiz ([src/quiz/answers.test.ts](src/quiz/answers.test.ts)), con `node:test`, sin dependencias. Lo demás se verifica con `npm run build` y probando en Discord.
- Los tests **no** pueden vivir en `src/commands/`, `src/events/` ni `src/player/`: el loader hace `require` de todo `.js` de esas carpetas en `dist/`.
- `tsconfig` con `strict: false` y `noImplicitAny: false`; abunda `any`, no hace falta tiparlo todo.
- Probar de verdad requiere token y un servidor de Discord con canal de voz. El `.env` local puede tener un token viejo: `railway run node dist/index.js` arranca en local con las variables de Railway (apaga antes el despliegue de Railway, o responderán los dos).

## CI y SonarCloud

- GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): `npm ci && npm run build`.
- SonarCloud analiza cada PR con Quality Gate sobre código nuevo. Lo que más lo tumba:
  - **Duplicación > 3 %.** `*.test.ts` se declara como test en [.sonarcloud.properties](.sonarcloud.properties) para que no cuente.
  - **Promesas sin manejar.** Toda promesa debe llevar `await`, `.catch(...)` o `void` explícito.
  - **`npm ci`/`npm install` sin `--ignore-scripts` en el Dockerfile** (ver Deploy).
- Revisa el estado de **ambos** checks (`build` y `SonarCloud Code Analysis`) antes de mergear: `gh pr checks <n>`.

## Arquitectura

[src/index.ts](src/index.ts) arranca todo y carga módulos **por nombre de archivo** desde `dist/`:

- `commands/<categoria>/*.js` → se registran por `name` y cada `alias` en `client.commands`.
- `events/<evento>.js` → `client.on('<evento>', (...args) => handler(client, ...args))`. El nombre del archivo ES el nombre del evento de Discord.
- `player/<evento>.js` → `player.events.on('<evento>', handler)`. Igual: el nombre del archivo es el evento de discord-player (`playerStart`, `emptyQueue`, `playerError`...). Estos handlers **no** reciben `client`.

Todos estos módulos exportan con `module.exports = ...` (no `export default`), porque el loader usa `require()`. Un comando nuevo: crea `src/commands/<categoria>/x.ts` con un objeto `Command` ([src/types/index.ts](src/types/index.ts)) y `module.exports = command`. `help` lo lista solo, agrupado por `category`.

[src/events/messageCreate.ts](src/events/messageCreate.ts) parsea prefijo + args y llama a `command.execute(client, message, args)`. Solo loguea `[CMD]` con autor y nombre del comando; **nunca** el texto de los mensajes.

### Errores

- `index.ts` registra `unhandledRejection`/`uncaughtException` con log `[Proceso]`: un error puntual no tumba el bot.
- Excepción: un fallo en el **arranque** (token inválido, extractor que no carga) sí termina el proceso con `exit(1)`, para que Railway lo reinicie. No lo conviertas en un log.
- Envíos al canal: `channel.send(...).catch(logSendError)` ([src/utils/safeSend.ts](src/utils/safeSend.ts)). En `MusicQuiz` usa `this.send()`, que nunca rechaza (marca con `void` si no lo esperas).

### Streaming de YouTube ([src/streamer.ts](src/streamer.ts))

El `YoutubeExtractor` de discord-player-youtubei se usa para **buscar**, pero el audio lo produce yt-dlp (`youtube-dl-exec`) pipeando su stdout. No uses el stream propio del extractor: daba 403 desde IPs de datacenter.

- El stream de los tracks de YouTube se crea en el hook global `onBeforeCreateStream(track, queryType, queue)` de `index.ts`. Es el único punto que recibe track y cola juntos; dentro de `createStream`, `track.queue` es `undefined` porque el track ya salió de `queue.tracks`. Con el servidor conocido decide el seek: 45 s si ese servidor tiene quiz, 0 si no.
- `createStream` del extractor queda solo para tracks puenteados (Spotify → YouTube), siempre desde 0:00.
- El hook convierte el `error` del stream en `playerError` de la cola. Si yt-dlp falla después de entregar el stream, discord-player solo vería que el audio se acabó.
- `spawnStream(url, title, seekSeconds)`: con `seekSeconds > 0` encadena `yt-dlp | ffmpeg -ss N -c copy` para que el audio ya empiece en ese segundo (lo usa el quiz). Evita `queue.node.seek()`, que re-crea el stream y causa doble silencio.
- Precarga por servidor:
  - `prefetchTrack(guildId, url, title, seek)` arranca el stream antes y `takePrefetched(guildId, url, seek)` lo entrega.
  - La clave es servidor + seek + URL, así que un `=play` nunca recibe un stream del quiz.
  - Máximo 2 por servidor, TTL 15 min.
  - `clearPrefetched(guildId)` limpia un servidor; sin argumento, todos.
  - En `index.ts`, `playerStart` precarga la siguiente de la cola (solo YouTube y nunca durante un quiz); `emptyQueue` y `queueDelete` limpian solo su servidor.
- `extractorArgs: 'youtube:player_client=tv,web_safari,mweb'` está probado en Railway con cookies; el historial de git muestra que cambiarlo rompió cosas. No lo toques sin motivo.
- Los subprocesos se matan en el `close` del PassThrough y los rechazos de yt-dlp se capturan para que un track roto no tumbe el proceso. Mantén ambas cosas si refactorizas.

### Quiz ([src/quiz/MusicQuiz.ts](src/quiz/MusicQuiz.ts))

- Saca canciones de una playlist pública de Spotify con `spotify-url-info` (scrapea la página embed, **sin credenciales**; [src/services/spotify.ts](src/services/spotify.ts)). Las credenciales de Spotify de `.env` son opcionales y solo las usa `SpotifyExtractor` para `=play` con URLs de Spotify.
- Cada canción se busca en YouTube como `"<título> <artista>"`, se elige la versión más vista sin remixes, suena desde 0:45 (`QUIZ_SEEK_SECONDS`, exportado), hay 60 s para adivinar y 1.5 s de pausa entre canciones (`SONG_GAP_MS`).
- Respuestas: un `MessageCollector` sobre el canal. `=stop` y `=vskip` dentro del quiz los maneja el collector, **no** el sistema de comandos (`vskip` no existe como comando).
- Solo juegan quienes están en el canal de voz. Los mensajes con prefijo no se evalúan como respuesta.
- La normalización y el "¿acierta?" son funciones puras en [src/quiz/answers.ts](src/quiz/answers.ts): palabras completas, sin tildes, comillas ni puntuación. Cualquier cambio ahí va con su caso en `answers.test.ts`.
- Título o artista vacío tras limpiar se da por adivinado; si no queda nada que adivinar en la ronda, se salta.
- `quizGuilds` (exportado) es el estado global de "hay quiz en este servidor".
  - Los comandos de música llaman a `rejectIfQuizActive(message)` al inicio. Si añades un comando de música, haz lo mismo; solo `volume` está exento.
  - `skip`, `stop` y `remove` tienen su propio chequeo.
  - Los eventos del player (`playerStart`, `playerError`, `emptyQueue`...) consultan `quizGuilds` para no interferir ni revelar la canción.
- `=quiz` se niega si ya hay quiz (`activeQuizzes` mientras carga la playlist, `quizGuilds` durante la partida) o si hay música sonando o en cola.
- El quiz escucha `playerError` de su servidor y de su canción actual (`currentUrl`) para pasar solo a la siguiente; quita el listener en `cleanup()`.
- `cleanup()` limpia las precargas de su servidor: llevan seek a 0:45 y contaminarían un `=play` normal.

## Deploy

- Railway construye con el [Dockerfile](Dockerfile): multi-stage, runtime sin devDeps ni build-essential, usuario `node`.
- Las dependencias se instalan con `--ignore-scripts` y luego `npm rebuild ffmpeg-static youtube-dl-exec`, que son los únicos cuyos scripts hacen falta porque descargan los binarios. Si añades una dependencia que necesita su script de instalación, súmala a ese `npm rebuild`.
- Cada merge a `master` redespliega y reinicia el bot, cortando la música. Mergear varios PRs seguidos = varios reinicios. Para comparar contra un bug, revisa `railway deployment list` y `railway logs <id>`.
- `railway redeploy` sin `--from-source` puede reutilizar un despliegue viejo (pasó: redesplegó un commit de antes de la v2 y el build falló). Usa `railway redeploy --from-source -y`.
- `discord-player-youtubei` 3.1.0 hace `require("simple-ytdl-core")` pero no lo declara como dependencia: por eso está en `package.json`. No lo quites.
- `@discordjs/voice` 0.19 pide Node ≥ 22.12.

## Convenciones

- Todo en español: mensajes al usuario, comentarios, logs y commits.
- Mensajes al usuario: `message.channel.send(':warning: ...')` para errores y `:white_check_mark:` para éxito; embeds con `EmbedBuilder` (verde `0x1DB954` para música).
- Logs de consola con prefijo entre corchetes: `[Player]`, `[Stream]`, `[Prefetch]`, `[Quiz]`, `[yt-dlp]`, `[Proceso]`, `[Discord]`.
- Commits: Conventional Commits con scope, p. ej. `feat(quiz): ...`, `fix(music): ...`.
- PRs que dependen de otros: mergea con **merge commit**, no squash, o los siguientes darán conflicto.
- Nunca subas `.env` ni `cookies.txt` (están en `.gitignore`, pero existen en local).
