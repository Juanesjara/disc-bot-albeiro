import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { Player } from 'discord-player';
import { SpotifyExtractor, AttachmentExtractor } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import youtubeDl from 'youtube-dl-exec';
import https from 'https';
import http from 'http';
import { PassThrough } from 'stream';
import path from 'path';
import fs from 'fs';
import { config } from './config/config';
import { BotClient, Command } from './types';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
    ],
}) as BotClient;

client.commands = new Collection<string, Command>();
client.prefix = config.prefix;

(async () => {
    const player = new Player(client, {
        connectionTimeout: 30000,
    });
    const cookiesFile = path.join(__dirname, '..', 'cookies.txt');

    // En servidores en la nube, las cookies se guardan como variable de entorno en base64
    if (process.env.YOUTUBE_COOKIES_B64 && !fs.existsSync(cookiesFile)) {
        fs.writeFileSync(cookiesFile, Buffer.from(process.env.YOUTUBE_COOKIES_B64, 'base64').toString('utf8'));
        console.log('[Player] cookies.txt creado desde variable de entorno YOUTUBE_COOKIES_B64');
    }

    const hasCookies = fs.existsSync(cookiesFile);
    if (hasCookies) {
        console.log('[Player] Usando cookies.txt para autenticación de YouTube');
    } else {
        console.warn('[Player] ADVERTENCIA: No se encontró cookies.txt — YouTube puede bloquear streams');
    }

    // YouTube: yt-dlp obtiene la URL CDN autenticada, https la streamea con headers correctos
    await player.extractors.register(YoutubeExtractor, {
        createStream: async (track: any) => {
            try {
                // Paso 1: yt-dlp resuelve la URL del CDN (no descarga, solo extrae la URL)
                const ytdlOptions: any = {
                    // Mejor audio disponible; fallback a formato 18 (mp4 no-DASH) si falla
                    format: 'bestaudio[acodec=opus][abr>=100]/bestaudio[acodec=opus]/bestaudio/18',
                    getUrl: true,
                    noWarnings: true,
                    jsRuntime: 'node',
                };
                if (hasCookies) ytdlOptions.cookies = cookiesFile;

                const output = await (youtubeDl as any)(track.url, ytdlOptions) as string;
                const streamUrl = output.split('\n').map((l: string) => l.trim()).filter(Boolean)[0];
                if (!streamUrl) throw new Error('yt-dlp no devolvió URL');

                // Paso 2: streamear la URL del CDN con headers de navegador
                return new Promise<any>((resolve, reject) => {
                    const protocol = streamUrl.startsWith('https') ? https : http;
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
                            const rp = res.headers.location.startsWith('https') ? https : http;
                            rp.get(res.headers.location, { headers: { 'Accept-Encoding': 'identity' } }, (redirectRes) => {
                                const buffered = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });
                                redirectRes.pipe(buffered);
                                resolve(buffered);
                            }).on('error', reject);
                        } else {
                            console.log(`[Stream] CDN ${res.statusCode} — ${res.headers['content-type']} — ${res.headers['content-length']} bytes`);
                            const buffered = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });
                            res.pipe(buffered);
                            resolve(buffered);
                        }
                    });
                    req.on('error', reject);
                });
            } catch (err: any) {
                console.error('[Stream] ERROR:', err?.message ?? err);
                throw err;
            }
        },
    });
    // Spotify con credenciales para que el quiz pueda resolver tracks por URL
    await player.extractors.register(SpotifyExtractor, {
        clientId: config.spotify.clientId,
        clientSecret: config.spotify.clientSecret,
    });
    // Archivos adjuntos directos
    await player.extractors.register(AttachmentExtractor, {});
    client.player = player;

    // Cargar comandos desde src/commands/{categoria}/*.ts (compilado a .js)
    const commandsPath = path.join(__dirname, 'commands');
    for (const dir of fs.readdirSync(commandsPath)) {
        const dirPath = path.join(commandsPath, dir);
        if (!fs.statSync(dirPath).isDirectory()) continue;
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const command: Command = require(path.join(dirPath, file));
            client.commands.set(command.name, command);
            if (command.aliases) {
                for (const alias of command.aliases) {
                    client.commands.set(alias, command);
                }
            }
        }
    }

    // Cargar eventos de Discord
    const eventsPath = path.join(__dirname, 'events');
    for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
        const eventName = file.split('.')[0];
        const event = require(path.join(eventsPath, file));
        client.on(eventName, (...args: any[]) => event(client, ...args));
    }

    // Cargar eventos del reproductor
    const playerEventsPath = path.join(__dirname, 'player');
    for (const file of fs.readdirSync(playerEventsPath).filter(f => f.endsWith('.js'))) {
        const eventName = file.split('.')[0];
        const event = require(path.join(playerEventsPath, file));
        player.events.on(eventName as any, (...args: any[]) => event(...args));
    }

    client.login(config.token);
})();
