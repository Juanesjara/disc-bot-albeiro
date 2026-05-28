import playdl, { SpotifyPlaylist } from 'play-dl';
import { Song } from '../types';

export class SpotifyService {
    // play-dl manages its own Spotify token internally — no credentials needed
    async authorize(): Promise<void> {}

    async getPlaylistSongs(playlistUrl: string): Promise<Song[]> {
        const data = await playdl.spotify(playlistUrl);

        if (data.type !== 'playlist') {
            throw new Error('La URL no corresponde a una playlist de Spotify.');
        }

        const tracks = await (data as SpotifyPlaylist).all_tracks();

        return tracks.map(track => ({
            title: this.stripSongName(track.name),
            artist: track.artists[0]?.name || 'Desconocido',
            spotifyUrl: track.url,
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
