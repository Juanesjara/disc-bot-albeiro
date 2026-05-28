// eslint-disable-next-line @typescript-eslint/no-require-imports
const SpotifyUrlInfoModule = require('spotify-url-info') as import('spotify-url-info').SpotifyUrlInfoModule;
import { Song } from '../types';

// spotify-url-info scrapes Spotify's public embed page — no API credentials needed
const spotifyInfo = SpotifyUrlInfoModule(fetch);

export class SpotifyService {
    async authorize(): Promise<void> {}

    async getPlaylistSongs(playlistUrl: string): Promise<Song[]> {
        let tracks: any[];
        try {
            tracks = await spotifyInfo.getTracks(playlistUrl) as any[];
        } catch (err: any) {
            // spotify-url-info attaches the raw HTML when parsing fails
            if (err.html?.includes('"status":404')) {
                const e: any = new Error('Playlist no encontrada o privada');
                e.statusCode = 404;
                throw e;
            }
            throw err;
        }

        if (!tracks.length) throw new Error('Playlist sin canciones');

        return tracks
            .filter(t => t.name)
            .map(t => ({
                title: this.stripSongName(t.name as string),
                artist: (t.artist as string) || 'Desconocido',
                spotifyUrl: t.uri
                    ? `https://open.spotify.com/track/${(t.uri as string).split(':').pop()}`
                    : playlistUrl,
            }));
    }

    private stripSongName(name: string): string {
        return name
            .replace(/\s*\(.*?\)/g, '')
            .replace(/\s*\[.*?\]/g, '')
            .replace(/\s*-\s.*$/, '')
            .replace(/\s*feat\..*$/i, '')
            .trim();
    }
}
