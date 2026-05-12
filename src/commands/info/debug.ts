import { Message, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'debug',
    description: 'Muestra información de depuración del bot',
    usage: 'debug',
    category: 'Info',
    execute(client: BotClient, message: Message) {
        const queue = useQueue(message.guild!.id);
        const memUsage = process.memoryUsage();

        const embed = new EmbedBuilder()
            .setColor(0x7289DA)
            .setTitle(':bar_chart: Debug')
            .addFields(
                { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
                { name: 'Servidores', value: `${client.guilds.cache.size}`, inline: true },
                { name: 'RAM', value: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`, inline: true },
                { name: 'Uptime', value: `${Math.floor(client.uptime! / 1000 / 60)} minutos`, inline: true },
                { name: 'Reproduciendo', value: queue?.isPlaying() ? `:white_check_mark: Sí` : ':x: No', inline: true },
                { name: 'Canciones en cola', value: `${queue?.tracks.size ?? 0}`, inline: true }
            )
            .setFooter({ text: `Node ${process.version}` });

        message.channel.send({ embeds: [embed] });
    },
};

module.exports = command;
