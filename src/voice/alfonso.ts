// Alfonso: segundo bot que escucha el canal de voz y le pasa las órdenes habladas al bot de música.
// Hace falta porque la conexión de voz de discord-player no puede recibir audio.
// Sus eventos se enganchan aquí y no en src/events/, que el loader conecta al Client principal.
import {
    ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Client, Events, GatewayIntentBits,
    Message, MessageFlags, TextBasedChannel, VoiceState,
} from 'discord.js';
import {
    EndBehaviorType, VoiceConnection, VoiceConnectionStatus, entersState, joinVoiceChannel,
} from '@discordjs/voice';
import prism from 'prism-media';
import { config } from '../config/config';
import { BotClient } from '../types';
import { logSendError } from '../utils/safeSend';
import { quizGuilds } from '../quiz/MusicQuiz';
import { interpretText, mentionRegex } from '../ai/assistant';
import { ListenSession, applyButton, buttonId, onVoiceLeave, parseButtonId, renderListeners, shouldProcessVoice } from './listeners';
import { extractWakeCommand } from './wakeword';
import { DailyQuota } from './quota';
import { durationMs, toMono16k, toWav } from './audio';
import { MIN_BILLED_MS, transcribe } from './transcribe';
import { buildPrompt, isPromptEcho, remember, trackTerms } from './vocabulary';
import { voiceMessage } from './voiceMessage';
import { Shortcut, matchShortcut } from './shortcuts';

// Silencio que cierra una frase y tope de duración (habla continua sin pausas)
const SILENCE_MS = 700;
const MAX_PHRASE_MS = 15_000;
// Ruidos cortos: Whisper los convierte en frases inventadas ("Gracias.", el prompt...)
const MIN_PHRASE_MS = 600;
// PCM que entrega el decodificador: 48 kHz, estéreo, 16 bits
const PCM_BYTES_PER_MS = 192;
// Fallos seguidos de transcripción antes de avisar en el canal
const FAILURES_BEFORE_NOTICE = 3;

interface Session extends ListenSession {
    guildId: string;
    connection: VoiceConnection;
    textChannel: TextBasedChannel;
    entryMessage: Message | null;
    /** Usuarios con una frase abierta (suscripción al audio en curso). */
    receiving: Set<string>;
    /** Las órdenes se ejecutan en el orden en que terminaron las frases. */
    chain: Promise<void>;
    failures: number;
}

const sessions = new Map<string, Session>();
// Artistas y canciones que han sonado en cada servidor: pista para que Whisper los escriba bien
const recentNames = new Map<string, string[]>();
const joining = new Set<string>();
let alfonsoClient: Client | null = null;
let mainClient: BotClient | null = null;
let quota: DailyQuota | null = null;

const noMentions = { parse: [] as [] };

function send(channel: TextBasedChannel, content: string) {
    return (channel as any).send({ content, allowedMentions: noMentions }).catch(logSendError);
}

function entryContent(session: Session, channelName: string): string {
    return [
        `:microphone2: Entré a **${channelName}**. Para darme órdenes di: *"ey alfonso, pon Sanka de Ryan Castro"*.`,
        'Solo escucho a quien toque **🎙️ Escúchame** (vale hasta que salga del canal). '
        + 'No guardo audio ni texto; la voz de quien acepte se envía a un servicio externo para transcribirla.',
        renderListeners(session.accepted),
    ].join('\n');
}

function entryButtons(sessionId: string) {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(buttonId('escuchar', sessionId)).setLabel('Escúchame').setEmoji('🎙️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(buttonId('dejar', sessionId)).setLabel('Ya no').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
    )];
}

function channelName(session: Session): string {
    return (alfonsoClient?.channels.cache.get(session.channelId) as any)?.name ?? 'el canal';
}

function refreshEntry(session: Session): void {
    session.entryMessage?.edit({ content: entryContent(session, channelName(session)), allowedMentions: noMentions }).catch(logSendError);
}

