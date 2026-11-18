// Topes diarios de audio transcrito (por persona y global), para no gastar de más.
// En memoria: se reinician con el proceso y al cambiar el día en Colombia.

export type QuotaResult = 'ok' | 'user' | 'global';

const bogotaDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});

export class DailyQuota {
    private day = '';
    private perUser = new Map<string, number>();
    private total = 0;
    private notified = new Set<string>();

    constructor(
        private readonly perUserMs: number,
        private readonly globalMs: number,
        private readonly now: () => number = Date.now,
    ) {}

    /** Reinicia los contadores si cambió el día en Colombia. */
    private roll(): void {
        const today = bogotaDay.format(this.now());
        if (today === this.day) return;
        this.day = today;
        this.perUser.clear();
        this.total = 0;
        this.notified.clear();
    }

    /** ¿Puede transcribirse más audio de esta persona hoy? Si se pasan los dos topes, gana `user`. */
    check(userId: string): QuotaResult {
        this.roll();
        if ((this.perUser.get(userId) ?? 0) >= this.perUserMs) return 'user';
        if (this.total >= this.globalMs) return 'global';
        return 'ok';
    }

    /** Suma la duración del audio que se mandó a transcribir. */
    add(userId: string, ms: number): void {
        this.roll();
        this.perUser.set(userId, (this.perUser.get(userId) ?? 0) + ms);
        this.total += ms;
    }

    /** true solo la primera vez del día para ese tope (y esa persona, si es el de usuario). */
    shouldNotify(kind: 'user' | 'global', userId: string): boolean {
        this.roll();
        const key = kind === 'global' ? 'global' : `user:${userId}`;
        if (this.notified.has(key)) return false;
        this.notified.add(key);
        return true;
    }
}
