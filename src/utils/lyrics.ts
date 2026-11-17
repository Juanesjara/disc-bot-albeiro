// Reglas puras para el comando de letras: limpiar el título de YouTube y partir la letra en mensajes.
// Sin dependencias de Discord ni de config para poder probarlas con `npm test`.

/** Límite de caracteres de un mensaje de Discord. */
export const DISCORD_MAX = 2000;

/**
 * Saca artista y título buscables de un título de YouTube:
 * "Karol G - TUSA (Official Video)" → { artist: 'Karol G', title: 'TUSA' }
 * "DUKI - Malbec x Bizarrap"        → { artist: 'DUKI', title: 'Malbec' }
 * Sin separador, el artista es el canal (`author`) sin " - Topic" / "VEVO".
 */
export function parseTrackTitle(rawTitle: string, author = ''): { artist: string; title: string } {
    let text = (rawTitle ?? '')
        .replace(/[([{【][^)\]}】]*[)\]}】]/g, ' ') // (Official Video), [Lyrics], {HD}...
        .replace(/#/g, ' ');                        // "Sessions #52" → "Sessions 52"

    let artist = '';
    const sep = text.match(/\s+(?:-|–|—|\|\|?)\s+/);
    if (sep) {
        artist = text.slice(0, sep.index).trim();
        text = text.slice(sep.index! + sep[0].length);
    } else {
        artist = (author ?? '').replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim();
    }

    const title = text
        // Colaboraciones al final del título: "ft. X", "feat X", "x Bizarrap", "con X"
        .replace(/\s+(?:ft\.?|feat\.?|featuring|x|con|w\/)\s+.*$/i, '')
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
