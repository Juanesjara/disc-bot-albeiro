// Conversión del audio de Discord (PCM 48 kHz estéreo, 16 bits) al WAV que se manda a transcribir.

export const WAV_RATE = 16000;

/** 48 kHz estéreo → 16 kHz mono: promedia los dos canales y cada grupo de 3 muestras. */
export function toMono16k(pcm: Buffer): Buffer {
    const frames = Math.floor(pcm.length / 4);
    const outFrames = Math.floor(frames / 3);
    const out = Buffer.alloc(outFrames * 2);
    for (let o = 0; o < outFrames; o++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) {
            const i = (o * 3 + k) * 4;
            sum += pcm.readInt16LE(i) + pcm.readInt16LE(i + 2);
        }
        out.writeInt16LE(Math.round(sum / 6), o * 2);
    }
    return out;
}

/** Duración en milisegundos de PCM mono 16 kHz de 16 bits. */
export function durationMs(pcm16k: Buffer): number {
    return Math.round((pcm16k.length / 2 / WAV_RATE) * 1000);
}

/** Antepone la cabecera WAV (44 bytes) a PCM mono 16 kHz de 16 bits. */
export function toWav(pcm16k: Buffer): Buffer {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0);
    h.writeUInt32LE(36 + pcm16k.length, 4);
    h.write('WAVE', 8);
    h.write('fmt ', 12);
    h.writeUInt32LE(16, 16);          // tamaño del bloque fmt
    h.writeUInt16LE(1, 20);           // PCM
    h.writeUInt16LE(1, 22);           // mono
    h.writeUInt32LE(WAV_RATE, 24);
    h.writeUInt32LE(WAV_RATE * 2, 28); // bytes por segundo
    h.writeUInt16LE(2, 32);           // bytes por muestra
    h.writeUInt16LE(16, 34);          // bits por muestra
    h.write('data', 36);
    h.writeUInt32LE(pcm16k.length, 40);
    return Buffer.concat([h, pcm16k]);
}