/** Canal de voz en el que está ahora un usuario, según Alfonso. */
function userVoiceChannel(guildId: string, userId: string): string | null {
    return alfonsoClient?.guilds.cache.get(guildId)?.voiceStates.cache.get(userId)?.channelId ?? null;
}

function isBot(guildId: string, userId: string): boolean {
    const guild = alfonsoClient?.guilds.cache.get(guildId);
    return !!(guild?.members.cache.get(userId)?.user.bot ?? alfonsoClient?.users.cache.get(userId)?.bot);
}

function tagOf(userId: string): string {
    return alfonsoClient?.users.cache.get(userId)?.tag ?? userId;
}

function canProcess(session: Session, userId: string): boolean {
    return sessions.get(session.guildId) === session
        && shouldProcessVoice(session, userId, userVoiceChannel(session.guildId, userId), isBot(session.guildId, userId));
}

// ---------- Entrar (mención a Alfonso) ----------

async function onMention(message: Message): Promise<void> {
    if (!message.guild || message.author.bot || !alfonsoClient?.user) return;
    if (message.content.startsWith(config.prefix)) return;
    if (!mentionRegex(alfonsoClient.user.id).test(message.content)) return;

    const guildId = message.guild.id;
    console.log(`[Alfonso] mención (autor=${message.author.tag})`);

    if (!config.alfonso?.groqApiKey) {
        await send(message.channel, ':warning: La voz no está configurada en este bot (falta `GROQ_API_KEY`). No puedo entrar.');
        return;
    }
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
        await send(message.channel, ':warning: Debes estar en un canal de voz.');
        return;
    }
    const current = sessions.get(guildId);
    if (current) {
        await send(message.channel, current.channelId === voiceChannel.id
            ? ':microphone2: Ya estoy aquí. Toca **🎙️ Escúchame** en mi mensaje de entrada y di *"ey alfonso, ..."*.'
            : `:warning: Ya estoy escuchando en **${channelName(current)}**.`);
        return;
    }
    if (joining.has(guildId)) return;
    joining.add(guildId);

    try {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId,
            adapterCreator: message.guild.voiceAdapterCreator,
            group: 'alfonso',
            selfDeaf: false,
            selfMute: true,
        });
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        } catch {
            connection.destroy();
            await send(message.channel, ':warning: No pude conectarme al canal de voz.');
            return;
        }

        const session: Session = {
            id: `${guildId}-${Date.now()}`,
            guildId,
            channelId: voiceChannel.id,
            accepted: new Set(),
            connection,
            textChannel: message.channel,
            entryMessage: null,
            receiving: new Set(),
            chain: Promise.resolve(),
            failures: 0,
        };
        sessions.set(guildId, session);
        watchConnection(session);
        listen(session);
        // Si quien lo llamó se fue mientras se conectaba, nadie va a salir del canal para avisarlo
        if (!voiceChannel.members.some(m => !m.user.bot)) {
            leave(guildId, 'empty');
            return;
        }
        console.log(`[Alfonso] entré a ${voiceChannel.name} (servidor=${message.guild.name})`);

        session.entryMessage = await (message.channel as any).send({
            content: entryContent(session, voiceChannel.name),
            components: entryButtons(session.id),
            allowedMentions: noMentions,
        }).catch((err: any) => { logSendError(err); return null; });
    } finally {
        joining.delete(guildId);
    }
}

// ---------- Botones "Escúchame" / "Ya no" ----------

