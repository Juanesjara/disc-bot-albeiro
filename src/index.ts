import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { Player } from 'discord-player';
import { SpotifyExtractor, AttachmentExtractor } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import youtubeDl from 'youtube-dl-exec';
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

    // YouTube: yt-dlp descarga y streamea el audio directamente (pipe de stdout).
    // Dejar que yt-dlp baje el CDN con su propio contexto evita el 403 que daba el fetch manual.
    await player.extractors.register(YoutubeExtractor, {
        createStream: async (track: any) => {
            try {
                const ytdlOptions: any = {
                    // Mejor audio disponible; fallback a formato 18 (mp4 no-DASH) si falla
                    format: 'bestaudio[acodec=opus][abr>=100]/bestaudio[acodec=opus]/bestaudio/18',
                    output: '-',        // volcar a stdout
                    quiet: true,
                    noWarnings: true,
                    noPlaylist: true,
                    jsRuntime: 'node',
                };
                if (hasCookies) ytdlOptions.cookies = cookiesFile;

                // .exec() devuelve el subproceso (no lo await-ea) para poder pipear su stdout
                const subprocess = (youtubeDl as any).exec(track.url, ytdlOptions, {
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                // Log de diagnóstico: mostrar la primera línea de error de yt-dlp si algo falla
                subprocess.stderr?.on('data', (chunk: Buffer) => {
                    const line = chunk.toString().trim();
                    if (line) console.error('[yt-dlp]', line.split('\n')[0]);
                });
                subprocess.on('error', (err: any) => {
                    console.error('[Stream] subproceso yt-dlp falló:', err?.message ?? err);
                });

                if (!subprocess.stdout) throw new Error('yt-dlp no expuso stdout');
                console.log(`[Stream] Iniciando pipe de yt-dlp para: ${track.title ?? track.url}`);

                // Buffer intermedio para suavizar la lectura hacia discord-player/ffmpeg
                const buffered = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });
                subprocess.stdout.pipe(buffered);
                subprocess.stdout.on('error', (err: any) => buffered.destroy(err));
                return buffered;
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
