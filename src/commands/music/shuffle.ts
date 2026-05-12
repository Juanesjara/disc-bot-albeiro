import { Message } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'shuffle',
    description: 'Mezcla la cola de reproducción',
    usage: 'shuffle',
    category: 'Music',
    execute(client: BotClient, message: Message) {
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }
        if (queue.tracks.size < 2) {
            return message.channel.send(':warning: Necesitas al menos 2 canciones en la cola para mezclar.');
        }
        queue.tracks.shuffle();
        message.channel.send(':white_check_mark: Cola mezclada aleatoriamente.');
    },
};

module.exports = command;
