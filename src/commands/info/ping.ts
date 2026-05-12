import { Message } from 'discord.js';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'ping',
    description: 'Muestra la latencia del bot',
    usage: 'ping',
    category: 'Info',
    async execute(client: BotClient, message: Message) {
        const reply = await message.channel.send('Calculando...');
        const latency = reply.createdTimestamp - message.createdTimestamp;
        reply.edit(`:bar_chart: Latencia: **${latency}ms** | WebSocket: **${client.ws.ping}ms**`);
    },
};

module.exports = command;
