import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DISCORD_TOKEN) {
    console.error('[Config] Variables disponibles:', Object.keys(process.env).join(', '));
    throw new Error('Falta DISCORD_TOKEN en .env');
}

// Spotify es opcional: solo lo usa SpotifyExtractor para `=play` con URLs de Spotify.
// Si falta cualquiera de las dos credenciales se trata como si no hubiera ninguna.
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotify = spotifyClientId && spotifyClientSecret
    ? { clientId: spotifyClientId, clientSecret: spotifyClientSecret }
    : null;

export const config = {
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.PREFIX || '=',
    // Opcional: sin ella las menciones solo entienden las frases comunes (reglas) y no se llama a la IA
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    spotify,
};
