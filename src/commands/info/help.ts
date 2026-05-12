import { Message, EmbedBuilder } from 'discord.js';
import { BotClient, Command } from '../../types';

const command: Command = {
    name: 'help',
    aliases: ['h'],
    description: 'Muestra la lista de comandos',
    usage: 'help [comando]',
    category: 'Info',
    execute(client: BotClient, message: Message, args: string[]) {
        if (args[0]) {
            const cmd = client.commands.get(args[0].toLowerCase());
            if (!cmd) return message.channel.send(`:warning: Comando \`${args[0]}\` no encontrado.`);
            const embed = new EmbedBuilder()
                .setColor(0x7289DA)
                .setTitle(`Comando: ${client.prefix}${cmd.name}`)
                .setDescription(cmd.description)
                .addFields(
                    { name: 'Uso', value: `\`${client.prefix}${cmd.usage}\`` },
                    { name: 'Alias', value: cmd.aliases?.map(a => `\`${a}\``).join(', ') || 'Ninguno' }
                );
            return message.channel.send({ embeds: [embed] });
        }

        const categories = new Map<string, Command[]>();
        const seen = new Set<string>();
        for (const cmd of client.commands.values()) {
            if (seen.has(cmd.name)) continue;
            seen.add(cmd.name);
            const list = categories.get(cmd.category) || [];
            list.push(cmd);
            categories.set(cmd.category, list);
        }

        const embed = new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle(':headphones: Comandos del Bot')
            .setFooter({ text: `Prefijo: ${client.prefix} | Usa ${client.prefix}help <comando> para más info` });

        for (const [category, cmds] of categories) {
            embed.addFields({
                name: category,
                value: cmds.map(c => `\`${client.prefix}${c.name}\``).join(' '),
            });
        }

        message.channel.send({ embeds: [embed] });
    },
};

module.exports = command;
