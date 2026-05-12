import { Message } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';
import { quizGuilds } from '../../quiz/MusicQuiz';

const command: Command = {
    name: 'skip',
    aliases: ['s'],
    description: 'Salta la canción actual',
    usage: 'skip',
    category: 'Music',
    execute(client: BotClient, message: Message) {
        if (quizGuilds.has(message.guild!.id)) {
            return message.channel.send(':warning: Hay un quiz activo. Usa `=vskip` para votar saltar.');
        }
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }
        queue.node.skip();
        message.channel.send(':white_check_mark: Canción saltada.');
    },
};

module.exports = command;
