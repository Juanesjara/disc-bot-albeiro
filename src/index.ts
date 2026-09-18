import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { Player } from 'discord-player';
import { SpotifyExtractor, AttachmentExtractor } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { initStreamer, spawnStream, takePrefetched, prefetchTrack, clearPrefetched } from './streamer';
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

    // YouTube: yt-dlp descarga y streamea el audio directamente (ver src/streamer.ts).
    // Si hay un stream precargado (siguiente de la cola / quiz), se usa al instante.
    initStreamer(hasCookies ? cookiesFile : null);
    await player.extractors.register(YoutubeExtractor, {
        createStream: async (track: any) => {
            const cached = takePrefetched(track.url);
            if (cached) return cached;
            console.log(`[Stream] Iniciando pipe de yt-dlp para: ${track.title ?? track.url}`);
            return spawnStream(track.url, track.title);
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

    // Precargar la siguiente canción de la cola mientras suena la actual
    // (las del quiz se precargan desde MusicQuiz con su propio seek)
    player.events.on('playerStart', (queue: any) => {
        const next = queue?.tracks?.at?.(0) ?? queue?.tracks?.data?.[0];
        if (next?.url) prefetchTrack(next.url, next.title);
    });
    player.events.on('emptyQueue', () => clearPrefetched());

    client.login(config.token);
})();
