#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1133-bag-persist.js — 원정 몸 짐의 날짜를 몸과 같이 저장(`T1133_BAG_PERSIST` · T1133 · 판정대기 문 17 ㄱ) ====================
//
// ★왜 [★PM 11-03 · 신선도 캐논 ★재민 10-12 · 10-14 "아이템마다 신선도를 따로"] 원정 몸 짐의 로트 줄(`granary-lots.js` `BAG`)은 몸 밖 WeakMap 이라
//   서버가 다시 뜨면 몸이 새 객체가 되어 줄을 잃었다 — 양(T747 `inventory`)은 남고 날짜만 사라져, 내려놓을 때 날짜 없는 줌(`giveNoRec`)으로 셌다.
// 판정 사본 0: 운영 함수 그대로(`villages.__p3Bind` — `_warRationLoad` · `_t747Pack` · `_t747Restore` · `_warRationLayDownBody` · war-core `createWar` · 곳간 장부 `granary-lots`).
//   "다시 뜸" = **다른 프로세스**(모듈 새로 적재 · WeakMap 비어 있음 · 몸 = 새 객체): 판 1 이 원정에 짐을 싣고 몸 줄(`_t747Pack`)을 글자로 내고,
//   판 2 가 그 글자를 마을 econ 칸(`_t747Body`)에 놓고 운영 되살림(`_t747Restore`)을 부른 뒤 귀환 내려놓기를 부른다.
//   ⚠진행 중 전쟁 자체는 재기동에 안 실린다(T742 회부 1) — 판 2 는 **같은 번호의 전쟁 객체를 다시 세운다**(전쟁 영속이 서는 날의 귀환 문만 본다 · 보고 T1133 §2).
// 지키는 것:
//   ⓪ 정적 — 손잡이 한 줄(`!== '0'`) · 몸 줄에 `G.bagDump` · 되살림에 `G.bagLoad` · 저장 꼴은 `_rd` 하나(곳간 장부 · 갱 비축 · 몸 짐)
//   ① ★켬(기본) — 판 2 의 곳간에 새로 선 레코드 날짜 = 판 1 출발 전 곳간 날짜(k1 · k2) · 날짜 없는 줌 0 · 되살린 짐 줄 = 저장한 줄 · 짐 불변식(줄 합 = 몸 칸)
//   ②a 끔(`=0` · 종전) — 짐 줄도 원정 표식(`_warPackOf`)도 안 실린다 → 귀환이 그 몸 짐을 못 내린다(양만 몸 손에 남는다)
//   ② ★미끼 — 끔 + 표식만 손으로 세운 판 — 날짜 없는 줌 > 0 · 새 레코드 날짜 = 귀환 그 순간(출발 전 날짜를 잃었다)
//   ③ 짐 없는 몸 — 켬 · 끔 몸 줄 글자 같다(칸 0 — 재기동 없는 판 · 짐 없는 판 무변)
//   ④ 크기 — 몸 하나 짐 줄 바이트(표 · 보고 T1133 §3)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ── 아이 판 ────────────────────────────────────────────────────────────────────────────────
if (process.env.T1133_SUB) {
  const PH = process.env.T1133_SUB, IN = process.env.T1133_IN ? JSON.parse(fs.readFileSync(process.env.T1133_IN, 'utf8')) : null;
  const out = { ph: PH };
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    const Lots = require(SV('lots.js')), GL = require(SV('granary-lots.js')), E = require(path.join(ROOT, 'sim', 'economy-sim'));
    const WarCore = require(path.join(ROOT, 'sim', 'war-core')), V = require(SV('villages.js'));
    const DAY = 1440000, MIN = DAY / 1440;
    let NOW = IN ? IN.now + 2 * DAY : 900 * DAY + 180 * MIN;   // 다시 뜸 — 이틀 뒤(멈춘 시간)
    Lots.setClock(() => NOW, DAY);
    out.on = !!(GL.ON && Lots.momentOn());
    if (out.on) WarCore.setLotHook(GL.hooks);
    const R6 = (x) => +(+x).toFixed(6);
    const recs = (a) => (a || []).map((r) => [r.k, R6(r.u)]);
    const bagOf = (p) => { const B = GL.bagOf(p) || {}; const o = {}; for (const k of Object.keys(B)) if (B[k].length) o[k] = recs(B[k]); return o; };
    const mkV = (name) => ({ name, npcPids: [], econ: { name, npcs: Array.from({ length: 10 }, (_, i) => ({ id: i })), counts: {}, storage: { food: 0 }, _warFatigue: 0 } });
    const players = new Map();
    const A = mkV('공격'), D = mkV('방어');
    const world = { villages: [A.econ, D.econ], day: Math.floor(NOW / DAY) };
    let H = null;
    const war = WarCore.createWar({ villages: [A, D], world, seed: 1, log: () => {},
      rationEat: (w, day) => H._warRationEat(w, day), rationCollect: (w) => H._warRationCollect(w),
      lootCarry: (w, items, kind, lots) => H._warLootAccept(w, items, kind, lots) });
    H = V.__p3Bind({ deps: { players, setHp: (p, hp) => { p.hp = hp; } }, war, warCore: WarCore, world, warBodies: new Map(), villages: [A, D] });
    GL.attach(A.econ, null, null); GL.attach(D.econ, null, null);
    const mkS = (pid) => { const p = { pid, isNpc: true, hp: 100, inventory: {} }; players.set(pid, p); return p; };
    if (PH === 'save') {
      const k1 = NOW; A.econ.storage.food += 5; NOW += DAY;   // 출발 전 곳간 — 날짜 둘(짐이 두 날짜에 걸치게 오래된 쪽은 작게)
      const k2 = NOW; A.econ.storage.food += 30; NOW += DAY;
      const s1 = mkS('s1'), s2 = mkS('s2'); A.npcPids = ['s1', 's2'];   // s2 = 짐 없는 몸(대조)
      const w = { id: 7, atk: A, def: D, force: 2, warriors: 2, phase: 'march', op: 'march', born: Math.floor(NOW / DAY) };
      w._packDays = w._packRem = war._opPackLoad(A, 2, 4, w);
      const body = { w, pids: ['s1'], phase: 'march' };
      H.state.warBodies.set(w.id, body);
      out.nb = H._warRationLoad(body);
      out.k = [k1, k2]; out.bag = bagOf(s1); out.inv = s1.inventory; out.keys = (w._packKeys || []).slice(); out.packOf = s1._warPackOf;
      const P = H._t747Pack(A);
      out.rows = P; out.now = NOW;
      out.rowBytes = P.rows.map((r) => r ? Buffer.byteLength(JSON.stringify(r)) : 0);
      out.bagBytes = P.rows.map((r) => (r && r._bag) ? Buffer.byteLength(JSON.stringify({ _bag: r._bag, _packOf: r._packOf })) : 0);
      out.st = H.t1133Stat(); out.gl = GL.stats();
    }
    if (PH === 'restore') {
      const s1 = mkS('s1'), s2 = mkS('s2'); A.npcPids = ['s1', 's2'];   // 다시 뜬 몸 — 새 객체 · 빈손
      A.econ._t747Body = IN.rows;
      out.R = H._t747Restore();
      out.bag = bagOf(s1); out.inv = s1.inventory; out.packOf = s1._warPackOf == null ? null : s1._warPackOf;
      out.cb = GL.checkBag(s1, IN.keys).length;
      //   귀환 — 같은 번호의 전쟁(전쟁 영속이 서는 날의 꼴 · T742 회부 1) · 몸이 집에 닿아 내려놓는다(운영 문 `_warRationLayDownBody`)
      const w = { id: 7, atk: A, def: D, force: 2, warriors: 2, phase: 'return', op: 'return', born: 900, _packKeys: IN.keys.slice(), _packOnBodies: true };
      const body = { w, pids: ['s1'], phase: 'return' };
      H.state.warBodies.set(w.id, body);
      //   끔 판 — 표식도 안 실린다: 그대로면 내려놓기 자체가 없다(짐이 몸 손에 남는다 · 종전 꼴 ②a). 미끼(②b)는 표식만 손으로 세워 "날짜만 잃은" 꼴을 본다.
      if (process.env.T1133_MARK === '1' && s1._warPackOf == null) { s1._warPackOf = 7; out.markByHand = true; }
      const g0 = GL.stats().giveNoRec, a0 = R6(A.econ.storage.food);
      NOW += DAY;
      out.kNow = NOW;
      out.back = R6(H._warRationLayDownBody(body));
      out.dA = R6(A.econ.storage.food - a0);
      out.led = recs(GL.ledger(A.econ, 'food'));
      out.giveNoRec = GL.stats().giveNoRec - g0;
      out.bagAfter = !!GL.bagOf(s1);
      out.bad = GL.check([A.econ]).bad.length;
      out.st = H.t1133Stat();
    }
  } catch (e) { out.err = String((e && e.stack) || e).slice(0, 600); }
  _log(JSON.stringify(out));
  process.exit(0);
}

