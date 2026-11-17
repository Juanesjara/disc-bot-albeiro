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

// Alfonso (opcional): segundo bot que escucha el canal de voz y le pasa las órdenes a este.
// Sin ALFONSO_TOKEN no se conecta. Sin GROQ_API_KEY se conecta, pero avisa que la voz no está configurada.
const minutes = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const alfonso = process.env.ALFONSO_TOKEN
    ? {
        token: process.env.ALFONSO_TOKEN,
        groqApiKey: process.env.GROQ_API_KEY || '',
        // Topes diarios de audio transcrito, en minutos de lo que cobra Groq
        topeUsuarioMin: minutes(process.env.ALFONSO_TOPE_USUARIO_MIN, 30),
        topeGlobalMin: minutes(process.env.ALFONSO_TOPE_GLOBAL_MIN, 180),
    }
    : null;

export const config = {
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.PREFIX || '=',
    // Opcional: sin ella las menciones solo entienden las frases comunes (reglas) y no se llama a la IA
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    spotify,
    alfonso,
};
