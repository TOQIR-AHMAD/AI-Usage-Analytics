export function formatK(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) {
        const v = n / 1_000_000;
        return (Math.round(v * 10) / 10).toString() + 'm';
    }
    if (abs >= 1_000) {
        const v = n / 1_000;
        if (abs >= 10_000) {
            return Math.round(v).toString() + 'k';
        }
        return (Math.round(v * 10) / 10).toString() + 'k';
    }
    return n.toString();
}

export function formatTokenCount(n: number): string {
    if (n >= 10_000) {
        return formatK(n);
    }
    return n.toLocaleString('en-US');
}

export function formatCurrency(n: number, currency = 'USD'): string {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(n);
    } catch {
        return `$${n.toFixed(2)}`;
    }
}

export function formatPercent(pct: number): string {
    return `${Math.round(pct)}%`;
}

export function formatRelativeTime(date: Date | null): string {
    if (!date) {
        return 'never';
    }
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) {
        return 'just now';
    }
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) {
        return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    const s = ms / 1000;
    if (s < 60) {
        return `${s.toFixed(1)}s`;
    }
    const m = Math.floor(s / 60);
    const rem = Math.round(s - m * 60);
    return `${m}m ${rem}s`;
}

export function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
