import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist');
const webJsDir = path.join(root, '_expo', 'static', 'js', 'web');
const indexPath = path.join(root, 'index.html');

if (!fs.existsSync(indexPath) || !fs.existsSync(webJsDir)) {
  console.error(`Web export is incomplete: ${root}`);
  process.exit(1);
}

const webJs = fs.readdirSync(webJsDir).filter((name) => name.endsWith('.js')).sort();

// HIVE deliberately ships as one web bundle. Production-only async routes made
// every deploy delete the filenames held by returning phones, producing
// `Requiring unknown module` before login. A small allowance keeps this guard
// compatible with a future Expo runtime split, while still rejecting per-screen
// route chunks (the broken build produced 25 files).
if (webJs.length > 3) {
  console.error(`Unsafe split web export: found ${webJs.length} JavaScript files.`);
  console.error(webJs.join('\n'));
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
const localRefs = refs.filter((ref) => ref.startsWith('/') && !ref.startsWith('//'));
// A cache-busting query is part of the address, not part of the filename.
// `/favicon.ico?v=2` is how the icon links force a browser past its own
// favicon cache (public/index.html, 2026-08-19), and checking it verbatim
// reported four perfectly present files as missing.
const onDisk = (ref) => path.join(root, ref.slice(1).split('?')[0].split('#')[0]);
const missing = localRefs.filter((ref) => !fs.existsSync(onDisk(ref)));

if (missing.length > 0) {
  console.error('Web export references files that do not exist:');
  console.error(missing.join('\n'));
  process.exit(1);
}

console.log(`Web export safe: ${webJs.length} JavaScript file(s), ${localRefs.length} local asset references, 0 missing.`);
