#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 4   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1355-lot-day.js — 로트 건강 칸은 식단 칸과 같은 끼니를 모은다(T1355 · T1309 고침 — `T1309_HEALTH_EATEN` 켬 안 · 끔 = 무동작) ===
//
// ★왜: `consumeFood` 는 부를 때마다 식단 칸(`_foodEaten`)과 로트 건강 칸(`_t1309LotH`)을 그 끼니로 새로 쓴다. T1197 끼니(하루 두 끼 · 몸 끼니)는
//   `_t1197Eat` 가 식단 칸만 모아(몸 끼니 → 다음 날 경계 · 마을 끼니 → 그날 칸) 로트 건강 칸은 마지막 한 끼만 남았다 — 먹은 로트의 `h` 가 그날 셈에서 빠졌다.
// ★지키는 것(존을 안 띄운다 — econ 정본 함수 · 서버 곳간 로트 정본(`server/granary-lots`)을 그대로 부른다 · 날짜 · 벽시계 0 — 판 날만 센다):
//   ① 손잡이 — `T1309_HEALTH_EATEN` 끔이면 새 칸 0(`_t1197BodyLot` · `_t1309LotH` 안 선다) · 몸 끼니 길은 그대로 돈다(K1)
//   ② 몸 길 = 일괄 길 — 같은 곳간 · 같은 로트(날마다 다른 건강)로 한 마을은 날 경계(`t1197Day`)에서만, 다른 마을은 낮에 몸 끼니(`t1197Meal` 몸)로 먹는다:
//      날 경계 뒤 두 마을의 식단 칸(P1) · 로트 건강 칸(P2) · 먹은 것 건강(`t1309EatenHealth` — P3)이 같다
//   ③ 로트 칸 단위 = 식단 칸 단위 — 조리식은 다 로트에서 나오므로 그날 로트 칸의 조리식 단위가 식단 칸 조리식과 같다(두 마을 다 · 하루 두 끼 — U1)
//   ④ 날 사이 몸 끼니는 그날 칸을 안 건드린다 — 몸 끼니 뒤 식단 칸 · 로트 건강 칸이 날 경계 뒤 그대로(W1 · 몸 끼니 몫은 다음 날 경계로)
//   ⑤ T1197 끔(하루 한 끼 `consumeFood`) — 로트 칸 = 그 끼니(종전 그대로 · N1)
//   ⑥ 글자 — 더하기 함수 하나 · 부르는 자리 둘(몸 · 마을) · 날 경계 한 줄 · 세 줄 다 손잡이가 맨 앞(G1 · G2)
//   ⑦ 미끼(이 파일 안 · 바꾼 자리가 정확히 1곳인지 센다 · 어느 단언이 빨강이 되는지 단언한다 · 정본 파일 무변 — 한 줄만 바꾼 사본을 싣는다):
//      nobodylot(몸 끼니 줄을 뺀다 → W1) · novillage(마을 끼니 더하기를 뺀다 → U1) · noboundary(날 경계 줄을 뺀다 → P2) · addover(더하기를 덮어쓰기로 → U1)
//
// 실행: node scripts/test-t1355-lot-day.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1355_HARNESS_ARM || '', MUT = process.env.T1355_MUTANT || '';
const ESF = 'sim/economy-sim.js';
// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자 · 돌릴 팔 · 빨강이 되어야 할 단언]
const BAITS = {
  nobodylot: [ESF, 'if (T1309_HEALTH_EATEN) { v._t1197BodyLot = _t1355LotAdd(v._t1197BodyLot, v._t1309LotH); v._t1309LotH = lh0 || null; }', '', ['on'], ['W1']],
  novillage: [ESF, 'if (T1309_HEALTH_EATEN) v._t1309LotH = _t1355LotAdd(lh0, v._t1309LotH);', '', ['on'], ['U1']],
  noboundary: [ESF, 'if (T1309_HEALTH_EATEN) { v._t1309LotH = v._t1197BodyLot || null; v._t1197BodyLot = null; }', '', ['on'], ['P2']],
  addover: [ESF, 'x[0] += B[k][0]; x[1] += B[k][1];', 'x[0] = B[k][0]; x[1] = B[k][1];', ['on'], ['U1']],
};
const DAYS = 6;   // 판 날 — 날마다 조리식 로트(다른 건강) · 식량(로트 없음)을 더한다

