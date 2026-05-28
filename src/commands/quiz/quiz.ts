import { Message, GuildMember, VoiceChannel } from 'discord.js';
import { BotClient, Command } from '../../types';
import { MusicQuiz } from '../../quiz/MusicQuiz';

const activeQuizzes = new Set<string>();

const command: Command = {
    name: 'quiz',
    aliases: ['musicquiz', 'mq'],
    description: 'Inicia un quiz musical con una playlist de Spotify',
    usage: 'quiz <url_playlist> <canciones> [artist|title|both]',
    category: 'Quiz',
    async execute(client: BotClient, message: Message, args: string[]) {
        const member = message.member as GuildMember;

        if (!member?.voice.channel) {
            return message.channel.send(':warning: Debes estar en un canal de voz para iniciar el quiz.');
        }

        if (activeQuizzes.has(message.guild!.id)) {
            return message.channel.send(':warning: Ya hay un quiz activo en este servidor.');
        }

        const [playlistUrl, songCountStr, modeArg] = args;

        if (!playlistUrl || !/spotify\.com\/(playlist|blend)\//.test(playlistUrl)) {
            return message.channel.send(
                `:warning: Debes proporcionar una URL de playlist de Spotify.\nUso: \`${client.prefix}quiz <url_playlist> <canciones> [artist|title|both]\``
            );
        }

        const songCount = parseInt(songCountStr);
        if (isNaN(songCount) || songCount < 1 || songCount > 30) {
            return message.channel.send(':warning: El número de canciones debe estar entre 1 y 30.');
        }

        const validModes = ['artist', 'title', 'both'] as const;
        const mode = validModes.includes(modeArg as any)
            ? (modeArg as 'artist' | 'title' | 'both')
            : 'both';

        activeQuizzes.add(message.guild!.id);

        const quiz = new MusicQuiz(message, songCount, mode);
        try {
            await quiz.start(playlistUrl, songCount);
        } finally {
            activeQuizzes.delete(message.guild!.id);
        }
    },
};

module.exports = command;
