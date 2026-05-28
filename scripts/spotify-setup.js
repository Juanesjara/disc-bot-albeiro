/**
 * One-time Spotify OAuth setup.
 * Run with: node scripts/spotify-setup.js
 *
 * Before running:
 *  1. Go to https://developer.spotify.com/dashboard
 *  2. Open your app → Settings → Redirect URIs
 *  3. Add: http://localhost:8888/callback   (save)
 *
 * After running, add SPOTIFY_REFRESH_TOKEN to your .env file.
 */

require('dotenv').config();
const http = require('http');

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    console.error('ERROR: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env');
    process.exit(1);
}

const redirectUri = 'http://localhost:8888/callback';
const scope = 'playlist-read-public playlist-read-collaborative';

const authUrl =
    'https://accounts.spotify.com/authorize' +
    '?client_id=' + clientId +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(scope);

console.log('\n=== Spotify OAuth Setup ===\n');
console.log('IMPORTANT: Make sure http://localhost:8888/callback is added as a');
console.log('Redirect URI in your Spotify Developer Dashboard first.\n');
console.log('1. Open this URL in your browser:\n');
console.log('   ' + authUrl + '\n');
console.log('2. Log in and authorize the app.');
console.log('3. The browser will redirect to localhost — this page will capture the code automatically.\n');
console.log('Waiting for Spotify callback on http://localhost:8888/callback ...\n');

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost:8888');
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        res.end('<h2>Authorization denied: ' + error + '</h2><p>You can close this tab.</p>');
        console.error('Authorization denied:', error);
        server.close();
        process.exit(1);
    }

    if (!code) {
        res.end('<h2>No code received.</h2>');
        return;
    }

    res.end('<h2>Authorization successful! You can close this tab.</h2>');
    server.close();

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
    });

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + credentials,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });

        const data = await tokenRes.json();

        if (!tokenRes.ok || !data.refresh_token) {
            console.error('Error getting token:', JSON.stringify(data, null, 2));
            process.exit(1);
        }

        console.log('=== SUCCESS ===\n');
        console.log('Add these lines to your .env file:\n');
        console.log('SPOTIFY_REFRESH_TOKEN=' + data.refresh_token);
        console.log('SPOTIFY_MARKET=CO');
        console.log('\nThen restart the bot.');
    } catch (err) {
        console.error('Request failed:', err.message);
        process.exit(1);
    }
});

server.listen(8888, () => {});
