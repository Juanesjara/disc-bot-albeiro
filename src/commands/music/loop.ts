import { Message } from 'discord.js';
import { useQueue, QueueRepeatMode } from 'discord-player';
import { BotClient, Command } from '../../types';

const modes: Record<string, QueueRepeatMode> = {
    off: QueueRepeatMode.OFF,
    track: QueueRepeatMode.TRACK,
    queue: QueueRepeatMode.QUEUE,
};

const modeNames: Record<number, string> = {
    [QueueRepeatMode.OFF]: 'desactivado',
    [QueueRepeatMode.TRACK]: 'canción',
    [QueueRepeatMode.QUEUE]: 'cola',
};

const command: Command = {
    name: 'loop',
    aliases: ['repeat'],
    description: 'Cambia el modo de repetición',
    usage: 'loop [off|track|queue]',
    category: 'Music',
    execute(client: BotClient, message: Message, args: string[]) {
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }

        const modeKey = args[0]?.toLowerCase();
        if (!modeKey || !(modeKey in modes)) {
            const current = modeNames[queue.repeatMode] || 'desconocido';
            return message.channel.send(`:musical_note: Modo actual: **${current}**. Opciones: \`off\`, \`track\`, \`queue\``);
        }

        queue.setRepeatMode(modes[modeKey]);
        message.channel.send(`:white_check_mark: Modo de repetición: **${modeNames[modes[modeKey]]}**`);
    },
};

module.exports = command;
