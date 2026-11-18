// Voz a texto con Whisper en Groq (API compatible con OpenAI): se llama con fetch, sin SDK.

const API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
const TIMEOUT_MS = 10_000;

/** Groq factura mínimo 10 s por petición: es lo que cuentan los topes diarios. */
export const MIN_BILLED_MS = 10_000;

/**
 * `prompt` es solo vocabulario (ver src/voice/vocabulary.ts). En el spike, un prompt con una orden
 * completa ("Ey Alfonso, pon Tusa...") se devolvía tal cual con audio corto y habría disparado órdenes falsas.
 */
export async function transcribe(wav: Buffer, apiKey: string, prompt: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'frase.wav');
    form.append('model', MODEL);
    form.append('language', 'es');
    form.append('temperature', '0');
    form.append('prompt', prompt);
    form.append('response_format', 'json');

    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw Object.assign(new Error(`Groq respondió ${res.status}: ${body.slice(0, 200)}`), { status: res.status });
    }
    const data: any = await res.json();
    return String(data?.text ?? '').trim();
}
