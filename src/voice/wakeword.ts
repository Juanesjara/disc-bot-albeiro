// Detecta "ey alfonso, <orden>" en lo que transcribió Whisper.
// Sin dependencias de Discord ni de config para poder probarla con `npm test`.

// Cabecera de la orden al inicio de la oración: signos opcionales, una interjección opcional ("ey", "oye"... y "y",
// que es como Whisper suele escribir "ey") y la palabra clave con sus variantes ("alfonzo",
// "al fonso"). Se exige la "f": "Alonso" no cuenta.
const WAKE = /^[\s¡¿"'«(\-]*(?:(?:ey|hey|oye|oe|eh|oiga|y)[\s,.!¡]+)?al\s?fon[sz]o(?![\p{L}\p{N}])[\s,.:;!?¡¿\-]*/iu;
// En mitad de la oración solo cuenta con una interjección delante ("bueno, ey alfonso, salta"):
// así "le dije a alfonso..." o "fui con Pedro y Alfonso" no son órdenes.
const WAKE_INSIDE = /(?<![\p{L}\p{N}])(?:ey|hey|oye|oe|oiga)[\s,.!¡]+al\s?fon[sz]o(?![\p{L}\p{N}])[\s,.:;!?¡¿\-]*/iu;

// Al final de la oración, después de una coma ("salta esa, Alfonso"): sin la coma no cuenta,
// para que "fui con Pedro y Alfonso" no sea una orden.
const WAKE_END = /,\s*(?:(?:ey|hey|oye|oe)\s+)?al\s?fon[sz]o\s*[.!?…]*$/iu;
// Interjección suelta al inicio de una orden con el nombre al final ("Hey, cambia esa, Alfonso")
const LEADING_INTERJECTION = /^[\s¡¿]*(?:ey|hey|oye|oe)[\s,!]+/iu;

/** Parte el texto en oraciones, conservando el texto original de cada una. */
function sentences(text: string): string[] {
    return (text.match(/[^.!?…]+[.!?…]*/g) ?? []).map(s => s.trim()).filter(Boolean);
}

/** Quita los signos que cierran la oración ("salta." → "salta"). */
function clean(s: string): string {
    return s.replace(/[\s.!?…,;:]+$/u, '').trim();
}

/**
 * Busca la primera oración que empieza por la palabra clave (o la lleva en medio con "ey"/"oye" delante,
 * o al final tras una coma: "salta esa, Alfonso") y devuelve la orden,
 * con sus mayúsculas y tildes originales (la búsqueda de canciones usa el texto tal cual).
 * - `null`: no es una orden (no hay palabra clave al inicio de ninguna oración).
 * - `''`: solo se dijo la palabra clave.
 * Si la oración es solo "Ey Alfonso." y viene otra detrás, la orden es la siguiente.
 */
export function extractWakeCommand(transcript: string): string | null {
    const parts = sentences(transcript ?? '');
    for (let i = 0; i < parts.length; i++) {
        const end = parts[i].match(WAKE_END);
        if (end && !WAKE.test(parts[i])) {
            const before = clean(parts[i].slice(0, end.index).replace(LEADING_INTERJECTION, ''));
            if (before) return before;
        }
        const m = parts[i].match(WAKE) ?? parts[i].match(WAKE_INSIDE);
        if (!m) continue;
        const rest = clean(parts[i].slice(m.index! + m[0].length));
        if (rest) return rest;
        return i + 1 < parts.length ? clean(parts[i + 1]) : '';
    }
    return null;
}
