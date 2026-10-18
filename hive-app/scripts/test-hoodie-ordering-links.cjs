const assert = require('node:assert/strict');
const fs = require('node:fs');

const url = 'https://app.the-hive.app/hoodie-studio/';
const root = process.cwd();
const read = path => fs.readFileSync(`${root}/${path}`, 'utf8');

assert.match(read('lib/hoodieOrdering.ts'), new RegExp(url.replace(/[./]/g, '\\$&')));
assert.match(read('components/surveys/EndOfMonthForm.tsx'), /Choose my HIVE clothing/);
assert.match(read('supabase/functions/chat/index.ts'), /Never send them to an old PDF/);

const migration = read('supabase/migrations/20261018171916_update_hoodie_ordering_links.sql');
assert.match(migration, /update public\.board_posts/);
assert.match(migration, /update public\.board_replies/);
assert.match(migration, /title ilike '%hoodie season%'/);
assert.match(migration, /https:\/\/app\.the-hive\.app\/hoodie-studio\//);
assert.match(migration, /mime_type.*application\/pdf/s);
assert.match(migration, /delete from public\.context_summaries/);

const vercel = JSON.parse(read('vercel.json'));
assert.ok(vercel.rewrites.some(rule => rule.source === '/hoodie-studio/' && rule.destination === '/hoodie-studio/index.html'));
assert.ok(fs.existsSync(`${root}/public/hoodie-studio/index.html`));

console.log('HIVE clothing link: announcement, boards migration, Clive and share route agree.');
