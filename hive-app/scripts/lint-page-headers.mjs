import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [path.join(root, 'app'), path.join(root, 'components')];
const failures = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function appHeaderOpeningTags(source) {
  const tags = [];
  let from = 0;
  while (true) {
    const start = source.indexOf('<AppHeader', from);
    if (start < 0) break;
    let quote = null;
    let escaped = false;
    let braces = 0;
    let end = start;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '{') braces += 1;
      else if (char === '}') braces = Math.max(0, braces - 1);
      else if (char === '>' && braces === 0) {
        end = i + 1;
        break;
      }
    }
    tags.push({ start, text: source.slice(start, end) });
    from = Math.max(end, start + 10);
  }
  return tags;
}

for (const file of roots.flatMap(walk)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const tag of appHeaderOpeningTags(source)) {
    if (/\bsubtitle\s*=/.test(tag.text)) {
      const line = source.slice(0, tag.start).split('\n').length;
      failures.push(`${path.relative(root, file)}:${line} passes subtitle to AppHeader`);
    }
  }
}

const headerFile = path.join(root, 'components/navigation/AppHeader.tsx');
const headerSource = fs.readFileSync(headerFile, 'utf8');
if (/\bsubtitle\??\s*:/.test(headerSource) || /\{\s*subtitle\s*\?/.test(headerSource)) {
  failures.push('components/navigation/AppHeader.tsx restores the forbidden subtitle API');
}

const customClarifiers = [
  ['app/(app)/hive-wide.tsx', 'Have a look around and see what'],
  ['components/hive/HivePicker.tsx', 'You can move between them any time from the menu.'],
];
for (const [relative, phrase] of customClarifiers) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (source.includes(phrase)) failures.push(`${relative} restores the removed page clarifier`);
}

if (failures.length) {
  console.error('Page headers are WHERE + WHAT only.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Page headers: WHERE + WHAT only.');
