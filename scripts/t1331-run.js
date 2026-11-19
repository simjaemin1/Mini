#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1331 판 자 · 제품 무변)
// === scripts/t1331-run.js — 서버 판 자(t577 아이 env 그대로 · `kidEnv`)를 **존 하나 골라** 가상 시계로 띄우고 T1331 탐침(`t1331-ledger-probe.js`)을 싣는다 ===
//   왜: t577 자는 존이 한반도로 박혀 있다(`ZONE_ID: 'hanbando'`). 닛폰 장부 · 몸을 같은 자 같은 조건으로 재려고 존 칸 하나만 덮는다(나머지 env · 훅 · 시계 그대로).
//   판 조건 = 서버 기준선 자(`server-baseline-check.js --vclock`)와 같다: `VILLAGE_CARAVAN_MAX=0` · `T400_BUILD_ACT=0` · 가상 시계 · 생활층 훅 없음.
//   쓰는 법: node scripts/t1331-run.js <outdir> <표지> <존> <씨> <날> [--days-probe 1,2,…] [--env K=V,…]
//   결과: <outdir>/<표지>.json(t577 판 JSON) · <표지>.probe.jsonl(탐침 줄) · <표지>.log · 벽시계 초는 <표지>.done 에.
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다(PM land1082)
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const [OUTD, TAG, ZONE, SEEDS, DAYSS] = A;
if (!OUTD || !TAG || !ZONE || !SEEDS || !DAYSS) { console.error('쓰는 법: <outdir> <표지> <존> <씨> <날> [--days-probe …] [--env K=V,…]'); process.exit(2); }
// 판 조건(기준선 자의 COND) — 부르는 쪽 env 가 먼저
for (const [k, v] of Object.entries({ VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0', T745_VCLOCK: '1' })) if (process.env[k] == null) process.env[k] = v;
for (const kv of String(opt('--env', '')).split(',').filter(Boolean)) { const i = kv.indexOf('='); process.env[kv.slice(0, i)] = kv.slice(i + 1); }
const T577 = require('./t577-server-run');
fs.mkdirSync(OUTD, { recursive: true });
(async () => {
  const port = await T577.freePort();
  const out = path.join(OUTD, TAG + '.json'), db = path.join(OUTD, TAG + '.db'), logf = path.join(OUTD, TAG + '.log'), pj = path.join(OUTD, TAG + '.probe.jsonl');
  for (const f of [out, db, db + '-wal', db + '-shm', pj, path.join(OUTD, TAG + '.done')]) { try { fs.unlinkSync(f); } catch (e) {} }
  const env = T577.kidEnv({ seed: parseInt(SEEDS, 10), port, db, out, days: parseInt(DAYSS, 10) });
  env.ZONE_ID = ZONE;
  env.T1331_PROBE_OUT = pj;
  if (opt('--days-probe', '')) env.T1331_PROBE_DAYS = opt('--days-probe', '');
  env.NODE_OPTIONS = (`--require ${path.join(__dirname, 't745-vclock.js')} ` + (process.env.NODE_OPTIONS || '') + ` --require ${path.join(__dirname, 't1331-ledger-probe.js')}`).trim();
  const t0 = Date.now();
  const child = spawn(process.execPath, ['-r', path.join(__dirname, 't577-server-hook.js'), path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const lf = fs.createWriteStream(logf); child.stdout.pipe(lf); child.stderr.pipe(lf);
  child.on('exit', (code) => {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    fs.writeFileSync(path.join(OUTD, TAG + '.done'), JSON.stringify({ code, sec, zone: ZONE, seed: SEEDS, days: DAYSS, env: opt('--env', '') }) + '\n');
    console.log(`[t1331-run] ${TAG} 끝 code ${code} · ${sec}초`);
    process.exit(0);
  });
})();
