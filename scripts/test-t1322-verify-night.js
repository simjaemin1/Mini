#!/usr/bin/env node
'use strict';
// @regress
// @regress-alone   ← [T1288] 러너 -j 판에서 맨 먼저 혼자 돈다(다른 하네스를 안 띄운다) · 긴 판(홀로 1,827초 · CPU 를 판 내내 쥔다) — 판 C -j4 에서 러너 상한 2400초 넘김 · 홀로 초록 · 곁 하네스의 시간 재기도 흔든다
// === scripts/test-t1322-verify-night.js — 첫 거름 견줌 판(야간 · T1323 · T1322 회부 1) ===
//   몸 전부 판(T1270 판 자 — `scripts/t1294/run.cjs` · 가상 시계 · 시드 1020 · 30날)을 `T1322_PREFILTER=verify` 로 한 판 돌린다.
//   `verify` 는 거를 때마다 몸을 열어 종전 걸음 문 머리 글자로 다시 판정한다(어긋나면 그 몸은 종전 길 — 판은 늘 종전 답).
//   ★[T1337] `T1337_WAKE=verify` 도 같이 — ④ 잠 깨움 표가 건너려던 결정을 실제로 돌려 견줌 어긋남 0.
//   ① 판이 끝까지 돌았다(가상 시계 오류 0 · 30날)  ② 견줌이 탔다(자명 통과 아님)  ③ **어긋남 0** — 아니면 빨강 + 어긋난 칸 · 몸 · 시각 + 그 칸을 걸음 문 밖에서 쓰는 자리(정적 후보) 한 줄씩.
//   판 하나 ≈ 30 ~ 35분(혼자). 짧게: `T1323_NIGHT_DAYS=2`.
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path'), fs = require('fs'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DAYS = +(process.env.T1323_NIGHT_DAYS || 30), SEED = String(process.env.T1323_NIGHT_SEED || 1020);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const out = fs.mkdtempSync(path.join(os.tmpdir(), 't1323-night-'));
console.log(`\n=== 첫 거름 견줌 판 — 시드 ${SEED} · ${DAYS}날 · ${out} ===`);
const t0 = Date.now();
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't1294', 'run.cjs'), path.join(out, 'run'), String(DAYS)], {
  cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, T1278_ROOT: ROOT, T1294_SEED: SEED, T577_PORT_BASE: process.env.T577_PORT_BASE || '47900', T1322_PREFILTER: 'verify', T1337_WAKE: 'verify', T1322_STAT: path.join(out, 'st-%p.json') } });
const st = fs.existsSync(path.join(out, 'run', 'status.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'run', 'status.json'), 'utf8')) : null;
ok(r.status === 0 && st && st.valid && st.days === DAYS, `① 판이 끝까지 돌았다(${DAYS}날 · 가상 시계 오류 0)`, `rc ${r.status} · ${Math.round((Date.now() - t0) / 1000)}초`);
const S = { skip: 0, vchecks: 0, bad: 0, why: {}, ex: [], dvq: 0, dcmp: 0, dbad: 0, dwhy: {}, dex: [] };   // ★[T1337] 잠 깨움 견줌(건너려던 결정을 실제로 돌려 견줌)
for (const f of fs.readdirSync(out).filter((x) => /^st-\d+\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
  S.skip += j.skip; S.vchecks += j.vchecks; S.bad += j.bad; for (const [k, v] of Object.entries(j.why || {})) S.why[k] = (S.why[k] || 0) + v; S.ex.push(...(j.ex || []));
  S.dvq += j.dvq || 0; S.dcmp += j.dcmp || 0; S.dbad += j.dbad || 0; for (const [k, v] of Object.entries(j.dwhy || {})) S.dwhy[k] = (S.dwhy[k] || 0) + v; S.dex.push(...(j.dex || []));
}
ok(S.vchecks > 0 && S.vchecks === S.skip && S.vchecks > DAYS * 1e6, '② 견줌이 탔다(건넌 몸마다 몸을 열어 다시 판정)', `견줌 ${S.vchecks}`);
// 어긋난 칸 → 그 칸을 쓰는 서버 자리(걸음 문 `npcStep` 몸통 밖 · 정적 후보)
const FIELD = { hp: ['hp'], inactive: ['simJob', 'simVillageId', 'x', 'y'], gate: ['nextDecisionAt', 'canadiaVillage'], nda: ['nextDecisionAt'], moved: ['x', 'y'], evac: ['simEvacUntil'],
  night: ['targetX', 'targetY', 'behavior', 'gatherTarget', 'npcBedX', 'npcBedY', 'npcHomeX', 'npcHomeY', 'simLonOff'], state: ['behavior', 'targetX', 'targetY', 'path', 'pathIndex', 'vx', 'vy', 'gatherTarget', 'harvestTarget', 'canadiaTask', 'floor'] };
function sites(fields) {
  const res = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'server')).filter((x) => x.endsWith('.js'))) {
    const L = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8').split('\n');
    let inStep = false;
    L.forEach((ln, i) => {
      if (f === 'zone.js' && /^function npcStep\(/.test(ln)) inStep = true; else if (inStep && ln === '}') inStep = false;
      if (inStep) return;
      for (const k of fields) if (new RegExp(`\\.${k}\\s*(=[^=]|\\+\\+|--|\\+=|-=)`).test(ln)) { res.push(`${f}:${i + 1}`); break; }
    });
  }
  return res;
}
const whyTxt = Object.entries(S.why).map(([k, v]) => `${k} ${v}`).join(' · ');
ok(S.bad === 0, '③ 어긋남 0 — 표가 산 동안 걸음 문 밖에서 판정 칸을 바꾼 쓰기가 없다', `어긋남 ${S.bad}${whyTxt ? ' · ' + whyTxt : ''}`);
ok(S.dvq > 0 && S.dcmp === S.dvq && S.dbad === 0, '④ ★[T1337] 잠 깨움 — 건너려던 결정을 실제로 돌려 견줌 어긋남 0(결정 시각 · 몸 칸)', `견줌 ${S.dvq} · 돌린 뒤 견줌 ${S.dcmp} · 어긋남 ${S.dbad}${Object.keys(S.dwhy).length ? ' · ' + JSON.stringify(S.dwhy) : ''}`);
if (S.dbad) for (const e of S.dex.slice(0, 8)) console.log('    · 잠 깨움 ' + e);
if (S.bad) {
  for (const e of S.ex.slice(0, 8)) console.log('    · ' + e);
  for (const k of Object.keys(S.why)) { const s = sites(FIELD[k] || []); console.log(`    · 칸 ${k}(${(FIELD[k] || []).join(' · ')}) 을 걸음 문 밖에서 쓰는 자리 ${s.length}: ${s.slice(0, 12).join(' ')}${s.length > 12 ? ' …' : ''}`); }
}
try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) {}
console.log(`\n=== T1322 첫 거름 견줌 판 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
