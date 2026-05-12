module.exports = {
    name: 'remove',
    aliases: [],
    category: 'Music',
    utilisation: '{prefix}remove [number]',

    execute(client, message) {
        if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} - You're not in a voice channel !`);

        if (message.guild.me.voice.channel && message.member.voice.channel.id !== message.guild.me.voice.channel.id) return message.channel.send(`${client.emotes.error} - You are not in the same voice channel !`);

        const queue = client.player.getQueue(message);

        if (!client.player.getQueue(message)) return message.channel.send(`${client.emotes.error} - No songs currently playing !`);

        //console.log(queue.tracks, "soy queue")
        numero = message.content.split(' ', 3)
        console.log(numero[1], "soy el numero")
        cancionBorrada = queue.tracks.splice(parseInt(numero[1])-1, 1)
        console.log(cancionBorrada)
        if(cancionBorrada.length == 0){
            message.channel.send(`no podes borrar esa cancion tonto`)
        }else{
            message.channel.send(`Cancion ${cancionBorrada[0].title} borrada de la cola`)
        }
        

       /* message.channel.send(`**Server queue - ${message.guild.name} ${client.emotes.queue} ${client.player.getQueue(message).loopMode ? '(looped)' : ''}**\nCurrent : ${queue.playing.title} | ${queue.playing.author}\n\n` + (queue.tracks.map((track, i) => {
            return `**#${i + 1}** - ${track.title} | ${track.author} (requested by : ${track.requestedBy.username})`
        }).slice(0, 5).join('\n') + `\n\n${queue.tracks.length > 5 ? `And **${queue.tracks.length - 5}** other songs...` : `In the playlist **${queue.tracks.length}** song(s)...`}`));*/
    },
};