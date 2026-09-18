"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const discord_player_1 = require("discord-player");
const extractor_1 = require("@discord-player/extractor");
const discord_player_youtubei_1 = require("discord-player-youtubei");
const youtube_dl_exec_1 = __importDefault(require("youtube-dl-exec"));
const stream_1 = require("stream");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config/config");
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
        discord_js_1.GatewayIntentBits.MessageContent,
    ],
});
client.commands = new discord_js_1.Collection();
client.prefix = config_1.config.prefix;
(async () => {
    const player = new discord_player_1.Player(client, {
        connectionTimeout: 30000,
    });
    const cookiesFile = path_1.default.join(__dirname, '..', 'cookies.txt');
    // En servidores en la nube, las cookies se guardan como variable de entorno en base64
    if (process.env.YOUTUBE_COOKIES_B64 && !fs_1.default.existsSync(cookiesFile)) {
        fs_1.default.writeFileSync(cookiesFile, Buffer.from(process.env.YOUTUBE_COOKIES_B64, 'base64').toString('utf8'));
        console.log('[Player] cookies.txt creado desde variable de entorno YOUTUBE_COOKIES_B64');
    }
    const hasCookies = fs_1.default.existsSync(cookiesFile);
    if (hasCookies) {
        console.log('[Player] Usando cookies.txt para autenticación de YouTube');
    }
    else {
        console.warn('[Player] ADVERTENCIA: No se encontró cookies.txt — YouTube puede bloquear streams');
    }
    // YouTube: yt-dlp descarga y streamea el audio directamente (pipe de stdout).
    // Dejar que yt-dlp baje el CDN con su propio contexto evita el 403 que daba el fetch manual.
    await player.extractors.register(discord_player_youtubei_1.YoutubeExtractor, {
        createStream: async (track) => {
            try {
                const ytdlOptions = {
                    // Mejor audio disponible; fallback a formato 18 (mp4 no-DASH) si falla
                    format: 'bestaudio[acodec=opus]/bestaudio/18',
                    output: '-', // volcar a stdout
                    quiet: true,
                    noWarnings: true,
                    noPlaylist: true,
                    jsRuntime: 'node',
                    // Solo clientes que usan cookies (android/ios las ignoran y piden login)
                    extractorArgs: 'youtube:player_client=tv,web_safari,mweb',
                    forceIpv4: true,
                };
                if (hasCookies)
                    ytdlOptions.cookies = cookiesFile;
                // .exec() devuelve el subproceso (no lo await-ea) para poder pipear su stdout
                const subprocess = youtube_dl_exec_1.default.exec(track.url, ytdlOptions, {
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                // Buffer intermedio para suavizar la lectura hacia discord-player/ffmpeg
                const buffered = new stream_1.PassThrough({ highWaterMark: 4 * 1024 * 1024 });
                // Guardar la última línea de error de yt-dlp para diagnóstico
                let lastErr = '';
                subprocess.stderr?.on('data', (chunk) => {
                    const line = chunk.toString().trim();
                    if (line) {
                        lastErr = line.split('\n')[0];
                        console.error('[yt-dlp]', lastErr);
                    }
                });
                // CRÍTICO: capturar el rechazo del subproceso para que un track fallido
                // NO tumbe todo el proceso (unhandled rejection -> crash del bot).
                if (typeof subprocess.catch === 'function') {
                    subprocess.catch((err) => {
                        const msg = lastErr || err?.shortMessage || err?.message || 'yt-dlp falló';
                        console.error('[Stream] yt-dlp falló:', msg);
                        buffered.destroy(new Error(msg));
                    });
                }
                subprocess.on?.('error', (err) => buffered.destroy(err));
                if (!subprocess.stdout)
                    throw new Error('yt-dlp no expuso stdout');
                console.log(`[Stream] Iniciando pipe de yt-dlp para: ${track.title ?? track.url}`);
                subprocess.stdout.pipe(buffered);
                subprocess.stdout.on('error', (err) => buffered.destroy(err));
                return buffered;
            }
            catch (err) {
                console.error('[Stream] ERROR:', err?.message ?? err);
                throw err;
            }
        },
    });
    // Spotify con credenciales para que el quiz pueda resolver tracks por URL
    await player.extractors.register(extractor_1.SpotifyExtractor, {
        clientId: config_1.config.spotify.clientId,
        clientSecret: config_1.config.spotify.clientSecret,
    });
    // Archivos adjuntos directos
    await player.extractors.register(extractor_1.AttachmentExtractor, {});
    client.player = player;
    // Cargar comandos desde src/commands/{categoria}/*.ts (compilado a .js)
    const commandsPath = path_1.default.join(__dirname, 'commands');
    for (const dir of fs_1.default.readdirSync(commandsPath)) {
        const dirPath = path_1.default.join(commandsPath, dir);
        if (!fs_1.default.statSync(dirPath).isDirectory())
            continue;
        const files = fs_1.default.readdirSync(dirPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const command = require(path_1.default.join(dirPath, file));
            client.commands.set(command.name, command);
            if (command.aliases) {
                for (const alias of command.aliases) {
                    client.commands.set(alias, command);
                }
            }
        }
    }
    // Cargar eventos de Discord
    const eventsPath = path_1.default.join(__dirname, 'events');
    for (const file of fs_1.default.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
        const eventName = file.split('.')[0];
        const event = require(path_1.default.join(eventsPath, file));
        client.on(eventName, (...args) => event(client, ...args));
    }
    // Cargar eventos del reproductor
    const playerEventsPath = path_1.default.join(__dirname, 'player');
    for (const file of fs_1.default.readdirSync(playerEventsPath).filter(f => f.endsWith('.js'))) {
        const eventName = file.split('.')[0];
        const event = require(path_1.default.join(playerEventsPath, file));
        player.events.on(eventName, (...args) => event(...args));
    }
    client.login(config_1.config.token);
})();
//# sourceMappingURL=index.js.map