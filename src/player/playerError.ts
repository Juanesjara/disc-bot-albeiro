import { GuildQueue, Track } from 'discord-player';
import { TextChannel } from 'discord.js';
import { QueueMetadata } from '../types';

module.exports = (queue: GuildQueue<QueueMetadata>, error: Error, track: Track) => {
    console.error(`Error en reproductor [${track?.title}]:`, error.message);
    const channel = queue.metadata?.channel as TextChannel;
    channel?.send(`:warning: Error al reproducir **${track?.title}**: ${error.message}`);
};
