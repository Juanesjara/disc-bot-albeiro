// Pruebas de la detección de "ey alfonso". Se corren con `npm test`.
// Viven en src/voice/ (no en commands/events/player) para que el loader del bot no las cargue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWakeCommand } from './wakeword';

test('frases del spec que sí son orden', () => {
    assert.equal(extractWakeCommand('ey alfonso pon tusa de karol g'), 'pon tusa de karol g');
    assert.equal(extractWakeCommand('Alfonso, salta'), 'salta');
    assert.equal(extractWakeCommand('oye al fonso pausa'), 'pausa');
    assert.equal(extractWakeCommand('ey alfonzo volumen 30'), 'volumen 30');
});

test('frases del spec que no son orden', () => {
    assert.equal(extractWakeCommand('le dije a alfonso que pusiera algo'), null);
    assert.equal(extractWakeCommand('Alonso pon tusa'), null);
    assert.equal(extractWakeCommand('pon tusa'), null);
    assert.equal(extractWakeCommand('Alberto salta'), null);
    assert.equal(extractWakeCommand(''), null);
});

test('conserva mayúsculas y tildes de la orden', () => {
    assert.equal(extractWakeCommand('Alfonso, pon Tusa de Karol G'), 'pon Tusa de Karol G');
    assert.equal(extractWakeCommand('Ey Alfonso, pon Canción Bonita.'), 'pon Canción Bonita');
});

test('así lo escribe Whisper (casos del spike)', () => {
    assert.equal(extractWakeCommand('Ey Alfonso, salta.'), 'salta');
    assert.equal(extractWakeCommand('Ey, Alfonso, salta, ¿no?'), 'salta, ¿no');
    assert.equal(extractWakeCommand('Y Alfonso Salta.'), 'Salta');
    assert.equal(extractWakeCommand('¡Ey, Alfonso! salta'), 'salta');
    assert.equal(extractWakeCommand('Ey Alfonso. Pon Tusa.'), 'Pon Tusa');
});

test('habla continua: usa la primera oración que empieza por la palabra clave', () => {
    assert.equal(
        extractWakeCommand('Ok. Ey, Alfonso, salta. What? Pero es que hice eso. Ey, Alfonso, pausa.'),
        'salta',
    );
});

test('en mitad de la oración cuenta solo con "ey"/"oye" delante', () => {
    assert.equal(extractWakeCommand('Y se quedó probando pues, Ey Alfonso Salta.'), 'Salta');
    assert.equal(extractWakeCommand('Bueno, oye alfonso, pausa'), 'pausa');
    assert.equal(extractWakeCommand('jaja ey alfonso pon Malbec de Duki'), 'pon Malbec de Duki');
    assert.equal(extractWakeCommand('fui con Pedro y Alfonso al parque'), null);
    assert.equal(extractWakeCommand('le dije a alfonso que pusiera algo'), null);
    assert.equal(extractWakeCommand('el rey alfonso salta'), null);
});

test('nombre al final de la oración, después de una coma', () => {
    assert.equal(extractWakeCommand('salta esa, Alfonso'), 'salta esa');
    assert.equal(extractWakeCommand('Hey, cambia esa por otra, la Duki más famosa, Alfonso'), 'cambia esa por otra, la Duki más famosa');
    assert.equal(extractWakeCommand('pon Tusa de Karol G, ey alfonso.'), 'pon Tusa de Karol G');
    assert.equal(extractWakeCommand('fui con Pedro y Alfonso'), null);
    assert.equal(extractWakeCommand('Perro, Alfonso, esos son inútiles, weón'), null);
});

test('solo la palabra clave devuelve vacío', () => {
    assert.equal(extractWakeCommand('alfonso'), '');
    assert.equal(extractWakeCommand('Ey, Alfonso.'), '');
});

test('alucinaciones típicas de Whisper no son orden', () => {
    assert.equal(extractWakeCommand('Gracias.'), null);
    assert.equal(extractWakeCommand('Gracias por ver el video.'), null);
    assert.equal(extractWakeCommand('¿Eh?'), null);
});
