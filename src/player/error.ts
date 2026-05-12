import { GuildQueue } from 'discord-player';
import { TextChannel } from 'discord.js';
import { QueueMetadata } from '../types';
import { quizGuilds } from '../quiz/MusicQuiz';

module.exports = (queue: GuildQueue<QueueMetadata>, error: Error) => {
    console.error('[Player] Error de conexión de voz:', error.message);

    if (quizGuilds.has(queue.guild.id)) return;

    const channel = queue.metadata?.channel as TextChannel;
    channel?.send(`:warning: Error de conexión: ${error.message}`);
};
