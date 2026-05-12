import { Message } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'pause',
    description: 'Pausa la música',
    usage: 'pause',
    category: 'Music',
    execute(client: BotClient, message: Message) {
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }
        if (queue.node.isPaused()) {
            return message.channel.send(':warning: La música ya está pausada. Usa `resume`.');
        }
        queue.node.pause();
        message.channel.send(':white_check_mark: Música pausada.');
    },
};

module.exports = command;
