// Vocabulario que se le pasa a Whisper como pista para que escriba bien artistas y canciones
// ("Malbec de Duki" y no "mal B que de Duque"). Aprende de lo que suena en cada servidor.
// Sin dependencias de Discord para poder probarlo con `npm test`.

// Artistas que más se piden: la pista arranca con estos aunque el servidor no haya puesto nada
export const BASE_VOCABULARY = [
    'Karol G', 'Duki', 'Feid', 'Bad Bunny', 'Blessd', 'Ryan Castro', 'J Balvin', 'Maluma', 'Myke Towers',
    'Peso Pluma', 'Quevedo', 'Bizarrap', 'Rauw Alejandro', 'Ozuna', 'Mora', 'Young Miko', 'Anuel AA',
    'Farruko', 'Sech', 'Daddy Yankee', 'Shakira', 'Kapo', 'Beéle', 'Emilia', 'Tiago PZK',
    // Atajos del servidor (src/voice/shortcuts.ts)
    'Yoryi', 'Luigi 21 Plus', 'Daga Adicta',
];

// Whisper solo mira ~224 tokens del prompt: un tope en caracteres deja margen
const MAX_PROMPT_CHARS = 600;
// Cuántos nombres recientes recuerda cada servidor
const MAX_RECENT = 40;
const MAX_ITEM_CHARS = 40;

/** Nombres útiles de una canción: el artista y el título sin "(Video Oficial)", "ft. X", etc. */
export function trackTerms(title: string, author: string): string[] {
    const cleaned = (title ?? '')
        .replace(/[([{][^)\]}]*[)\]}]/g, ' ')                 // (Video Oficial), [Lyrics], {…}
        .replace(/\b(ft\.?|feat\.?|prod\.?)\s.*$/i, ' ')        // ft. Otro artista
        .replace(/\b(official|oficial|video|lyrics?|letra|audio|visualizer)\b/gi, ' ');
    const parts = cleaned.split(/\s[-|–—]\s|\|/).map(s => s.replace(/\s+/g, ' ').trim());
    const artist = (author ?? '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
    return [artist, ...parts].filter(s => s.length > 1 && s.length <= MAX_ITEM_CHARS);
}

/** Añade nombres al principio de la lista reciente, sin repetir (ignora mayúsculas y tildes). */
export function remember(recent: string[], terms: string[]): string[] {
    const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const seen = new Set<string>();
    return [...terms, ...recent].filter(t => {
        const k = key(t);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
    }).slice(0, MAX_RECENT);
}

/**
 * Prompt para Whisper: una lista de nombres separados por comas, con "Alfonso" dentro de la lista.
 * Nunca empieza por "Alfonso." ni es una orden: si Whisper lo repite con audio de ruido, el texto
 * no pasa la detección de la palabra clave (y además isPromptEcho lo descarta).
 */
export function buildPrompt(recent: string[]): string {
    const names = remember([], [...recent, ...BASE_VOCABULARY]).filter(n => n.toLowerCase() !== 'alfonso');
    const out = [names[0] ?? 'Karol G', 'Alfonso'];
    for (const name of names.slice(1)) {
        if ([...out, name].join(', ').length > MAX_PROMPT_CHARS) break;
        out.push(name);
    }
    return out.join(', ');
}

/** ¿El texto es un trozo de la pista? Whisper la repite a veces cuando el audio es ruido. */
export function isPromptEcho(text: string, prompt: string): boolean {
    const letters = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
    const t = letters(text);
    return t.length > 0 && letters(prompt).includes(t);
}
