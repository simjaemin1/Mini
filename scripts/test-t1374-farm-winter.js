#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 2   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1374-farm-winter.js — 밭 세계가 겨울 너머로 먹이는 갈래 둘(T1374 ① 부산물 곡식 · ② 다음 거둠 출생 문) =====================
//
// 지키는 것:
//   ① 손잡이 — `T1374_NO_BYGRAIN` · `T1374_BIRTH_HARV` · `T1374_FAMINE_HARV`(기근 문 날 수 — 같은 `t1374NeedDays` · 결과 줄은 회부) 끔 기본 · `=1` 이어도 밭 세계(`T1243_FARM_ON`) 켬일 때만 선다 ·
//      문턱 날 수 = max(30일, 다음 거둠 날 − 오늘)(`t1374NeedDays` — 다음 거둠을 모르면 30일)
//   ② 결과(서버 판 · 밭 켬 · 판 시계 몸 축 · 작물 철 켬 · 1020 · 30날 — 3월):
//      ⓐ `T1374_NO_BYGRAIN` 켬 = 농부 부산물 곡식(밀 · 쌀 · 보리)이 밭 못자리에 하나도 안 든다(관찰기 `byF` 합 = 0)
//      ⓑ `T1374_BIRTH_HARV` 켬 = 첫 거둠(6월) 앞 3월에 사람이 안 는다(날 30 인구 ≤ 날 1 × 1.05 — 종전은 2.5배)
//   ③ 미끼 둘(이 파일 안 · 바꾼 자리를 센다 — 0 · 둘 이상이면 미끼 자체가 빨강):
//      ⓐ econ 부산물 문의 한 줄을 `if (false) continue;` 로 → ⓐ 의 줄이 빨강(byF > 0)
//      ⓑ econ 출생 문 `if (T1374_BIRTH_HARV) {` 를 `if (false) {` 로 → ⓑ 의 줄이 빨강(날 30 인구 > 날 1 × 1.05)
//   ①이 빨강이면 서버 판을 안 돈다(옛 코드 빨강 자 `pm-old-code-red.sh` 의 시한 안에 끝나게).
//   날짜 · 벽시계를 쓰지 않는다(판은 가상 시계 · 날 수만).
//
// 실행: node scripts/test-t1374-farm-winter.js   (서버 판 30날 × 3 · 몇 분)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
const KNOBS = ['T1374_NO_BYGRAIN', 'T1374_BIRTH_HARV', 'T1374_FAMINE_HARV', 'T1179_CROP_SEASON', 'T1276_FARM_K', 'T1284_FARM_YIELD', 'T1297_BIRTH_FOOD', 'T1351_MINE_CLOCK', 'T1326_HUNT_CLOCK', 'T1316_BODY_CLOCK', 'T1316_SUBSTEP', 'T1243_FARM_ON', 'T1334_BUNDLE', 'T400_BUILD_ACT'];
const sub = (env, code) => {
  const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; for (const k of KNOBS) delete e[k]; Object.assign(e, env);
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T1374 — 밭 세계 겨울 갈래 둘 ===');
// ── ① 손잡이 · 문턱 날 수 ──
const Q = `const E=require('./sim/economy-sim');const o={a:E.T1374_NO_BYGRAIN,b:E.T1374_BIRTH_HARV,c:E.T1374_FAMINE_HARV,f:typeof E.t1374NeedDays};
if(o.f==='function'){o.n0=E.t1374NeedDays({},10);o.n1=E.t1374NeedDays({_t1374Next:100},10);o.n2=E.t1374NeedDays({_t1374Next:20},10);}console.log(JSON.stringify(o));`;
let u0, u1, uN;
try { u0 = sub({ T1243_FARM_ON: '1' }, Q); u1 = sub({ T1243_FARM_ON: '1', T1374_NO_BYGRAIN: '1', T1374_BIRTH_HARV: '1', T1374_FAMINE_HARV: '1' }, Q); uN = sub({ T1374_NO_BYGRAIN: '1', T1374_BIRTH_HARV: '1', T1374_FAMINE_HARV: '1' }, Q); } catch (e) { u0 = u1 = uN = { err: String(e).slice(0, 200) }; }
const unitOk = ok(u0 && u0.f === 'function' && u0.a === false && u0.b === false && u0.c === false && u1.a === true && u1.b === true && u1.c === true && uN.a === false && uN.b === false && uN.c === false
  && u1.n0 === 30 && u1.n1 === 90 && u1.n2 === 30,
  '① T1374 — 끔 기본 · 켬은 밭 세계에서만 · 문턱 날 수 = max(30, 다음 거둠 − 오늘)', JSON.stringify({ u0, u1, uN }).slice(0, 240));
if (!unitOk) { console.log(`\n${pass} 통과 · ${fail} 실패`); process.exit(1); }
// ── ② · ③ 서버 판 ──
const D = fs.mkdtempSync(path.join(os.tmpdir(), 't1374h-')); require('./lib-tmp').own(D);   // [T1400] lib-tmp — 판 끝(빨강 · 상한 포함)에 지운다
const ES = path.join(ROOT, 'sim', 'economy-sim.js');
const NEEDLE = {
  by: "if (T1374_NO_BYGRAIN && npc.currentJob === 'farmer' && _t1374FieldCrop(r)) continue;",
  birth: 'if (T1374_BIRTH_HARV) {',
};
const REPL = { by: 'if (false) continue;', birth: 'if (false) {' };
//   미끼 사본 = 메모리에서만(파일 무접촉) — econ 을 읽을 때 바늘 하나를 바꾼다 · 바꾼 자리 수를 `T1374_BAIT_N` 에 적는다
const BAIT_JS = path.join(D, 'bait.js');
fs.writeFileSync(BAIT_JS, `'use strict';
const fs=require('fs');if(!(process.env.T577_SEED&&/server[\\/\\\\]zone\\.js$/.test(process.argv[1]||'')))return;
const ES=${JSON.stringify(ES)},N=JSON.parse(process.env.T1374_BAIT_NEEDLE),R=process.env.T1374_BAIT_REPL;
const Module=require('module'),_c=Module.prototype._compile;
Module.prototype._compile=function(c,f){if(f===ES){const n=c.split(N).length-1;fs.writeFileSync(process.env.T1374_BAIT_N,String(n));if(n===1)c=c.replace(N,R);}return _c.call(this,c,f);};
`);
const BASE = { T1243_FARM_ON: '1', T1316_BODY_CLOCK: '1', T1316_SUBSTEP: '1', T1326_HUNT_CLOCK: '1', T1351_MINE_CLOCK: '1', T1179_CROP_SEASON: '1',
  T1374_NO_BYGRAIN: '1', T1374_BIRTH_HARV: '1', T400_BUILD_ACT: '0', VILLAGE_NPC_CAP: 'Infinity', VILLAGE_CARAVAN_MAX: '0', T745_VCLOCK: '1', T577_PAR: '1' };
const DAYS = 30;
const run = (tag, bait) => {
  const e = Object.assign({}, process.env); for (const k of KNOBS) delete e[k]; delete e.NODE_OPTIONS;
  Object.assign(e, BASE, { T577_DIR: path.join(D, tag), T577_TAG: tag, T1374_OUT: path.join(D, tag + '.json'),
    NODE_OPTIONS: (bait ? `-r ${BAIT_JS} ` : '') + `-r ${path.join(ROOT, 'scripts', 't745-vclock.js')} -r ${path.join(ROOT, 'scripts', 't1374-observe.js')}` });   // 미끼 걸이가 맨 앞(관찰기가 econ 을 먼저 읽는다)
  if (bait) Object.assign(e, { T1374_BAIT_NEEDLE: JSON.stringify(NEEDLE[bait]), T1374_BAIT_REPL: REPL[bait], T1374_BAIT_N: path.join(D, tag + '.n') });
  try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), String(DAYS), '1020'], { cwd: ROOT, env: e, stdio: 'ignore', timeout: 1800000 }); } catch (err) { /* 관찰기 JSON 을 본다 */ }
  let o; try { o = JSON.parse(fs.readFileSync(path.join(D, tag + '.json'), 'utf8')); } catch (err) { o = { err: 'no observer json' }; }
  if (bait) { try { o.baitN = +fs.readFileSync(path.join(D, tag + '.n'), 'utf8'); } catch (err) { o.baitN = -1; } }
  return o;
};
//   ⓐ 부산물 곡식 = Σ 마을-달 `byF` · ⓑ 인구 = 세계 날 줄(날 1 · 날 30)
const byF = (o) => { if (!o || o.err || !o.cols) return null; const I = o.cols.indexOf('byF'); let t = 0; for (const r of o.rows) t += +r[I] || 0; return t; };
const popAt = (o, d) => { const r = o && o.w && o.w.find((x) => x[0] === d); return r ? r[1] : null; };
const predA = (b) => b === 0;
const predB = (o) => { const a = popAt(o, 1), b = popAt(o, DAYS); return a > 0 && b != null && b <= a * 1.05; };
const R = run('on');
ok(predA(byF(R)), '② ⓐ `T1374_NO_BYGRAIN` 켬 — 농부 부산물 곡식이 밭 못자리에 0(30날 · 마을-달 byF 합)', R.err || `${byF(R)}`);
ok(predB(R), `② ⓑ \`T1374_BIRTH_HARV\` 켬 — 첫 거둠 앞 3월 인구 날 ${DAYS} ≤ 날 1 × 1.05`, R.err || `${popAt(R, 1)} → ${popAt(R, DAYS)}`);
const Ba = run('baitA', 'by');
ok(Ba.baitN === 1 && byF(Ba) != null && !predA(byF(Ba)) && byF(Ba) > 0, '③ 미끼 ⓐ — 바꾼 자리 1곳(부산물 문 `if (false) continue;`)인 사본은 ② ⓐ 의 줄이 빨강(byF > 0)', Ba.err || `바꾼 자리 ${Ba.baitN} · byF ${byF(Ba)}`);
const Bb = run('baitB', 'birth');
ok(Bb.baitN === 1 && popAt(Bb, DAYS) != null && !predB(Bb), '③ 미끼 ⓑ — 바꾼 자리 1곳(출생 문 `if (false) {`)인 사본은 ② ⓑ 의 줄이 빨강(인구가 는다)', Bb.err || `바꾼 자리 ${Bb.baitN} · ${popAt(Bb, 1)} → ${popAt(Bb, DAYS)}`);
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
