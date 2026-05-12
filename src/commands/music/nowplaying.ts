import { Message, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Muestra la canción que se está reproduciendo',
    usage: 'nowplaying',
    category: 'Music',
    execute(client: BotClient, message: Message) {
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }

        const track = queue.currentTrack!;
        const progress = queue.node.createProgressBar();

        const embed = new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle(':musical_note: Reproduciendo ahora')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                { name: 'Artista', value: track.author, inline: true },
                { name: 'Duración', value: track.duration, inline: true },
                { name: 'Pedido por', value: `${track.requestedBy}`, inline: true },
                { name: 'Progreso', value: progress || track.duration }
            )
            .setThumbnail(track.thumbnail);

        message.channel.send({ embeds: [embed] });
    },
};

module.exports = command;
