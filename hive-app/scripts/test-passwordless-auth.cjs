const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const login = read('app/(auth)/login.tsx');
const callback = read('app/(auth)/callback.tsx');
const layout = read('app/_layout.tsx');
const join = read('app/join.tsx');
const profile = read('app/(app)/profile.tsx');
const guard = read('supabase/migrations/20261029194659_guard_profile_email_for_code_sign_in.sql');
const prepareEmailLogin = read('supabase/functions/prepare-email-login/index.ts');
const linkedLogins = read('components/profile/LinkedLogins.tsx');
const envExample = read('.env.example');

assert.match(login, /Continue with Google/, 'Google must remain the primary sign-in option');
assert.match(login, /Or use your email/, 'the email alternative must be named at the door');
assert.match(login, /Email me a sign-in code/, 'the email action must promise a code');
assert.match(
  login,
  /const EMAIL_AUTH_ENABLED = process\.env\.EXPO_PUBLIC_EMAIL_AUTH_ENABLED === 'true'/,
  'email auth must fail closed unless a build explicitly sets the release flag to true'
);
assert.ok(
  login.indexOf('{EMAIL_AUTH_ENABLED ? (') < login.indexOf('Or use your email'),
  'the email controls must render inside the release gate'
);
assert.match(login, /signInWithOtp\(\{[\s\S]*shouldCreateUser: false/, 'email sign-in must not create a separate Auth user for an existing member');
assert.match(login, /supabase\.functions\.invoke\('prepare-email-login'/, 'new email members need a verified invite before Auth provisioning');
assert.match(login, /verifyOtp\(\{ email: address, token, type: 'email' \}\)/, 'returning email codes must verify in place');
assert.match(login, /verifyOtp\(\{ email: address, token, type: 'signup' \}\)/, 'first-use email codes must verify in place');
assert.match(login, /router\.replace\(\(safeReturnTo \?\? '\/'\)/, 'email-code sign-in must keep the protected return path');
assert.match(login, /identity\.provider === 'google'/, 'shared-device Google hints must use the linked Google identity');
assert.match(login, /rememberSignIn\(googleIdentityEmail\)/, 'a preferred Hotmail sign-in must not become the Google login hint');

assert.match(callback, /if \(sanitizeReturnTo\(params\.returnTo\) !== '\/settings'\) throw exchangeError/, 'a failed sign-in callback must never enter HIVE');
assert.ok(!join.includes('Google session'), 'invite copy must not assume Google sign-in');
assert.ok(!join.includes('invited Google account'), 'invite account guidance must work for either sign-in method');
assert.ok(!profile.includes('sign in again with Google'), 'sign-out copy must not promise a Google-only return');

assert.match(layout, /profileInsertError\?\.code === '23505'/, 'a profile-email race must stop as an identity conflict');
assert.match(guard, /create unique index if not exists profiles_one_email_idx/, 'profile emails need a database-level duplicate guard');
assert.ok(!guard.includes('security definer'), 'the guard must not expose a privileged public function');
assert.match(prepareEmailLogin, /\.eq\('token', token\)/, 'new Auth user preparation must check the invite token');
assert.match(prepareEmailLogin, /invite\.email\?\.trim\(\)\.toLowerCase\(\) !== email/, 'the invite must belong to the supplied address');
assert.match(prepareEmailLogin, /if \(profile\)/, 'an existing member contact address must not become a new user');
assert.match(linkedLogins, /supabase\.auth\.updateUser\(/, 'preferred email must be changed from within the existing signed-in account');
assert.match(envExample, /EXPO_PUBLIC_EMAIL_AUTH_ENABLED=false/, 'the documented default must keep email auth off');

console.log('PASS: Email login stays gated, new Auth users need an invite, and an existing member must connect another email from inside that account.');
