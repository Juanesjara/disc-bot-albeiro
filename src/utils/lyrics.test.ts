// Pruebas de la limpieza de títulos y del troceado de letras. Se corren con `npm test`.
// Viven en src/utils/ (no en commands/events/player) para que el loader del bot no las cargue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackTitle, splitLyrics, DISCORD_MAX } from './lyrics';

test('título "Artista - Canción" con etiquetas entre paréntesis', () => {
    assert.deepEqual(parseTrackTitle('Karol G - TUSA (Official Video)'), { artist: 'Karol G', title: 'TUSA' });
    assert.deepEqual(parseTrackTitle('Bad Bunny - DtMF [Visualizer]'), { artist: 'Bad Bunny', title: 'DtMF' });
});

test('colaboraciones al final del título no entran en la búsqueda', () => {
    assert.deepEqual(parseTrackTitle('DUKI - Malbec x Bizarrap'), { artist: 'DUKI', title: 'Malbec' });
    assert.deepEqual(parseTrackTitle('Feid - Normal ft. Myke Towers'), { artist: 'Feid', title: 'Normal' });
});

test('separador || y número de sesión', () => {
    assert.deepEqual(
        parseTrackTitle('QUEVEDO || BZRP Music Sessions #52'),
        { artist: 'QUEVEDO', title: 'BZRP Music Sessions 52' },
    );
});

test('sin separador: el artista es el canal sin " - Topic"', () => {
    assert.deepEqual(parseTrackTitle('Despacito', 'Luis Fonsi - Topic'), { artist: 'Luis Fonsi', title: 'Despacito' });
    assert.deepEqual(parseTrackTitle('Hello (Official Music Video)', 'AdeleVEVO'), { artist: 'Adele', title: 'Hello' });
});

test('una letra corta queda en un solo mensaje', () => {
    assert.deepEqual(splitLyrics('linea 1\nlinea 2'), ['linea 1\nlinea 2']);
});

test('una letra larga se parte en mensajes de 2000 o menos, cortando en saltos de línea', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `verso número ${i} de la canción`);
    const chunks = splitLyrics(lines.join('\n'));
    assert.ok(chunks.length > 1);
    for (const c of chunks) assert.ok(c.length <= DISCORD_MAX, `trozo de ${c.length}`);
    // Ningún verso se partió: juntando los trozos con \n vuelve el texto original
    assert.equal(chunks.join('\n'), lines.join('\n'));
});

test('una línea más larga que el límite se corta a la fuerza', () => {
    const chunks = splitLyrics('a'.repeat(4500), 2000);
    assert.deepEqual(chunks.map(c => c.length), [2000, 2000, 500]);
});
