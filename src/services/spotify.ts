import SpotifyApi from 'spotify-web-api-node';
import { config } from '../config/config';
import { Song } from '../types';

export class SpotifyService {
    private client = new SpotifyApi({
        clientId: config.spotify.clientId,
        clientSecret: config.spotify.clientSecret,
    });

    async authorize(): Promise<void> {
        const response = await this.client.clientCredentialsGrant();
        this.client.setAccessToken(response.body.access_token);
    }

    async getPlaylistSongs(playlistId: string): Promise<Song[]> {
        let id = playlistId;
        const match = playlistId.match(/playlist\/([^?]+)/);
        if (match) id = match[1];

        const result = await this.client.getPlaylistTracks(id);
        return result.body.items
            .filter(item => item.track !== null)
            .map(({ track }) => ({
                title: this.stripSongName(track!.name),
                artist: track!.artists[0]?.name || 'Desconocido',
                spotifyUrl: `https://open.spotify.com/track/${track!.id}`,
            }));
    }

    private stripSongName(name: string): string {
        return name
            .replace(/\s*\(.*?\)/g, '')    // Quita (feat. ...), (Remix), (Official...), etc.
            .replace(/\s*\[.*?\]/g, '')    // Quita [feat. ...], [Official Video], etc.
            .replace(/\s*-\s.*$/, '')      // Quita - Anything After Dash
            .replace(/\s*feat\..*$/i, '')  // Quita feat. si quedó suelto
            .trim();
    }
}
