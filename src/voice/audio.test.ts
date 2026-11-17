// Pruebas de la conversión de audio. Se corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMono16k, toWav, durationMs } from './audio';

/** PCM estéreo de 16 bits a partir de pares [izquierda, derecha]. */
function stereo(...frames: Array<[number, number]>): Buffer {
    const b = Buffer.alloc(frames.length * 4);
    frames.forEach(([l, r], i) => { b.writeInt16LE(l, i * 4); b.writeInt16LE(r, i * 4 + 2); });
    return b;
}

test('3 muestras estéreo de 48 kHz → 1 muestra mono de 16 kHz con el promedio', () => {
    const out = toMono16k(stereo([100, 200], [300, 400], [500, 600], [0, 0], [0, 0], [-600, 0]));
    assert.equal(out.length, 4);
    assert.equal(out.readInt16LE(0), 350);
    assert.equal(out.readInt16LE(2), -100);
});

test('descarta las muestras que no completan un grupo', () => {
    assert.equal(toMono16k(stereo([1, 1], [1, 1])).length, 0);
});

test('cabecera WAV mono 16 kHz de 16 bits', () => {
    const pcm = Buffer.alloc(32000); // 1 s
    const wav = toWav(pcm);
    assert.equal(wav.length, 44 + 32000);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(4), 36 + 32000);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 16000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), 32000);
    assert.equal(durationMs(pcm), 1000);
});
