#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1351-mine-clock.js — 판 시계 광부의 수요 문 = 몸의 하루(T1351 · T1326 회부 3) =====================================
//
// 지키는 것:
//   ① 손잡이 `T1351_MINE_CLOCK` — 끔 기본 · 켬이어도 판 시계 몸 축(밭 세계 · 존 · `T1316_BODY_CLOCK` · 하루 < 운영 하루)에서만 선다(운영 시계 · 끔 = 안 선다)
//   ② 결과 — 판 시계 서버 판(밭 켬 · 몸 전부 · T1316 켬 · 집 끔 · 1020) 날 26 ~ 50: 곳간에 든 원석 ÷ 수요 D ≥ 0.85
//      (몸 세계 판 = 1.00 · 고치기 전 판 시계 = 0.48 — 마을마다 하루 치고 하루 쉰다 · 보고 T1351 §2)
//   ③ 미끼(이 파일 안) — 수요 문의 켬 갈래 한 곳만 끈 사본(`if (false)`)으로 같은 판을 돌리면 ② 의 줄이 빨강이 된다(몫 < 0.6)
//      ⚠미끼 바늘은 villages.js 에 정확히 한 번 있어야 한다(없거나 둘이면 미끼 자체가 빨강 — 사본이 문법 오류로 죽은 빨강을 거른다)
//   ①이 빨강이면 서버 판을 안 돈다(옛 코드 빨강 자 `pm-old-code-red.sh` 의 시한 안에 끝나게 — 그 판은 ① 에서 빨강).
//   날짜 · 벽시계를 쓰지 않는다(판은 가상 시계 · 날 수만).
//
// 실행: node scripts/test-t1351-mine-clock.js   (서버 판 50날 × 2 · 몇 분)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
const KNOBS = ['T1351_MINE_CLOCK', 'T1326_HUNT_CLOCK', 'T1316_BODY_CLOCK', 'T1316_SUBSTEP', 'T1295_FARM_CLOCK', 'T1243_FARM_ON', 'T325_WOOD_ACT', 'T1195_HUNT_REAL', 'T400_BUILD_ACT'];
const sub = (env, code) => {
  const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; for (const k of KNOBS) delete e[k]; Object.assign(e, env);
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T1351 — 판 시계 광부 수요 문 ===');
// ── ① 손잡이 · 문 ──
const Q = `const V=require('./server/villages');const B=V.__p3Bind({});const o={k:V.T1351_MINE_CLOCK,has:typeof V.t1351MineOn==='function'};
const vil={dbId:1};B.state.deps=Object.assign({},B.state.deps||{},{zoneAwake:()=>true});
if(o.has){B.state.dayMs=250;o.fast=V.t1351MineOn(vil);B.state.dayMs=require('./server/zone-config').WORLD.dayLengthMs;o.live=V.t1351MineOn(vil);}
console.log(JSON.stringify(o));`;
const BASE = { T1243_FARM_ON: '1', T1316_BODY_CLOCK: '1', T1316_SUBSTEP: '1' };
let u0, u1, uN;
try { u0 = sub(BASE, Q); u1 = sub(Object.assign({ T1351_MINE_CLOCK: '1' }, BASE), Q); uN = sub({ T1243_FARM_ON: '1', T1351_MINE_CLOCK: '1' }, Q); } catch (e) { u0 = u1 = uN = { err: String(e).slice(0, 200) }; }
const unitOk = ok(u0 && u0.has && u0.k === false && u0.fast === false && u1.k === true && u1.fast === true && u1.live === false && uN.fast === false,
  '① T1351 — 끔 기본 · 켬 = 판 시계 몸 축 광부 마을만(운영 시계 · 몸 축 끔 = 안 선다)', JSON.stringify({ u0, u1, uN }).slice(0, 200));
if (!unitOk) { console.log(`\n${pass} 통과 · ${fail} 실패`); process.exit(1); }
// ── ② · ③ 서버 판 ──
const D = fs.mkdtempSync(path.join(os.tmpdir(), 't1351h-'));
//   미끼 사본 = 메모리에서만(파일 무접촉) — 바늘 하나를 `if (false)` 로. 바늘 수를 세어 0 · 2 이상이면 빨강(아래 `bait.needle`).
const NEEDLE = 'if (!T66 && left !== Infinity && _t1351MineOn(vil)) {';
const BAIT_JS = path.join(D, 'bait.js');
fs.writeFileSync(BAIT_JS, `'use strict';
const path=require('path'),fs=require('fs');if(!(process.env.T577_SEED&&/server[\\/\\\\]zone\\.js$/.test(process.argv[1]||'')))return;
const VS=path.join(${JSON.stringify(ROOT)},'server','villages.js');const N=${JSON.stringify(NEEDLE)};
const Module=require('module'),_c=Module.prototype._compile;
Module.prototype._compile=function(c,f){if(f===VS){const n=c.split(N).length-1;fs.writeFileSync(process.env.T1351_BAIT_N,String(n));if(n===1)c=c.replace(N,'if (false) {');}return _c.call(this,c,f);};
`);
const run = (out, extra) => {
  const e = Object.assign({}, process.env); for (const k of KNOBS) delete e[k]; delete e.NODE_OPTIONS;
  Object.assign(e, BASE, { T1351_MINE_CLOCK: '1', T1326_HUNT_CLOCK: '1', T400_BUILD_ACT: '0', VILLAGE_NPC_CAP: 'Infinity', VILLAGE_CARAVAN_MAX: '0', T745_VCLOCK: '1', T577_PAR: '1',
    T577_DIR: path.join(D, out), T577_TAG: out, T1351_OUT: path.join(D, out + '.json'),
    NODE_OPTIONS: `-r ${path.join(ROOT, 'scripts', 't745-vclock.js')} -r ${path.join(ROOT, 'scripts', 't1351-observe.js')}` + (extra ? ` -r ${BAIT_JS}` : '') }, extra || {});
  try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), '50', '1020'], { cwd: ROOT, env: e, stdio: 'ignore', timeout: 1800000 }); } catch (err) { /* 관찰기 JSON 을 본다 */ }
  try { return JSON.parse(fs.readFileSync(path.join(D, out + '.json'), 'utf8')); } catch (err) { return { err: 'no observer json' }; } };
