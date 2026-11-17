// Pruebas de las reglas de respuesta del quiz (R2, R3, R6). Se corren con `npm test`.
// Viven en src/quiz/ (no en commands/events/player) para que el loader del bot no las cargue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, matchesAnswer, isBlankAnswer, buildScoreboard } from './answers';

test('palabra completa: "yo" no acierta con "yoyo"', () => {
    assert.equal(matchesAnswer('yoyo', 'Yo'), false);
    assert.equal(matchesAnswer('yoyo yoyo', 'Yo'), false);
});

test('palabra completa: "yo" acierta dentro de una frase', () => {
    assert.equal(matchesAnswer('creo que es yo', 'Yo'), true);
    assert.equal(matchesAnswer('yo', 'Yo'), true);
    assert.equal(matchesAnswer('yo creo', 'Yo'), true);
});

test('títulos de varias palabras deben aparecer completos y contiguos', () => {
    assert.equal(matchesAnswer('es despacito de luis fonsi', 'Despacito'), true);
    assert.equal(matchesAnswer('la bicicleta', 'La Bicicleta'), true);
    assert.equal(matchesAnswer('bicicleta', 'La Bicicleta'), false);
    assert.equal(matchesAnswer('la gran bicicleta', 'La Bicicleta'), false);
});

test('ignora mayúsculas y tildes', () => {
    assert.equal(matchesAnswer('CANCION', 'Canción'), true);
    assert.equal(matchesAnswer('camilo', 'Camilo'), true);
    assert.equal(matchesAnswer('el nino', 'El Niño'), true);
    assert.equal(matchesAnswer('pinguinos', 'Pingüinos'), true);
    assert.equal(matchesAnswer('Canción', 'cancion'), true);
});

test('ignora comillas (Héctor "El Father")', () => {
    assert.equal(matchesAnswer('hector el father', 'Héctor "El Father"'), true);
    assert.equal(matchesAnswer('Héctor “El Father”', 'Hector El Father'), true);
    assert.equal(matchesAnswer('dont stop me now', "Don't Stop Me Now"), true);
});

test('& equivale a "y"', () => {
    assert.equal(matchesAnswer('simon y garfunkel', 'Simon & Garfunkel'), true);
    assert.equal(matchesAnswer('simon & garfunkel', 'Simon y Garfunkel'), true);
    assert.equal(matchesAnswer('simon&garfunkel', 'Simon & Garfunkel'), true);
});

test('ignora signos de puntuación alrededor de la respuesta', () => {
    assert.equal(matchesAnswer('tusa!', 'Tusa'), true);
    assert.equal(matchesAnswer('¿es tusa?', 'Tusa'), true);
    assert.equal(matchesAnswer('karol g, tusa.', 'TUSA'), true);
    assert.equal(matchesAnswer('ac/dc', 'AC/DC'), true);
});

test('título vacío tras normalizar: nadie lo acierta', () => {
    assert.equal(isBlankAnswer(''), true);
    assert.equal(isBlankAnswer('   '), true);
    assert.equal(isBlankAnswer('"..."'), true);
    assert.equal(isBlankAnswer('Tusa'), false);
    assert.equal(matchesAnswer('cualquier cosa', ''), false);
    assert.equal(matchesAnswer('', ''), false);
    assert.equal(matchesAnswer('...', '"..."'), false);
    assert.equal(matchesAnswer('   ', '   '), false);
});

test('mensaje vacío no acierta', () => {
    assert.equal(matchesAnswer('', 'Tusa'), false);
    assert.equal(matchesAnswer('!!!', 'Tusa'), false);
});

test('normalizeAnswer colapsa espacios y quita tildes', () => {
    assert.equal(normalizeAnswer('  Héctor   "El  Father"  '), 'hector el father');
    assert.equal(normalizeAnswer('Rock & Roll'), 'rock y roll');
    assert.equal(normalizeAnswer('Mañana'), 'manana');
});

test('marcador: incluye a quien puntuó aunque ya no esté en el canal de voz', () => {
    const board = buildScoreboard(['a', 'b'], { b: 2, c: 5 });
    assert.deepEqual(board, [
        { id: 'c', score: 5 },
        { id: 'b', score: 2 },
        { id: 'a', score: 0 },
    ]);
});

test('marcador: quien no puntuó y se fue no aparece', () => {
    const board = buildScoreboard(['a'], { z: 0 });
    assert.deepEqual(board, [{ id: 'a', score: 0 }]);
});
