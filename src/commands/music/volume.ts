import { Message } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'volume',
    aliases: ['vol'],
    description: 'Ajusta el volumen (1-100)',
    usage: 'volume <1-100>',
    category: 'Music',
    execute(client: BotClient, message: Message, args: string[]) {
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }

        const vol = parseInt(args[0]);
        if (isNaN(vol) || vol < 1 || vol > 100) {
            return message.channel.send(`:warning: Uso: \`${client.prefix}volume <1-100>\``);
        }

        queue.node.setVolume(vol);
        message.channel.send(`:white_check_mark: Volumen ajustado a **${vol}%**`);
    },
};

module.exports = command;
