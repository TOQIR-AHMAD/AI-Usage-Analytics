export function todayKey(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function monthKey(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function billingPeriodKey(resetDay: number, date = new Date()): string {
    const day = date.getDate();
    let anchor = new Date(date.getFullYear(), date.getMonth(), resetDay);
    if (day < resetDay) {
        anchor = new Date(date.getFullYear(), date.getMonth() - 1, resetDay);
    }
    const y = anchor.getFullYear();
    const m = String(anchor.getMonth() + 1).padStart(2, '0');
    const d = String(anchor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function nextResetDate(resetDay: number, from = new Date()): Date {
    const day = from.getDate();
    const safeDay = Math.max(1, Math.min(28, resetDay));
    if (day < safeDay) {
        return new Date(from.getFullYear(), from.getMonth(), safeDay);
    }
    return new Date(from.getFullYear(), from.getMonth() + 1, safeDay);
}

export function daysUntil(target: Date, from = new Date()): number {
    const ms = target.getTime() - from.getTime();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function lastNDays(n: number, from = new Date()): string[] {
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - i);
        out.push(todayKey(d));
    }
    return out;
}

export function parseHHMM(hhmm: string): { hour: number; minute: number } | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!match) {
        return null;
    }
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }
    return { hour, minute };
}
