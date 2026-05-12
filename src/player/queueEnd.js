module.exports = (client, message, queue) => {
    console.log("juanes11")
    message.channel.send(`${client.emotes.error} - Music stopped as there is no more music in the queue !`);
};