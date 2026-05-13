import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const p of ['index.html', 'assets', 'modules']) cpSync(p, join(out, p), { recursive: true });
cpSync('docs', join(out, 'docs'), { recursive: true });
