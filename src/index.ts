import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { Player, onBeforeCreateStream } from 'discord-player';
import { SpotifyExtractor, AttachmentExtractor } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { initStreamer, spawnStream, takePrefetched, prefetchTrack, clearPrefetched } from './streamer';
import path from 'path';
import fs from 'fs';
import { config } from './config/config';
import { BotClient, Command } from './types';
import { quizGuilds, QUIZ_SEEK_SECONDS } from './quiz/MusicQuiz';

// Un error puntual (mensaje que no se pudo enviar, stream roto...) no debe tumbar el bot:
// en Node 22 un rechazo sin capturar mata el proceso. Se registra y se sigue.
process.on('unhandledRejection', (reason: any) => {
    console.error('[Proceso] Promesa rechazada sin capturar:', reason?.stack ?? reason);
});
process.on('uncaughtException', (err: any) => {
    console.error('[Proceso] Excepción no capturada:', err?.stack ?? err);
});

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
    initStreamer(hasCookies ? cookiesFile : null);

    // Hook global (aplica a todas las colas): es el único punto donde discord-player
    // entrega track + cola juntos. createStream del extractor no recibe la cola y
    // track.queue no sirve ahí (busca en queue.tracks y el track ya salió de la cola).
    // Con el servidor conocido: precarga por servidor y seek del quiz solo en su servidor.
    onBeforeCreateStream(async (track: any, _queryType, queue: any) => {
        const guildId: string | undefined = queue?.guild?.id;
        // Tracks que no son de YouTube (p. ej. Spotify) se resuelven por el extractor (bridge)
        if (!guildId || track?.source !== 'youtube' || !track.url) return null;

        const seek = quizGuilds.has(guildId) ? QUIZ_SEEK_SECONDS : 0;
        let stream = takePrefetched(guildId, track.url, seek);
        if (!stream) {
            console.log(`[Stream] Iniciando pipe de yt-dlp para: ${track.title ?? track.url}`);
            stream = spawnStream(track.url, track.title, seek);
        }
        // Si yt-dlp falla después de entregar el stream, discord-player solo ve que se
        // acabó el audio: avisar como playerError para que el quiz/música reaccionen.
        stream.once('error', (err: Error) => {
            queue.emit('playerError', queue, err, track);
        });
        return stream;
    });

    // El extractor sigue buscando en YouTube; su createStream solo se usa para tracks
    // puenteados (Spotify → YouTube), que no pasan por el hook de arriba.
    await player.extractors.register(YoutubeExtractor, {
        createStream: async (track: any) => {
            console.log(`[Stream] Iniciando pipe de yt-dlp para: ${track.title ?? track.url}`);
            return spawnStream(track.url, track.title);
        },
    });
    // Spotify (opcional): solo para `=play` con URLs de Spotify. El quiz no lo necesita.
    if (config.spotify) {
        await player.extractors.register(SpotifyExtractor, {
            clientId: config.spotify.clientId,
            clientSecret: config.spotify.clientSecret,
        });
    } else {
        console.warn('[Player] ADVERTENCIA: Sin SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET — play con URLs de Spotify desactivado (el quiz funciona igual)');
    }
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
    // (las del quiz se precargan desde MusicQuiz con su propio seek).
    // También al añadir canciones: si la cola estaba vacía en playerStart, la que se
    // añade después con =play no se precargaba y arrancaba en frío (silencio largo).
    const prefetchNext = (queue: any) => {
        const guildId = queue?.guild?.id;
        if (!guildId || quizGuilds.has(guildId) || !queue.currentTrack) return;
        const next = queue?.tracks?.at?.(0) ?? queue?.tracks?.data?.[0];
        if (next?.url && next.source === 'youtube') prefetchTrack(guildId, next.url, next.title);
    };
    player.events.on('playerStart', prefetchNext);
    player.events.on('audioTrackAdd', prefetchNext);
    player.events.on('audioTracksAdd', prefetchNext);
    // Limpiar solo las precargas de ESE servidor. Durante el quiz, la cola se queda
    // vacía entre canciones: no tocar sus precargas (MusicQuiz.cleanup las limpia).
    player.events.on('emptyQueue', (queue: any) => {
        const guildId = queue?.guild?.id;
        if (guildId && !quizGuilds.has(guildId)) clearPrefetched(guildId);
    });
    player.events.on('queueDelete', (queue: any) => {
        const guildId = queue?.guild?.id;
        if (guildId) clearPrefetched(guildId);
    });

    await client.login(config.token);
})().catch((err) => {
    // Un fallo al arrancar (token inválido, extractor que no carga) sí debe tumbar el proceso
    // para que Railway lo reinicie, en vez de quedar vivo sin conectarse
    console.error('[Proceso] Error fatal en el arranque:', err?.stack ?? err);
    process.exit(1);
});
