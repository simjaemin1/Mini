#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 1   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1388-farm-gap.js — 끔 세계 식량 장부 분해 · 사다리 사본 · 밭 세계 팔 둘(T1388) =====================================
//
// 지키는 것(econ 마을 넷 · 60날 · 한 프로세스 판 — 서버 0 · 몇 초):
//   ① 관찰기(`scripts/t1388-observe.js`)의 econ 훅 일곱이 다 정확히 한 곳씩 걸렸다
//   ② 장부 분해 — 출처별 먹은 몫의 합 = 먹은 식량(틈 0) · 칸 합 = 곳간(틈 0) · 든 몫이 곳간 변화를 다 설명한다(잔차 ≤ 든 몫의 10%)
//      (든 출처가 하나라도 빠지면 그만큼이 잔차로 남는다 — 미끼가 그 줄을 문다)
//   ③ 훅 무해 — 훅을 건 판과 안 건 판의 마을 칸(곳간 · 인구 · 직업)이 바이트 같다
//   ④ 사다리 사본(`scripts/t1388-variants.js`) — 계단 둘(anchor1 · nobygrain)의 바꾼 자리가 1 · 1 · 앵커 사본은 `T100_ANCHOR_N` = 1 · 부산물 사본은 농부 부산물 곡식 0
//   ⑤ 밭 세계 팔 둘(`T1388_FARMER_CELLS` · `T1388_FIELD_SHARE`) 끔 기본 · 끔 목표 = 사람 × 12 · 켬 ⓐ = max(사람 × 12, 농부 × 12 ÷ 0.75) · 켬 ⓒ = 사람 × 12 × (1 − 다른 몫) ÷ 0.79
//   ⑥ 미끼(이 파일 안) — 관찰기 사본에서 훅 하나(수식 산출 곳간 줄)를 뺀다(바꾼 자리 1) → ② 의 잔차 줄이 빨강
//   날짜 · 벽시계를 쓰지 않는다(econ 날 수만).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
const KN = ['T1388_INPROC', 'T1388_VAR', 'T1388_VAR_N', 'T1388_FARMER_CELLS', 'T1388_FIELD_SHARE', 'T1243_FARM_ON', 'T100_FIELD_YIELD', 'T1334_BUNDLE', 'NODE_OPTIONS'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
console.log('\n=== T1388 — 끔 세계 식량 장부 · 사다리 · 밭 세계 팔 ===');
//   한 판 — econ 마을 넷 60날(`tickVillage` 를 마을마다 · 서버와 같은 내보낸 문) · obs = 관찰기 경로(null = 훅 없음)
const WORLD = (obs) => `${obs ? `process.env.T1388_INPROC='1';const O=require(${JSON.stringify(obs)});` : 'const O=null;'}
const E=require('./sim/economy-sim');const w=E.createWorld({villageCount:4,seed:7});
for(let d=1;d<=60;d++){w.day=d;for(const v of w.villages)E.tickVillage(v,d,w);}
const sig=JSON.stringify(w.villages.map(v=>[v.name,v.npcs.length,Object.entries(v.storage).filter(([k,x])=>x).map(([k,x])=>[k,+x.toFixed(9)]),Object.entries(v.counts||{}).filter(([k,x])=>x)]));
const r=O?O.dump():null;console.log(JSON.stringify({sig:require('crypto').createHash('sha1').update(sig).digest('hex'),hooks:r&&r.hooks,tot:r&&r.tot}));`;
const OBS = path.join(ROOT, 'scripts', 't1388-observe.js');
const sumv = (o) => Object.values(o || {}).reduce((a, c) => a + c, 0);
const residOk = (T) => { const inn = sumv(T.inBy); return inn > 0 && (T.gain + T.loss) <= 0.10 * inn; };
let R, P;
try { R = kid({}, WORLD(OBS)); P = kid({}, WORLD(null)); } catch (e) { R = P = { err: String(e).slice(0, 200) }; }
const T = R.tot || {};
ok(Array.isArray(R.hooks) && R.hooks.length === 7 && R.hooks.every((n) => n === 1), '① 관찰기 훅 일곱이 econ 에 정확히 한 곳씩', JSON.stringify(R.hooks || R.err));
ok(T.eat > 0 && Math.abs(sumv(T.eatBy) - T.eat) <= 1e-9 * T.eat && T.closeMax <= 1e-6 * Math.max(1, T.eat), '② 출처별 먹은 몫의 합 = 먹은 식량 · 칸 합 = 곳간', T.eat ? `먹음 ${T.eat.toFixed(2)} · 합 ${sumv(T.eatBy).toFixed(2)} · 칸 틈 ${T.closeMax}` : '—');
ok(residOk(T) && (T.inBy.farm > 0) && (T.inBy.fish > 0 || T.inBy.hunt > 0), '② 든 몫이 곳간 변화를 설명한다(잔차 ≤ 든 몫의 10%) · 농부 · 어부/사냥 출처가 섰다', T.inBy ? `든 ${sumv(T.inBy).toFixed(1)} · 늘어남 ${T.gain.toFixed(2)} · 줄어듦 ${T.loss.toFixed(2)} · ${Object.keys(T.inBy).join(',')}` : '—');
ok(R.sig && R.sig === P.sig, '③ 훅 무해 — 훅 건 판 = 안 건 판(마을 칸 지문)', `${R.sig} · ${P.sig}`);
// ── ④ 사다리 사본 ──
let V = null;
try { V = kid({ T1388_INPROC: '1', T1388_VAR: 'anchor1,nobygrain' }, `const VV=require('./scripts/t1388-variants.js');process.env.T1388_INPROC='1';const O=require('./scripts/t1388-observe.js');const E=require('./sim/economy-sim');
const w=E.createWorld({villageCount:4,seed:7});for(let d=1;d<=60;d++){w.day=d;for(const v of w.villages)E.tickVillage(v,d,w);}const r=O.dump();
console.log(JSON.stringify({n:VV.N,anchor:E.T100_ANCHOR_N,by:r.tot.inBy.farmBy||0}));`); } catch (e) { V = { err: String(e).slice(0, 200) }; }
ok(V && V.n && V.n.anchor1 === 1 && V.n.nobygrain === 1 && V.anchor === 1 && V.by === 0 && (T.inBy.farmBy || 0) > 0, '④ 사다리 사본 — 바꾼 자리 1 · 1 · 앵커 1 · 부산물 곡식 0(사본 없는 판은 > 0)', JSON.stringify(V) + ` · 사본 없음 farmBy ${(T.inBy.farmBy || 0).toFixed(1)}`);
// ── ⑤ 밭 세계 팔 둘 ──
const ARM = `const V=require('./server/villages');const vil={_t1388O:0.3,econ:{npcs:new Array(10).fill(0),counts:{farmer:9}}};console.log(JSON.stringify({a:V.T1388_FARMER_CELLS,c:V.T1388_FIELD_SHARE,t:V.t1388Target(vil)}));`;
let a0, aA, aC;
try { a0 = kid({}, ARM); aA = kid({ T1388_FARMER_CELLS: '1' }, ARM); aC = kid({ T1388_FIELD_SHARE: '1' }, ARM); } catch (e) { a0 = aA = aC = { err: String(e).slice(0, 200) }; }
const near = (x, y) => Math.abs(x - y) < 1e-9;
ok(a0.a === false && a0.c === false && near(a0.t, 120) && aA.a === true && near(aA.t, 144) && aC.c === true && near(aC.t, 120 * 0.7 / 0.79),
  '⑤ 팔 ⓐ · ⓒ 끔 기본 · 끔 = 사람 × 12 · ⓐ = max(·, 농부 × 16) · ⓒ = 사람 × 12 × (1 − 다른 몫) ÷ 0.79', JSON.stringify({ a0, aA, aC }));
// ── ⑥ 미끼 — 관찰기 사본(임시 파일)에서 수식 산출 곳간 훅 줄을 뺀다 ──
const src = fs.readFileSync(OBS, 'utf8');
const NEEDLE = "if (globalThis.__t1388in) globalThis.__t1388in(v, globalThis.__t1388by ? 'farmBy' : npc.currentJob, r, amt - tax);";
const nN = src.split(NEEDLE).length - 1;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 't1388h-')), BO = path.join(D, 't1388-observe.js');
fs.writeFileSync(BO, (nN === 1 ? src.replace(NEEDLE, '') : src).replace("const ROOT = path.join(__dirname, '..');", `const ROOT = ${JSON.stringify(ROOT)};`));
let Bt = null; try { Bt = kid({}, WORLD(BO)); } catch (e) { Bt = { err: String(e).slice(0, 200) }; }
const BT = (Bt && Bt.tot) || {};
ok(nN === 1 && BT.eat > 0 && !residOk(BT), '⑥ 미끼 — 바꾼 자리 1곳(수식 산출 곳간 훅)인 관찰기 사본은 ② 의 잔차 줄이 빨강', `바꾼 자리 ${nN} · 늘어남 ${(BT.gain || 0).toFixed(1)} · 든 ${sumv(BT.inBy).toFixed(1)}`);
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
