import { Message, GuildMember, TextChannel } from 'discord.js';
import { useMainPlayer, Track } from 'discord-player';
import { BotClient, Command } from '../../types';

const REMIX_KEYWORDS = [
    'remix', 'slowed', 'reverb', 'cover', 'hardstyle', 'dubstep',
    'nightcore', 'mashup', 'flip', 'bootleg', 'extended', 'sped up',
    'speed up', 'lofi', 'lo-fi', 'trap', 'bass boost', 'acoustic',
    'karaoke', 'instrumental', 'tribute',
];

function pickBestTrack(tracks: Track[], userQuery: string): Track {
    const queryLower = userQuery.toLowerCase();
    const userWantsRemix = REMIX_KEYWORDS.some(k => queryLower.includes(k));

    // Solo filtrar remixes si el usuario NO los pidió explícitamente
    let pool = tracks;
    if (!userWantsRemix) {
        const originals = tracks.filter(t => {
            const title = t.title.toLowerCase();
            return !REMIX_KEYWORDS.some(k => title.includes(k));
        });
        if (originals.length > 0) pool = originals;
    }

    // Ordenar por vistas si hay datos disponibles
    const hasViews = pool.some(t => t.views > 0);
    if (hasViews) {
        return pool.sort((a, b) => (b.views || 0) - (a.views || 0))[0];
    }

    return pool[0];
}

const command: Command = {
    name: 'play',
    aliases: ['p'],
    description: 'Reproduce una canción o playlist',
    usage: 'play <nombre o URL>',
    category: 'Music',
    async execute(client: BotClient, message: Message, args: string[]) {
        const member = message.member as GuildMember;
        const voiceChannel = member?.voice.channel;

        if (!voiceChannel) {
            return message.channel.send(':warning: Debes estar en un canal de voz.');
        }

        if (!args.length) {
            return message.channel.send(`:warning: Uso: \`${client.prefix}play <nombre o URL>\``);
        }

        const query = args.join(' ');
        const player = useMainPlayer();

        try {
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            let trackToPlay: any = query;

            if (!isUrl) {
                const results = await player.search(query, { requestedBy: message.author });
                if (!results.hasTracks()) {
                    return message.channel.send(':warning: No encontré resultados para esa búsqueda.');
                }
                trackToPlay = pickBestTrack(results.tracks, query);
            }

            const { track } = await player.play(voiceChannel, trackToPlay, {
                requestedBy: message.author,
                nodeOptions: {
                    metadata: { channel: message.channel as TextChannel },
                    volume: 75,
                    leaveOnEnd: true,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 10000,
                },
            });
            message.channel.send(`:white_check_mark: Añadido a la cola: **${track.title}** de **${track.author}**`);
        } catch (error: any) {
            message.channel.send(`:warning: No pude encontrar esa canción: ${error.message}`);
        }
    },
};

module.exports = command;
