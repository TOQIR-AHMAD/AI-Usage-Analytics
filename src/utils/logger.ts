import * as vscode from 'vscode';

let channel: vscode.OutputChannel | null = null;

const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|AIza[A-Za-z0-9_-]{10,}|anthropic[^\s]{0,20}[A-Za-z0-9_-]{10,})/g;

function scrub(text: string): string {
    return text.replace(SECRET_PATTERN, '[REDACTED]');
}

export function initLogger(context: vscode.ExtensionContext): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('AI Usage Tracker');
        context.subscriptions.push(channel);
    }
    return channel;
}

function stamp(): string {
    return new Date().toISOString();
}

function write(level: string, args: unknown[]): void {
    if (!channel) {
        return;
    }
    const parts = args.map(a => {
        if (a instanceof Error) {
            return scrub(a.message);
        }
        if (typeof a === 'string') {
            return scrub(a);
        }
        try {
            return scrub(JSON.stringify(a));
        } catch {
            return String(a);
        }
    });
    channel.appendLine(`[${stamp()}] [${level}] ${parts.join(' ')}`);
}

export const logger = {
    info: (...args: unknown[]) => write('INFO', args),
    warn: (...args: unknown[]) => write('WARN', args),
    error: (...args: unknown[]) => write('ERROR', args),
    debug: (...args: unknown[]) => write('DEBUG', args)
};
