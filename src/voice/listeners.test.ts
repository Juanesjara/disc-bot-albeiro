// Pruebas de quién aceptó que Alfonso lo escuche. Se corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyButton, buttonId, onVoiceLeave, parseButtonId, renderListeners, shouldProcessVoice, ListenSession,
} from './listeners';

const session = (): ListenSession => ({ id: 'g1-100', channelId: 'voz', accepted: new Set() });
const escuchar = { action: 'escuchar' as const, sessionId: 'g1-100' };
const dejar = { action: 'dejar' as const, sessionId: 'g1-100' };

test('parseButtonId', () => {
    assert.deepEqual(parseButtonId(buttonId('escuchar', 'g1-100')), escuchar);
    assert.deepEqual(parseButtonId('alfonso:dejar:g1-100'), dejar);
    assert.equal(parseButtonId('otro:escuchar:g1-100'), null);
    assert.equal(parseButtonId('alfonso:bailar:g1-100'), null);
    assert.equal(parseButtonId('alfonso:escuchar'), null);
    assert.equal(parseButtonId('alfonso:escuchar:g1-100:x'), null);
    assert.equal(parseButtonId(''), null);
});

test('botón de una entrada anterior o sin sesión no cambia nada', () => {
    const s = session();
    assert.equal(applyButton(undefined, escuchar, 'u', 'voz'), 'stale');
    assert.equal(applyButton(s, { action: 'escuchar', sessionId: 'g1-1' }, 'u', 'voz'), 'stale');
    assert.equal(s.accepted.size, 0);
});

test('Escúchame solo desde el canal de Alfonso', () => {
    const s = session();
    assert.equal(applyButton(s, escuchar, 'u', 'otro'), 'not-in-channel');
    assert.equal(applyButton(s, escuchar, 'u', null), 'not-in-channel');
    assert.equal(s.accepted.size, 0);
    assert.equal(applyButton(s, escuchar, 'u', 'voz'), 'added');
    assert.equal(applyButton(s, escuchar, 'u', 'voz'), 'already');
});

test('Ya no', () => {
    const s = session();
    assert.equal(applyButton(s, dejar, 'u', 'voz'), 'not-listed');
    applyButton(s, escuchar, 'u', 'voz');
    assert.equal(applyButton(s, dejar, 'u', null), 'removed');
    assert.equal(s.accepted.has('u'), false);
});

test('shouldProcessVoice', () => {
    const s = session();
    assert.equal(shouldProcessVoice(s, 'u', 'voz', false), false);
    applyButton(s, escuchar, 'u', 'voz');
    assert.equal(shouldProcessVoice(s, 'u', 'voz', false), true);
    assert.equal(shouldProcessVoice(s, 'u', 'otro', false), false);
    assert.equal(shouldProcessVoice(s, 'u', 'voz', true), false);
    assert.equal(shouldProcessVoice({ ...session(), id: 'g1-200' }, 'u', 'voz', false), false);
    assert.equal(shouldProcessVoice(undefined, 'u', 'voz', false), false);
    applyButton(s, dejar, 'u', 'voz');
    assert.equal(shouldProcessVoice(s, 'u', 'voz', false), false);
});

test('quien sale del canal deja de estar apuntado', () => {
    const s = session();
    applyButton(s, escuchar, 'u', 'voz');
    applyButton(s, escuchar, 'v', 'voz');
    assert.equal(onVoiceLeave(s, 'u', null), true);
    assert.equal(onVoiceLeave(s, 'v', 'voz'), false);
    assert.deepEqual([...s.accepted], ['v']);
    assert.equal(onVoiceLeave(s, 'w', 'otro'), false);
});

test('renderListeners', () => {
    assert.match(renderListeners([]), /nadie/);
    assert.equal(renderListeners(new Set(['1', '2'])), 'Escuchando a: <@1>, <@2>');
});
