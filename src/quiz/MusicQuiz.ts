import {
    VoiceChannel,
    TextChannel,
    Message,
    MessageCollector,
    GuildMember,
    EmbedBuilder,
} from 'discord.js';
import { useMainPlayer, useQueue, GuildQueue, Track } from 'discord-player';
import { SpotifyService } from '../services/spotify';
import { Song } from '../types';
import { config } from '../config/config';

const STOP_CMD = `${config.prefix}stop`;
const SKIP_CMD = `${config.prefix}vskip`;

// Exportado para que los eventos del player puedan saber si hay un quiz activo
export const quizGuilds = new Set<string>();

export class MusicQuiz {
    private textChannel: TextChannel;
    private voiceChannel: VoiceChannel;
    private guildId: string;
    private songs: Song[] = [];
    private currentIndex = 0;
    private scores: Record<string, number> = {};
    private skippers: Set<string> = new Set();
    private collector: MessageCollector | null = null;
    private songTimer: NodeJS.Timeout | null = null;
    private titleGuessed = false;
    private artistGuessed = false;
    private guessMode: 'artist' | 'title' | 'both';
    private stopped = false;

    constructor(message: Message, songCount: number, mode: 'artist' | 'title' | 'both') {
        this.textChannel = message.channel as TextChannel;
        this.voiceChannel = (message.member as GuildMember).voice.channel as VoiceChannel;
        this.guildId = message.guild!.id;
        this.guessMode = mode;
    }

    async start(playlistUrl: string, songCount: number): Promise<void> {
        const spotify = new SpotifyService();
        try {
            const allSongs = await spotify.getPlaylistSongs(playlistUrl);
            if (!allSongs.length) {
                this.textChannel.send(':warning: Esta playlist no tiene canciones o no es pública.');
                return;
            }
            this.songs = allSongs
                .sort(() => Math.random() - 0.5)
                .slice(0, songCount);
        } catch (err: any) {
            console.error('[Quiz] Error al obtener playlist:', err?.message ?? err);
            const msg = (err?.statusCode ?? err?.status) === 404
                ? ':warning: No pude acceder a esa playlist. Los Blend de Spotify son privados y no son compatibles. Usa una playlist pública.'
                : ':warning: No pude obtener la playlist. Verifica que sea pública.';
            this.textChannel.send(msg);
            return;
        }

        quizGuilds.add(this.guildId);

        this.collector = this.textChannel.createMessageCollector({
            filter: (m) => !m.author.bot,
        });
        this.collector.on('collect', (m) => this.handleMessage(m));

        await this.textChannel.send(this.buildStartMessage());
        await this.playSong();
    }

    private async playSong(): Promise<void> {
        if (this.stopped) return;

        this.titleGuessed = this.guessMode === 'title';
        this.artistGuessed = this.guessMode === 'artist';
        this.skippers.clear();

        const song = this.songs[this.currentIndex];
        await this.textChannel.send(`:musical_note: Canción **${this.currentIndex + 1}/${this.songs.length}** — ¡Adivina!`);

        const player = useMainPlayer();
        // Buscar en YouTube por título+artista; filtrar remixes y elegir la versión más vista
        const query = `${song.title} ${song.artist}`;

        try {
            const result = await player.search(query);
            

            if (!result.hasTracks()) {
                return this.nextSong('No encontré esta canción en YouTube, pasando a la siguiente.');
            }

            // Filtrar remixes y elegir la mejor versión
            const REMIX_WORDS = ['remix', 'slowed', 'reverb', 'cover', 'hardstyle', 'speed up', 'sped up', 'nightcore', 'lofi', 'karaoke'];
            const originals = result.tracks.filter(t => !REMIX_WORDS.some(w => t.title.toLowerCase().includes(w)));
            const pool = originals.length > 0 ? originals : result.tracks;
            const best = pool.some(t => t.views > 0)
                ? pool.sort((a, b) => (b.views || 0) - (a.views || 0))[0]
                : pool[0];

            const existingQueue = useQueue(this.guildId);
            console.log(best.title, best.url);
            if (existingQueue) {
                existingQueue.tracks.clear();
                existingQueue.addTrack(best);
                existingQueue.node.skip();
            } else {
                await player.play(this.voiceChannel, best, {
                    nodeOptions: {
                        metadata: { channel: this.textChannel },
                        leaveOnEnd: false,
                        leaveOnEmpty: true,
                        leaveOnEmptyCooldown: 5000,
                        volume: 75,
                    },
                });
            }

            // Buscar al minuto 1:30 cuando la canción REALMENTE empiece
            const seekOnStart = (queue: GuildQueue, _track: Track) => {
                if (queue.guild.id !== this.guildId || this.stopped) return;
                setTimeout(async () => {
                    if (this.stopped) return;
                    const q = useQueue(this.guildId);
                    if (q?.isPlaying()) {
                        try { await q.node.seek(90_000); } catch {}
                    }
                }, 500);
            };
            player.events.once('playerStart', seekOnStart);

        } catch (err: any) {
            console.error('[Quiz] Error reproduciendo canción:', err?.message ?? err);
            return this.nextSong('Error al reproducir, pasando a la siguiente.');
        }

        // Verificar si el quiz fue detenido mientras esperábamos el stream
        if (this.stopped) return;

        this.songTimer = setTimeout(() => {
            this.nextSong(':alarm_clock: ¡Se acabó el tiempo! No adivinaron la canción.');
        }, 60_000);
    }

