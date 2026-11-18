// Reglas puras para el comando de letras: limpiar el título de YouTube y partir la letra en mensajes.
// Sin dependencias de Discord ni de config para poder probarlas con `npm test`.

/** Límite de caracteres de un mensaje de Discord. */
export const DISCORD_MAX = 2000;
/** Caracteres por página de letra (unas 25-30 líneas): cabe holgado en el recuadro y se lee sin hacer scroll. */
export const LYRICS_PAGE_CHARS = 1000;

// Separadores "Artista - Canción" que usa YouTube (con espacios alrededor)
const SEPARATORS = [' - ', ' – ', ' — ', ' || ', ' | '];
// Cómo empieza lo que va tras el último " - " cuando es una versión y no la canción: "- Remastered 2011", "- Live"...
const VERSION_PREFIXES = [
    'remaster', 'live', 'en vivo', 'radio edit', 'edit', 'from ', 'version', 'versión',
    'acoustic', 'acústic', 'acustic', 'mono', 'stereo', 'single',
];
// Palabras que abren la lista de colaboradores al final del título.
// "con" no: es muy común dentro de títulos en español ("Café con Ron")
const COLLAB_WORDS = new Set(['ft', 'ft.', 'feat', 'feat.', 'featuring', 'x', 'w/']);
// Etiquetas sueltas (sin paréntesis) al final del título
const TAG_SUFFIXES = [
    'official music video', 'official video', 'official audio', 'video oficial', 'audio oficial',
    'lyrics', 'lyric', 'letra', 'visualizer',
];
const OPEN_BRACKETS = '([{【';
const CLOSE_BRACKETS = ')]}】';

/** Quita los tramos entre paréntesis/corchetes/llaves: "(Official Video)", "[Lyrics]"... */
function stripBrackets(s: string): string {
    let out = '';
    let depth = 0;
    for (const ch of s) {
        if (OPEN_BRACKETS.includes(ch)) depth++;
        else if (CLOSE_BRACKETS.includes(ch) && depth > 0) { depth--; out += ' '; }
        else if (depth === 0) out += ch;
    }
    return out;
}

/** Posición y largo del primer separador "Artista - Canción", o null. */
function findSeparator(s: string): { index: number; length: number } | null {
    let best: { index: number; length: number } | null = null;
    for (const sep of SEPARATORS) {
        const index = s.indexOf(sep);
        if (index > 0 && (!best || index < best.index)) best = { index, length: sep.length };
    }
    return best;
}

/** Quita " - Remastered 2011", " - Live", " - From "Encanto""... del final. */
function stripVersionSuffix(s: string): string {
    for (const dash of [' - ', ' – ', ' — ']) {
        const index = s.lastIndexOf(dash);
        if (index <= 0) continue;
        let rest = s.slice(index + dash.length).trim().toLowerCase();
        if (/^\d{4} /.test(rest)) rest = rest.slice(5); // "- 2011 Remaster"
        if (VERSION_PREFIXES.some(p => rest.startsWith(p))) return s.slice(0, index);
    }
    return s;
}

/** Canal sin " - Topic" ni "VEVO": "Luis Fonsi - Topic" → "Luis Fonsi", "AdeleVEVO" → "Adele". */
function cleanAuthor(author: string): string {
    let a = (author ?? '').trim();
    if (a.toLowerCase().endsWith(' - topic')) a = a.slice(0, -' - topic'.length);
    if (a.toLowerCase().endsWith('vevo')) a = a.slice(0, -'vevo'.length);
    return a.trim();
}

/** Corta los colaboradores ("ft. X", "x Bizarrap") y las etiquetas sueltas del final. */
function cleanSongTitle(s: string): string {
    const words = s.split(/\s+/).filter(Boolean);
    const collab = words.findIndex((w, i) => i > 0 && COLLAB_WORDS.has(w.toLowerCase()));
    let title = (collab > 0 ? words.slice(0, collab) : words).join(' ');
    for (const tag of TAG_SUFFIXES) {
        if (title.toLowerCase().endsWith(' ' + tag)) title = title.slice(0, -tag.length);
    }
    return title.trim();
}

/**
 * Saca artista y título buscables de un título de YouTube:
 * "Karol G - TUSA (Official Video)" → { artist: 'Karol G', title: 'TUSA' }
 * "DUKI - Malbec x Bizarrap"        → { artist: 'DUKI', title: 'Malbec' }
 * Sin separador, el artista es el canal (`author`) sin " - Topic" / "VEVO".
 *
 * Con `titleIsClean` (tracks de Spotify) o canales "- Topic", el título ya es solo la canción
 * y el artista viene en `author`: no se parte por " - " ("Bohemian Rhapsody - Remastered 2011").
 */
export function parseTrackTitle(rawTitle: string, author = '', titleIsClean = false): { artist: string; title: string } {
    // "Sessions #52" → "Sessions 52"
    let text = stripBrackets(rawTitle ?? '').split('#').join(' ');

    const fromTopic = (author ?? '').trim().toLowerCase().endsWith(' - topic');
    const sep = titleIsClean || fromTopic ? null : findSeparator(text);
    let artist: string;
    if (sep) {
        artist = text.slice(0, sep.index);
        text = text.slice(sep.index + sep.length);
    } else {
        artist = cleanAuthor(author);
    }
    // El sufijo de versión solo se busca en la parte de la canción:
    // "Oasis - Live Forever" no es una versión en vivo, "Oasis - Wonderwall - Live" sí
    text = stripVersionSuffix(text);

    return { artist: artist.split(/\s+/).filter(Boolean).join(' '), title: cleanSongTitle(text) };
}

/**
 * Parte un texto en trozos de como mucho `max` caracteres, cortando siempre en un salto de línea.
 * Solo si una línea sola no cabe, esa línea se corta a la fuerza.
 */
export function splitLyrics(text: string, max = DISCORD_MAX): string[] {
    const chunks: string[] = [];
    let current = '';
    for (const rawLine of (text ?? '').split('\n')) {
        let line = rawLine;
        while (line.length > max) {
            if (current) { chunks.push(current); current = ''; }
            chunks.push(line.slice(0, max));
            line = line.slice(max);
        }
        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > max) {
            chunks.push(current);
            current = line;
        } else {
            current = candidate;
        }
    }
    if (current.trim()) chunks.push(current);
    return chunks.filter(c => c.trim());
}
