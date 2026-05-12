import { Message } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';
import { quizGuilds } from '../../quiz/MusicQuiz';

const command: Command = {
    name: 'stop',
    description: 'Detiene la música y limpia la cola',
    usage: 'stop',
    category: 'Music',
    execute(client: BotClient, message: Message) {
        if (quizGuilds.has(message.guild!.id)) return; // El quiz maneja su propio stop
        const queue = useQueue(message.guild!.id);
        if (!queue) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }
        queue.delete();
        message.channel.send(':white_check_mark: Música detenida y cola limpiada.');
    },
};

module.exports = command;
