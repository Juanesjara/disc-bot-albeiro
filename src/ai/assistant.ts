import { Message } from 'discord.js';
import { BotClient } from '../types';
import { config } from '../config/config';
import { quizGuilds } from '../quiz/MusicQuiz';
import { logSendError } from '../utils/safeSend';
import { hasCommaCompound, normalizePhrase, parseIntent } from './intents';

// DeepSeek con API compatible con OpenAI: se llama con fetch, sin SDK
const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';
const TIMEOUT_MS = 20_000;
// Tope de vueltas modelo → herramientas por mención, para que una frase rara no se convierta en un bucle
const MAX_TURNS = 4;

const CAPABILITIES = 'poner canciones, saltar, parar, pausar, reanudar, ver la cola, ver qué suena, '
    + 'cambiar el volumen, quitar de la cola, limpiar la cola, loop, shuffle y quiz con una playlist de Spotify';
// Por voz no se maneja el quiz (no se puede dictar la URL de la playlist)
const VOICE_CAPABILITIES = 'poner canciones, saltar, parar, pausar, reanudar, ver la cola, ver qué suena, '
    + 'cambiar el volumen, quitar de la cola, limpiar la cola, loop y shuffle';

const SYSTEM_PROMPT = `Eres el bot de música de un servidor de Discord. Los usuarios te mencionan con frases en español \
para que hagas acciones. Tu único trabajo es traducir la frase a llamadas de herramientas.

Reglas:
- Si la frase pide una o varias acciones, llama a las herramientas en el orden pedido. No escribas texto: \
cada herramienta ya publica su propio mensaje en el canal.
- Si a una acción le falta un dato obligatorio (qué canción poner, la URL de la playlist o el número de canciones \
del quiz, el nivel de volumen, la posición a quitar), no llames ninguna herramienta y pide ese dato en una sola línea.
- Si la frase no tiene que ver con estas acciones (charla, chistes, preguntas generales), no llames herramientas y \
responde en una sola línea que solo sabes: ${CAPABILITIES}.
- Nunca inventes URLs ni números que el usuario no dio.
- Responde siempre en español, en una sola línea, sin markdown.`;

// Cada herramienta mapea a un comando existente: se ejecuta ese comando con el mensaje original,
// así la validación, la lógica y los mensajes al canal son exactamente los de su versión con prefijo.
interface ToolDef {
    name: string;
    description: string;
    parameters: Record<string, any>;
    toArgs: (input: any) => string[];
}

const noInput = { type: 'object', properties: {} };

// Herramienta sin parámetros: el nombre coincide con el del comando
const simple = (name: string, description: string): ToolDef => ({
    name, description, parameters: noInput, toArgs: () => [],
});

const TOOLS: ToolDef[] = [
    {
        name: 'play',
        description: 'Busca y reproduce una canción (o la añade a la cola). Acepta nombre + artista o una URL.',
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Nombre y artista de la canción, o URL' } },
            required: ['query'],
        },
        toArgs: (i) => String(i.query ?? '').trim().split(/ +/g).filter(Boolean),
    },
    simple('skip', 'Salta la canción que está sonando.'),
    simple('stop', 'Detiene la música, vacía la cola y desconecta al bot.'),
    simple('pause', 'Pausa la canción actual.'),
    simple('resume', 'Reanuda la canción pausada.'),
    {
        name: 'queue',
        description: 'Muestra la cola de reproducción.',
        parameters: {
            type: 'object',
            properties: { page: { type: 'integer', description: 'Página de la cola (por defecto 1)' } },
        },
        toArgs: (i) => (i.page ? [String(i.page)] : []),
    },
    simple('nowplaying', 'Muestra qué canción está sonando.'),
    {
        name: 'volume',
        description: 'Cambia el volumen.',
        parameters: {
            type: 'object',
            properties: { level: { type: 'integer', description: 'Volumen de 1 a 100' } },
            required: ['level'],
        },
        toArgs: (i) => [String(i.level)],
    },
    {
        name: 'remove',
        description: 'Quita una canción de la cola por su posición (1 = la siguiente en sonar).',
        parameters: {
            type: 'object',
            properties: { position: { type: 'integer', description: 'Posición en la cola, empezando en 1' } },
            required: ['position'],
        },
        toArgs: (i) => [String(i.position)],
    },
    simple('clear', 'Vacía la cola sin detener la canción actual.'),
    {
        name: 'loop',
        description: 'Cambia el modo de repetición. Sin modo, informa el modo actual.',
        parameters: {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    enum: ['off', 'track', 'queue'],
                    description: 'off = sin repetir, track = repetir la canción, queue = repetir la cola',
                },
            },
        },
        toArgs: (i) => (i.mode ? [i.mode] : []),
    },
    simple('shuffle', 'Mezcla la cola en orden aleatorio.'),
    {
        name: 'quiz',
        description: 'Inicia un quiz musical con una playlist pública de Spotify. Requiere la URL y el número de canciones.',
        parameters: {
            type: 'object',
            properties: {
                playlist_url: { type: 'string', description: 'URL de la playlist de Spotify, tal como la escribió el usuario' },
                song_count: { type: 'integer', description: 'Número de canciones, de 1 a 30' },
                mode: {
                    type: 'string',
                    enum: ['artist', 'title', 'both'],
                    description: 'Qué hay que adivinar. Por defecto both.',
                },
            },
            required: ['playlist_url', 'song_count'],
        },
        toArgs: (i) => [String(i.playlist_url), String(i.song_count), ...(i.mode ? [i.mode] : [])],
    },
];

