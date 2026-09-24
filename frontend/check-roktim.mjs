// Roktim configuration diagnostic.
//
//   node check-roktim.mjs
//
// Run from the `frontend` folder. Read-only: it changes nothing.
//
// It answers, in order, the only questions that matter when Roktim renders
// nothing:
//   1. which env files exist, and which of them define VITE_ROKTIM_URL
//   2. what Vite ACTUALLY resolves for `npm run dev` and for `npm run build`
//      -- these are different modes and load different files, which is the
//      single most common reason a value works in one and not the other
//   3. whether the built bundle, if present, contains the URL
//   4. whether the forecast service answers, and whether it allows this origin
//
// Every check prints the evidence it used, so nothing here has to be taken on
// trust.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KEY = 'VITE_ROKTIM_URL';
const ok = (s) => `  [ok]   ${s}`;
const bad = (s) => `  [BAD]  ${s}`;
const info = (s) => `  .      ${s}`;

console.log('\n=== 1. env files on disk ===\n');

const candidates = ['.env', '.env.local', '.env.development', '.env.production'];
const found = {};
for (const f of candidates) {
  if (!existsSync(f)) {
    console.log(info(`${f.padEnd(18)} not present`));
    continue;
  }
  const text = readFileSync(f, 'utf8');
  // Deliberately loose: catches `VITE_ROKTIM_URL=`, with or without spaces,
  // and reports an empty value as a miss rather than a hit.
  const m = text.match(new RegExp(`^\\s*${KEY}\\s*=\\s*(.*)$`, 'm'));
  const value = m ? m[1].trim() : null;
  found[f] = value;
  if (!m) console.log(bad(`${f.padEnd(18)} exists, but has NO ${KEY}`));
  else if (!value) console.log(bad(`${f.padEnd(18)} has ${KEY} but it is EMPTY`));
  else console.log(ok(`${f.padEnd(18)} ${KEY}=${value}`));
}

console.log('\n=== 2. what Vite resolves, per mode ===\n');
console.log(info('`npm run dev`   uses mode "development" -> .env, .env.development'));
console.log(info('`npm run build` uses mode "production"  -> .env, .env.production'));
console.log(info('.env.production is NOT read by the dev server. This catches people out.\n'));

let loadEnv;
try {
  ({ loadEnv } = await import('vite'));
} catch {
  console.log(bad('could not import vite -- run `npm ci` first'));
}

if (loadEnv) {
  for (const mode of ['development', 'production']) {
    const env = loadEnv(mode, process.cwd(), '');
    const v = env[KEY];
    const label = mode === 'development' ? 'npm run dev  ' : 'npm run build';
    if (!v) console.log(bad(`${label} -> ${KEY} is EMPTY. Roktim will render nothing.`));
    else console.log(ok(`${label} -> ${KEY}=${v}`));
    for (const k of ['VITE_API_URL', 'VITE_ENGINE_URL']) {
      console.log(info(`${' '.repeat(16)}${k}=${env[k] || '(empty)'}`));
    }
  }
}

console.log('\n=== 3. built bundle ===\n');

const assets = join('dist', 'assets');
if (!existsSync(assets)) {
  console.log(info('no dist/ yet -- run `npm run build` if you want this checked'));
} else {
  const js = readdirSync(assets).filter((f) => f.endsWith('.js'));
  let hit = false;
  for (const f of js) {
    const text = readFileSync(join(assets, f), 'utf8');
    const m = text.match(/https?:\/\/[a-z0-9.-]*onrender\.com/gi);
    if (m) {
      const uniq = [...new Set(m)];
      console.log(info(`${f}: ${uniq.join(', ')}`));
      if (uniq.some((u) => /forecast/i.test(u))) hit = true;
    }
  }
  console.log(hit ? ok('bundle contains a forecast URL') : bad('bundle has NO forecast URL'));
}

console.log('\n=== 4. the forecast service ===\n');

const url = (loadEnv && loadEnv('production', process.cwd(), '')[KEY])
  || found['.env']
  || 'https://roktonet-forecast.onrender.com';

console.log(info(`testing ${url}`));
try {
  const r = await fetch(`${url}/health`);
  const j = await r.json();
  console.log(r.ok && j.status === 'ok'
    ? ok(`/health ${r.status} schema_version=${j.schema_version} model_loaded=${j.model_loaded}`)
    : bad(`/health ${r.status} ${JSON.stringify(j)}`));
} catch (e) {
  console.log(bad(`/health unreachable: ${e.message}`));
}

// The allowlist check. /health is open to '*', so it proves nothing about
// whether the browser can read /forecast/*. This is the request that matters.
for (const origin of ['http://localhost:5173', 'https://roktonet.roktonet.workers.dev']) {
  try {
    const r = await fetch(`${url}/forecast/units?grain=district`, { headers: { Origin: origin } });
    const acao = r.headers.get('access-control-allow-origin');
    console.log(acao === origin
      ? ok(`CORS allows ${origin}`)
      : bad(`CORS does NOT allow ${origin}  (got: ${acao || 'no header'})`));
  } catch (e) {
    console.log(bad(`${origin}: ${e.message}`));
  }
}

console.log('');
