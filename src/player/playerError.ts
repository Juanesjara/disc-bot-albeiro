import { GuildQueue, Track } from 'discord-player';
import { TextChannel } from 'discord.js';
import { QueueMetadata } from '../types';
import { quizGuilds } from '../quiz/MusicQuiz';

module.exports = (queue: GuildQueue<QueueMetadata>, error: Error, track: Track) => {
    console.error(`Error en reproductor [${track?.title}]:`, error.message);
    const channel = queue.metadata?.channel as TextChannel;
    // Durante el quiz no revelamos título, artista ni URL (el error de yt-dlp puede traer la URL)
    if (quizGuilds.has(queue.guild.id)) {
        channel?.send(':warning: Error al reproducir la canción del quiz.');
        return;
    }
    channel?.send(`:warning: Error al reproducir **${track?.title}**: ${error.message}`);
};
