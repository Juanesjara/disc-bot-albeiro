module.exports = {
    name: 'play',
    aliases: ['p'],
    category: 'Music',
    utilisation: '{prefix}play [name/URL]',
    
    execute(client, message, args) {
        if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} - You're not in a voice channel !`);

        if (message.guild.me.voice.channel && message.member.voice.channel.id !== message.guild.me.voice.channel.id) return message.channel.send(`${client.emotes.error} - You are not in the same voice channel !`);

        if (!args[0]) return message.channel.send(`${client.emotes.error} - Please indicate the title of a song !`);

        console.log(message.content, " soy message")
        if(message.content == "-p musica para recordar al yeico"){
            console.log("entre if")
            client.player.play(message, "https://open.spotify.com/playlist/2MkjoPAFJqq5dLMSWstp5Y?si=226e3cf876714937","https://open.spotify.com/playlist/2MkjoPAFJqq5dLMSWstp5Y?si=226e3cf876714937")
        }else{
            console.log("soy else")
            client.player.play(message, args.join(" "), { firstResult: true });
            
        }
    },
};