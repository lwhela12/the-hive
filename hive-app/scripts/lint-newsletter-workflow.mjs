import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const admin = fs.readFileSync(path.join(root, 'app/(app)/admin.tsx'), 'utf8');
const panels = fs.readFileSync(path.join(root, 'components/admin/GodModePanels.tsx'), 'utf8');
const writer = fs.readFileSync(path.join(root, 'app/(app)/newsletter.tsx'), 'utf8');
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
if (!panels.includes('Sent & past issues') || panels.includes('issues.slice(0, 1)')) {
  failures.push('Test & send must put completed issues straight into one history shelf');
}
if (!panels.includes('currentNewsletterDraft(issues)') || !writer.includes('currentNewsletterDraft(candidates)')) {
  failures.push('Admin and writer must share the same current-draft policy');
}

if (failures.length) {
  console.error('Newsletter workflow: one ideas tab, reversible overflow, one draft, one history.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Newsletter workflow: combined ideas, two-way tabs, shared draft policy, immediate history.');
