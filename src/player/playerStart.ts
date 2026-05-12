import { GuildQueue, Track } from 'discord-player';
import { TextChannel, EmbedBuilder } from 'discord.js';
import { QueueMetadata } from '../types';
import { quizGuilds } from '../quiz/MusicQuiz';

module.exports = (queue: GuildQueue<QueueMetadata>, track: Track) => {
    // Durante el quiz no revelamos la canción que está sonando
    if (quizGuilds.has(queue.guild.id)) return;

    const channel = queue.metadata?.channel as TextChannel;
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle(':musical_note: Reproduciendo ahora')
        .setDescription(`**[${track.title}](${track.url})**`)
        .addFields(
            { name: 'Artista', value: track.author, inline: true },
            { name: 'Duración', value: track.duration, inline: true },
            { name: 'Pedido por', value: `${track.requestedBy}`, inline: true }
        )
        .setThumbnail(track.thumbnail);

    channel.send({ embeds: [embed] });
};
