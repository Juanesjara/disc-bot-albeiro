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
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
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
    // YouTube: yt-dlp obtiene la URL CDN autenticada, https la streamea con headers correctos
    await player.extractors.register(discord_player_youtubei_1.YoutubeExtractor, {
        createStream: async (track) => {
            try {
                // Paso 1: yt-dlp resuelve la URL del CDN (no descarga, solo extrae la URL)
                const ytdlOptions = {
                    // Mejor audio disponible; fallback a formato 18 (mp4 no-DASH) si falla
                    format: 'bestaudio[acodec=opus][abr>=100]/bestaudio[acodec=opus]/bestaudio/18',
                    getUrl: true,
                    noWarnings: true,
                    jsRuntime: 'node',
                };
                if (hasCookies)
                    ytdlOptions.cookies = cookiesFile;
                const output = await youtube_dl_exec_1.default(track.url, ytdlOptions);
                const streamUrl = output.split('\n').map((l) => l.trim()).filter(Boolean)[0];
                if (!streamUrl)
                    throw new Error('yt-dlp no devolvió URL');
                // Paso 2: streamear la URL del CDN con headers de navegador
                return new Promise((resolve, reject) => {
                    const protocol = streamUrl.startsWith('https') ? https_1.default : http_1.default;
                    const req = protocol.get(streamUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'Accept': '*/*',
                            'Accept-Encoding': 'identity',
                            'Connection': 'keep-alive',
                            'Referer': 'https://www.youtube.com/',
                        },
                    }, (res) => {
                        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                            const rp = res.headers.location.startsWith('https') ? https_1.default : http_1.default;
                            rp.get(res.headers.location, { headers: { 'Accept-Encoding': 'identity' } }, (redirectRes) => {
                                const buffered = new stream_1.PassThrough({ highWaterMark: 4 * 1024 * 1024 });
                                redirectRes.pipe(buffered);
                                resolve(buffered);
                            }).on('error', reject);
                        }
                        else {
                            console.log(`[Stream] CDN ${res.statusCode} — ${res.headers['content-type']} — ${res.headers['content-length']} bytes`);
                            const buffered = new stream_1.PassThrough({ highWaterMark: 4 * 1024 * 1024 });
                            res.pipe(buffered);
                            resolve(buffered);
                        }
                    });
                    req.on('error', reject);
                });
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