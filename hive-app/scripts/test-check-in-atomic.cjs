// Isolated PostgreSQL (PGlite) regression; never connects to Supabase.
// npm install --prefix /tmp/hive-atomic-save-test --no-audit --no-fund --package-lock=false @electric-sql/pglite
// NODE_PATH=/tmp/hive-atomic-save-test/node_modules node scripts/test-check-in-atomic.cjs
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const db = new PGlite();
 const u='00000000-0000-0000-0000-000000000001', h='00000000-0000-0000-0000-000000000002', other='00000000-0000-0000-0000-000000000003', s='00000000-0000-0000-0000-000000000004', e='00000000-0000-0000-0000-000000000005', monthSurvey='00000000-0000-0000-0000-000000000006', undated='00000000-0000-0000-0000-000000000008', undatedEvent='00000000-0000-0000-0000-000000000009';
 await db.exec(`create role authenticated; create role anon; create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key); create table communities(id uuid primary key);
 create table surveys(id uuid primary key,title text,is_active boolean,community_id uuid);
 create table community_memberships(user_id uuid,community_id uuid);
 create table events(id uuid primary key,community_id uuid,event_date date,event_type text,status text);
 create function check_in_kind(text) returns text language sql as $$select $1$$;
 create table survey_responses(id uuid primary key default gen_random_uuid(),survey_id uuid references surveys,user_id uuid references profiles,community_id uuid references communities,response_period text,answers jsonb,submitted_at timestamptz, metadata text default 'preserved',community_key uuid generated always as (coalesce(community_id,'00000000-0000-0000-0000-000000000000'::uuid)) stored,unique(survey_id,user_id,response_period,community_key));
 insert into profiles values ('${u}'); insert into communities values ('${h}'),('${other}'),('${undated}');
 insert into surveys values ('${s}','premeeting',true,null),('${monthSurvey}','endofmonth',true,null);
 insert into community_memberships values ('${u}','${h}'),('${u}','${undated}');
 insert into events values ('${e}','${h}',current_date + 3,'meeting','scheduled');
 grant usage on schema public,auth to authenticated,anon;
 grant select on all tables in schema public to authenticated;
 `);
 await db.exec(fs.readFileSync(`${__dirname}/../supabase/migrations/233_check_in_occurrence_receipts.sql`,'utf8'));
 await db.exec(fs.readFileSync(`${__dirname}/../supabase/migrations/236_check_ins_stay_open_without_a_meeting.sql`,'utf8'));
 await db.exec(`grant select on check_in_completions to authenticated; set role authenticated; select set_config('request.jwt.claim.sub','${u}',false);`);
 const save = async (answers, community=h, occurrence=`meeting:${e}`, survey=s) => (await db.query('select save_check_in_occurrence($1,$2,$3,$4) as response',[survey,community,occurrence,JSON.stringify(answers)])).rows[0].response;
 const first=await save({q:1}); const revised=await save({q:2});
 assert.ok((await db.query('select answers from check_in_answer_history')).rows.some(r => r.answers.q === 1));
 await assert.rejects(db.query("delete from check_in_answer_history"));
 await db.exec(`reset role; update survey_responses set answers='{"legacy":"late browser write"}'; set role authenticated;`);
 await save({q:2});
 assert.ok((await db.query('select answers from check_in_answer_history')).rows.some(r => r.answers.legacy === 'late browser write'));
 await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
 assert.equal((await db.query('select count(*)::int as n from check_in_answer_history')).rows[0].n,0);
 await db.exec(`select set_config('request.jwt.claim.sub','${u}',false)`);
 assert.equal(first.id,revised.id); assert.equal(revised.metadata,'preserved');
 assert.deepEqual((await db.query('select answers from check_in_completions')).rows[0].answers,{q:2});
 await assert.rejects(save({q:3},other)); await assert.rejects(save({q:3},null)); await assert.rejects(save({q:3},h,'meeting:wrong')); await assert.rejects(save([]));
 await save({q:'waiting'},undated,`next:${undated}`);
 await db.exec(`reset role; insert into events values ('${undatedEvent}','${undated}',current_date + 4,'meeting','scheduled'); set role authenticated;`);
 await save({q:'scheduled'},undated,`meeting:${undatedEvent}`);
 const carried=(await db.query('select occurrence from check_in_completions where community_id=$1 order by occurrence',[undated])).rows.map(r=>r.occurrence);
 assert.deepEqual(carried,[`carried-to:${undatedEvent}`,`meeting:${undatedEvent}`]);
 await assert.rejects(save({},null,'month:1900-01',monthSurvey));
 await assert.rejects(db.query('update check_in_completions set answers = $1',[{q:'bypass'}]));
 // Force the SECOND write to fail: first-time and revision saves both roll back.
 await db.exec(`reset role; create function reject_receipt() returns trigger language plpgsql as $$begin if new.answers ? 'fail' then raise exception 'injected receipt failure'; end if; return new; end;$$;
 create trigger reject_receipt before insert or update on check_in_completions for each row execute function reject_receipt(); set role authenticated;`);
 await assert.rejects(save({fail:true}));
 assert.deepEqual((await db.query('select answers from survey_responses')).rows[0].answers,{q:2});
 assert.deepEqual((await db.query('select answers from check_in_completions')).rows[0].answers,{q:2});
 const month=(await db.query("select 'month:' || to_char(now() at time zone 'America/Los_Angeles','YYYY-MM') as value")).rows[0].value;
 await assert.rejects(save({fail:true},null,month,monthSurvey));
 assert.equal((await db.query('select count(*)::int as n from survey_responses')).rows[0].n,2);
 await save({month:'wide'},null,month,monthSurvey);
 await save({month:'hive'},h,month,monthSurvey);
 assert.equal((await db.query('select count(*)::int as n from check_in_completions')).rows[0].n,5);
 // Two meetings in one month retain separate occurrence answers, while
 // existing monthly consumers continue to see the canonical latest response.
 const secondEvent='00000000-0000-0000-0000-000000000007';
 await db.exec(`reset role; insert into events select '${secondEvent}',community_id,event_date,event_type,status from events where id='${e}'; set role authenticated;`);
 const second=await save({q:'second'},h,`meeting:${secondEvent}`);
 assert.equal(second.id,first.id);
 const meetingAnswers=(await db.query("select occurrence,answers from check_in_completions where survey_id=$1 and community_id=$2 order by occurrence",[s,h])).rows;
 assert.deepEqual(meetingAnswers.map(r=>r.answers),[{q:2},{q:'second'}]);
 await db.exec(`reset role; update events set status='cancelled' where id='${secondEvent}'; set role authenticated;`);
 await assert.rejects(save({},h,`meeting:${secondEvent}`));
 await db.exec(`reset role; update surveys set is_active=false where id='${s}'; set role authenticated;`);
 await assert.rejects(save({}));
 await db.exec(`reset role; update surveys set is_active=true where id='${s}'; set role authenticated;`);
 await db.exec("select set_config('request.jwt.claim.sub','',false)"); await assert.rejects(save({}));
 for (const page of ['beforewemeet','endofmonth']) {
  const source=fs.readFileSync(`${__dirname}/../app/(app)/${page}/index.tsx`,'utf8');
  assert.ok(source.includes('submitCheckInOccurrence('));
  assert.ok(!source.includes("from('check_in_completions').upsert"));
  assert.ok(!source.includes('await submitResponse(') && !source.includes('await submitPerHiveResponses('));
 }
 console.log('PASS: real isolated PostgreSQL migration/RPC; canonical id + metadata; receipt-failure insert/update rollback; membership/meeting/month/auth/JSON guards; direct receipt writes denied; distinct HIVE-wide/per-HIVE receipts; both UI callers use RPC only.');
 await db.close();
})().catch(e => { console.error(e); process.exitCode=1; });
