import { Message } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'resume',
    aliases: ['r'],
    description: 'Reanuda la música pausada',
    usage: 'resume',
    category: 'Music',
    execute(client: BotClient, message: Message) {
        const queue = useQueue(message.guild!.id);
        if (!queue) {
            return message.channel.send(':warning: No hay música en la cola.');
        }
        if (!queue.node.isPaused()) {
            return message.channel.send(':warning: La música no está pausada.');
        }
        queue.node.resume();
        message.channel.send(':white_check_mark: Música reanudada.');
    },
};

module.exports = command;
