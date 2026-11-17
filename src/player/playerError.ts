import { GuildQueue, Track } from 'discord-player';
import { TextChannel } from 'discord.js';
import { QueueMetadata } from '../types';
import { logSendError } from '../utils/safeSend';
import { quizGuilds } from '../quiz/MusicQuiz';

module.exports = (queue: GuildQueue<QueueMetadata>, error: Error, track: Track) => {
    console.error(`[Player] Error en reproductor [${track?.title}]:`, error?.message);

    // Durante el quiz, MusicQuiz avisa y pasa a la siguiente sin revelar la canción
    if (quizGuilds.has(queue.guild.id)) return;

    const channel = queue.metadata?.channel as TextChannel;
    channel?.send(`:warning: Error al reproducir **${track?.title}**: ${error?.message}`).catch(logSendError);
};
