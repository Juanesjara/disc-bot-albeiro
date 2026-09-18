import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import youtubeDl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';

// ==========================================================================
// Streaming de YouTube vía yt-dlp (pipe directo de stdout) + cache de precarga.
//
// - Pipe directo: dejar que yt-dlp baje el CDN con su propio contexto evita el
//   403 que daba resolver la URL y bajarla con https.get desde IPs de datacenter.
// - seekSeconds: para el quiz — el audio se entrega YA empezando en ese segundo
//   (yt-dlp | ffmpeg -ss N -c copy), sin el doble silencio de reproducir desde
//   0:00 y luego saltar con node.seek() (que re-crea el stream desde cero).
// - Precarga: prefetchTrack() arranca el stream de la siguiente canción mientras
//   suena la actual; createStream lo recoge con takePrefetched() → transición
//   casi instantánea.
// ==========================================================================

interface CacheEntry {
    stream: PassThrough;
    title: string;
    timer: NodeJS.Timeout;
}

let cookiesFile: string | null = null;
const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 2;
const TTL_MS = 15 * 60 * 1000; // si en 15 min no se usó, descartar (canción muy larga o cola cambiada)

export function initStreamer(cookies: string | null): void {
    cookiesFile = cookies;
}

// Lanza yt-dlp (y ffmpeg si hay seek) y devuelve un PassThrough con el audio
export function spawnStream(url: string, title?: string, seekSeconds = 0): PassThrough {
    const ytdlOptions: any = {
        // Con seek forzamos webm/opus: es lo que ffmpeg puede remuxear desde un pipe
        format: seekSeconds > 0
            ? 'bestaudio[acodec=opus]/bestaudio[ext=webm]'
            : 'bestaudio[acodec=opus]/bestaudio/18',
        output: '-',
        quiet: true,
        noWarnings: true,
        noPlaylist: true,
        jsRuntime: 'node',
        // Combo probado en Railway: los tres usan cookies y se cubren entre sí
        // (tv solo falla a veces con "The page needs to be reloaded";
        //  android/ios ignoran cookies y piden login)
        extractorArgs: 'youtube:player_client=tv,web_safari,mweb',
        forceIpv4: true,
    };
    if (cookiesFile) ytdlOptions.cookies = cookiesFile;

    const subprocess = (youtubeDl as any).exec(url, ytdlOptions, {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Buffer intermedio para suavizar la lectura hacia discord-player/ffmpeg
    const buffered = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });

    let lastErr = '';
    subprocess.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) { lastErr = line.split('\n')[0]; console.error('[yt-dlp]', lastErr); }
    });
    // CRÍTICO: capturar el rechazo del subproceso para que un track fallido
    // NO tumbe todo el proceso (unhandled rejection -> crash del bot).
    if (typeof subprocess.catch === 'function') {
        subprocess.catch((err: any) => {
            const msg = lastErr || err?.shortMessage || err?.message || 'yt-dlp falló';
            console.error('[Stream] yt-dlp falló:', msg);
            if (!buffered.destroyed) buffered.destroy(new Error(msg));
        });
    }
    subprocess.on?.('error', (err: any) => {
        if (!buffered.destroyed) buffered.destroy(err);
    });

    if (!subprocess.stdout) {
        buffered.destroy(new Error('yt-dlp no expuso stdout'));
        return buffered;
    }

    let ff: ReturnType<typeof spawn> | null = null;
    if (seekSeconds > 0 && ffmpegPath) {
        // yt-dlp stdout → ffmpeg (descarta hasta seekSeconds, copia sin recodificar) → buffered
        ff = spawn(ffmpegPath as unknown as string, [
            '-hide_banner', '-loglevel', 'error',
            '-ss', String(seekSeconds),
            '-i', 'pipe:0',
            '-c', 'copy', '-f', 'webm',
            'pipe:1',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        ff.stderr?.on('data', (chunk: Buffer) => {
            const line = chunk.toString().trim();
            if (line) console.error('[ffmpeg-seek]', line.split('\n')[0]);
        });
        ff.on('error', (err: any) => {
            if (!buffered.destroyed) buffered.destroy(err);
        });
        // EPIPE al cerrar temprano no debe tumbar nada
        ff.stdin!.on('error', () => {});
        subprocess.stdout.on('error', () => {});

        subprocess.stdout.pipe(ff.stdin!);
        ff.stdout!.pipe(buffered);
    } else {
        subprocess.stdout.pipe(buffered);
        subprocess.stdout.on('error', (err: any) => {
            if (!buffered.destroyed) buffered.destroy(err);
        });
    }

    // Al destruirse el stream (fin, skip, stop, error), matar los procesos
    // para no dejar yt-dlp/ffmpeg zombis acumulándose en el contenedor.
    buffered.once('close', () => {
        try { subprocess.kill?.('SIGKILL'); } catch {}
        try { ff?.kill('SIGKILL'); } catch {}
    });

    return buffered;
}

function evict(url: string, reason: string): void {
    const entry = cache.get(url);
    if (!entry) return;
    cache.delete(url);
    clearTimeout(entry.timer);
    entry.stream.destroy(); // el 'close' del stream mata los procesos
    console.log(`[Prefetch] descartado (${reason}): ${entry.title}`);
}

// Arranca el stream de un track por adelantado para que createStream lo encuentre listo
export function prefetchTrack(url: string, title = url, seekSeconds = 0): void {
    if (!url || cache.has(url)) return;
    while (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        evict(oldest, 'cache llena');
    }
    console.log(`[Prefetch] precargando${seekSeconds ? ` (desde ${seekSeconds}s)` : ''}: ${title}`);
    const stream = spawnStream(url, title, seekSeconds);
    stream.on('error', () => evict(url, 'error'));
    const timer = setTimeout(() => evict(url, 'expiró'), TTL_MS);
    timer.unref?.();
    cache.set(url, { stream, title, timer });
}

// Devuelve el stream precargado si existe (y lo saca de la cache)
export function takePrefetched(url: string): PassThrough | null {
    const entry = cache.get(url);
    if (!entry) return null;
    cache.delete(url);
    clearTimeout(entry.timer);
    if (entry.stream.destroyed) return null;
    console.log(`[Prefetch] HIT: ${entry.title}`);
    return entry.stream;
}

// Descarta todas las precargas pendientes (fin de cola, fin de quiz)
export function clearPrefetched(): void {
    for (const url of [...cache.keys()]) evict(url, 'limpieza');
}
