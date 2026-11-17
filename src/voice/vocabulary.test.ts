// Pruebas del vocabulario que se le pasa a Whisper. Se corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, isPromptEcho, remember, trackTerms } from './vocabulary';
import { extractWakeCommand } from './wakeword';

test('trackTerms limpia títulos de YouTube', () => {
    assert.deepEqual(trackTerms('Duki - Malbec (Video Oficial)', 'Duki'), ['Duki', 'Duki', 'Malbec']);
    assert.deepEqual(trackTerms('KAROL G - TUSA ft. Nicki Minaj [Official Video]', 'KarolGVEVO'), ['KarolG', 'KAROL G', 'TUSA']);
    assert.deepEqual(trackTerms('Feid - Normal | Lyrics', 'Feid - Topic'), ['Feid', 'Feid', 'Normal']);
});

test('remember pone lo nuevo primero, sin repetir y con tope', () => {
    const r = remember(['Duki', 'Feid'], ['Malbec', 'duki']);
    assert.deepEqual(r, ['Malbec', 'duki', 'Feid']);
    const many = Array.from({ length: 60 }, (_, i) => `Artista ${i}`);
    assert.equal(remember([], many).length, 40);
});

test('buildPrompt: lista con Alfonso dentro, lo reciente primero y con tope', () => {
    const p = buildPrompt(['Malbec', 'Duki']);
    assert.ok(p.startsWith('Malbec, Alfonso, Duki'));
    assert.ok(p.length <= 600);
    assert.equal(p.split(', ').filter(n => n === 'Duki').length, 1);
    assert.ok(buildPrompt([]).includes('Alfonso'));
});

test('si Whisper repite la pista no se convierte en orden', () => {
    const p = buildPrompt(['Malbec', 'Duki']);
    assert.equal(extractWakeCommand(p), null);
    assert.equal(isPromptEcho(p, p), true);
    assert.equal(isPromptEcho('Malbec, Alfonso, Duki.', p), true);
    assert.equal(isPromptEcho('Ey Alfonso, pon Malbec de Duki.', p), false);
    assert.equal(isPromptEcho('', p), false);
});
