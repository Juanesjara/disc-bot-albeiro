import { Message } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';
import { quizGuilds } from '../../quiz/MusicQuiz';

const command: Command = {
    name: 'remove',
    aliases: ['rm', 'quit'],
    description: 'Quita una canción de la cola por su número (el de =queue)',
    usage: 'remove <número>',
    category: 'Music',
    execute(client: BotClient, message: Message, args: string[]) {
        if (quizGuilds.has(message.guild!.id)) {
            return message.channel.send(':warning: Hay un quiz activo, no se puede modificar la cola.');
        }
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }

        const size = queue.tracks.size;
        if (size === 0) {
            return message.channel.send(':warning: No hay canciones en la cola para quitar.');
        }

        // Mismo número que muestra =queue (1 = la siguiente en sonar)
        const position = parseInt(args[0]);
        if (isNaN(position) || position < 1 || position > size) {
            return message.channel.send(`:warning: Indica un número entre 1 y ${size}. Ejemplo: \`=remove 2\``);
        }

        const removed = queue.node.remove(position - 1);
        if (!removed) {
            return message.channel.send(':warning: No pude quitar esa canción.');
        }
        message.channel.send(`:wastebasket: Quitada de la cola: **${removed.title}**`);
    },
};

module.exports = command;