//   몫 = Σ(날 26 ~ 50) 그날 곳간에 든 원석 ÷ Σ 수요 D(관찰기 `oreIn` · `oreD` — econ 틱이 비우기 전 · 틱 뒤 칸)
const frac = (o) => { if (!o || o.err || !o.cols) return null; const I = o.cols.indexOf('oreIn'), Dd = o.cols.indexOf('oreD'); let a = 0, b = 0; for (const r of o.rows) if (r[0] > 25 && r[0] <= 50) { a += r[I]; b += r[Dd]; } return b > 0 ? a / b : null; };
const kg = (o) => { if (!o || !o.cols) return 0; const K = o.cols.indexOf('bodyKg'); const r = o.rows[o.rows.length - 1]; return r ? r[K] : 0; };
const pred = (f) => f != null && f >= 0.85;   // ② 의 줄 — 미끼도 같은 술어로 잰다(어느 줄이 빨강이 되는지 단언)
const R = run('on'), fOn = frac(R);
ok(pred(fOn) && kg(R) > 0, '② T1351 켬 — 판 시계 50날: 곳간에 든 원석 ÷ 수요 D ≥ 0.85 · 광부 몸이 친 kg > 0', R.err || `${fOn == null ? '—' : fOn.toFixed(3)} · ${Math.round(kg(R))} kg`);
const nPath = path.join(D, 'bait.n');
const Bt = run('bait', { T1351_BAIT_N: nPath }), fB = frac(Bt);
let needleN = -1; try { needleN = +fs.readFileSync(nPath, 'utf8'); } catch (e) {}
ok(needleN === 1, '③ 미끼 바늘 = villages.js 에 정확히 한 곳', `${needleN}`);
ok(needleN === 1 && fB != null && !pred(fB) && fB < 0.6, '③ 미끼 — 수요 문 켬 갈래만 끈 사본은 ② 의 줄이 빨강(몫 < 0.6)', Bt.err || `${fB == null ? '—' : fB.toFixed(3)}`);
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
