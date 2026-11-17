import {
    VoiceChannel,
    TextChannel,
    Message,
    MessageCollector,
    GuildMember,
    EmbedBuilder,
} from 'discord.js';
import { useMainPlayer, useQueue, Track, GuildQueue } from 'discord-player';
import { SpotifyService } from '../services/spotify';
import { Song } from '../types';
import { config } from '../config/config';
import { prefetchTrack, clearPrefetched } from '../streamer';
import { logSendError } from '../utils/safeSend';
import { matchesAnswer, isBlankAnswer, buildScoreboard } from './answers';

const STOP_CMD = `${config.prefix}stop`;
const SKIP_CMD = `${config.prefix}vskip`;
// El quiz reproduce desde 0:45: el stream se genera ya empezando ahí,
// en vez de sonar desde 0:00 y saltar con seek (que re-creaba el stream = doble silencio)
export const QUIZ_SEEK_SECONDS = 45;
// Silencio entre canciones del quiz para marcar el cambio
const SONG_GAP_MS = 1500;

// Exportado para que los eventos del player puedan saber si hay un quiz activo
export const quizGuilds = new Set<string>();

// Para comandos de música: si hay quiz en el servidor, avisa y devuelve true (el comando no debe ejecutarse)
export function rejectIfQuizActive(message: Message): boolean {
    if (!quizGuilds.has(message.guild!.id)) return false;
    message.channel.send(':warning: Hay un quiz activo, este comando no está disponible hasta que termine.').catch(logSendError);
    return true;
}

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
    // true durante la pausa entre canciones: se ignoran respuestas y votos de skip
    private transitioning = false;
    // URL de la canción que debería estar sonando (para ignorar errores de otras)
    private currentUrl: string | null = null;
    // Listener de playerError de este quiz (se quita en cleanup)
    private playerErrorListener: ((queue: GuildQueue, error: Error, track: Track) => void) | null = null;

    constructor(message: Message, mode: 'artist' | 'title' | 'both') {
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
                void this.send(':warning: Esta playlist no tiene canciones o no es pública.');
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
            void this.send(msg);
            return;
        }

        quizGuilds.add(this.guildId);

        this.collector = this.textChannel.createMessageCollector({
            filter: (m) => !m.author.bot,
        });
        this.collector.on('collect', (m) => this.handleMessage(m));

        // Si el audio de una canción falla (yt-dlp, ffmpeg...), pasar a la siguiente
        // en vez de quedarse 60 s en silencio. El aviso no revela la canción.
        this.playerErrorListener = (queue, error, track) => {
            if (queue?.guild?.id !== this.guildId) return;
            if (this.stopped || this.transitioning) return;
            // Sin canción en curso (buscando la siguiente) ningún error puede ser de esta ronda
            if (!this.currentUrl || track?.url !== this.currentUrl) return;
            console.error('[Quiz] Falló el audio de la canción, pasando a la siguiente:', error?.message ?? error);
            this.nextSong('Error al reproducir, pasando a la siguiente.');
        };
        useMainPlayer().events.on('playerError', this.playerErrorListener);

        await this.send(this.buildStartMessage());
        await this.playSong();
    }

    private async playSong(): Promise<void> {
        if (this.stopped) return;

        const index = this.currentIndex;
        const song = this.songs[index];
        // Lo que no se pide en este modo, o queda vacío tras limpiar (p. ej. "(Intro)"),
        // se da por adivinado: nadie puede acertarlo y la ronda puede cerrarse con lo demás
        this.titleGuessed = this.guessMode === 'artist' || isBlankAnswer(song.title);
        this.artistGuessed = this.guessMode === 'title' || isBlankAnswer(song.artist);
        if (isBlankAnswer(song.title) || isBlankAnswer(song.artist)) {
            console.log(`[Quiz] Respuesta vacía tras normalizar (título: "${song.title}", artista: "${song.artist}"), se da por adivinada`);
        }
        this.skippers.clear();

        this.currentUrl = null;

        // Si en este modo no queda nada que adivinar, no tiene sentido esperar 60 s
        if (this.titleGuessed && this.artistGuessed) {
            return this.nextSong('No hay nada que adivinar en esta canción, pasando a la siguiente.');
        }

        await this.send(`:musical_note: Canción **${index + 1}/${this.songs.length}** — ¡Adivina!`);
        if (this.stopped) return;

        const player = useMainPlayer();
        // Buscar en YouTube por título+artista; filtrar remixes y elegir la versión más vista
        const query = `${song.title} ${song.artist}`;

        try {
            const result = await player.search(query);
            // =stop durante la búsqueda: no volver a entrar al canal ni revelar la canción
            if (this.stopped) return;

            if (!result.hasTracks()) {
                return this.nextSong('No encontré esta canción en YouTube, pasando a la siguiente.');
            }

            const best = MusicQuiz.pickBest(result.tracks);
            console.log(best.title, best.url);

            // Asegurar que el stream exista YA empezando en 0:45 (si la precarga de la
            // ronda anterior lo dejó listo, esto es un no-op y la transición es instantánea)
            this.currentUrl = best.url;
            prefetchTrack(this.guildId, best.url, best.title, QUIZ_SEEK_SECONDS);

            const existingQueue = useQueue(this.guildId);
            if (existingQueue) {
                existingQueue.tracks.clear();
                existingQueue.addTrack(best);
                // Si la anterior falló o terminó, no hay nada que saltar: arrancar la nueva
                if (existingQueue.isPlaying()) existingQueue.node.skip();
                else await existingQueue.node.play();
                // La pausa entre canciones dejó el nodo pausado: reanudar con la nueva
                if (existingQueue.node.isPaused()) existingQueue.node.resume();
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

            // Mientras suena esta, dejar lista la siguiente (búsqueda + stream en 0:45)
            this.prefetchNextSong(player);

        } catch (err: any) {
            console.error('[Quiz] Error reproduciendo canción:', err?.message ?? err);
            return this.nextSong('Error al reproducir, pasando a la siguiente.');
        }

        // Verificar si el quiz fue detenido mientras esperábamos el stream, o si la
        // canción ya falló y se pasó a otra (playerError durante el play)
        if (this.stopped || this.transitioning || this.currentIndex !== index) return;

        if (this.songTimer) clearTimeout(this.songTimer);
        this.songTimer = setTimeout(() => {
            this.nextSong(':alarm_clock: ¡Se acabó el tiempo! No adivinaron la canción.');
        }, 60_000);
    }

    // Filtrar remixes y elegir la versión más vista
    private static pickBest(tracks: Track[]): Track {
        const REMIX_WORDS = ['remix', 'slowed', 'reverb', 'cover', 'hardstyle', 'speed up', 'sped up', 'nightcore', 'lofi', 'karaoke'];
        const originals = tracks.filter(t => !REMIX_WORDS.some(w => t.title.toLowerCase().includes(w)));
        const pool = originals.length > 0 ? originals : tracks;
        return pool.some(t => t.views > 0)
            ? [...pool].sort((a, b) => (b.views || 0) - (a.views || 0))[0]
            : pool[0];
    }

    // Precarga (búsqueda + stream desde 0:45) de la siguiente canción del quiz
    // mientras suena la actual, para que la transición sea casi instantánea
    private prefetchNextSong(player: ReturnType<typeof useMainPlayer>): void {
        const next = this.songs[this.currentIndex + 1];
        if (!next) return;
        player.search(`${next.title} ${next.artist}`)
            .then(res => {
                if (this.stopped || !res.hasTracks()) return;
                const best = MusicQuiz.pickBest(res.tracks);
                prefetchTrack(this.guildId, best.url, best.title, QUIZ_SEEK_SECONDS);
            })
            .catch(() => {});
    }

    private handleMessage(message: Message): void {
        const content = message.content.toLowerCase().trim();

        if (content === STOP_CMD) {
            this.printStatus('Quiz detenido.');
            this.cleanup();
            return;
        }

        // Durante la pausa entre canciones ya se mostró la respuesta: no contar nada
        if (this.transitioning) return;

        // Solo juega quien está en el canal de voz del quiz: el resto ni vota ni puntúa ni recibe reacción
        if (!this.isInVoiceChannel(message.author.id)) return;

        if (content === SKIP_CMD) {
            this.handleSkip(message.author.id);
            return;
        }

        // Otros comandos (=play, =queue...) no son respuestas: ni suman ni reciben ❌
        if (content.startsWith(config.prefix.toLowerCase())) return;

        const song = this.songs[this.currentIndex];
        let gained = 0;
        let correct = false;

        if (!this.titleGuessed && matchesAnswer(content, song.title)) {
            this.titleGuessed = true;
            gained += 2;
            correct = true;
        }

        if (!this.artistGuessed && matchesAnswer(content, song.artist)) {
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

    private isInVoiceChannel(userId: string): boolean {
        return this.voiceChannel.members.has(userId);
    }

    private handleSkip(userId: string): void {
        this.skippers.add(userId);
        const nonBotMembers = this.voiceChannel.members.filter((m) => !m.user.bot);
        const needed = nonBotMembers.size;
        // Solo cuentan los votos de quienes siguen en el canal de voz
        const votes = [...this.skippers].filter((id) => nonBotMembers.has(id)).length;

        if (votes >= needed) {
            this.nextSong('Canción saltada por votación.');
            return;
        }

        void this.send(`⏭ Votos para saltar: **(${votes}/${needed})**`);
    }

    private nextSong(reason: string): void {
        if (this.stopped || this.transitioning) return;
        if (this.songTimer) clearTimeout(this.songTimer);
        this.printStatus(reason);

        if (this.currentIndex + 1 >= this.songs.length) {
            this.cleanup();
            return;
        }

        // Pausa de 1.5s en silencio antes de la siguiente canción
        this.transitioning = true;
        useQueue(this.guildId)?.node.pause();
        setTimeout(() => {
            this.transitioning = false;
            if (this.stopped) return;
            this.currentIndex++;
            this.playSong().catch((err: any) => {
                console.error('[Quiz] Error inesperado al pasar de canción:', err?.message ?? err);
            });
        }, SONG_GAP_MS);
    }

    private printStatus(reason: string): void {
        const song = this.songs[this.currentIndex];
        const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle(`(${this.currentIndex + 1}/${this.songs.length}) ${reason}`)
            .setDescription(`> **${song.title}** — **${song.artist}**\n> [Link Spotify](${song.spotifyUrl})`)
            .addFields({ name: ':trophy: Puntajes', value: this.getScores() || 'Sin puntajes' });

        void this.send({ embeds: [embed] });
    }

    // Enviar al canal sin que un fallo (p. ej. sin permisos) corte el quiz
    private send(content: Parameters<TextChannel['send']>[0]): Promise<unknown> {
        return this.textChannel.send(content).catch(logSendError);
    }

    private getScores(): string {
        const medals = [':first_place:', ':second_place:', ':third_place:'];
        // Quienes están en el canal de voz + quienes puntuaron aunque ya se hayan ido
        const memberIds = this.voiceChannel.members.filter((m) => !m.user.bot).map((m) => m.id);
        return buildScoreboard(memberIds, this.scores)
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
        if (this.playerErrorListener) {
            useMainPlayer().events.off('playerError', this.playerErrorListener);
            this.playerErrorListener = null;
        }
        // Descartar las precargas del quiz de ESTE servidor (no las de otros)
        clearPrefetched(this.guildId);
        const queue = useQueue(this.guildId);
        queue?.delete();
    }
}