const TOOLS_BY_NAME = new Map(TOOLS.map(t => [t.name, t]));
const toApiTools = (tools: ToolDef[]) => tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
}));
const API_TOOLS = toApiTools(TOOLS);
const VOICE_API_TOOLS = toApiTools(TOOLS.filter(t => t.name !== 'quiz'));

/** Opciones de interpretText: `voice` = la orden llegó hablada por Alfonso. */
export interface InterpretOptions {
    voice?: boolean;
}

// Solo cuenta la mención escrita explícitamente (<@id> o <@!id>), no las respuestas a mensajes del bot
export function mentionRegex(botId: string): RegExp {
    return new RegExp(`<@!?${botId}>`, 'g');
}

function quizWarning(): string {
    return `:warning: Hay un quiz activo. Durante el quiz no puedo tocar la música; usa \`${config.prefix}stop\` para terminarlo o \`${config.prefix}vskip\` para votar saltar.`;
}

// El texto de la IA nunca debe poder mencionar a @everyone, roles ni usuarios
function sendPlain(message: Message, content: string) {
    return message.channel.send({ content: content.slice(0, 2000), allowedMentions: { parse: [] } });
}

export async function handleMention(client: BotClient, message: Message): Promise<void> {
    const guildId = message.guild!.id;

    // Durante el quiz no se interpreta nada: así no hay forma de que se revele la canción ni se toque la cola
    if (quizGuilds.has(guildId)) {
        await message.channel.send(quizWarning());
        return;
    }

    const text = message.content.replace(mentionRegex(client.user!.id), '').replace(/\s+/g, ' ').trim();
    if (!text) {
        await message.channel.send(`Puedo ${CAPABILITIES}. Por ejemplo: "@${client.user!.username} pon Tusa de Karol G".`);
        return;
    }

    await interpretText(client, message, text);
}

/**
 * Entiende una frase ya sin la mención y ejecuta lo pedido: reglas primero, IA de respaldo.
 * La usan la mención y las órdenes habladas a Alfonso (con un Message mínimo, ver src/voice/voiceMessage.ts).
 */
export async function interpretText(client: BotClient, message: Message, text: string, opts: InterpretOptions = {}): Promise<void> {
    const capabilities = opts.voice ? VOICE_CAPABILITIES : CAPABILITIES;
    if (!text) {
        await message.channel.send(`Puedo ${capabilities}.`);
        return;
    }

    if (opts.voice && /\bquiz\b/.test(normalizePhrase(text))) {
        await message.channel.send(`:warning: El quiz no se maneja por voz: escríbelo con \`${config.prefix}quiz\`.`);
        return;
    }

    // 1) Reglas: las frases comunes se entienden gratis y al instante.
    // Hablando se encadenan órdenes con comas: eso lo resuelve la IA
    const intent = opts.voice && hasCommaCompound(text) ? null : parseIntent(text);
    if (intent && 'ask' in intent) {
        await message.channel.send(intent.ask);
        return;
    }
    if (intent && 'command' in intent) {
        console.log(`[IA] regla → ${intent.command} (autor=${message.author.tag})`);
        await runCommand(client, message, intent.command, intent.args);
        return;
    }

    // 2) Sin regla: decide la IA, si está configurada
    if (!config.deepseekApiKey) {
        await message.channel.send(`:warning: No entendí. Puedo ${capabilities}. Prueba con algo como "pon Tusa de Karol G" o usa \`${config.prefix}help\`.`);
        return;
    }
    await askModel(client, message, text, opts.voice ? VOICE_API_TOOLS : API_TOOLS);
}

