import Anthropic from '@anthropic-ai/sdk';
import { Message } from 'discord.js';
import { BotClient } from '../types';
import { config } from '../config/config';
import { quizGuilds } from '../quiz/MusicQuiz';

const MODEL = 'claude-haiku-4-5';
// Tope de vueltas modelo → herramientas por mención, para que una frase rara no se convierta en un bucle
const MAX_TURNS = 4;

const CAPABILITIES = 'poner canciones, saltar, parar, pausar, reanudar, ver la cola, ver qué suena, '
    + 'cambiar el volumen, quitar de la cola, limpiar la cola, loop, shuffle y quiz con una playlist de Spotify';

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
    tool: Anthropic.Tool;
    command: string;
    toArgs: (input: any) => string[];
}

const noInput: Anthropic.Tool['input_schema'] = { type: 'object', properties: {} };

// Herramienta sin parámetros: el nombre coincide con el del comando
const simple = (name: string, description: string): ToolDef => ({
    command: name,
    tool: { name, description, input_schema: noInput },
    toArgs: () => [],
});

const TOOLS: ToolDef[] = [
    {
        command: 'play',
        tool: {
            name: 'play',
            description: 'Busca y reproduce una canción (o la añade a la cola). Acepta nombre + artista o una URL.',
            input_schema: {
                type: 'object',
                properties: { query: { type: 'string', description: 'Nombre y artista de la canción, o URL' } },
                required: ['query'],
            },
        },
        toArgs: (i) => String(i.query ?? '').trim().split(/ +/g).filter(Boolean),
    },
    simple('skip', 'Salta la canción que está sonando.'),
    simple('stop', 'Detiene la música, vacía la cola y desconecta al bot.'),
    simple('pause', 'Pausa la canción actual.'),
    simple('resume', 'Reanuda la canción pausada.'),
    {
        command: 'queue',
        tool: {
            name: 'queue',
            description: 'Muestra la cola de reproducción.',
            input_schema: {
                type: 'object',
                properties: { page: { type: 'integer', description: 'Página de la cola (por defecto 1)' } },
            },
        },
        toArgs: (i) => (i.page ? [String(i.page)] : []),
    },
    simple('nowplaying', 'Muestra qué canción está sonando.'),
    {
        command: 'volume',
        tool: {
            name: 'volume',
            description: 'Cambia el volumen.',
            input_schema: {
                type: 'object',
                properties: { level: { type: 'integer', description: 'Volumen de 1 a 100' } },
                required: ['level'],
            },
        },
        toArgs: (i) => [String(i.level)],
    },
    {
        command: 'remove',
        tool: {
            name: 'remove',
            description: 'Quita una canción de la cola por su posición (1 = la siguiente en sonar).',
            input_schema: {
                type: 'object',
                properties: { position: { type: 'integer', description: 'Posición en la cola, empezando en 1' } },
                required: ['position'],
            },
        },
        toArgs: (i) => [String(i.position)],
    },
    simple('clear', 'Vacía la cola sin detener la canción actual.'),
    {
        command: 'loop',
        tool: {
            name: 'loop',
            description: 'Cambia el modo de repetición. Sin modo, informa el modo actual.',
            input_schema: {
                type: 'object',
                properties: {
                    mode: {
                        type: 'string',
                        enum: ['off', 'track', 'queue'],
                        description: 'off = sin repetir, track = repetir la canción, queue = repetir la cola',
                    },
                },
            },
        },
        toArgs: (i) => (i.mode ? [i.mode] : []),
    },
    simple('shuffle', 'Mezcla la cola en orden aleatorio.'),
    {
        command: 'quiz',
        tool: {
            name: 'quiz',
            description: 'Inicia un quiz musical con una playlist pública de Spotify. Requiere la URL y el número de canciones.',
            input_schema: {
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
        },
        toArgs: (i) => [String(i.playlist_url), String(i.song_count), ...(i.mode ? [i.mode] : [])],
    },
];

const TOOLS_BY_NAME = new Map(TOOLS.map(t => [t.tool.name, t]));

let anthropic: Anthropic | null = null;
function getClient(): Anthropic | null {
    if (!config.anthropicApiKey) return null;
    if (!anthropic) anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    return anthropic;
}

// Solo cuenta la mención escrita explícitamente (<@id> o <@!id>), no las respuestas a mensajes del bot
export function mentionRegex(botId: string): RegExp {
    return new RegExp(`<@!?${botId}>`, 'g');
}

function quizWarning(): string {
    return `:warning: Hay un quiz activo. Durante el quiz no puedo tocar la música; usa \`${config.prefix}stop\` para terminarlo o \`${config.prefix}vskip\` para votar saltar.`;
}

export async function handleMention(client: BotClient, message: Message): Promise<void> {
    const guildId = message.guild!.id;

    // Durante el quiz no se llama a la IA: así no hay forma de que revele la canción ni toque la cola
    if (quizGuilds.has(guildId)) {
        await message.channel.send(quizWarning());
        return;
    }

    const text = message.content.replace(mentionRegex(client.user!.id), '').replace(/\s+/g, ' ').trim();
    if (!text) {
        await message.channel.send(`Puedo ${CAPABILITIES}. Por ejemplo: "@${client.user!.username} pon Tusa de Karol G".`);
        return;
    }

    const ai = getClient();
    if (!ai) {
        await message.channel.send(`:warning: La IA no está configurada. Usa los comandos con \`${config.prefix}\` (\`${config.prefix}help\`).`);
        return;
    }

    console.log(`[IA] ${message.author.tag}: "${text}"`);
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: text }];
    let usedTools = false;

    try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
            const response = await ai.messages.create({
                model: MODEL,
                max_tokens: 1024,
                system: SYSTEM_PROMPT,
                tools: TOOLS.map(t => t.tool),
                messages,
            });

            const toolUses = response.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
            );

            if (response.stop_reason !== 'tool_use' || !toolUses.length) {
                // El texto propio de la IA solo se publica si no ejecutó nada (aclaraciones, pedir datos, fuera de alcance);
                // si ejecutó acciones, los comandos ya respondieron en el canal
                const reply = response.content
                    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                    .map(b => b.text).join(' ').trim();
                if (!usedTools && reply) await message.channel.send(reply.slice(0, 2000));
                return;
            }

            messages.push({ role: 'assistant', content: response.content });
            const results: Anthropic.ToolResultBlockParam[] = [];
            // En orden y de una en una: "pon X y sube el volumen" depende del orden
            for (const use of toolUses) {
                results.push(await runTool(client, message, use));
                usedTools = true;
            }
            messages.push({ role: 'user', content: results });
        }
        console.warn(`[IA] Se alcanzó el máximo de ${MAX_TURNS} vueltas para: "${text}"`);
    } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
            console.error('[IA] Límite de la API alcanzado:', err.message);
            await message.channel.send(':warning: La IA está saturada ahora mismo. Prueba en un rato o usa los comandos con `' + config.prefix + '`.');
        } else if (err instanceof Anthropic.AuthenticationError) {
            console.error('[IA] Clave de Anthropic inválida:', err.message);
            await message.channel.send(':warning: La IA no está bien configurada. Usa los comandos con `' + config.prefix + '`.');
        } else {
            console.error('[IA] Error:', (err as any)?.message ?? err);
            await message.channel.send(':warning: No pude entender eso ahora mismo. Prueba de nuevo o usa los comandos con `' + config.prefix + '`.');
        }
    }
}

async function runTool(client: BotClient, message: Message, use: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
    const def = TOOLS_BY_NAME.get(use.name);
    const command = def && client.commands.get(def.command);
    if (!def || !command) {
        return { type: 'tool_result', tool_use_id: use.id, content: `Herramienta desconocida: ${use.name}`, is_error: true };
    }

    // Una acción anterior de esta misma mención pudo arrancar un quiz: a partir de ahí no se toca nada
    if (quizGuilds.has(message.guild!.id)) {
        return { type: 'tool_result', tool_use_id: use.id, content: 'Hay un quiz activo; acción bloqueada.', is_error: true };
    }

    const args = def.toArgs(use.input ?? {});
    console.log(`[IA] → ${def.command} ${args.join(' ')}`);
    try {
        await command.execute(client, message, args);
        return { type: 'tool_result', tool_use_id: use.id, content: 'Ejecutado. El comando ya publicó su resultado en el canal.' };
    } catch (err) {
        console.error(`[IA] Error ejecutando ${def.command}:`, err);
        await message.channel.send(':warning: Ocurrió un error al ejecutar ese comando.');
        return { type: 'tool_result', tool_use_id: use.id, content: 'Falló al ejecutarse.', is_error: true };
    }
}