async function onButton(interaction: ButtonInteraction): Promise<void> {
    const button = parseButtonId(interaction.customId);
    if (!button || !interaction.guildId) return;
    const session = sessions.get(interaction.guildId);
    const userId = interaction.user.id;
    const result = applyButton(session, button, userId, userVoiceChannel(interaction.guildId, userId));

    if (result === 'added' || result === 'removed') {
        console.log(`[Alfonso] ${result === 'added' ? 'escucha a' : 'deja de escuchar a'} ${interaction.user.tag}`);
        await interaction.update({ content: entryContent(session!, channelName(session!)), allowedMentions: noMentions }).catch(logSendError);
        return;
    }
    const reply = {
        'stale': 'Ese mensaje es de una entrada anterior. Menciona a Alfonso para que vuelva a entrar.',
        'not-in-channel': `Para que te escuche tienes que estar en el canal de voz **${session ? channelName(session) : ''}**.`,
        'already': 'Ya te estoy escuchando.',
        'not-listed': 'No te estaba escuchando.',
    }[result];
    await interaction.reply({ content: reply, flags: MessageFlags.Ephemeral }).catch(logSendError);
}

// ---------- Salir ----------

function leave(guildId: string, reason: 'empty' | 'disconnected'): void {
    const session = sessions.get(guildId);
    if (!session) return;
    sessions.delete(guildId);
    session.accepted.clear();
    if (session.connection.state.status !== VoiceConnectionStatus.Destroyed) session.connection.destroy();
    session.entryMessage?.edit({
        content: ':microphone2: Alfonso salió del canal. Menciónalo para que vuelva a entrar.',
        components: [],
        allowedMentions: noMentions,
    }).catch(logSendError);
    if (reason === 'empty') send(session.textChannel, ':x: Me quedé solo en el canal de voz. Saliendo...');
    console.log(`[Alfonso] salí del canal (${reason === 'empty' ? 'vacío' : 'desconectado'})`);
}

function watchConnection(session: Session): void {
    const { connection } = session;
    connection.on('error', (err) => console.error('[Alfonso] Error de conexión de voz:', err?.message ?? err));
    connection.on('stateChange', async (_old, next) => {
        if (sessions.get(session.guildId) !== session) return;
        if (next.status === VoiceConnectionStatus.Destroyed) {
            leave(session.guildId, 'disconnected');
        } else if (next.status === VoiceConnectionStatus.Disconnected) {
            // Patrón de @discordjs/voice: si se está reconectando sola, esperar; si no, salir
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                leave(session.guildId, 'disconnected');
            }
        }
    });
}

function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const session = sessions.get(newState.guild.id);
    if (!session) return;
    const userId = newState.id;
    if (userId === alfonsoClient?.user?.id) {
        // Su desconexión la maneja watchConnection. Si un moderador lo mueve a otro canal,
        // la sesión (quién aceptó, canal a vigilar) ya no vale: sale y hay que volver a mencionarlo
        if (newState.channelId && newState.channelId !== session.channelId) leave(session.guildId, 'disconnected');
        return;
    }

    if (oldState.channelId === session.channelId && newState.channelId !== session.channelId) {
        if (onVoiceLeave(session, userId, newState.channelId)) refreshEntry(session);
        const channel: any = newState.guild.channels.cache.get(session.channelId);
        const humans = channel?.members?.filter((m: any) => !m.user.bot).size ?? 0;
        if (humans === 0) leave(session.guildId, 'empty');
    }
}

// ---------- Escuchar y transcribir ----------

