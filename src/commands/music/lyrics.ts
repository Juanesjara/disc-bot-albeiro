import { Message, TextChannel } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';
import { rejectIfQuizActive } from '../../quiz/MusicQuiz';
import { logSendError } from '../../utils/safeSend';
import { parseTrackTitle, splitLyrics } from '../../utils/lyrics';

// lrclib.net: base pública de letras, gratis y sin clave.
// Se llama con fetch y un solo intento por búsqueda: el cliente de discord-player reintenta sin tope
// ante un 429 y seguiría pidiendo en segundo plano después de avisar al usuario.
const LRCLIB_SEARCH = 'https://lrclib.net/api/search';
const LYRICS_TIMEOUT_MS = 10_000;

async function searchLrclib(params: Record<string, string>): Promise<any[]> {
    const res = await fetch(`${LRCLIB_SEARCH}?${new URLSearchParams(params)}`, {
        headers: { 'User-Agent': 'coipia-albeiro (https://github.com/Juanesjara/disc-bot-albeiro)' },
        signal: AbortSignal.timeout(LYRICS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`lrclib respondió ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

// Busca primero por título + artista y, si no hay nada, con texto libre. Devuelve la primera letra no vacía.
// Si un intento falla se prueba el siguiente; solo se lanza el error si fallaron todos.
async function findLyrics(artist: string, title: string): Promise<string | null> {
    const query = `${artist} ${title}`.trim();
    const attempts = [
        ...(title ? [() => searchLrclib({ track_name: title, artist_name: artist })] : []),
        ...(query ? [() => searchLrclib({ q: query })] : []),
    ];
    let lastError: any = null;
    let answered = false;
    for (const attempt of attempts) {
        try {
            const results = await attempt();
            answered = true;
            const hit = (results ?? []).find(r => !r.instrumental && r.plainLyrics?.trim());
            if (hit) return hit.plainLyrics.trim();
        } catch (err) {
            lastError = err;
        }
    }
    if (!answered && lastError) throw lastError;
    return null;
}

const command: Command = {
    name: 'lyrics',
    aliases: ['letra', 'ly'],
    description: 'Muestra la letra de la canción que se está reproduciendo',
    usage: 'lyrics',
    category: 'Music',
    async execute(client: BotClient, message: Message) {
        if (rejectIfQuizActive(message)) return;
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }

        const track = queue.currentTrack!;
        // Los tracks que no vienen de YouTube (p. ej. Spotify) ya traen el título limpio y el artista en author
        const { artist, title } = parseTrackTitle(track.title, track.author, track.source !== 'youtube');
        console.log(`[Lyrics] Buscando letra: "${artist} - ${title}"`);
        (message.channel as TextChannel).sendTyping().catch(() => {});

        let lyrics: string | null;
        try {
            lyrics = await findLyrics(artist, title);
        } catch (err: any) {
            console.error('[Lyrics] Error buscando letra:', err?.message ?? err);
            return message.channel.send(':warning: No pude buscar la letra ahora mismo. Prueba en un rato.').catch(logSendError);
        }

        // Un quiz pudo arrancar mientras se buscaba: no revelar nada
        if (rejectIfQuizActive(message)) return;

        if (!lyrics) {
            return message.channel
                .send({ content: `:warning: No encontré la letra de **${track.title}**.`, allowedMentions: { parse: [] } })
                .catch(logSendError);
        }

        // La letra es texto de terceros: que nunca notifique a nadie
        const chunks = splitLyrics(`:page_facing_up: **${title}** — ${artist}\n\n${lyrics}`);
        for (const chunk of chunks) {
            await message.channel.send({ content: chunk, allowedMentions: { parse: [] } }).catch(logSendError);
        }
    },
};

module.exports = command;
