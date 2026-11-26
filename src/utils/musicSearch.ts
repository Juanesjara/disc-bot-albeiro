// Lógica pura para convertir resultados de YouTube Music en datos de canción.
// La búsqueda en sí (con red) está en src/services/youtubeMusic.ts.

export interface MusicSong {
    id: string;
    title: string;
    author: string;
    seconds: number;
    thumbnail?: string;
}

interface Thumb { url: string; width?: number }

// Forma mínima de un MusicResponsiveListItem de youtubei.js que usamos
export interface MusicItemLike {
    item_type?: string;
    id?: string;
    title?: string;
    artists?: { name: string }[];
    duration?: { seconds: number };
    thumbnails?: Thumb[];
}

// Solo canciones con id y título; el resto (videos, álbumes, artistas...) se descarta
export function songsFromMusicItems(items: MusicItemLike[]): MusicSong[] {
    return items
        .filter(it => it.item_type === 'song' && it.id && it.title)
        .map(it => ({
            id: it.id,
            title: it.title,
            author: it.artists?.map(a => a.name).filter(Boolean).join(', ') || 'Desconocido',
            seconds: it.duration?.seconds ?? 0,
            thumbnail: largestThumbnail(it.thumbnails),
        }));
}

function largestThumbnail(thumbs?: Thumb[]): string | undefined {
    if (!thumbs?.length) return undefined;
    return [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url;
}
