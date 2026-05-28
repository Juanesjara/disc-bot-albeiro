import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DISCORD_TOKEN) {
    console.error('[Config] Variables disponibles:', Object.keys(process.env).join(', '));
    throw new Error('Falta DISCORD_TOKEN en .env');
}
if (!process.env.SPOTIFY_CLIENT_ID) throw new Error('Falta SPOTIFY_CLIENT_ID en .env');
if (!process.env.SPOTIFY_CLIENT_SECRET) throw new Error('Falta SPOTIFY_CLIENT_SECRET en .env');

export const config = {
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.PREFIX || '=',
    ownerId: process.env.DISCORD_OWNER_ID || '',
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        // Optional: copy from browser to access Spotify editorial playlists (Top 50, etc.)
        // DevTools → Application → Cookies → open.spotify.com → sp_dc
        spDc: process.env.SPOTIFY_SP_DC || '',
    },
};
