import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const admin = fs.readFileSync(path.join(root, 'app/(app)/admin.tsx'), 'utf8');
const panels = fs.readFileSync(path.join(root, 'components/admin/GodModePanels.tsx'), 'utf8');
const writer = fs.readFileSync(path.join(root, 'app/(app)/newsletter.tsx'), 'utf8');
const buzz = fs.readFileSync(path.join(root, 'app/(app)/buzz.tsx'), 'utf8');
const buzzArchiveMigration = fs.readFileSync(path.join(root, 'supabase/migrations/210_the_buzz_is_one_archive.sql'), 'utf8');
// The three places a letter is drawn. A marker that only some of them know is
// a picture in the email and the literal text `[[IMAGE:…]]` on the website.
const email = fs.readFileSync(path.join(root, 'supabase/functions/send-newsletter/index.ts'), 'utf8');
const publicSite = fs.readFileSync(path.join(root, '../site/index.html'), 'utf8');
const appNews = fs.readFileSync(path.join(root, 'lib/appNews.ts'), 'utf8');
const draftFunction = fs.readFileSync(path.join(root, 'supabase/functions/draft-newsletter/index.ts'), 'utf8');
const quickAdd = fs.readFileSync(path.join(root, 'components/navigation/QuickAdd.tsx'), 'utf8');
const failures = [];

if (!admin.includes("accessibilityLabel={direction < 0 ? 'Show earlier tabs' : 'Show more tabs'}")) {
  failures.push('Admin panel overflow must provide both earlier and later tab controls');
}
if (panels.includes('Ideas & shout-outs')) {
  failures.push('Newsletter must not restore a separate Ideas & shout-outs tab');
}
if (!panels.includes('titleTabKey="shoutouts"')) {
  failures.push('Newsletter name tab must open the combined ideas worktop');
}
if (panels.includes("{ key: 'write', label: 'Write this month’s' }")
  || !panels.includes('accessibilityLabel="Write this month’s newsletter"')
  || panels.includes('Add a newsletter note')) {
  failures.push('Newsletter must have one Write this month’s pill and no duplicate write or quick-add control');
}
if (!panels.includes('Sent & past issues') || panels.includes('issues.slice(0, 1)')) {
  failures.push('Test & send must put completed issues straight into one history shelf');
}
if (!panels.includes('currentNewsletterDraft(issues)') || !writer.includes('currentNewsletterDraft(candidates)')) {
  failures.push('Admin and writer must share the same current-draft policy');
}
if (!buzz.includes('currentNewsletterDraft(candidates)') || !buzz.includes('newsletterIssueHistory(candidates, draft)')) {
  failures.push('The Buzz must share the same draft/history policy as Admin and the writer');
}
if (buzz.includes("filter((row) => row.visibility === 'public' || sent.has(row.id) || isOwner)")) {
  failures.push('The Buzz must not relabel imported history as owner-only drafts');
}
if (!buzz.includes('subtitle={formatDateLong(item.created_at)}') || buzz.includes(' · from ${hiveDisplayName')) {
  failures.push('Buzz cards must show the date only, with no source-HIVE delineation');
}
if (!buzzArchiveMigration.includes('HIVE members locate the Buzz archive')
  || !buzzArchiveMigration.includes('HIVE members read the completed Buzz archive')) {
  failures.push('Every HIVE member must be able to locate and read the completed Buzz archive');
}
if (!writer.includes('.filter(isPublicNewsletterSafeAppNews)')) {
  failures.push('Newsletter app news must be filtered before it leaves the client.');
}
if (!appNews.includes("!/\\bproduction(?:\\s+hive)?\\b/i.test(copy)")) {
  failures.push('The public app-news filter must exclude Production HIVE.');
}
if (!draftFunction.includes('Never mention Production HIVE')
  || !draftFunction.includes('exact number of HIVEs')) {
  failures.push('The newsletter writer must never expose Production HIVE or an exact HIVE count.');
}
if (!draftFunction.includes(".eq('visibility', 'public').eq('invited_scope', 'public')")
  || draftFunction.includes(".in('visibility', ['all_hives', 'public'])")) {
  failures.push('The public newsletter event list must accept public/public events only, never member-only HIVE-Wide events.');
}
if (!draftFunction.includes('This is one sealed event block')
  || !draftFunction.includes('Keep every shelter, mascot, costume, current-focus and logging')) {
  failures.push('Upcoming events and HIVE Help must each stay in one non-repeating section.');
}
if (!draftFunction.includes('The HIVE knows every HD Wish')
  || !draftFunction.includes('midMonthSpan')) {
  failures.push('Wish copy and HIVE Help timing must match how the community actually works.');
}
if (!quickAdd.includes('usePersistentTextDraft')
  || !quickAdd.includes('quick-add:newsletter:')
  || !quickAdd.includes('clearNewsletterThought();')) {
  failures.push('Quick Add must keep an unfinished newsletter note until a successful save.');
}
if (!writer.includes('accessibilityLabel="Newsletter title"')
  || !writer.includes('accessibilityLabel="Newsletter draft"')) {
  failures.push('The newsletter writer must keep both the title and letter editable on the page.');
}
if (!writer.includes('saveExistingDraft') || !writer.includes("draftPostId ? 'unsaved' : 'not_saved'")) {
  failures.push('Edits to a saved newsletter draft must autosave from the writing page.');
}
if (!writer.includes('Nothing sends from this page')) {
  failures.push('The writer must say plainly that saving and sending are separate actions.');
}
if (writer.includes('then edit it there')) {
  failures.push('The writer must not send Nat elsewhere to edit the newsletter.');
}

/**
 * The newsletter question ids are declared once, in the file that writes the
 * check-ins, and read everywhere else.
 *
 * `lib/checkIns.ts` says it out loud: *"an id on this list is a question with a
 * destination and an id off it is busy work."* A second copy in the panel that
 * SHOWS the answers is how a HIVE ends up being asked a question whose answer
 * nobody ever sees.
 */
if (!panels.includes('NEWSLETTER_ANSWER_IDS,') || /const NEWSLETTER_ANSWER_IDS\s*=/.test(panels)) {
  failures.push('Admin must import NEWSLETTER_ANSWER_IDS from lib/checkIns, never declare its own');
}

/**
 * A picture in the letter has to render in all three surfaces, or in none.
 *
 * Nat's rule for the letter, 2026-08-12: *"whatever is in the email [is] on
 * HIVE wide & public site... nothing gets lost."* The `[[BUTTON:…]]` marker is
 * duplicated across these same three files for the same reason, and this is
 * what stops the next marker being added to one of them and forgotten in the
 * other two.
 *
 * `https:` is asserted in each one on purpose: the marker is written by hand
 * into text that three renderers turn into markup, and a `javascript:` src is
 * the one thing that path must never carry.
 */
const imageSurfaces = [
  ['the writer and The Buzz (app/(app)/newsletter.tsx)', writer],
  ['the email (supabase/functions/send-newsletter/index.ts)', email],
  ['the public site (site/index.html)', publicSite],
];
for (const [where, source] of imageSurfaces) {
  if (!source.includes('IMAGE:')) {
    failures.push(`A [[IMAGE:…]] line must render as a picture in ${where}`);
  } else if (!source.includes('https:')) {
    failures.push(`The picture marker in ${where} must accept https URLs only`);
  }
}

if (failures.length) {
  console.error('Newsletter workflow: one ideas tab, reversible overflow, one draft, one history.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Newsletter workflow: combined ideas, write/preview/facts tabs, inline autosave, shared draft policy, immediate history, pictures on all three surfaces.');
