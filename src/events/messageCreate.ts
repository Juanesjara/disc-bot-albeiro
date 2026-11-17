import { Message } from 'discord.js';
import { BotClient } from '../types';
import { logSendError } from '../utils/safeSend';
import { handleMention, mentionRegex } from '../ai/assistant';

module.exports = async (client: BotClient, message: Message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(client.prefix)) {
        // Sin prefijo: si mencionan al bot, se interpreta en lenguaje natural
        if (client.user && mentionRegex(client.user.id).test(message.content)) {
            try {
                await handleMention(client, message);
            } catch (error) {
                console.error('[IA] Error manejando mención:', error);
                message.channel.send(':warning: Ocurrió un error al procesar ese mensaje.').catch(logSendError);
            }
        }
        return;
    }

    const args = message.content.slice(client.prefix.length).trim().split(/ +/g);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName);
    // Solo autor y nombre del comando: nunca los argumentos ni el texto de otros mensajes
    console.log(`[CMD] autor=${message.author.tag} comando="${commandName}" encontrado=${!!command}`);
    if (!command) return;

    try {
        await command.execute(client, message, args);
    } catch (error) {
        console.error(`Error ejecutando ${commandName}:`, error);
        message.channel.send(':warning: Ocurrió un error al ejecutar ese comando.').catch(logSendError);
    }
};
