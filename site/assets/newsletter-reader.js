/* The public-site twin of hive-app/lib/newsletterHeaders.ts::readLetter.
 *
 * A newsletter is stored once as plain text. Email and the signed-in app both
 * recover its headings, lists, dates and quotes before displaying it; the
 * public archive used to dump those same words into one large paragraph.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HiveNewsletter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var BULLET_LINE = /^([-*•→▸])[ \t]+(.*)$/;
  var NUMBERED_LINE = /^(\d{1,2})[.)][ \t]+(.*)$/;
  var LINK_ONLY = /^(https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+)$/i;
  var MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
  var DAY = '\\d{1,2}(?:st|nd|rd|th)?';
  var DATE_LINE = new RegExp('^(' + MONTH + ' ' + DAY + '(?:\\s*[-–—]\\s*(?:' + MONTH + ' )?' + DAY + ')?):\\s*(.*)$');
  var OPENS_QUOTE = /^[“"]/;
  var CLOSES_QUOTE = /[”"][\s—–-]*$/;
  var DECORATION = /[^\p{Letter}\p{Number}:;,.!?]+$/u;
  var TITLE_MAX = 52;
  var LABEL_MAX = 60;

  function readLetter(text) {
    var blocks = String(text || '').split('\n').map(function (line) {
      return line.replace(/ /g, ' ').trim();
    }).filter(Boolean).map(function (line) {
      var numbered = NUMBERED_LINE.exec(line);
      if (numbered) return { kind: 'numbered', marker: numbered[1], text: numbered[2] };
      var bullet = BULLET_LINE.exec(line);
      if (bullet) return { kind: 'bullet', text: bullet[2] };
      var dated = DATE_LINE.exec(line);
      if (dated) return dated[2]
        ? { kind: 'dated', when: dated[1], text: dated[2] }
        : { kind: 'label', text: dated[1], isDate: true };
      if (LINK_ONLY.test(line)) return { kind: 'paragraph', text: line, isLink: true };
      if (OPENS_QUOTE.test(line) && CLOSES_QUOTE.test(line) && line.length > 24) {
        return { kind: 'quote', text: line };
      }
      return { kind: 'paragraph', text: line };
    });

    function isTitleish(block, next) {
      if (!block || block.kind !== 'paragraph' || block.isLink) return false;
      var t = block.text;
      var limit = t.endsWith(':') ? LABEL_MAX : TITLE_MAX;
      if (t.length < 2 || t.length > limit || !/\p{Letter}/u.test(t)) return false;
      if (/:.+$/.test(t) || /^[\p{Lowercase_Letter}—–→]/u.test(t)) return false;
      if (/[.!,;]$/.test(t.replace(DECORATION, '')) || !next) return false;
      if (!next.isLink && next.kind === 'paragraph' && /^\p{Lowercase_Letter}/u.test(next.text)) return false;
      return true;
    }

    function introduces(next) {
      if (!next) return false;
      if (next.kind === 'bullet' || next.kind === 'numbered' || next.kind === 'dated') return true;
      if (next.text.length >= 60) return true;
      return next.text.length >= 20 && next.text.endsWith(':');
    }

    var marks = blocks.map(function (block, i) {
      if (!isTitleish(block, blocks[i + 1])) return null;
      if (block.text.endsWith(':')) return 'label';
      return introduces(blocks[i + 1]) ? 'heading' : null;
    });

    for (var i = blocks.length - 2; i >= 0; i--) {
      if (marks[i] || !marks[i + 1]) continue;
      if (marks[i - 1] === 'label' || marks[i - 1] === 'heading') continue;
      if (isTitleish(blocks[i], blocks[i + 1])) {
        marks[i] = blocks[i].text.endsWith(':') ? 'label' : 'heading';
      }
    }

    for (var j = 0; j < blocks.length; j++) {
      if (marks[j] !== 'label') continue;
      var run = 0;
      for (var k = j + 1; k < blocks.length; k++) {
        var b = blocks[k];
        if (b.kind !== 'paragraph' || b.isLink || b.text.length > TITLE_MAX) break;
        if (/[.!?,;]$/.test(b.text.replace(DECORATION, ''))) break;
        run++;
      }
      if (run >= 2) for (var q = 0; q < run; q++) marks[j + 1 + q] = null;
    }

    marks.forEach(function (mark, index) { if (mark) blocks[index].kind = mark; });

    var out = [];
    for (var n = 0; n < blocks.length; n++) {
      var block = blocks[n], next = blocks[n + 1];
      if (block.kind === 'label' && block.isDate && next && next.kind === 'paragraph' && !next.isLink) {
        out.push({ kind: 'dated', when: block.text, text: next.text });
        n++;
        continue;
      }
      if (block.kind === 'quote' && next && next.kind !== 'quote') {
        var who = next.text.replace(/^[-–—•*]\s*/, '');
        if (who.length <= 40 && !/[.!?]$/.test(who)) {
          out.push({ kind: 'quote', text: block.text });
          out.push({ kind: 'attribution', text: who });
          n++;
          continue;
        }
      }
      out.push(block);
    }
    return out;
  }

  return { readLetter: readLetter };
});