// ── 부모 ──────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const KNOBS = ['T1133_BAG_PERSIST', 'T732_MOMENT_LOT', 'T1133_SUB', 'T1133_IN', 'T1133_MARK', 'T1094_CARRY_CAP', 'T811_ARMS_BODY', 'T423_RATION_ACT'];
const BASE = (() => { const e = Object.assign({}, process.env); for (const k of KNOBS) delete e[k]; return e; })();
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1133-'));
function sub(ph, knob, inObj, extra) {
  const env = Object.assign({}, BASE, { T1133_SUB: ph }, extra || {});
  if (knob != null) env.T1133_BAG_PERSIST = knob;
  if (inObj) { const f = path.join(TMP, `${ph}-${knob}.json`); fs.writeFileSync(f, JSON.stringify(inObj)); env.T1133_IN = f; }
  try { return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); }
  catch (e) { return { err: String((e && e.message) || e).slice(0, 400) }; }
}
console.log('\n=== 원정 몸 짐의 날짜를 몸과 같이 저장 — T1133_BAG_PERSIST ===');
{
  const Vs = fs.readFileSync(SV('villages.js'), 'utf8'), Gs = fs.readFileSync(SV('granary-lots.js'), 'utf8');
  ok(/const T1133_BAG = process\.env\.T1133_BAG_PERSIST !== '0';/.test(Vs) && (Vs.match(/process\.env\.T1133_BAG_PERSIST/g) || []).length === 1
    && /const bg = _G\.bagDump\(b\); if \(bg\) \{ o\._bag = bg;/.test(Vs) && /_t1133BagLoad\(b, S\._bag, S\._packOf, false\)/.test(Vs) && /const n = G\.bagLoad\(b, bag\);/.test(Vs)   /* ★[T1166] 거는 글자가 함수 하나로(시계 전이면 미룸) */
    && /function gangDump\(g\) \{ const a = GANG\.get\(g\); return \(a && a\.length\) \? a\.map\(_rd\) : null; \}/.test(Gs) && /out\.L\[res\] = recs\.map\(_rd\)/.test(Gs) && /o\[res\] = recs\.map\(_rd\)/.test(Gs)
    && (Gs.match(/u: \+r\.u\.toFixed\(9\)/g) || []).length === 1,
    "⓪ 손잡이 한 줄(`!== '0'`) · 몸 줄에 `bagDump` · 되살림에 `bagLoad` · 저장 꼴 `_rd` 하나(곳간 · 갱 · 몸 짐 — 사본 0)");
}
const S1 = sub('save', null), S0 = sub('save', '0');
const pre = !S1.err && !S0.err && S1.on === true && S1.nb === 1 && (S1.bag.food || []).length >= 2;
ok(pre, '[상황] 판 1 — 원정 짐이 몸에 실렸다(곳간 날짜 둘이 짐 줄로)', S1.err || S0.err || JSON.stringify(S1.bag));
if (pre) {
  const R1 = sub('restore', null, S1), R0 = sub('restore', '0', S0), RM = sub('restore', '0', S0, { T1133_MARK: '1' });
  ok(!R1.err && !R0.err, '[상황] 판 2 — 다시 뜬 프로세스에서 되살림 · 귀환이 돌았다', R1.err || R0.err || '');
  const kDep = new Set(S1.k), newK = (R1.led || []).map((x) => x[0]);
  ok(JSON.stringify(R1.bag) === JSON.stringify(S1.bag) && R1.packOf === S1.packOf && R1.cb === 0 && R1.R && R1.R.bodies === 2,
    '★① 켬(기본) — 되살린 몸에 짐 줄 그대로(날짜 · 양) · 원정 표식 · 짐 불변식(줄 합 = 몸 칸)', JSON.stringify({ bag: R1.bag, packOf: R1.packOf, cb: R1.cb }));
  ok(R1.giveNoRec === 0 && R1.back > 0 && newK.length > 0 && newK.every((k) => kDep.has(k)) && !newK.includes(R1.kNow) && R1.bad === 0 && R1.bagAfter === false,
    '★① 켬 — 귀환 내려놓기 = 곳간 레코드 날짜가 출발 전 날짜(k1 · k2) · 날짜 없는 줌 0 · 곳간 불변식', JSON.stringify({ led: R1.led, k: S1.k, giveNoRec: R1.giveNoRec }));
  ok(JSON.stringify(R0.bag) === '{}' && R0.packOf == null && R0.back === 0 && (R0.led || []).length === 0 && R0.inv && R0.inv.food > 0,
    '②a 끔(`=0` · 종전) — 짐 줄도 표식도 안 실린다 · 귀환이 내려놓지 못한다(짐은 양만 몸 손에 남는다 — T747 손)', JSON.stringify({ bag: R0.bag, back: R0.back, inv: R0.inv }));
  ok(!RM.err && RM.markByHand === true && RM.giveNoRec > 0 && (RM.led || []).some((x) => x[0] === RM.kNow) && !(RM.led || []).some((x) => kDep.has(x[0])),
    '[미끼 · ②b] 끔 + 표식만 손으로 — 날짜 없는 줌 > 0 · 새 레코드 날짜 = 귀환 그 순간(출발 전 날짜를 잃었다 — 카드가 적은 꼴)', JSON.stringify({ led: RM.led, giveNoRec: RM.giveNoRec, kNow: RM.kNow }));
  ok(JSON.stringify(S1.rows.rows[1]) === JSON.stringify(S0.rows.rows[1]) && !('_bag' in (S1.rows.rows[1] || {})) && !('_bag' in (S0.rows.rows[0] || {})),
    '③ 짐 없는 몸 — 켬 · 끔 몸 줄 글자 같다(칸 0) · 끔이면 짐 든 몸도 칸 0', JSON.stringify({ on: S1.rows.rows[1], off: S0.rows.rows[1] }));
  ok(S1.bagBytes[0] > 0 && S1.rowBytes[0] - S0.rowBytes[0] === S1.bagBytes[0] - 1,
    '④ 크기 — 짐 든 몸 하나 몸 줄 증가 바이트 = 짐 줄 칸(`_bag` · `_packOf`)', `몸 줄 ${S0.rowBytes[0]} → ${S1.rowBytes[0]} B · 짐 칸 ${S1.bagBytes[0]} B · 레코드 ${(S1.bag.food || []).length}`);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
