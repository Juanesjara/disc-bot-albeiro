// Atajos de voz: frases fijas que hacen algo propio del servidor en vez de pasar por el intérprete.
// Sin dependencias de Discord para poder probarlos con `npm test`.

export interface Shortcut {
    /** Mensaje que Alfonso escribe en el chat. `{mention}` se cambia por la mención de `mentionName`. */
    say: string;
    /** Nombre (apodo, nombre global o usuario) de quien se etiqueta, buscado en el canal de voz. */
    mentionName?: string;
    /** Orden para el bot de música, como si se hubiera dicho tras "ey alfonso". */
    play: string;
}

const normalize = (s: string) => (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "llegó <nombre>" con las formas de decirlo; `names` son las variantes del nombre como las escribe Whisper. */
const arrival = (names: string) => new RegExp(`^(ya )?(llego|llega|ya llego|ya esta|aqui esta) (el )?(${names})$`);

// "llegó Yoryi" y como lo escriba Whisper: Gorgi, Yorgi, Jorgi, George...
const YORYI = arrival('yoryi|yorgi|yorgui|yoryis|jorgi|jorgui|jorgy|gorgi|gorgui|georgi|george|georgie|giorgi|yoyi');
// "llegó Wiwi" y como lo escriba Whisper: oui oui, wi wi, ui ui, güigüi...
const WIWI = arrival('wi ?wi|wiwis|oui ?oui|ui ?ui|gui ?gui|wee ?wee|hui ?hui|whi ?whi|wui ?wui|uiui|wewe|we we');

const SHORTCUTS: Array<{ match: RegExp; shortcut: Shortcut }> = [
    {
        match: YORYI,
        shortcut: {
            say: ':goat: ¡Llegó la cabra de las cabras de la economía! {mention}',
            mentionName: 'Coco',
            play: 'pon Daga Adicta de Luigi 21 Plus',
        },
    },
    {
        match: WIWI,
        shortcut: {
            say: ':goat: ¡Llegó Wiwi, el GOAT de la ingeniería mecánica, top 2 en Saber Pro Colombia y casi médico!',
            play: 'pon Manifiéstate de Dani y Magneto',
        },
    },
];

/** Atajo que corresponde a la orden (lo que se dijo después de "ey alfonso"), o null. */
export function matchShortcut(command: string): Shortcut | null {
    const n = normalize(command);
    return SHORTCUTS.find(s => s.match.test(n))?.shortcut ?? null;
}
