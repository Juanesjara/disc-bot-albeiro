module.exports = (oldState, newState) => {
    console.log(arguments);

    // if nobody left the channel in question, return.
    if (oldState.channelID !== oldState.guild?.me.voice.channelID || newState.channel)
        return;

    // otherwise, check how many people are in the channel now
    
 /*    console.log("oldsate",oldState.channel)
    console.log("oldsate",oldState.guild)

    console.log("new",newState.channel)
    console.log("new",newState.guild) */
    if (!oldState.channel?.members.size - 1)
        setTimeout(() => { // if 1 (you), wait five minutes
            if (!oldState.channel.members.size - 1) // if there's still 1 member, 
                oldState.channel.leave(); // leave
        }, 300000); // (5 min in ms)
};