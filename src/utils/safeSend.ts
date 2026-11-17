// Enviar al canal puede fallar (sin permisos, canal borrado, rate limit...).
// Ese fallo no debe cortar la música ni el quiz: se registra y se sigue.
export function logSendError(err: any): void {
    console.error('[Discord] No se pudo enviar mensaje al canal:', err?.message ?? err);
}