// ── 아이 판 ──────────────────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of ['T1260_FOOD_READS', 'T1298_HEALTH', 'T1298_LEDGER', 'T1309_HEALTH_EATEN', 'T1309_DIVERSITY_EATEN', 'T1309_MOVE_CONS', 'T1197_MEAL_BODY', 'T1209_MEAL_TRIAGE']) delete process.env[k];
  process.env.ENABLE_VILLAGES = '0';
  process.env.T1260_FOOD_READS = '1'; process.env.T1298_HEALTH = '1';
  if (ARM === 'on' || ARM === 'one') process.env.T1309_HEALTH_EATEN = '1';
  if (ARM === 'on' || ARM === 'off') process.env.T1197_MEAL_BODY = '1';
  if (MUT) {   // 미끼 — 정본 파일을 읽어 한 자리만 바꾼 사본으로 싣는다(파일 무변 · 자리 수는 어미가 이미 셌다)
    const M = require('module'), old = M._extensions['.js'], B = BAITS[MUT], target = path.join(ROOT, B[0]);
    M._extensions['.js'] = function (mod, filename) {
      if (filename === target) { const src = fs.readFileSync(filename, 'utf8'); mod._compile(src.split(B[1]).join(B[2]), filename); return; }
      return old(mod, filename);
    };
  }
  const out = { arm: ARM, mut: MUT || null };
  try {
    const E = require(path.join(ROOT, 'sim', 'economy-sim'));
    const Lots = require(path.join(ROOT, 'server', 'lots')); Lots.momentOn = () => true;   // 서버 시계 문(로트는 서버에서만 붙는다 — 하네스가 연다 · T1309 하네스와 같은 자리)
    const G = require(path.join(ROOT, 'server', 'granary-lots'));
    out.knob = { he: E.T1309_HEALTH_EATEN, body: E.T1197_MEAL_BODY, m: !!E.__t1197() };
    const mkV = (id) => { const v = { id, name: 'v' + id, npcs: [], storage: { food: 0, fish: 0, meat: 0, cooked_food: 0 }, counts: { farmer: 3 }, founder: true };
      for (let i = 0; i < 3; i++) v.npcs.push({ id: `n${id}.${i + 1}`, age: 20 + i, currentJob: 'farmer' }); G.attach(v, null, 0); return v; };
    const A = mkV(1), Bv = mkV(2);
    out.attached = [G.attached(A), G.attached(Bv)];
    const give = (v, d) => {   // 날 d 의 들어옴 — 조리식 로트(날마다 다른 한 단위 건강) + 식량(로트 건강 없음)
      v.storage.cooked_food = (v.storage.cooked_food || 0) + 2.5; G.tagH(v, 'cooked_food', 2.5, 0.1 + 0.15 * (d % 4));
      v.storage.food = (v.storage.food || 0) + 1.5;
    };
    const lh = (v) => v._t1309LotH ? JSON.parse(JSON.stringify(v._t1309LotH)) : null;
    const fe = (v) => v._foodEaten ? JSON.parse(JSON.stringify(v._foodEaten)) : null;
    const pop = 3;
    out.days = [];
    if (ARM === 'one') {   // T1197 끔 — 하루 한 끼(`consumeFood` 한 번 · 종전 길)
      for (let d = 0; d < DAYS; d++) { give(A, d); E.consumeFood(A, pop); out.days.push({ d, feA: fe(A), lhA: lh(A) }); }
    } else {
      const M = E.__t1197();
      for (let d = 0; d < DAYS; d++) {
        give(A, d); give(Bv, d);
        const before = { fe: fe(Bv), lh: lh(Bv) };
        // 몸 길(Bv): 사람 0 은 두 끼 다 몸 · 사람 1 은 아침만 몸 · 사람 2 는 몸 끼니 0(날 경계에서 먹는다)
        for (const k of [0, 1]) {
          const at = d + (k ? M.R : 0);
          for (const [i, p] of Bv.npcs.entries()) { if (i === 2 || (i === 1 && k === 1)) continue; E.t1197Advance(p, at); if (p._mS < d * 2 + k) E.t1197Meal(Bv, [p], d * 2 + k, true); }
        }
        const mid = { fe: fe(Bv), lh: lh(Bv), bodyLot: Bv._t1197BodyLot ? JSON.parse(JSON.stringify(Bv._t1197BodyLot)) : null };
        E.t1197Day(A, d + 1); E.t1197Day(Bv, d + 1);
        out.days.push({ d, before, mid, feA: fe(A), feB: fe(Bv), lhA: lh(A), lhB: lh(Bv),
          ehA: E.T1309_HEALTH_EATEN ? E.t1309EatenHealth(A, pop) : null, ehB: E.T1309_HEALTH_EATEN ? E.t1309EatenHealth(Bv, pop) : null,
          stA: +A.storage.cooked_food.toFixed(9), stB: +Bv.storage.cooked_food.toFixed(9) });
      }
      out.fields = { bodyLotKey: Object.prototype.hasOwnProperty.call(Bv, '_t1197BodyLot'), lotHKey: Object.prototype.hasOwnProperty.call(Bv, '_t1309LotH') || Object.prototype.hasOwnProperty.call(A, '_t1309LotH') };
    }
  } catch (e) { out.crash = String(e && e.stack || e).slice(0, 600); }
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ── 어미 판 ────────────────────────────────────────────────────────────────────────────
function child(arm, mut) {
  const env = Object.assign({}, process.env, { T1355_HARNESS_ARM: arm, T1355_MUTANT: mut || '' });
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26 });
  const line = String(r.stdout || '').trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (r.status !== 0 || !line) return { arm, crash: (String(r.stderr || '') + String(r.stdout || '')).slice(-600) };
  try { const o = JSON.parse(line); return o; } catch (e) { return { arm, crash: 'json ' + e.message }; }
}
const J = (x) => JSON.stringify(x);
const EPS = 1e-9;
const near = (a, b, e) => Math.abs((+a || 0) - (+b || 0)) <= (e == null ? EPS : e);
const lhEq = (x, y) => { const ks = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]); for (const k of ks) { const p = (x || {})[k] || [0, 0], q = (y || {})[k] || [0, 0]; if (!near(p[0], q[0]) || !near(p[1], q[1])) return false; } return true; };
const feEq = (x, y) => { const ks = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]); for (const k of ks) if (!near((x || {})[k], (y || {})[k], 1e-9)) return false; return true; };
const D = (P, a) => (P[a] && P[a].days) || [];
// 단언 — [이름 · 팔 · 판정(P) → [참/거짓 · 보일 값] · 글]
const CHECKS = [
  ['K1', ['on', 'off'], (P) => { const on = P.on, off = P.off; const c = on.knob.he === true && on.knob.body === true && on.knob.m && off.knob.he === false && off.knob.body === true && off.knob.m
      && on.fields.bodyLotKey && on.fields.lotHKey && !off.fields.bodyLotKey && !off.fields.lotHKey && D(P, 'off').length === DAYS && D(P, 'off').every((x) => x.lhA === null && x.lhB === null);
    return [c, { on: on.knob, off: off.knob, fOn: on.fields, fOff: off.fields }]; }, '손잡이 — `T1309_HEALTH_EATEN` 끔이면 새 칸 0(몸 끼니 길은 그대로 돈다) · 켬이면 선다'],
  ['P1', ['on'], (P) => { const ds = D(P, 'on'); const c = ds.length === DAYS && ds.every((x) => feEq(x.feA, x.feB) && near(x.stA, x.stB, 1e-9)) && ds.some((x) => (x.feA || {}).cooked_food > 0);
    return [c, ds.map((x) => [x.d, +((x.feA || {}).cooked_food || 0).toFixed(4), +((x.feB || {}).cooked_food || 0).toFixed(4)])]; }, '[전제] 몸 길 = 일괄 길 — 날 경계 뒤 두 마을의 식단 칸 · 곳간 조리식이 같다(픽스처가 같은 것을 먹었다)'],
  ['P2', ['on'], (P) => { const ds = D(P, 'on'); const c = ds.length === DAYS && ds.every((x) => x.lhA && x.lhB && lhEq(x.lhA, x.lhB));
    return [c, ds.map((x) => [x.d, x.lhA && x.lhA.cooked_food, x.lhB && x.lhB.cooked_food])]; }, '★로트 건강 칸 — 몸 끼니로 먹은 마을과 날 경계에서 먹은 마을이 같다(품목마다 [건강 합 · 단위])'],
  ['P3', ['on'], (P) => { const ds = D(P, 'on'); const c = ds.length === DAYS && ds.every((x) => x.ehA > 0 && near(x.ehA, x.ehB, 1e-12));
    return [c, ds.map((x) => [x.d, +(+x.ehA).toFixed(6), +(+x.ehB).toFixed(6)])]; }, '★먹은 것 건강(`t1309EatenHealth`) — 두 길이 같다(몸 끼니로 나간 로트의 `h` 가 그날 셈에 든다)'],
  ['U1', ['on'], (P) => { const ds = D(P, 'on'); const u = (x, a) => ((x['lh' + a] || {}).cooked_food || [0, 0])[1], f = (x, a) => (x['fe' + a] || {}).cooked_food || 0;
    const c = ds.length === DAYS && ds.every((x) => near(u(x, 'A'), f(x, 'A'), 1e-9) && near(u(x, 'B'), f(x, 'B'), 1e-9) && f(x, 'A') > 0);
    return [c, ds.map((x) => [x.d, +u(x, 'A').toFixed(4), +f(x, 'A').toFixed(4), +u(x, 'B').toFixed(4), +f(x, 'B').toFixed(4)])]; }, '★로트 칸 단위 = 식단 칸 단위 — 조리식은 다 로트에서 나오므로 그날 로트 칸 조리식 단위 = 식단 칸 조리식(두 마을 · 하루 두 끼)'],
  ['W1', ['on'], (P) => { const ds = D(P, 'on'); const c = ds.length === DAYS && ds.slice(1).every((x) => feEq(x.before.fe, x.mid.fe) && lhEq(x.before.lh, x.mid.lh)) && ds.some((x) => x.mid.bodyLot && x.mid.bodyLot.cooked_food);
    return [c, ds.map((x) => [x.d, x.before.lh && x.before.lh.cooked_food, x.mid.lh && x.mid.lh.cooked_food, x.mid.bodyLot && x.mid.bodyLot.cooked_food])]; }, '날 사이 몸 끼니는 그날 칸을 안 건드린다 — 식단 칸 · 로트 건강 칸이 그대로(몸 끼니 몫은 다음 날 경계로 · 몸 칸이 선다)'],
  ['N1', ['one'], (P) => { const ds = D(P, 'one'); const c = ds.length === DAYS && ds.every((x) => x.lhA && near(((x.lhA || {}).cooked_food || [0, 0])[1], (x.feA || {}).cooked_food || 0, 1e-9) && ((x.feA || {}).cooked_food || 0) > 0);
    return [c, ds.map((x) => [x.d, ((x.lhA || {}).cooked_food || [0, 0]).map((y) => +(+y).toFixed(4)), +((x.feA || {}).cooked_food || 0).toFixed(4)])]; }, 'T1197 끔(하루 한 끼) — 로트 칸 = 그 끼니(종전 그대로)'],
];
function runChecks(P, print) {
  const failed = [], ran = [];
  for (const [id, arms, f, msg] of CHECKS) {
    if (!arms.every((a) => P[a])) continue;
    const dead = arms.filter((a) => P[a].crash);
    let r; if (dead.length) r = [false, `아이 판 죽음 ${dead.join(',')} ${P[dead[0]].crash.slice(0, 300)}`]; else { try { r = f(P); } catch (e) { r = [false, '판정 오류 ' + e.message]; } }
    ran.push(id); if (!r[0]) failed.push(id);
    if (print) console.log(`  ${r[0] ? '✓' : '✗'} ${id} ${msg}  ${typeof r[1] === 'string' ? r[1] : J(r[1])}`);
  }
  return { ran, failed, pass: ran.length - failed.length, fail: failed.length };
}

