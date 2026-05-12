import { Message } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'clear',
    aliases: ['clearqueue'],
    description: 'Limpia la cola (sin detener la canción actual)',
    usage: 'clear',
    category: 'Music',
    execute(client: BotClient, message: Message) {
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }
        queue.tracks.clear();
        message.channel.send(':white_check_mark: Cola limpiada. La canción actual seguirá sonando.');
    },
};

module.exports = command;
