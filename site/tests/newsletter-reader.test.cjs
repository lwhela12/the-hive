const assert = require('node:assert/strict');
const { readLetter } = require('../assets/newsletter-reader.js');

const blocks = readLetter([
  'Yellow!',
  'Hi Hivers! Here is a proper opening paragraph long enough to introduce the letter.',
  'Upcoming events',
  '- Costume Karaoke — Saturday, October 24 at 7pm',
  '- Mukgo Nolza, 3336 Spring Mountain Road',
  'October 24: Costume Karaoke',
  'https://lovers.thenateffect.com/',
].join('\n'));

assert.equal(blocks[0].kind, 'paragraph');
assert.equal(blocks[2].kind, 'heading');
assert.deepEqual(blocks.slice(3, 5).map((block) => block.kind), ['bullet', 'bullet']);
assert.equal(blocks[5].kind, 'dated');
assert.equal(blocks[6].kind, 'paragraph');
assert.equal(blocks[6].isLink, true);
console.log('newsletter reader mirrors the app/email block structure');
