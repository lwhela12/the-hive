const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
const markdown = read('components/chat/MarkdownContent.tsx');
const detail = read('components/board/BoardPostDetail.tsx');
const reply = read('components/board/BoardReplyItem.tsx');
const card = read('components/board/BoardPostCard.tsx');

assert.match(markdown, /selectable\?: boolean/, 'The shared rich-text reader accepts an explicit copy setting');
assert.match(markdown, /userSelect: selectable \? 'text' : 'auto'/, 'Selectable rich text becomes real selectable web text');
assert.match(markdown, /<LinkifiedText[\s\S]*selectable=\{selectable\}/, 'Linked prose keeps selection enabled');
assert.match(markdown, /code_block:[\s\S]*selectable=\{selectable\}/, 'Code blocks can be copied too');
assert.match(detail, /<Text selectable[\s\S]*\{post\.title\}/, 'Thread titles can be copied');
assert.match(detail, /<MarkdownContent content=\{post\.content\} isUser=\{skin\.dark\} selectable/, 'Thread bodies can be copied');
assert.match(reply, /<MarkdownContent content=\{reply\.content\} isUser=\{skin\.dark\} selectable/, 'Replies can be copied');
assert.match(card, /<LinkifiedText[\s\S]*selectable/, 'Board-list previews can be copied before opening a thread');

console.log('PASS: board titles, posts, replies, links, and code stay selectable for copying.');