console.log('=== test-t1355-lot-day — 로트 건강 칸은 식단 칸과 같은 끼니를 모은다(T1309_HEALTH_EATEN 켬 안) ===');
const ARMS = ['on', 'off', 'one'];
const P = {};
for (const a of ARMS) P[a] = child(a);
console.log('\n① ~ ⑤ 손잡이 · 몸 길 = 일괄 길 · 로트 칸 = 식단 칸 · 날 사이 · 하루 한 끼');
const R = runChecks(P, true);

console.log('\n⑥ 글자 — 더하기 함수 하나 · 부르는 자리 둘 · 날 경계 한 줄 · 손잡이가 맨 앞');
let gp = 0, gf = 0;
const gok = (c, m, x) => { if (c) gp++; else gf++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + (typeof x === 'string' ? x : J(x)) : '')); };
{
  const ES = fs.readFileSync(path.join(ROOT, ESF), 'utf8');
  const n = (s) => ES.split(s).length - 1;
  gok(n('function _t1355LotAdd(') === 1 && n('_t1355LotAdd(') === 3, 'G1 더하기 함수 하나 · 부르는 자리 둘(몸 끼니 · 마을 끼니 — 정의 + 둘 = 셋)', [n('function _t1355LotAdd('), n('_t1355LotAdd(')]);
  const L3 = [BAITS.nobodylot[1], BAITS.novillage[1], BAITS.noboundary[1]];
  gok(L3.every((s) => n(s) === 1 && s.startsWith('if (T1309_HEALTH_EATEN)')) && n('const lh0 = T1309_HEALTH_EATEN ? v._t1309LotH : null;') === 1,
    'G2 새 줄 셋(몸 · 마을 · 날 경계)은 한 번씩 · 다 `T1309_HEALTH_EATEN` 이 맨 앞(끔 = 무동작) · 이 끼니 앞 칸 읽기도 손잡이 안', L3.map(n));
}

