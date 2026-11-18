// Pruebas de los topes diarios de audio. Se corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DailyQuota } from './quota';

const MIN = 60_000;

test('tope por persona y tope global', () => {
    const q = new DailyQuota(2 * MIN, 3 * MIN, () => Date.UTC(2026, 10, 16, 15));
    assert.equal(q.check('a'), 'ok');
    q.add('a', 2 * MIN);
    assert.equal(q.check('a'), 'user');
    assert.equal(q.check('b'), 'ok');
    q.add('b', 1 * MIN);
    assert.equal(q.check('b'), 'global');
});

test('si se pasan los dos topes gana el de la persona', () => {
    const q = new DailyQuota(1 * MIN, 1 * MIN, () => Date.UTC(2026, 10, 16, 15));
    q.add('a', 1 * MIN);
    assert.equal(q.check('a'), 'user');
    assert.equal(q.check('b'), 'global');
});

test('se reinicia al cambiar el día en Colombia (UTC-5)', () => {
    let now = Date.UTC(2026, 10, 17, 4, 59); // 23:59 del 16 en Bogotá
    const q = new DailyQuota(1 * MIN, 10 * MIN, () => now);
    q.add('a', 1 * MIN);
    assert.equal(q.check('a'), 'user');
    now = Date.UTC(2026, 10, 17, 5, 1); // 00:01 del 17 en Bogotá
    assert.equal(q.check('a'), 'ok');
});

test('avisa una sola vez por día y tope', () => {
    let now = Date.UTC(2026, 10, 16, 15);
    const q = new DailyQuota(1 * MIN, 1 * MIN, () => now);
    assert.equal(q.shouldNotify('user', 'a'), true);
    assert.equal(q.shouldNotify('user', 'a'), false);
    assert.equal(q.shouldNotify('user', 'b'), true);
    assert.equal(q.shouldNotify('global', 'a'), true);
    assert.equal(q.shouldNotify('global', 'b'), false);
    now = Date.UTC(2026, 10, 17, 15);
    assert.equal(q.shouldNotify('user', 'a'), true);
});
