import { Message } from 'discord.js';
import { BotClient } from '../types';
import { handleMention, mentionRegex } from '../ai/assistant';

module.exports = async (client: BotClient, message: Message) => {
    console.log(`[MSG] autor=${message.author.tag} guild=${!!message.guild} prefix="${client.prefix}" content="${message.content}" starts=${message.content.startsWith(client.prefix)}`);
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(client.prefix)) {
        // Sin prefijo: si mencionan al bot, se interpreta en lenguaje natural
        if (client.user && mentionRegex(client.user.id).test(message.content)) {
            try {
                await handleMention(client, message);
            } catch (error) {
                console.error('[IA] Error manejando mención:', error);
                message.channel.send(':warning: Ocurrió un error al procesar ese mensaje.').catch(() => {});
            }
        }
        return;
    }

    const args = message.content.slice(client.prefix.length).trim().split(/ +/g);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName);
    console.log(`[CMD] comando="${commandName}" encontrado=${!!command}`);
    if (!command) return;

    try {
        await command.execute(client, message, args);
    } catch (error) {
        console.error(`Error ejecutando ${commandName}:`, error);
        message.channel.send(':warning: Ocurrió un error al ejecutar ese comando.');
    }
};
