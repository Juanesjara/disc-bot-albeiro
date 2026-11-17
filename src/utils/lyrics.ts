// Reglas puras para el comando de letras: limpiar el título de YouTube y partir la letra en mensajes.
// Sin dependencias de Discord ni de config para poder probarlas con `npm test`.

/** Límite de caracteres de un mensaje de Discord. */
export const DISCORD_MAX = 2000;

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
    let text = (rawTitle ?? '')
        .replace(/[([{【][^)\]}】]*[)\]}】]/g, ' ') // (Official Video), [Lyrics], {HD}...
        .replace(/#/g, ' ')                         // "Sessions #52" → "Sessions 52"
        // Sufijos de versión: "- Remastered 2011", "- Live", "- Radio Edit", "- From "Encanto""
        .replace(/\s+[-–—]\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|live|en vivo|radio edit|edit|from|version|versi[oó]n|acoustic|ac[uú]stic[oa]|mono|stereo|single)(?![a-z]).*$/i, '');

    let artist = '';
    const fromTopic = /\s*-\s*topic$/i.test(author ?? '');
    const sep = titleIsClean || fromTopic ? null : text.match(/\s+(?:-|–|—|\|\|?)\s+/);
    if (sep) {
        artist = text.slice(0, sep.index).trim();
        text = text.slice(sep.index! + sep[0].length);
    } else {
        artist = (author ?? '').replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim();
    }

    const title = text
        // Colaboraciones al final del título: "ft. X", "feat X", "x Bizarrap".
        // "con" no: es muy común dentro de títulos en español ("Café con Ron")
        .replace(/\s+(?:ft\.?|feat\.?|featuring|x|w\/)\s+.*$/i, '')
        // Etiquetas sueltas sin paréntesis: "Official Video", "Video Oficial", "Lyrics"...
        .replace(/\s+(?:official\s+(?:music\s+)?(?:video|audio)|video\s+oficial|audio\s+oficial|lyrics?|letra|visualizer)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    return { artist: artist.replace(/\s+/g, ' '), title };
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
