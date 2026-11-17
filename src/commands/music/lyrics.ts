import { Message, TextChannel } from 'discord.js';
import { useMainPlayer, useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';
import { rejectIfQuizActive } from '../../quiz/MusicQuiz';
import { logSendError } from '../../utils/safeSend';
import { parseTrackTitle, splitLyrics } from '../../utils/lyrics';

// lrclib reintenta por su cuenta; pasado este tiempo se avisa en vez de dejar al usuario esperando
const LYRICS_TIMEOUT_MS = 15_000;

// Busca primero por título + artista y, si no hay nada, con texto libre. Devuelve la primera letra no vacía.
async function findLyrics(artist: string, title: string): Promise<string | null> {
    const lrc = useMainPlayer().lyrics;
    const attempts = [
        () => lrc.search({ trackName: title, artistName: artist }),
        () => lrc.search({ q: `${artist} ${title}`.trim() }),
    ];
    for (const attempt of attempts) {
        const results = await attempt();
        const hit = (results ?? []).find(r => !r.instrumental && r.plainLyrics?.trim());
        if (hit) return hit.plainLyrics.trim();
    }
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
        const { artist, title } = parseTrackTitle(track.title, track.author);
        console.log(`[Lyrics] Buscando letra: "${artist} - ${title}"`);
        (message.channel as TextChannel).sendTyping().catch(() => {});

        let lyrics: string | null;
        try {
            lyrics = await Promise.race([
                findLyrics(artist, title),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), LYRICS_TIMEOUT_MS)),
            ]);
        } catch (err: any) {
            console.error('[Lyrics] Error buscando letra:', err?.message ?? err);
            return message.channel.send(':warning: No pude buscar la letra ahora mismo. Prueba en un rato.').catch(logSendError);
        }

        // Un quiz pudo arrancar mientras se buscaba: no revelar nada
        if (rejectIfQuizActive(message)) return;

        if (!lyrics) {
            return message.channel.send(`:warning: No encontré la letra de **${track.title}**.`).catch(logSendError);
        }

        // La letra es texto de terceros: que nunca notifique a nadie
        const chunks = splitLyrics(`:page_facing_up: **${title}** — ${artist}\n\n${lyrics}`);
        for (const chunk of chunks) {
            await message.channel.send({ content: chunk, allowedMentions: { parse: [] } }).catch(logSendError);
        }
    },
};

module.exports = command;
