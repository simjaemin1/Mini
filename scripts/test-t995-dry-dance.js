#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t995-dry-dance.js — 탄 없는 사수 둘의 3.5m 춤(T956 ⓑ)과 시험 손잡이 셋(T995 · 끔 기본 · 켜는 값 '1' 하나) ==========
//
// ★왜 [지시 T995 · T956 회부 3] 열일곱째 판(돌격 헛걸음 켬)에 남은 긴 전쟁은 교전 국면이 날마다 이어지고 대치 · 철수가 없다.
//   몸 층에선 탄 없는 사수 둘이 3.5m 에서 물러섬(battle-core 원거리 절 첫 줄 — 탄과 무관) ↔ 다가섬(탄 없는 절 — 15m 안)을 되풀이해
//   손(1.2m)이 한 번도 안 닿는다 — hp 0 감소 · 'melee' 상태라 걸음마다 접촉이 서 대치(접촉 · 진척 없는 `standoffSec`)도 안 선다.
//   T956 회부 3 의 길 셋을 시험 손잡이로 세웠다(끔 = 종전 글자 · 고르는 건 재민):
//     ㉠ `T995_BACK_AMMO`(battle-core) — 3.5m 물러섬은 탄이 있을 때만
//     ㉡ `T995_CONTACT_REACH`(war-live) — 접촉은 'shoot' 이거나 손 안의 'melee' 만
//     ㉢ `T995_DRY_STANDOFF`(war-live) — 맞붙은 동안 hp 합이 한 번도 안 준 채 `standoffSec` 를 넘으면 대치
//   지키는 것: ⓐ 정적(손잡이 셋 · `=== '1'` · env 자리 · 새 수 0) · ⓑ 한 교전(war-live 정본 · battle-core 정본 · 존 안 띄움 · 아이 판 — 손잡이는 모듈을 싣는 순간 읽는다)
//     ★끔(미설정 · `=0`) = 춤(hp 그대로 · 걸음마다 접촉 · 대치 0 · 두 몸 3.4 ~ 3.6m) — 자명 통과 금지의 증인 · ㉠ 켬 = 손이 닿아 hp 가 준다 ·
//     ㉡ 켬 = 접촉 0 · 대치가 선다 · ㉢ 켬 = 맞붙은 뒤 대치가 선다 · ★탄이 있는 사수(대조)는 손잡이 셋 다 켜도 끔과 같은 걸음이다.
// 실행: node scripts/test-t995-dry-dance.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const KNOBS = ['T995_BACK_AMMO', 'T995_CONTACT_REACH', 'T995_DRY_STANDOFF'];

