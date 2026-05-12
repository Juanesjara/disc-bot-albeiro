import { Message } from 'discord.js';
import { BotClient } from '../types';

module.exports = (client: BotClient, message: Message) => {
    console.log(`[MSG] ${message.author.tag}: ${message.content}`);
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(client.prefix)) return;

    const args = message.content.slice(client.prefix.length).trim().split(/ +/g);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
        command.execute(client, message, args);
    } catch (error) {
        console.error(`Error ejecutando ${commandName}:`, error);
        message.channel.send(':warning: Ocurrió un error al ejecutar ese comando.');
    }
};
