import { Message, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'queue',
    aliases: ['q'],
    description: 'Muestra la cola de canciones',
    usage: 'queue [página]',
    category: 'Music',
    execute(client: BotClient, message: Message, args: string[]) {
        const queue = useQueue(message.guild!.id);
        if (!queue?.isPlaying()) {
            return message.channel.send(':warning: No hay música reproduciéndose.');
        }

        const page = Math.max(1, parseInt(args[0]) || 1);
        const pageSize = 10;
        const tracks = queue.tracks.toArray();
        const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
        const currentPage = Math.min(page, totalPages);
        const start = (currentPage - 1) * pageSize;

        const trackList = tracks.slice(start, start + pageSize)
            .map((t, i) => `**${start + i + 1}.** [${t.title}](${t.url}) — ${t.author} \`${t.duration}\``)
            .join('\n') || 'No hay más canciones en la cola.';

        const current = queue.currentTrack!;
        const embed = new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle(':bar_chart: Cola de reproducción')
            .setDescription(`**Reproduciendo:** [${current.title}](${current.url})\n\n${trackList}`)
            .setFooter({ text: `Página ${currentPage}/${totalPages} • ${tracks.length} canciones en cola` });

        message.channel.send({ embeds: [embed] });
    },
};

module.exports = command;
