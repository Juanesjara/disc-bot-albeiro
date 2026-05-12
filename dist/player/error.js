"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MusicQuiz_1 = require("../quiz/MusicQuiz");
module.exports = (queue, error) => {
    console.error('[Player] Error de conexión de voz:', error.message);
    if (MusicQuiz_1.quizGuilds.has(queue.guild.id))
        return;
    const channel = queue.metadata?.channel;
    channel?.send(`:warning: Error de conexión: ${error.message}`);
};
//# sourceMappingURL=error.js.map