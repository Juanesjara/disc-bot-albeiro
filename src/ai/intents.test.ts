// Pruebas de las reglas que entienden frases sin IA. Se corren con `npm test`.
// Viven en src/ai/ (no en commands/events/player) para que el loader del bot no las cargue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from './intents';

const cmd = (command: string, ...args: string[]) => ({ command, args });
const URL = 'https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF?si=abc123';

test('play: conserva el texto original para buscar', () => {
    assert.deepEqual(parseIntent('pone Tusa de Karol G'), cmd('play', 'Tusa', 'de', 'Karol', 'G'));
    assert.deepEqual(parseIntent('pon la canción Despacito'), cmd('play', 'Despacito'));
    assert.deepEqual(parseIntent('ponme Pepas de Farruko por favor'), cmd('play', 'Pepas', 'de', 'Farruko'));
    assert.deepEqual(parseIntent('reproduce https://youtu.be/abc'), cmd('play', 'https://youtu.be/abc'));
});

test('play sin canción concreta no se adivina', () => {
    assert.equal(parseIntent('pon algo'), null);
    assert.equal(parseIntent('ponme música'), null);
});

test('controles de reproducción', () => {
    assert.deepEqual(parseIntent('salta esta'), cmd('skip'));
    assert.deepEqual(parseIntent('siguiente'), cmd('skip'));
    assert.deepEqual(parseIntent('para la música'), cmd('stop'));
    assert.deepEqual(parseIntent('pausa'), cmd('pause'));
    assert.deepEqual(parseIntent('pon pausa'), cmd('pause'));
    assert.deepEqual(parseIntent('sigue'), cmd('resume'));
    assert.deepEqual(parseIntent('¿Qué está sonando?'), cmd('nowplaying'));
    assert.deepEqual(parseIntent('qué canción es esta'), cmd('nowplaying'));
    assert.deepEqual(parseIntent('muestra la cola'), cmd('queue'));
    assert.deepEqual(parseIntent('mezcla la cola'), cmd('shuffle'));
    assert.deepEqual(parseIntent('limpia la cola'), cmd('clear'));
    assert.deepEqual(parseIntent('repite esta'), cmd('loop', 'track'));
    assert.deepEqual(parseIntent('deja de repetir'), cmd('loop', 'off'));
});

test('letra de la canción que suena', () => {
    assert.deepEqual(parseIntent('pasame la letra la cancion'), cmd('lyrics'));
    assert.deepEqual(parseIntent('pásame la letra de la canción'), cmd('lyrics'));
    assert.deepEqual(parseIntent('la letra de la canción'), cmd('lyrics'));
    assert.deepEqual(parseIntent('¿cuál es la letra de esta?'), cmd('lyrics'));
    assert.deepEqual(parseIntent('letra'), cmd('lyrics'));
});

test('volumen y quitar de la cola necesitan número', () => {
    assert.deepEqual(parseIntent('volumen 30'), cmd('volume', '30'));
    assert.deepEqual(parseIntent('baja el volumen a 20%'), cmd('volume', '20'));
    assert.equal(parseIntent('sube el volumen'), null);
    assert.deepEqual(parseIntent('quita la 3 de la cola'), cmd('remove', '3'));
});

test('quiz: URL, número y modo', () => {
    assert.deepEqual(parseIntent(`haz un quiz de 10 canciones con esta playlist ${URL}`), cmd('quiz', URL, '10'));
    assert.deepEqual(parseIntent(`quiz ${URL} 5 de artistas`), cmd('quiz', URL, '5', 'artist'));
    // Los dígitos de la URL no cuentan como número de canciones
    assert.ok('ask' in parseIntent(`haz un quiz con ${URL}`)!);
    assert.ok('ask' in parseIntent('haz un quiz de reggaeton')!);
});

test('frases compuestas o desconocidas van a la IA', () => {
    assert.equal(parseIntent('pon Tusa y baja el volumen a 30'), null);
    assert.equal(parseIntent('cuéntame un chiste'), null);
    assert.equal(parseIntent(''), null);
});

test('una canción con "y" en el nombre sigue siendo play', () => {
    assert.deepEqual(parseIntent('pon Rosa y Azul'), cmd('play', 'Rosa', 'y', 'Azul'));
});
