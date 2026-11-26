import { useMainPlayer, Track, QueryType, Util } from 'discord-player';
import { YoutubeExtractor, getInnertube } from 'discord-player-youtubei';
import { User } from 'discord.js';
import { songsFromMusicItems } from '../utils/musicSearch';

// Busca solo canciones en YouTube Music (filtro "song"): la búsqueda normal del
// extractor devuelve cualquier video ("kyoto" daba una guía de viajes).
// El audio sigue saliendo de yt-dlp por el hook de index.ts (source 'youtube' + url).
// Si YouTube Music falla o no encuentra nada, cae a la búsqueda normal de YouTube.
export async function searchSongs(query: string, requestedBy?: User): Promise<Track[]> {
    const player = useMainPlayer();
    try {
        // El extractor ya creó la sesión de Innertube al registrarse: esto la reutiliza
        const tube = await getInnertube({});
        const result = await tube.music.search(query, { type: 'song' });
        const songs = songsFromMusicItems((result.songs?.contents ?? []) as any[]);
        if (songs.length > 0) {
            const extractor = player.extractors.get(YoutubeExtractor.identifier) ?? null;
            return songs.map(song => {
                const track = new Track(player, {
                    title: song.title,
                    author: song.author,
                    url: `https://www.youtube.com/watch?v=${song.id}`,
                    thumbnail: song.thumbnail,
                    duration: Util.buildTimeCode(Util.parseMS(song.seconds * 1000)),
                    requestedBy,
                    source: 'youtube',
                    queryType: QueryType.YOUTUBE_VIDEO,
                });
                track.extractor = extractor;
                return track;
            });
        }
    } catch (err: any) {
        console.error('[YouTube Music] Falló la búsqueda, usando YouTube normal:', err?.message ?? err);
    }

    const fallback = await player.search(query, { requestedBy });
    return fallback.tracks;
}
