import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walk(full));
        } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
            out.push(full);
        }
    }
    return out;
}

export async function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'tdd', color: true });
    const testsRoot = path.resolve(__dirname);
    const files = walk(testsRoot);
    for (const f of files) {
        mocha.addFile(f);
    }
    await new Promise<void>((resolve, reject) => {
        mocha.run(failures => (failures ? reject(new Error(`${failures} test(s) failed`)) : resolve()));
    });
}