    private handleMessage(message: Message): void {
        const content = message.content.toLowerCase().trim();

        if (content === STOP_CMD) {
            this.printStatus('Quiz detenido.');
            this.cleanup();
            return;
        }

        if (content === SKIP_CMD) {
            this.handleSkip(message.author.id);
            return;
        }

        const song = this.songs[this.currentIndex];
        let gained = 0;
        let correct = false;

        const normalize = (s: string) => s
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '') // é→e, á→a, ñ→n, ü→u...
            .replace(/[''`]/g, '')     // apóstrofes
            .replace(/&/g, 'y')       // & → y
            .replace(/\s+/g, ' ').trim();
        const normalizedContent = normalize(content);
        const normalizedTitle = normalize(song.title);
        const normalizedArtist = normalize(song.artist);

        if (!this.titleGuessed && normalizedContent.includes(normalizedTitle)) {
            this.titleGuessed = true;
            gained += 2;
            correct = true;
        }

        if (!this.artistGuessed && normalizedContent.includes(normalizedArtist)) {
            this.artistGuessed = true;
            gained += 3;
            correct = true;
        }

        if (gained > 0) {
            this.scores[message.author.id] = (this.scores[message.author.id] || 0) + gained;
            message.react('✅').catch(() => {});
        }

        if (correct && this.titleGuessed && this.artistGuessed) {
            this.nextSong('¡Listo el pollo! Adivinaron todo.');
            return;
        }

        if (!correct) {
            message.react('❌').catch(() => {});
        }
    }

    private handleSkip(userId: string): void {
        this.skippers.add(userId);
        const nonBotMembers = this.voiceChannel.members.filter((m) => !m.user.bot);
        const needed = nonBotMembers.size;

        if (this.skippers.size >= needed) {
            this.nextSong('Canción saltada por votación.');
            return;
        }

        this.textChannel.send(`⏭ Votos para saltar: **(${this.skippers.size}/${needed})**`);
    }

    private nextSong(reason: string): void {
        if (this.stopped) return;
        if (this.songTimer) clearTimeout(this.songTimer);
        this.printStatus(reason);

        if (this.currentIndex + 1 >= this.songs.length) {
            this.cleanup();
            return;
        }

        this.currentIndex++;
        this.playSong();
    }

    private printStatus(reason: string): void {
        const song = this.songs[this.currentIndex];
        const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle(`(${this.currentIndex + 1}/${this.songs.length}) ${reason}`)
            .setDescription(`> **${song.title}** — **${song.artist}**\n> [Link Spotify](${song.spotifyUrl})`)
            .addFields({ name: ':trophy: Puntajes', value: this.getScores() || 'Sin puntajes' });

        this.textChannel.send({ embeds: [embed] });
    }

    private getScores(): string {
        const medals = [':first_place:', ':second_place:', ':third_place:'];
        return this.voiceChannel.members
            .filter((m) => !m.user.bot)
            .map((m) => ({ id: m.id, score: this.scores[m.id] || 0 }))
            .sort((a, b) => b.score - a.score)
            .map((entry, i) => `${medals[i] ?? `**${i + 1}.**`} <@${entry.id}> — **${entry.score} puntos**`)
            .join('\n');
    }

    private buildStartMessage(): string {
        const pointInfo =
            this.guessMode === 'artist'
                ? 'Adivina el **artista** (3 puntos)'
                : this.guessMode === 'title'
                ? 'Adivina el **título** (2 puntos)'
                : 'Artista **(3 pts)** + Título **(2 pts)**';

        return [
            `**¡Comenzamos el quiz!** :headphones: :tada:`,
            `**${this.songs.length}** canciones de Spotify, 60 segundos por canción.`,
            '',
            pointInfo,
            '',
            `Escribe \`${STOP_CMD}\` para detener | \`${SKIP_CMD}\` para saltar (unanimidad)`,
        ].join('\n');
    }

    private cleanup(): void {
        this.stopped = true; // Detiene cualquier playSong/nextSong en curso
        if (this.songTimer) clearTimeout(this.songTimer);
        if (this.collector) this.collector.stop();
        quizGuilds.delete(this.guildId);
        const queue = useQueue(this.guildId);
        queue?.delete();
    }
}