async function askModel(client: BotClient, message: Message, text: string, tools: any[]): Promise<void> {
    // Solo el autor: nunca el texto del mensaje
    console.log(`[IA] modelo (autor=${message.author.tag})`);
    const messages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
    ];
    let usedTools = false;

    try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
            const reply = await callModel(messages, tools);
            const toolCalls: any[] = reply.tool_calls ?? [];

            if (!toolCalls.length) {
                // El texto propio de la IA solo se publica si no ejecutó nada (aclaraciones, pedir datos, fuera de alcance);
                // si ejecutó acciones, los comandos ya respondieron en el canal
                const content = String(reply.content ?? '').trim();
                if (!usedTools && content) await sendPlain(message, content);
                return;
            }

            messages.push({ role: 'assistant', content: reply.content ?? '', tool_calls: toolCalls });
            // En orden y de una en una: "pon X y sube el volumen" depende del orden
            for (const call of toolCalls) {
                const result = await runToolCall(client, message, call);
                usedTools = true;
                messages.push({ role: 'tool', tool_call_id: call.id, content: result });
            }
        }
        console.warn(`[IA] Se alcanzó el máximo de ${MAX_TURNS} vueltas (autor=${message.author.tag})`);
    } catch (err: any) {
        console.error('[IA] Error:', err?.message ?? err);
        // Si ya se ejecutó alguna acción, su comando ya respondió: un aviso de "no entendí" confundiría
        if (usedTools) return;
        const status = err?.status;
        const msg = status === 402 ? ':warning: Se acabó el saldo de la IA. Las frases simples y los comandos con `' + config.prefix + '` siguen funcionando.'
            : status === 401 ? ':warning: La IA no está bien configurada. Usa los comandos con `' + config.prefix + '`.'
            : status === 429 || status === 503 ? ':warning: La IA está saturada ahora mismo. Prueba en un rato o usa los comandos con `' + config.prefix + '`.'
            : ':warning: No pude entender eso ahora mismo. Prueba de nuevo o usa los comandos con `' + config.prefix + '`.';
        await message.channel.send(msg).catch(logSendError);
    }
}

async function callModel(messages: any[], tools: any[]): Promise<any> {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.deepseekApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: MODEL,
            messages,
            tools,
            tool_choice: 'auto',
            // Sin razonamiento: más rápido y barato, y basta para mapear una frase a comandos
            thinking: { type: 'disabled' },
            max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw Object.assign(new Error(`DeepSeek respondió ${res.status}: ${body.slice(0, 200)}`), { status: res.status });
    }
    const data: any = await res.json();
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error('Respuesta de DeepSeek sin mensaje');
    return message;
}

async function runToolCall(client: BotClient, message: Message, call: any): Promise<string> {
    const def = TOOLS_BY_NAME.get(call?.function?.name);
    if (!def) return `Error: herramienta desconocida ${call?.function?.name}`;

    // La API puede devolver argumentos que no son JSON válido: se trata como error de esa herramienta
    let input: any;
    try {
        input = JSON.parse(call.function.arguments || '{}');
    } catch {
        return 'Error: argumentos inválidos.';
    }
    return runCommand(client, message, def.name, def.toArgs(input ?? {}));
}

/** Ejecuta el comando con prefijo equivalente con el mensaje original. Devuelve el resultado para la IA. */
async function runCommand(client: BotClient, message: Message, name: string, args: string[]): Promise<string> {
    const command = client.commands.get(name);
    if (!command) return `Error: comando desconocido ${name}`;

    // Una acción anterior de esta misma mención pudo arrancar un quiz: a partir de ahí no se toca nada
    if (quizGuilds.has(message.guild!.id)) {
        return 'Error: hay un quiz activo; acción bloqueada.';
    }

    console.log(`[IA] → ${name}`);
    try {
        await command.execute(client, message, args);
        return 'Ejecutado. El comando ya publicó su resultado en el canal.';
    } catch (err) {
        console.error(`[IA] Error ejecutando ${name}:`, err);
        await message.channel.send(':warning: Ocurrió un error al ejecutar ese comando.').catch(logSendError);
        return 'Error: falló al ejecutarse.';
    }
}
