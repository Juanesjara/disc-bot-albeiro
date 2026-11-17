// Reglas para entender las frases más comunes sin llamar a la IA (gratis e instantáneo).
// Sin dependencias de Discord ni de config para poder probarlas con `npm test`.

/** Ejecutar un comando existente con estos argumentos, o responder pidiendo un dato. */
export type Intent =
    | { command: string; args: string[] }
    | { ask: string };

const SPOTIFY_PLAYLIST = /https?:\/\/\S*spotify\.com\/\S*(playlist|blend)\/\S+/i;

/** Minúsculas, sin tildes, sin signos ni muletillas ("oye", "por favor"). */
export function normalizePhrase(s: string): string {
    return (s ?? '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\p{L}\p{N}\s%]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(oye|ey|hey|porfa|por favor|plis)\s+/, '')
        .replace(/\s+(porfa|por favor|plis|please)$/, '')
        .trim();
}

// Varias acciones en una frase ("pon X y baja el volumen"): mejor que la resuelva la IA
const COMPOUND = /\s(y|luego|despues)\s+(pon|ponme|sube|baja|salta|pausa|para|quita|mezcla|repite|limpia|volumen|vol)\b/;

const FIXED: Array<[RegExp, string, string[]]> = [
    [/^(salta(la|te|lo)?|skip|siguiente|pasa(la)?|cambia(la)?|next)( (esta|esa|la|la cancion|esta cancion|esa cancion))?$/, 'skip', []],
    [/^(para|parala|deten|detente|detenla|stop|apaga)( (la musica|todo|eso|la cancion))?$/, 'stop', []],
    [/^(pausa(la)?|pon pausa|pause)( (la musica|la cancion|esto|esta))?$/, 'pause', []],
    [/^(sigue|continua|reanuda|resume|despausa|quita (la )?pausa|dale play)( (la musica|la cancion))?$/, 'resume', []],
    [/^(que|cual) (esta sonando|suena|cancion (es|suena|esta sonando)( esta)?|es esta( cancion)?)$/, 'nowplaying', []],
    [/^(((muestra|muestrame|ensena|ensename|ver|mira|cual es) )?(la )?cola|que (sigue|hay en la cola))$/, 'queue', []],
    [/^(mezcla(la)?|shuffle|aleatorio)( (la cola|las canciones))?$/, 'shuffle', []],
    [/^(limpia|vacia|borra) (la )?cola$/, 'clear', []],
    [/^repite (esta|esa|la cancion|esta cancion)$/, 'loop', ['track']],
    [/^repite (la cola|todo)$/, 'loop', ['queue']],
    [/^(no repitas|deja de repetir|sin repetir|quita el (loop|repetir))$/, 'loop', ['off']],
    // "pasame la letra", "la letra de la cancion", "cual es la letra de esta" (también sin el "de")
    [/^(((pasame|pasa|dame|muestra|muestrame|ensename|manda|mandame|cual es|quiero|tienes|ver) )?(la )?letra|lyrics)( (de )?(la cancion|esta cancion|esa cancion|esta|esa|la))?$/, 'lyrics', []],
];

/**
 * Traduce una frase (ya sin la mención) a un comando del bot.
 * Devuelve null si no hay una regla segura: entonces decide la IA.
 */
export function parseIntent(text: string): Intent | null {
    const original = (text ?? '').trim();
    const n = normalizePhrase(original);
    if (!n) return null;

    // Quiz: necesita URL de playlist y número de canciones
    if (/\bquiz\b/.test(n)) {
        const url = original.match(SPOTIFY_PLAYLIST)?.[0];
        if (!url) return { ask: 'Para el quiz pásame la URL de una playlist pública de Spotify y cuántas canciones (1-30).' };
        const rest = normalizePhrase(original.replace(url, ' '));
        const count = rest.match(/\b(\d{1,3})\b/)?.[1];
        if (!count) return { ask: '¿De cuántas canciones hago el quiz? (1-30)' };
        const mode = /\bartistas?\b/.test(rest) ? 'artist'
            : /\b(titulos?|nombres?)\b/.test(rest) ? 'title'
            : null;
        return { command: 'quiz', args: [url, count, ...(mode ? [mode] : [])] };
    }

    if (COMPOUND.test(n)) return null;

    for (const [pattern, command, args] of FIXED) {
        if (pattern.test(n)) return { command, args };
    }

    // "volumen 30", "pon el volumen en 30", "baja el volumen a 20%"
    const vol = n.match(/^((pon|sube|baja|cambia) )?(el )?(volumen|vol)( (a|en|al))? (\d{1,3})( ?%| por ciento)?$/);
    if (vol) return { command: 'volume', args: [vol[7]] };

    // "quita la 3 de la cola"
    const rm = n.match(/^(quita|borra|elimina|saca) (la )?(cancion )?(numero )?(\d+) de la cola$/);
    if (rm) return { command: 'remove', args: [rm[5]] };

    // "pon Tusa de Karol G": la búsqueda usa el texto original (con tildes y mayúsculas)
    const play = original.match(/^(?:oye\s+)?(?:pon|pone|ponme|ponga|reproduce|reprodúceme|reproduceme|toca|play|coloca)\s+(.+)$/i);
    if (play) {
        const query = play[1]
            .replace(/^(la canci[oó]n|el tema|la de|el de)\s+/i, '')
            .replace(/\s+(por favor|porfa|plis)[\s.!?]*$/i, '')
            .replace(/[\s.!?¡¿]+$/, '')
            .trim();
        // "pon algo", "ponme música": no dicen qué canción
        if (!query || /^(algo|musica|música|una canci[oó]n|otra|otra canci[oó]n)$/i.test(query)) return null;
        return { command: 'play', args: query.split(/\s+/) };
    }

    return null;
}
