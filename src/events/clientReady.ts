import { BotClient } from '../types';

module.exports = (client: BotClient) => {
    console.log(`✅ Bot listo: ${client.user?.tag}`);
    client.user?.setActivity(`${client.prefix}help | Music Quiz`);
};
