import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const openFeedback = fs.readFileSync(path.join(root, 'lib/openFeedback.ts'), 'utf8');
const feedbackPage = fs.readFileSync(path.join(root, 'app/(app)/app-feedback.tsx'), 'utf8');

for (const forbidden of [
  'Include a screenshot?',
  'captureFeedbackScreenshot',
  'captureRequested',
  'window.confirm',
  'Alert.alert',
]) {
  if (openFeedback.includes(forbidden)) failures.push(`lib/openFeedback.ts restores “${forbidden}”`);
}
if (!openFeedback.includes("...(originPath ? { originPath } : {})")) {
  failures.push('lib/openFeedback.ts must carry a safe return path into App Feedback');
}
if (!feedbackPage.includes('onBackPress={originPath ? () => router.replace(originPath as never) : undefined}')) {
  failures.push('App Feedback must return to the page that opened it');
}

if (failures.length) {
  console.error('App Feedback opens directly and always has a way back.\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('App Feedback: direct door, optional attachments inside, return path preserved.');