// ── 아이 판: 한 교전 — 궁수(A) ↔ 투석병(B) · 6m · 탄 0(대조 = 탄 그대로) · 2분(3,600걸음) ──
if (process.env.T995_SUB === '1') {
  const WLM = require(path.join(ROOT, 'server', 'war-live.js'));
  const live = WLM.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30 });
  const f = live.makeFight({ id: 5, born: 381, atk: { name: 'A' }, def: { name: 'B' }, _heading: 0 }, null, { A: null, B: null });
  const pa = { pid: 'pa', x: 100 * 32, y: 100 * 32 }, pb = { pid: 'pb', x: 106 * 32, y: 100 * 32 };
  const ga = { type: 'archer', pid: 'pa' }, gb = { type: 'slinger', pid: 'pb' };
  live.bindGroupUnit(ga, pa); live.bindGroupUnit(gb, pb);
  const ua = live.enlist(f, 'A', ga, pa), ub = live.enlist(f, 'B', gb, pb);
  if (process.env.T995_AMMO !== '1') { f.ctx.sides.A.arrows = 0; f.ctx.sides.B.stones = 0; }
  live.orderAdvance(f, 'A'); live.orderAdvance(f, 'B');
  const hp0 = [ua.hp, ub.hp];
  let cSteps = 0, so = 0, rout = null, minD = Infinity, maxD = 0, steps = 0, firstSo = null;
  const trace = [];
  for (let t = 0; t < 3600; t++) {
    const ev = live.stepFight(f); steps++;
    if (ev.contact) cSteps++;
    if (ev.standoff) { so++; if (firstSo == null) firstSo = t + 1; live.orderAdvance(f, 'A'); live.orderAdvance(f, 'B'); }
    if (ev.rout) { rout = ev.rout; break; }
    if (ua.hp > 0 && ub.hp > 0) { const d = Math.hypot(ua.x - ub.x, ua.y - ub.y); if (t > 120) { minD = Math.min(minD, d); maxD = Math.max(maxD, d); } }
    if (t % 600 === 0) trace.push([t, +Math.hypot(ua.x - ub.x, ua.y - ub.y).toFixed(3), ua.st, ub.st]);
  }
  const r3 = (x) => Number.isFinite(x) ? +x.toFixed(3) : null;
  process.stdout.write(JSON.stringify({ knobs: Object.fromEntries(KNOBS.map((k) => [k, process.env[k] || null])), steps, cSteps, so, firstSo, rout,
    hp0, hp1: [r3(ua.hp), r3(ub.hp)], minD: r3(minD), maxD: r3(maxD), ammo: [f.ctx.sides.A.arrows, f.ctx.sides.B.stones], contacts: f.contacts, trace }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const BCS = fs.readFileSync(path.join(ROOT, 'sim', 'battle-core.js'), 'utf8'), CB = codeOf(BCS);
const WLS = fs.readFileSync(path.join(ROOT, 'server', 'war-live.js'), 'utf8'), CW = codeOf(WLS);
console.log('\n=== 탄 없는 사수 둘의 3.5m 춤 · 시험 손잡이 셋(T995) ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 셋 · 끔 기본 · 새 수 0');
ok(/const T995_BACK_AMMO=\(typeof process!=='undefined'&&process\.env&&process\.env\.T995_BACK_AMMO==='1'\);/.test(CB) && (CB.match(/T995_BACK_AMMO/g) || []).length === 3,
  "ⓐ ㉠ battle-core — `=== '1'` 한 자리(끔 기본) · 읽는 줄 하나", (CB.match(/T995_BACK_AMMO/g) || []).length);
ok(/if\(d<3\.5&&\(ammo\|\|!T995_BACK_AMMO\)\)\{\s*\n\s+u\.st='melee'; const bd=Math\.hypot\(e\.x-u\.x,e\.y-u\.y\)\|\|1;/.test(CB), 'ⓐ ㉠ 물러섬 줄 — 켬이면 탄이 있을 때만(3.5 그대로 · 끔 = `d<3.5` 종전 뜻)');
ok(/function _t995On\(k\) \{ return typeof process !== 'undefined' && !!process\.env && process\.env\[k\] === '1'; \}/.test(CW)
  && /const T995_CONTACT_REACH = _t995On\('T995_CONTACT_REACH'\), T995_DRY_STANDOFF = _t995On\('T995_DRY_STANDOFF'\);/.test(CW), "ⓐ ㉡ ㉢ war-live — `=== '1'` 한 문(끔 기본)");
ok(/\(u\.st === 'shoot' \|\| \(u\.st === 'melee' && \(!T995_CONTACT_REACH \|\| _t995InReach\(u\)\)\)\)/.test(CW)
  && /function _t995InReach\(u\) \{ const e = u\.tgt, D = BC\.UNITS\[u\.type\]; return !!\(e && e\.hp > 0 && D && Math\.hypot\(e\.x - u\.x, e\.y - u\.y\) < D\.reach\); \}/.test(CW),
  'ⓐ ㉡ 접촉 줄 — 켬이면 손(`reach`) 안의 melee 만 · 끔 = 종전 두 상태');
ok(/else if \(T995_DRY_STANDOFF && f\.state === 'engaged' && f\.t - Math\.max\(f\._t995HitT, f\.gapT\) > standoffSec\(f\)\) \{ toStandoff\(f\); ev\.standoff = true; \}/.test(CW)
  && /if \(f\.state !== 'engaged' \|\| f\._t995Hp === undefined \|\| hp < f\._t995Hp\) f\._t995HitT = f\.t;/.test(CW), 'ⓐ ㉢ 대치 줄 — 켬이면 피해 없는 맞붙음도 종전 문턱(`standoffSec`)으로');
{
  //   손잡이가 더한 글자에 새 수가 없다(3.5 · reach · standoffSec 는 종전 글자 · 0 · 1 뿐)
  const add = [(CB.match(/if\(d<3\.5&&\(ammo\|\|!T995_BACK_AMMO\)\)/) || [''])[0].replace('3.5', ''),
    (CW.match(/function _t995InReach[^\n]*/) || [''])[0], (CW.match(/if \(T995_DRY_STANDOFF\) \{[\s\S]*?\n    \}/) || [''])[0], (CW.match(/else if \(T995_DRY_STANDOFF[^\n]*/) || [''])[0]].join(' ').replace(/'[^']*'/g, "''");
  ok(!/[^\w.'](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(add), 'ⓐ 새 수 0 — 더한 글자엔 0 · 1 만', add.length + '자');
}

// ── ⓑ 한 교전(아이 판) ──────────────────────────────────────────────────────────
console.log('\n[ⓑ] 한 교전 — 궁수 ↔ 투석병 · 6m · 2분');
const sub = (env) => { const E = Object.assign({}, process.env, { T995_SUB: '1' }); for (const k of KNOBS.concat(['T995_AMMO'])) delete E[k]; Object.assign(E, env);
  const out = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); return JSON.parse(out.slice(out.indexOf('{'))); };
const OFF = sub({}), OFF0 = sub({ T995_BACK_AMMO: '0', T995_CONTACT_REACH: '0', T995_DRY_STANDOFF: '0' });
ok(OFF.hp1[0] === OFF.hp0[0] && OFF.hp1[1] === OFF.hp0[1] && OFF.so === 0 && !OFF.rout && OFF.cSteps > 3000 && OFF.minD > 3 && OFF.maxD < 4,
  '★끔(미설정) — 춤: hp 그대로 · 걸음마다 접촉 · 대치 0 · 두 몸 3 ~ 4m(자명 통과 금지의 증인)', JSON.stringify({ hp: OFF.hp1, c: OFF.cSteps, so: OFF.so, d: [OFF.minD, OFF.maxD] }));
ok(JSON.stringify(OFF0) === JSON.stringify(Object.assign({}, OFF, { knobs: OFF0.knobs })), "★끔(`=0` 셋) = 미설정과 같은 걸음(켜는 값은 `'1'` 하나)");
const A = sub({ T995_BACK_AMMO: '1' });
ok((A.hp1[0] < A.hp0[0] || A.hp1[1] < A.hp0[1]) && A.minD < 1.2, '㉠ 켬 — 탄 없는 사수가 손이 닿게 다가서 hp 가 준다', JSON.stringify({ hp: A.hp1, d: A.minD, rout: A.rout, so: A.so }));
const B = sub({ T995_CONTACT_REACH: '1' });
ok(B.cSteps === 0 && B.so >= 1 && B.hp1[0] === B.hp0[0] && B.hp1[1] === B.hp0[1], '㉡ 켬 — 춤은 그대로지만 접촉 0 · 대치가 선다(진척 · 접촉 없는 `standoffSec`)', JSON.stringify({ c: B.cSteps, so: B.so, first: B.firstSo }));
const C = sub({ T995_DRY_STANDOFF: '1' });
ok(C.cSteps > 0 && C.so >= 1 && C.contacts >= 1 && C.hp1[0] === C.hp0[0] && C.hp1[1] === C.hp0[1], '㉢ 켬 — 맞붙은(접촉) 뒤 피해 없이 문턱을 넘어 대치가 선다', JSON.stringify({ c: C.cSteps, so: C.so, first: C.firstSo, contacts: C.contacts }));
const K0 = sub({ T995_AMMO: '1' }), K1 = sub({ T995_AMMO: '1', T995_BACK_AMMO: '1', T995_CONTACT_REACH: '1', T995_DRY_STANDOFF: '1' });
const strip = (o) => JSON.stringify(Object.assign({}, o, { knobs: null }));
ok(strip(K0) === strip(K1), '★대조 — 탄이 있는 사수(쏘며 맞는 판)는 손잡이 셋 다 켜도 끔과 같은 걸음', JSON.stringify({ hp: K0.hp1, ammo: K0.ammo, rout: K0.rout }));

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
