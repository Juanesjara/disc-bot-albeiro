# coipia-albeiro

Bot de Discord con reproductor de música y quiz musical. Reproduce canciones desde YouTube o Spotify directamente en tu canal de voz usando comandos de prefijo.

## Características

- Reproducción de música desde YouTube (vía yt-dlp) y Spotify
- Cola de reproducción con controles completos
- Filtros de audio (bassboost, nightcore, etc.)
- Quiz musical: adivina canciones de tus playlists de Spotify
- Prefijo configurable (por defecto `=`)

## Comandos

El prefijo por defecto es `=`. Todos los comandos se usan en el chat de texto.

### Música

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `=play <nombre o URL>` | `=p` | Reproduce una canción o playlist |
| `=search <nombre>` | — | Busca canciones y elige de una lista |
| `=pause` | — | Pausa la reproducción |
| `=resume` | — | Reanuda la reproducción |
| `=skip` | `=s` | Salta la canción actual |
| `=stop` | — | Detiene el bot y limpia la cola |
| `=queue` | — | Muestra la cola de reproducción |
| `=nowplaying` | — | Muestra la canción actual |
| `=loop` | — | Cambia el modo de bucle (canción / cola / off) |
| `=shuffle` | — | Mezcla la cola aleatoriamente |
| `=volume <0-100>` | — | Ajusta el volumen |
| `=clear` | — | Limpia la cola de reproducción |
| `=filter` | — | Aplica un filtro de audio |

### Quiz Musical

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `=quiz <url_playlist> <canciones> [artist\|title\|both]` | `=mq`, `=musicquiz` | Inicia un quiz con una playlist de Spotify |

**Ejemplo:** `=quiz https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF 10 both`

- `canciones`: entre 1 y 30
- Modo: `artist` (adivina el artista), `title` (adivina el título), `both` (ambos, por defecto)

### Info

| Comando | Alias | Descripción |
|---------|-------|-------------|
| `=help [comando]` | `=h` | Lista todos los comandos o detalla uno |
| `=ping` | — | Muestra la latencia del bot |

## Requisitos

- Node.js 22 o superior
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) instalado en el sistema
- FFmpeg instalado en el sistema
- Aplicación de [Discord](https://discord.com/developers/applications)
- Aplicación de [Spotify](https://developer.spotify.com/dashboard/applications)

## Configuración

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
DISCORD_TOKEN=tu_token_de_discord
SPOTIFY_CLIENT_ID=tu_client_id_de_spotify
SPOTIFY_CLIENT_SECRET=tu_client_secret_de_spotify

# Opcionales
PREFIX==
DISCORD_OWNER_ID=tu_id_de_discord

# Para autenticación de YouTube en servidores cloud (cookies en base64)
YOUTUBE_COOKIES_B64=
```

### Cookies de YouTube (opcional)

Si YouTube bloquea los streams (común en servidores cloud), puedes pasar un archivo `cookies.txt` en formato Netscape:

```bash
# Opción 1: archivo local
cp cookies.txt ./cookies.txt

# Opción 2: variable de entorno (base64)
YOUTUBE_COOKIES_B64=$(base64 -w0 cookies.txt)
```

## Instalación y ejecución

```bash
npm install
npm run build
npm start
```

Para desarrollo con recarga automática:

```bash
npm run dev
```

## Deploy en Heroku / Railway

El proyecto incluye un `Procfile` configurado como worker:

```
worker: node dist/index.js
```

Recuerda configurar las variables de entorno en el dashboard de tu proveedor.

## Stack

- [Discord.js v14](https://discord.js.org/)
- [discord-player v7](https://discord-player.js.org/) + [YoutubeExtractor](https://github.com/discord-player/discord-player-youtubei)
- [youtube-dl-exec](https://github.com/nicholasgasior/youtube-dl-exec) (yt-dlp)
- TypeScript + Node.js 22
