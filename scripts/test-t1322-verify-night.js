#!/usr/bin/env node
'use strict';
// @regress
// @bait 1   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// @regress-alone   ← [T1288] 러너 -j 판에서 맨 먼저 혼자 돈다(다른 하네스를 안 띄운다) · 긴 판(홀로 1,827초 · CPU 를 판 내내 쥔다) — 판 C -j4 에서 러너 상한 2400초 넘김 · 홀로 초록 · 곁 하네스의 시간 재기도 흔든다
// === scripts/test-t1322-verify-night.js — 첫 거름 견줌 판(야간 · T1323 · T1322 회부 1) ===
//   몸 전부 판(T1270 판 자 — `scripts/t1294/run.cjs` · 가상 시계 · 시드 1020 · 30날)을 `T1322_PREFILTER=verify` 로 한 판 돌린다.
//   `verify` 는 거를 때마다 몸을 열어 종전 걸음 문 머리 글자로 다시 판정한다(어긋나면 그 몸은 종전 길 — 판은 늘 종전 답).
//   ★[T1337] `T1337_WAKE=verify` 도 같이 — ④ 잠 깨움 표가 건너려던 결정을 실제로 돌려 견줌 어긋남 0.
//   ★[T1348] `T1348_WALK=verify` · `T1348_WORK=verify` 도 같이 — ⑥ 일터 깨움(농부)이 건너려던 결정을 실제로 돌려 견줌 어긋남 0 · ⑤ 걷는 몸 커널이 낼 값 ↔ 진짜 걸음 어긋남 0 · 고리 거울의 'gone' 표 ↔ players 술어 어긋남 0.
//   ① 판이 끝까지 돌았다(가상 시계 오류 0 · 30날)  ② 견줌이 탔다(자명 통과 아님)  ③ **어긋남 0** — 아니면 빨강 + 어긋난 칸 · 몸 · 시각 + 그 칸을 걸음 문 밖에서 쓰는 자리(정적 후보) 한 줄씩.
//   판 하나 ≈ 30 ~ 35분(혼자). 짧게: `T1323_NIGHT_DAYS=2`.
//   ★미끼 [T1356] — 존 사본 한 곳: 거름(`_t1322Skip`)의 결정 시각 문 `!(now < A.NDA[s])` 를 `false` 로(결정 시각이 지나도 건넌다) → 짧은 판(`T1356_BAIT_DAYS` · 기본 2날)에서
//     ③ 어긋남 > 0 이 빨강이어야 한다. 존은 판 자의 아이라 이 파일을 프리로드(`T1294_PRELOAD`)로 싣고 `__T1322_BAIT=1` 일 때만 `server/zone.js` 를 읽을 때 바꾼다
//     (프로세스마다 바꾼 자리 수를 `__T1322_BAIT_LOG` 에 한 줄 — 판정이 센다).
if (require.main !== module) {   // ★[T1356] 프리로드로 실렸을 때 — 미끼 갈아 끼우기만(판을 안 돈다)
  if (process.env.__T1322_BAIT === '1') {
    const Module = require('module'), _c = Module.prototype._compile, ZP = require('path').join('server', 'zone.js');
    const FROM = '!(now < A.NDA[s]) ? ((A.DS[s]', TO = 'false ? ((A.DS[s]';   // verify 는 `_t1322State` 를 같이 부르므로 그 함수를 바꾼 사본은 안 잡힌다 — 거름 쪽 한 곳
    Module.prototype._compile = function (content, filename) {
      if (filename.endsWith(ZP)) {
        const n = content.split(FROM).length - 1; content = content.replace(FROM, TO);
        if (process.env.__T1322_BAIT_LOG) { try { require('fs').appendFileSync(process.env.__T1322_BAIT_LOG, `${process.pid} ${n}\n`); } catch (e) {} }
      }
      return _c.call(this, content, filename);
    };
  }
  return;
}
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path'), fs = require('fs'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DAYS = +(process.env.T1323_NIGHT_DAYS || 30), SEED = String(process.env.T1323_NIGHT_SEED || 1020);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const out = fs.mkdtempSync(path.join(os.tmpdir(), 't1323-night-'));
console.log(`\n=== 첫 거름 견줌 판 — 시드 ${SEED} · ${DAYS}날 · ${out} ===`);
const t0 = Date.now();
const runEnv = (dir, extra) => ({ ...process.env, T1278_ROOT: ROOT, T1294_SEED: SEED, T577_PORT_BASE: process.env.T577_PORT_BASE || '47900', T1322_PREFILTER: 'verify', T1337_WAKE: 'verify', T1348_WALK: 'verify', T1348_WORK: 'verify', T1322_STAT: path.join(dir, 'st-%p.json'), ...(extra || {}) });   // ★[PM land1083] T1348 견줌 둘(S4) + T1356 `runEnv` · `stats`(S12) 합침
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't1294', 'run.cjs'), path.join(out, 'run'), String(DAYS)], {
  cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], env: runEnv(out) });