console.log('\n⑦ 미끼 — 한 자리 바꾼 사본은 정한 단언이 빨강이어야 한다(미끼 하나에 판정 줄 하나 — `@bait 4`)');
let bait = 0, baitSeen = 0;
const SRCS = {};
// 미끼 판 — 바꿀 자리를 세고(정확히 1곳일 때만 돈다) · 정한 팔을 사본으로 돌려 · 단언 판정을 다시 센다
function baitRun(name) {
  const [file, from, , arms, expect] = BAITS[name];
  const S = SRCS[file] || (SRCS[file] = fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const sites = S.split(from).length - 1;
  if (sites !== 1) return { sites, good: false, why: `바꿀 자리가 정확히 1곳이 아니다 — 미끼를 안 돌림 · 팔 ${arms.join('+')} · 정한 빨강 ${J(expect)}` };
  const Q = {}; for (const a of arms) Q[a] = child(a, name);
  const dead = arms.filter((a) => Q[a].crash);
  const r = runChecks(Q, false);
  const hit = expect.every((id) => r.failed.includes(id));
  return { sites, good: dead.length === 0 && hit,
    why: `팔 ${arms.join('+')} · 단언 ${r.ran.length} 가운데 빨강 ${J(r.failed)} · 정한 빨강 ${J(expect)}` + (dead.length ? ` · 아이 판 죽음 ${dead.join(',')} ${Q[dead[0]].crash.slice(0, 160)}` : '') };
}
// 미끼 판정 — 바꾼 자리 1곳 · 정한 단언이 빨강(아이 판 죽음 0)이면 초록
function ok(c, m, x) { baitSeen++; if (c) bait++; console.log((c ? '  ✓ ' : '  ✗ ') + m + '  ' + x); }
let b;
b = baitRun('nobodylot');  ok(b.sites === 1 && b.good, '미끼 nobodylot — 몸 끼니 줄(몸 칸으로 옮기고 그날 칸 되돌림)을 뺀 사본 → W1 빨강(몸 끼니가 그날 로트 칸을 덮어쓴다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('novillage');  ok(b.sites === 1 && b.good, '미끼 novillage — 마을 끼니 더하기를 뺀 사본 → U1 빨강(하루 두 끼 가운데 마지막 끼니만 남는다 — 종전 꼴)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('noboundary'); ok(b.sites === 1 && b.good, '미끼 noboundary — 날 경계 줄을 뺀 사본 → P2 빨강(몸 끼니로 먹은 마을의 로트 칸이 일괄 길과 갈린다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('addover');    ok(b.sites === 1 && b.good, '미끼 addover — 더하기를 덮어쓰기로 바꾼 사본 → U1 빨강(끼니 둘째가 첫째를 지운다)', `바꾼 자리 ${b.sites} · ${b.why}`);
const NB = Object.keys(BAITS).length;
if (baitSeen !== NB) { console.log(`  ✗ 미끼 표(${NB})와 판정 줄(${baitSeen}) 수가 다르다 — 표에 더한 미끼는 판정 줄도 더한다`); bait = -1; }
const total = R.pass + R.fail + gp + gf;
console.log(`\n=== ${R.pass + gp}/${total} ${R.fail + gf ? '✗' : '✓'} (미끼 ${bait}/${NB}) ===`);
process.exitCode = (R.fail || gf || bait < NB) ? 1 : 0;
