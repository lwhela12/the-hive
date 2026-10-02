// Isolated PostgreSQL verification of the reporting migration. No live data.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  const og = '00000000-0000-0000-0000-000000000001';
  const tech = '00000000-0000-0000-0000-000000000002';
  const show = '00000000-0000-0000-0000-000000000003';
  const survey = '00000000-0000-0000-0000-000000000004';
  const a = '00000000-0000-0000-0000-000000000011';
  const b = '00000000-0000-0000-0000-000000000012';
  const c = '00000000-0000-0000-0000-000000000013';
  const d = '00000000-0000-0000-0000-000000000014';
  await db.exec(`create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function public.is_hive_owner() returns boolean language sql as $$select false$$;
    create function public.check_in_kind(text) returns text language sql as $$
      select case when $1 = 'End of the month' then 'endofmonth' end
    $$;
    create table communities(id uuid, slug text);
    create table community_memberships(user_id uuid, community_id uuid);
    create table surveys(id uuid, community_id uuid, is_active boolean, title text, created_at timestamptz);
    create table survey_responses(id uuid, survey_id uuid, user_id uuid, community_id uuid,
      response_period text, answers jsonb, submitted_at timestamptz);
    insert into communities values ('${og}','default'),('${tech}','tech'),('${show}','show');
    insert into community_memberships values ('${a}','${og}'),('${a}','${tech}'),
      ('${b}','${og}'),('${c}','${tech}'),('${d}','${og}');
    insert into surveys values ('${survey}',null,true,'End of the month',now());
    insert into survey_responses values
      (gen_random_uuid(),'${survey}','${a}',null,'2026-09',
        '{"q_quarter_helping":"Yes","q_quarter_help_next":"A gentle nudge"}',now()),
      (gen_random_uuid(),'${survey}','${b}',null,'2026-09',
        '{"q_quarter_helping":"A little","q_quarter_help_next":"Time to work together"}',now()),
      (gen_random_uuid(),'${survey}','${c}',null,'2026-09',
        '{"q_quarter_helping":"Not yet","q_quarter_help_next":"Ideas or connections"}',now()),
      (gen_random_uuid(),'${survey}','${b}','${og}','2026-09',
        '{"q_quarter_helping":"Not sure","q_quarter_help_next":"Something else"}',now()),
      (gen_random_uuid(),'${survey}','${d}','${og}','2026-09',
        '{"q_quarter_helping":"Not sure"}',now());
  `);
  await db.exec(fs.readFileSync(`${__dirname}/../supabase/migrations/276_shared_quarter_helping_choice.sql`, 'utf8'));
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
  const summary = async id => (await db.query('select * from quarter_pulse_summary($1,$2)', [id, '2026-09'])).rows;
  const count = (rows, question, option) => Number(rows.find(row => row.question_id === question && row.option === option)?.response_count);
  const ogRows = await summary(og);
  const techRows = await summary(tech);
  assert.equal(count(ogRows, 'q_quarter_helping', 'Yes'), 1, 'one shared answer from a dual member in OG');
  assert.equal(count(ogRows, 'q_quarter_helping', 'A little'), 1, 'shared answer takes precedence over old OG value');
  assert.equal(count(ogRows, 'q_quarter_helping', 'Not sure'), 1, 'old OG answer remains readable as fallback');
  assert.equal(count(ogRows, 'q_quarter_helping', 'Not yet'), 0, 'Tech-only answer stays out of OG');
  assert.equal(count(ogRows, 'q_quarter_help_next', 'Something else'), 0, 'old OG support answer is not double counted');
  assert.equal(count(techRows, 'q_quarter_helping', 'Yes'), 1, 'dual member appears once in Tech');
  assert.equal(count(techRows, 'q_quarter_helping', 'Not yet'), 1, 'Tech-only member appears in Tech');
  assert.equal(count(techRows, 'q_quarter_helping', 'Not sure'), 0, 'OG-only legacy answer stays out of Tech');
  await db.exec(`select set_config('request.jwt.claim.sub','${d}',false);`);
  await assert.rejects(summary(tech), /HIVE membership required/);
  await assert.rejects(summary(show), /no pulse summary/);
  await db.close();
  console.log('Shared quarter summary: scoped counts, shared priority, OG history fallback, and membership guards passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