const st = fs.existsSync(path.join(out, 'run', 'status.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'run', 'status.json'), 'utf8')) : null;
ok(r.status === 0 && st && st.valid && st.days === DAYS, `① 판이 끝까지 돌았다(${DAYS}날 · 가상 시계 오류 0)`, `rc ${r.status} · ${Math.round((Date.now() - t0) / 1000)}초`);
function stats(dir) {
  const S = { skip: 0, vchecks: 0, bad: 0, why: {}, ex: [], dvq: 0, dcmp: 0, dbad: 0, dwhy: {}, dex: [], wvq: 0, wcmp: 0, wbad: 0, wwhy: {}, wex: [], gnbad: 0, fvq: 0, fcmp: 0, fbad: 0, fwhy: {}, fex: [] };   // ★[T1348] 걷는 몸 견줌 · gone 표   // ★[T1337] 잠 깨움 견줌(건너려던 결정을 실제로 돌려 견줌)
  for (const f of fs.readdirSync(dir).filter((x) => /^st-\d+\.json$/.test(x))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    S.skip += j.skip; S.vchecks += j.vchecks; S.bad += j.bad; for (const [k, v] of Object.entries(j.why || {})) S.why[k] = (S.why[k] || 0) + v; S.ex.push(...(j.ex || []));
    S.fvq += j.fvq || 0; S.fcmp += j.fcmp || 0; S.fbad += j.fbad || 0; for (const [k, v] of Object.entries(j.fwhy || {})) S.fwhy[k] = (S.fwhy[k] || 0) + v; S.fex.push(...(j.fex || []));
    S.wvq += j.wvq || 0; S.wcmp += j.wcmp || 0; S.wbad += j.wbad || 0; S.gnbad += j.gnbad || 0; for (const [k, v] of Object.entries(j.wwhy || {})) S.wwhy[k] = (S.wwhy[k] || 0) + v; S.wex.push(...(j.wex || []));
    S.dvq += j.dvq || 0; S.dcmp += j.dcmp || 0; S.dbad += j.dbad || 0; for (const [k, v] of Object.entries(j.dwhy || {})) S.dwhy[k] = (S.dwhy[k] || 0) + v; S.dex.push(...(j.dex || []));
  }
  return S;
}
const S = stats(out);
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
ok(S.wvq > DAYS * 1e5 && S.wcmp === S.wvq && S.wbad === 0 && S.gnbad === 0, '⑤ ★[T1348] 걷는 몸 커널 — 낼 값(속도 · 길 번호 · 막힘 자리) ↔ 진짜 걸음 어긋남 0 · 고리 거울 gone 표 ↔ players 술어 어긋남 0', `견줌 ${S.wvq} · 돌린 뒤 견줌 ${S.wcmp} · 어긋남 ${S.wbad}${Object.keys(S.wwhy).length ? ' · ' + JSON.stringify(S.wwhy) : ''} · gone 표 ${S.gnbad}`);
if (S.wbad) for (const e of S.wex.slice(0, 8)) console.log('    · ' + e);
ok(S.fvq > DAYS * 1e5 && S.fcmp === S.fvq && S.fbad === 0, '⑥ ★[T1348] 일터 깨움(농부 체류 · 배정 칸으로 가는 중) — 건너려던 결정을 실제로 돌려 견줌 어긋남 0(결정 시각 · 몸 칸)', `견줌 ${S.fvq} · 돌린 뒤 견줌 ${S.fcmp} · 어긋남 ${S.fbad}${Object.keys(S.fwhy).length ? ' · ' + JSON.stringify(S.fwhy) : ''}`);
if (S.fbad) for (const e of S.fex.slice(0, 8)) console.log('    · ' + e);
if (S.dbad) for (const e of S.dex.slice(0, 8)) console.log('    · 잠 깨움 ' + e);
if (S.bad) {
  for (const e of S.ex.slice(0, 8)) console.log('    · ' + e);
  for (const k of Object.keys(S.why)) { const s = sites(FIELD[k] || []); console.log(`    · 칸 ${k}(${(FIELD[k] || []).join(' · ')}) 을 걸음 문 밖에서 쓰는 자리 ${s.length}: ${s.slice(0, 12).join(' ')}${s.length > 12 ? ' …' : ''}`); }
}
try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) {}
// ★미끼 [T1356] — 서 있는 몸 조건 한 줄을 뺀 존 사본으로 짧은 판 → ③ 어긋남 > 0(빨강)이어야 한다 · 판은 끝까지 돌아야 한다(죽은 빨강이 아님)
{
  const BD = +(process.env.T1356_BAIT_DAYS || 2), bout = fs.mkdtempSync(path.join(os.tmpdir(), 't1356-bait-')), blog = path.join(bout, 'bait.log');
  const br = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't1294', 'run.cjs'), path.join(bout, 'run'), String(BD)], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], env: runEnv(bout, { T1294_PRELOAD: __filename, __T1322_BAIT: '1', __T1322_BAIT_LOG: blog }) });
  const bst = fs.existsSync(path.join(bout, 'run', 'status.json')) ? JSON.parse(fs.readFileSync(path.join(bout, 'run', 'status.json'), 'utf8')) : null;
  const BS = stats(bout), ns = fs.existsSync(blog) ? fs.readFileSync(blog, 'utf8').trim().split('\n').filter(Boolean).map((l) => +l.split(' ')[1]) : [];
  const nOk = ns.length > 0 && ns.every((x) => x === 1);
  ok(nOk && br.status === 0 && !!bst && bst.valid && BS.vchecks > 0 && BS.bad > 0, '미끼 — 결정 시각이 지나도 건너는 존 사본(거름 결정 시각 문 한 곳) → ③ 어긋남 > 0 빨강(판은 끝까지 돌았다)',
    `바꾼 자리 ${nOk ? 1 : JSON.stringify(ns)}(존 프로세스 ${ns.length}) · ${BD}날 · rc ${br.status} · 견줌 ${BS.vchecks} · 어긋남 ${BS.bad}${Object.keys(BS.why).length ? ' · ' + JSON.stringify(BS.why) : ''}`);
  try { fs.rmSync(bout, { recursive: true, force: true }); } catch (e) {}
}
console.log(`\n=== T1322 첫 거름 견줌 판 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
