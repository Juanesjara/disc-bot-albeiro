import { Guild, GuildMember, Message, TextBasedChannel } from 'discord.js';
import { BotClient } from '../types';

/**
 * Message mínimo para ejecutar los comandos del bot de música con una orden hablada.
 * Los comandos solo leen guild, member, author, channel (send) y createdTimestamp; todo sale del
 * Client principal para que el resultado lo publique el bot de música, igual que con una mención.
 * Si un comando usa algo que no está aquí (p. ej. `reply`), falla y lo captura runCommand.
 */
export function voiceMessage(client: BotClient, guild: Guild, member: GuildMember, channel: TextBasedChannel): Message {
    return {
        client,
        guild,
        guildId: guild.id,
        member,
        author: member.user,
        channel,
        channelId: channel.id,
        content: '',
        createdTimestamp: Date.now(),
    } as unknown as Message;
}
