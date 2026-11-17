// Quién aceptó que Alfonso lo escuche (botones "Escúchame" / "Ya no").
// Vale solo para la entrada actual de Alfonso al canal: se guarda en memoria y se pierde al salir.

export type ButtonAction = 'escuchar' | 'dejar';

export interface ListenSession {
    /** Distinto en cada entrada, para reconocer botones de mensajes viejos. */
    id: string;
    /** Canal de voz donde está Alfonso. */
    channelId: string;
    /** Usuarios que tocaron "Escúchame" en esta entrada. */
    accepted: Set<string>;
}

export type ButtonResult = 'stale' | 'not-in-channel' | 'added' | 'already' | 'removed' | 'not-listed';

const PREFIX = 'alfonso';

export function buttonId(action: ButtonAction, sessionId: string): string {
    return `${PREFIX}:${action}:${sessionId}`;
}

/** Lee el customId de un botón de Alfonso; null si no es suyo o está mal formado. */
export function parseButtonId(customId: string): { action: ButtonAction; sessionId: string } | null {
    const [prefix, action, sessionId, ...extra] = (customId ?? '').split(':');
    if (prefix !== PREFIX || extra.length || !sessionId) return null;
    if (action !== 'escuchar' && action !== 'dejar') return null;
    return { action, sessionId };
}

/**
 * Aplica un botón tocado por `userId`, que está en el canal de voz `userVoiceChannelId` (o en ninguno).
 * "Escúchame" solo apunta a quien está en el canal de Alfonso; "Ya no" funciona desde donde sea.
 */
export function applyButton(
    session: ListenSession | undefined,
    button: { action: ButtonAction; sessionId: string },
    userId: string,
    userVoiceChannelId: string | null,
): ButtonResult {
    if (!session || session.id !== button.sessionId) return 'stale';
    if (button.action === 'dejar') {
        return session.accepted.delete(userId) ? 'removed' : 'not-listed';
    }
    if (userVoiceChannelId !== session.channelId) return 'not-in-channel';
    if (session.accepted.has(userId)) return 'already';
    session.accepted.add(userId);
    return 'added';
}

/** ¿Se procesa la voz de este usuario? Solo si aceptó en esta entrada y sigue en el canal de Alfonso. */
export function shouldProcessVoice(
    session: ListenSession | undefined,
    userId: string,
    userVoiceChannelId: string | null,
    isBot: boolean,
): boolean {
    return !!session && !isBot && session.accepted.has(userId) && userVoiceChannelId === session.channelId;
}

/** Quien aceptó y sale del canal de Alfonso deja de estar apuntado. Devuelve true si cambió la lista. */
export function onVoiceLeave(session: ListenSession | undefined, userId: string, newChannelId: string | null): boolean {
    if (!session || newChannelId === session.channelId) return false;
    return session.accepted.delete(userId);
}

/** Línea del mensaje de Alfonso con a quién escucha (menciones: enviar con allowedMentions vacío para no notificar). */
export function renderListeners(userIds: Iterable<string>): string {
    const ids = [...userIds];
    if (!ids.length) return 'Todavía no escucho a nadie: toca **🎙️ Escúchame**.';
    return `Escuchando a: ${ids.map(id => `<@${id}>`).join(', ')}`;
}
