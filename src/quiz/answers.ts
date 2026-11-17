// Reglas puras del quiz: normalización de respuestas, "¿acierta?" y marcador.
// Sin dependencias de Discord ni de config para poder probarlas con `npm test`.

/**
 * Normaliza un texto para comparar respuestas:
 * minúsculas, sin tildes, sin comillas/apóstrofes, `&` → `y`,
 * el resto de signos de puntuación pasan a espacio y se colapsan los espacios.
 */
export function normalizeAnswer(s: string): string {
    return (s ?? '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // é→e, á→a, ñ→n, ü→u...
        .replace(/["'`´‘’“”«»]/g, '') // comillas y apóstrofes: Héctor "El Father" → hector el father
        .replace(/&/g, ' y ')         // & → y
        .replace(/[^\p{L}\p{N}\s]/gu, ' ') // resto de signos: "tusa!" → "tusa", "ac/dc" → "ac dc"
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * true si `answer` aparece como palabras completas dentro de `message`
 * (tras normalizar ambos). Si la respuesta queda vacía, nadie la acierta.
 */
export function matchesAnswer(message: string, answer: string): boolean {
    const normalizedAnswer = normalizeAnswer(answer);
    if (!normalizedAnswer) return false;
    const normalizedMessage = normalizeAnswer(message);
    if (!normalizedMessage) return false;
    return ` ${normalizedMessage} `.includes(` ${normalizedAnswer} `);
}

/** true si la respuesta queda vacía tras normalizar (no se puede adivinar). */
export function isBlankAnswer(answer: string): boolean {
    return normalizeAnswer(answer) === '';
}

export interface ScoreEntry {
    id: string;
    score: number;
}

/**
 * Entradas del marcador: quienes están en el canal de voz más cualquiera que
 * haya sumado puntos aunque ya se haya ido. Ordenado de mayor a menor puntaje.
 */
export function buildScoreboard(memberIds: Iterable<string>, scores: Record<string, number>): ScoreEntry[] {
    const ids = new Set<string>(memberIds);
    for (const [id, score] of Object.entries(scores)) {
        if (score > 0) ids.add(id);
    }
    return [...ids]
        .map((id) => ({ id, score: scores[id] || 0 }))
        .sort((a, b) => b.score - a.score);
}
