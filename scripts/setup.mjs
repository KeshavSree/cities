import { existsSync, copyFileSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (!existsSync('.dev.vars')) copyFileSync('.dev.vars.example', '.dev.vars');
if (!readFileSync('.dev.vars', 'utf8').includes('TOKEN_ENCRYPTION_KEY=')) appendFileSync('.dev.vars', `\nTOKEN_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`);
mkdirSync('dist', { recursive: true });
if (!existsSync('dist/index.html')) writeFileSync('dist/index.html', '<p>Run npm run dev to start C.I.T.I.E.S.</p>');
const result = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'cities', '--local'], { stdio: 'inherit', shell: false });
process.exitCode = result.status ?? 1;
