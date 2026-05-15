import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist';
for (const p of ['modules', 'docs']) {
  if (existsSync(p)) cpSync(p, join(out, p), { recursive: true });
}