function listen(session: Session): void {
    const { receiver } = session.connection;
    receiver.speaking.on('start', (userId) => {
        if (session.receiving.has(userId) || quizGuilds.has(session.guildId)) return;
        // A quien no aceptó no se le procesa nada: ni se decodifica ni se registra
        if (!canProcess(session, userId)) return;

        const allowed = quota!.check(userId);
        if (allowed !== 'ok') {
            if (quota!.shouldNotify(allowed, userId)) {
                send(session.textChannel, allowed === 'user'
                    ? `:warning: <@${userId}> llegó al tope diario de voz. Mañana te vuelvo a escuchar.`
                    : ':warning: Se llegó al tope diario de voz del bot. Mañana vuelvo a escuchar.');
            }
            return;
        }

        session.receiving.add(userId);
        const opus = receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS } });
        const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
        const chunks: Buffer[] = [];
        let bytes = 0;
        let byLimit = false;
        let ended = false;
        let done = false;

        const finish = () => {
            if (done) return;
            done = true;
            session.receiving.delete(userId);
            // Sin 'end' (tope de 15 s o error) pipe no cierra el decodificador, y opusscript no lo libera solo
            if (!ended) {
                opus.unpipe(decoder);
                decoder.destroy();
            }
            const endedAt = byLimit ? Date.now() : Date.now() - SILENCE_MS;
            onPhrase(session, userId, Buffer.concat(chunks), endedAt);
        };

        decoder.on('data', (chunk: Buffer) => {
            if (done) return;
            chunks.push(chunk);
            bytes += chunk.length;
            if (bytes >= MAX_PHRASE_MS * PCM_BYTES_PER_MS) {
                byLimit = true;
                opus.destroy();
                finish();
            }
        });
        decoder.on('error', (err: any) => console.error('[Voz] Error decodificando audio:', err?.message ?? err));
        opus.on('error', (err: any) => console.error('[Voz] Error recibiendo audio:', err?.message ?? err));
        opus.once('end', () => { ended = true; finish(); });
        opus.once('close', finish);
        opus.pipe(decoder);
    });
}

function onPhrase(session: Session, userId: string, pcm: Buffer, endedAt: number): void {
    const pcm16k = toMono16k(pcm);
    const ms = durationMs(pcm16k);
    if (ms < MIN_PHRASE_MS) return;
    // "Ya no" o salir del canal mientras hablaba: la frase no se manda
    if (!canProcess(session, userId) || quizGuilds.has(session.guildId)) return;
    if (quota!.check(userId) !== 'ok') {
        console.log(`[Voz] frase de ${ms} ms descartada: tope diario (autor=${tagOf(userId)})`);
        return;
    }
    quota!.add(userId, Math.max(ms, MIN_BILLED_MS));

    // La transcripción arranca ya; la orden espera a que terminen las frases anteriores
    const prompt = buildPrompt(recentNames.get(session.guildId) ?? []);
    const pending = transcribe(toWav(pcm16k), config.alfonso!.groqApiKey, prompt).then(
        (text) => ({ text, prompt }),
        (err) => ({ err }),
    );
    session.chain = session.chain
        .then(async () => handleTranscript(session, userId, await pending, endedAt, ms))
        .catch((err) => console.error('[Voz] Error procesando la orden:', err?.message ?? err));
}

async function handleTranscript(session: Session, userId: string, result: { text?: string; prompt?: string; err?: any }, endedAt: number, ms: number): Promise<void> {
    // "Ya no" o salir del canal mientras se transcribía: la orden ya no se ejecuta
    if (!canProcess(session, userId)) return;

    if (result.err) {
        session.failures++;
        console.error(`[Voz] Falló la transcripción (${result.err?.status ?? result.err?.message ?? 'error'})`);
        if (session.failures === FAILURES_BEFORE_NOTICE) {
            send(session.textChannel, ':warning: No estoy pudiendo entender la voz ahora mismo (el servicio de transcripción falla o está saturado). Sigo intentando.');
        }
        return;
    }
    session.failures = 0;

    const text = result.text ?? '';
    // Sin la palabra clave (o eco del prompt): se descarta. El log dice solo duración y autor, nunca el texto
    if (isPromptEcho(text, result.prompt ?? '')) {
        console.log(`[Voz] frase de ${ms} ms: ruido (autor=${tagOf(userId)})`);
        return;
    }
    const command = extractWakeCommand(text);
    if (command === null) {
        console.log(`[Voz] frase de ${ms} ms: sin palabra clave (autor=${tagOf(userId)})`);
        return;
    }
    if (quizGuilds.has(session.guildId)) return;

    const main = mainClient!;
    const guild = main.guilds.cache.get(session.guildId);
    const channel = main.channels.cache.get(session.textChannel.id) as TextBasedChannel | undefined;
    const member = await guild?.members.fetch(userId).catch(() => null);
    if (!guild || !channel || !member) {
        console.error('[Voz] El bot de música no ve el servidor, el canal de texto o al usuario');
        return;
    }

    const message = voiceMessage(main, guild, member, channel);

    // Atajos propios del servidor ("llegó Yoryi"): el mensaje sale de una, antes que nada
    const shortcut = matchShortcut(command);
    if (shortcut) {
        console.log(`[Voz] atajo en ${Date.now() - endedAt} ms (autor=${member.user.tag})`);
        await sendShortcut(session, shortcut);
        await interpretText(main, message, shortcut.play, { voice: true });
        return;
    }

    // Línea de "qué entendió": va antes del resultado de la acción
    await send(session.textChannel, `:speech_balloon: **${member.displayName}** dijo: "${command.slice(0, 300)}"`);
    console.log(`[Voz] orden en ${Date.now() - endedAt} ms (autor=${member.user.tag})`);
    await interpretText(main, message, command, { voice: true });
}

