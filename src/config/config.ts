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
    // Opcional: sin ella el bot arranca igual y solo dejan de funcionar las menciones en lenguaje natural
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    },
};
