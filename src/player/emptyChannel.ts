import { GuildQueue } from 'discord-player';
import { TextChannel } from 'discord.js';
import { QueueMetadata } from '../types';
import { quizGuilds } from '../quiz/MusicQuiz';

module.exports = (queue: GuildQueue<QueueMetadata>) => {
    if (quizGuilds.has(queue.guild.id)) return;

    const channel = queue.metadata?.channel as TextChannel;
    channel?.send(':x: Canal de voz vacío. Saliendo...');
    queue.delete();
};