/** Escribe el mensaje del atajo, etiquetando a `mentionName` si está en el canal de voz de Alfonso. */
async function sendShortcut(session: Session, shortcut: Shortcut): Promise<void> {
    const wanted = shortcut.mentionName?.toLowerCase();
    const channel: any = alfonsoClient?.channels.cache.get(session.channelId);
    const target = wanted ? channel?.members?.find((m: any) =>
        [m.displayName, m.user.globalName, m.user.username].some(n => n?.toLowerCase() === wanted)) : null;
    const content = shortcut.say.replace('{mention}', target ? `<@${target.id}>` : `**@${shortcut.mentionName ?? ''}**`).trim();
    // Solo notifica a esa persona: nunca @everyone ni roles
    await (session.textChannel as any).send({ content, allowedMentions: { users: target ? [target.id] : [] } }).catch(logSendError);
}

// ---------- Arranque ----------

/** Conecta a Alfonso si hay ALFONSO_TOKEN. Un fallo aquí no debe tumbar el bot de música. */
export async function initAlfonso(main: BotClient): Promise<void> {
    if (!config.alfonso) return;
    mainClient = main;
    quota = new DailyQuota(config.alfonso.topeUsuarioMin * 60_000, config.alfonso.topeGlobalMin * 60_000);
    // Aprender de lo que suena (no durante el quiz: esas canciones no son pedidos de nadie)
    main.player?.events.on('playerStart', (queue: any, track: any) => {
        const guildId = queue?.guild?.id;
        if (!guildId || quizGuilds.has(guildId) || !track) return;
        recentNames.set(guildId, remember(recentNames.get(guildId) ?? [], trackTerms(track.title, track.author)));
    });
    if (!config.alfonso.groqApiKey) console.warn('[Alfonso] Sin GROQ_API_KEY — Alfonso se conecta pero no entra a los canales');

    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages],
    });
    alfonsoClient = client;
    client.on(Events.MessageCreate, (message) => {
        onMention(message).catch((err) => console.error('[Alfonso] Error manejando mención:', err?.stack ?? err));
    });
    client.on(Events.InteractionCreate, (interaction) => {
        if (!interaction.isButton()) return;
        onButton(interaction).catch((err) => console.error('[Alfonso] Error manejando botón:', err?.stack ?? err));
    });
    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
        try { onVoiceStateUpdate(oldState, newState); } catch (err: any) { console.error('[Alfonso] Error en voiceStateUpdate:', err?.stack ?? err); }
    });
    client.on(Events.Error, (err) => console.error('[Alfonso] Error del cliente:', err?.message ?? err));
    client.once(Events.ClientReady, (c) => console.log(`[Alfonso] Conectado como ${c.user.tag}`));
    await client.login(config.alfonso.token);
}
