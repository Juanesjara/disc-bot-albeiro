import { Client, Collection, Message, TextChannel, MessagePayload, MessageCreateOptions } from 'discord.js';
import { Player } from 'discord-player';

// Nuestro bot solo opera en servidores (guild). PartialGroupDMChannel no tiene send()
// en los tipos de Discord.js, pero como nunca operamos en DMs grupales, esta extensión es segura.
declare module 'discord.js' {
    interface PartialGroupDMChannel {
        send(options: string | MessagePayload | MessageCreateOptions): Promise<Message>;
    }
}

export interface Command {
    name: string;
    aliases?: string[];
    description: string;
    usage: string;
    category: string;
    execute(client: BotClient, message: Message, args: string[]): Promise<any> | void;
}

export interface BotClient extends Client {
    commands: Collection<string, Command>;
    player: Player;
    prefix: string;
}

export interface QueueMetadata {
    channel: TextChannel;
}

export interface Song {
    title: string;
    artist: string;
    spotifyUrl: string;
}
