import { Message, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { BotClient, Command } from '../../types';

function formatViews(views: number): string {
    if (!views) return 'N/A';
    if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B vistas`;
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M vistas`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K vistas`;
    return `${views} vistas`;
}

const command: Command = {
    name: 'search',
    aliases: ['sc'],
    description: 'Busca una canción y te deja escoger cuál reproducir',
    usage: 'search <nombre>',
    category: 'Music',
    async execute(client: BotClient, message: Message, args: string[]) {
        const member = message.member as GuildMember;
        const voiceChannel = member?.voice.channel;

        if (!voiceChannel) {
            return message.channel.send(':warning: Debes estar en un canal de voz.');
        }

        if (!args.length) {
            return message.channel.send(`:warning: Uso: \`${client.prefix}search <nombre>\``);
        }

        const query = args.join(' ');
        const player = useMainPlayer();
        const results = await player.search(query, { requestedBy: message.author });

        if (!results.hasTracks()) {
            return message.channel.send(':warning: No encontré resultados para esa búsqueda.');
        }

        const tracks = results.tracks.slice(0, 5);

        const lines = tracks.map((t, i) => {
            const views = formatViews(t.views);
            const live = t.live ? ' 🔴 EN VIVO' : '';
            return `**${i + 1}.** [${t.title}](${t.url})${live}\n> 👤 ${t.author}  •  ⏱ \`${t.duration}\`  •  👁 ${views}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x1db954)
            .setTitle(`:mag: Resultados para: "${query}"`)
            .setDescription(lines.join('\n\n'))
            .setThumbnail(tracks[0].thumbnail)
            .setFooter({ text: 'Escribe el número (1-5) para reproducir • "cancelar" para salir • 30s' });

        await message.channel.send({ embeds: [embed] });

        const collector = (message.channel as TextChannel).createMessageCollector({
            filter: (m) => m.author.id === message.author.id,
            time: 30_000,
            max: 1,
        });

        collector.on('collect', async (response) => {
            const content = response.content.trim().toLowerCase();

            if (content === 'cancelar' || content === 'cancel') {
                return response.channel.send(':x: Búsqueda cancelada.');
            }

            const index = parseInt(content) - 1;
            if (isNaN(index) || index < 0 || index >= tracks.length) {
                return response.channel.send(`:warning: Escribe un número del 1 al ${tracks.length}.`);
            }

            const selected = tracks[index];
            try {
                await player.play(voiceChannel, selected, {
                    requestedBy: message.author,
                    nodeOptions: {
                        metadata: { channel: message.channel as TextChannel },
                        volume: 75,
                        leaveOnEnd: true,
                        leaveOnEmpty: true,
                        leaveOnEmptyCooldown: 10000,
                    },
                });
                response.channel.send(`:white_check_mark: Añadido: **${selected.title}** de **${selected.author}** (${formatViews(selected.views)})`);
            } catch (err: any) {
                response.channel.send(`:warning: No pude reproducir esa canción: ${err.message}`);
            }
        });

        collector.on('end', (collected) => {
            if (collected.size === 0) {
                (message.channel as TextChannel).send(':x: Tiempo agotado. Búsqueda cancelada.');
            }
        });
    },
};

module.exports = command;
