#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-arms-keep.js — 원정 짐의 무기는 재기동에도 어딘가에 있다(T764 · T403 켬 경로) ==========
//
// ★왜 [지시 T764 ② · 캐논 소멸 금지]
//   T403(`T403_ARMS_LEDGER=1`)은 동원 순간 곳간 `weapon` −n 을 원정 짐(`w._arms`)으로 옮기고 귀환 도착에 짐을 곳간에 되돌린다.
//   그런데 진행 중 전쟁(`world._warWars`)은 재기동에 안 실린다(T742 회부 1) ⇒ 다시 뜨면 짐째 사라지고, 곳간은 반출 뒤 그대로다 —
//   **반출한 무기가 세계에서 없어진다**(끔은 곳간에 그대로라 잃는 것이 없다 — 켬 경로만의 결함).
//   고침(war-core · 켬 경로 안): 공격 마을 econ 에 짐의 거울 `_warArmsOut`(econ 칸 — `serializeEcon` 이 싣는다) · 다시 뜨면
//   `rebuildFromEcon` 이 거울에서 그때 짐이 쥔 몫을 뺀 나머지를 곳간에 내려놓는다.
//   지키는 것: ⓐ 끔 = 칸 0 · 곳간 무변(비트) · ⓑ 거울 = 짐(반출 · 결판 · 귀환 · 두 원정) · ⓒ 재기동 — 곳간 + 짐 = 반출 앞(소멸 0) ·
//             ⓓ 거울이 없으면(T764 앞 글자) n 이 사라진다(대조) · ⓔ 손잡이가 아니라 칸을 본다 · ⓕ 실린 짐이 있으면 그만큼은 남긴다 · 새 수 0.
//
// ⚠존을 부팅하지 않는다 — war-core 정본(`warMobilize` · `warResolveBattle` · `daily` · `rebuildFromEcon`)을 그대로 부른다(규칙 사본 0).
//   세계 꼴은 `test-war-world` 의 `_mkCostWorld` 와 같은 두 마을(공격 30 · 방어 24 · 곳간 무기 40)이다.
// 실행: node scripts/test-arms-keep.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const econ = R('sim/economy-sim.js');
const WarCore = R('sim/war-core.js');
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8');
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const C = codeOf(SRC);
function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const _origRandom = Math.random;
const setK = (on) => { if (on) process.env.T403_ARMS_LEDGER = '1'; else delete process.env.T403_ARMS_LEDGER; };
const prevK = process.env.T403_ARMS_LEDGER;
const near = (a, b) => Math.abs(a - b) <= 1e-9;

//   세계 — 두 마을(공격 · 방어) · 새 war-core. `econs` 를 주면 그 econ 을 그대로 다시 쓴다(재기동 — econ 은 실리고 전쟁은 안 실린다).
function mkWorld(opts) {
  opts = opts || {};
  Math.random = seeded(opts.seed || 7);
  const mk = (name, pop) => {
    const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name });
    e.storage.weapon = 40; e.storage.stone = 400;
    return e;
  };
  const eA = opts.econs ? opts.econs[0] : mk('대가A', opts.atkPop || 30), eD = opts.econs ? opts.econs[1] : mk('대가B', opts.defPop || 24);
  Math.random = _origRandom;
  const atk = { name: '대가A', econ: eA, ccx: 0, ccy: 0 }, def = { name: '대가B', econ: eD, ccx: 0, ccy: 0 };
  const villages = [atk, def];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: opts.seq || 1 };
  const war = WarCore.createWar({ villages, world, seed: 7, infoRange: 5000, centerOf: (v) => ({ cx: v === atk ? 0 : 200, cy: 0 }), territoryOf: () => 2800, log: null,
    food: { consumeFood: econ.consumeFood, totalFoodEquivalent: econ.totalFoodEquivalent } });
  return { atk, def, villages, world, war };
}
//   재기동 — econ 을 저장 꼴(JSON 왕복)로 다시 읽고 새 세계 · 새 war-core 를 세운 뒤 호스트가 부르는 그 문(`rebuildFromEcon`)을 부른다
function reboot(W, pre) {
  const econs = [JSON.parse(JSON.stringify(W.atk.econ)), JSON.parse(JSON.stringify(W.def.econ))];
  const W2 = mkWorld({ econs, seq: W.world._warSeq });
  if (pre) pre(W2);
  W2.war.rebuildFromEcon();
  return W2;
}
const wOf = (W) => W.world._warWars;
const packSum = (W) => wOf(W).reduce((a, w) => a + (w._arms && !w._arms.done ? w._arms.weapon || 0 : 0), 0);

console.log('\n=== 원정 짐의 무기는 재기동에도 어딘가에 있다(T764 · T403 켬 경로) ===');

// ── ① 정적 ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n① 정적');
{
  const sync = (C.match(/function _syncArmsToEcon\(vil\) \{[\s\S]*?\n  \}/) || [''])[0];
  const reb = (C.match(/function rebuildFromEcon\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  ok(/for \(const w of WARS\) if \(w\.atk === vil && w\._arms && !w\._arms\.done\) s \+= Math\.max\(0, w\._arms\.weapon \|\| 0\);/.test(sync) && /if \(s > 0\) e\._warArmsOut = s; else if \(e\._warArmsOut != null\) delete e\._warArmsOut;/.test(sync),
    'ⓑ 거울은 늘 짐에서 다시 센다(`_syncTribToEcon` 꼴 · 두 번째 장부 0) · 0 이면 칸을 지운다');
  const calls = (C.match(/_syncArmsToEcon\(/g) || []).length - 1;
  ok(calls === 4 && /WARS\.push\(_war\);\s*if \(_war\._arms\) _syncArmsToEcon\(V\);/.test(C) && /if \(w\._arms\) _syncArmsToEcon\(w\.atk\); \}/.test(C)
     && /WARS\.splice\(i, 1\);\s*if \(w\._arms\) _syncArmsToEcon\(w\.atk\);/.test(C)
     && (C.match(/syncArmsMirror: \(vil\) => _syncArmsToEcon\(vil\),/g) || []).length === 1,
    'ⓑ 부르는 자리 셋 — 반출(동원) · 결판(짐에서 빠진 몫) · 귀환(반납 뒤) — 모두 `_arms` 가 있을 때만(끔 = 안 부른다) · 넷째는 호스트 문 하나(★[T857] `syncArmsMirror` — 결판 자리 몸 짐 뒤 · 같은 함수)', `자리 ${calls}`);
  ok(/if \(!e \|\| !\(e\._warArmsOut > 0\)\) continue;/.test(reb) && /held \+= Math\.max\(0, w\._arms\.weapon \|\| 0\)/.test(reb) && /e\.storage\.weapon = \(e\.storage\.weapon \|\| 0\) \+ back;/.test(reb) && !/_armsLedgerOn/.test(reb),
    'ⓒⓔ 다시 뜨면 — 거울 − 실린 짐 = 곳간에 · **칸을 본다**(손잡이 아님)');
  const added = sync + reb.slice(reb.indexOf('T764'));
  ok(!/[^\w.](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(added) && !/toFixed/.test(sync + reb.slice(reb.indexOf('T764'))), 'ⓐ 새 수 0 — 0 만(반올림도 없다 — 짐의 수 그대로)');
}

// ── ② 끔 ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n② 끔(main 글자) — 칸 0 · 곳간 무변 · 재기동에도 잃는 것 없음');
{
  setK(false);
  const W = mkWorld({});
  const A = W.atk.econ; A._warCd = 0; W.def.econ._warCd = 1e9;
  const a0 = A.storage.weapon;
  const okM = W.war.warMobilize(W.atk, W.def, 'feud', 300, W.world.day);
  const w = wOf(W)[0];
  ok(okM && w && w._arms === undefined && A.storage.weapon === a0 && !('_warArmsOut' in A), 'ⓐ ★끔 — 동원해도 곳간 그대로 · 짐 칸 0 · 거울 칸 0', `곳간 ${a0} → ${A.storage.weapon}`);
  const W2 = reboot(W);
  ok(W2.atk.econ.storage.weapon === a0 && !('_warArmsOut' in W2.atk.econ) && wOf(W2).length === 0, 'ⓐ ★끔 재기동 — 곳간 그대로(잃는 것 없음) · 전쟁은 안 실린다(T742 회부 1 그대로)', `곳간 ${W2.atk.econ.storage.weapon} · 전쟁 ${wOf(W2).length}`);
}

// ── ③ 켬 — 거울 = 짐 ─────────────────────────────────────────────────────────────────────────────────────
console.log('\n③ 켬 — 거울 = 짐(반출 · 결판 · 귀환 · 두 원정)');
let R1 = null;
{
  setK(true);
  const W = mkWorld({});
  const A = W.atk.econ; W.def.econ._warCd = 1e9;
  const a0 = A.storage.weapon;
  W.war.warMobilize(W.atk, W.def, 'feud', 300, W.world.day);
  const w = wOf(W)[0];
  ok(w && w._arms && near(A.storage.weapon, a0 - w._arms.out) && near(A._warArmsOut, w._arms.weapon) && near(A._warArmsOut, w.force),
    'ⓑ 반출 — 곳간 −n · 짐 n · 거울 n(n = 병력 · 재고 넉넉)', `곳간 ${a0} → ${A.storage.weapon} · 짐 ${w && w._arms ? w._arms.weapon : '?'} · 거울 ${A._warArmsOut}`);
  R1 = { a0, aMob: A.storage.weapon, out: w._arms.out };
  //   결판 — 공격이 졌다(같은 씨 · test-war-world ⓣ ② 의 그 판) · 잃은 몫이 짐에서 빠지면 거울도 따라간다
  W.war.warResolveBattle(w, W.world.day);
  const st = W.world._warStats || {};
  ok((st.defWin | 0) > 0 && w._arms.weapon < w._arms.out && near(A._warArmsOut, w._arms.weapon) && near(A.storage.weapon, R1.aMob),
    'ⓑ 결판(공격 패) — 짐에서 빠진 몫만큼 거울이 준다 · 집 곳간은 반출 뒤 그대로', `짐 ${w._arms.out} → ${w._arms.weapon.toFixed(3)} · 거울 ${A._warArmsOut}`);
  R1.afterBattle = w._arms.weapon;
  w.phase = 'return'; w.eta = W.world.day; W.war.daily(W.world.day);
  ok(wOf(W).length === 0 && !('_warArmsOut' in A) && near(A.storage.weapon, R1.aMob + R1.afterBattle), 'ⓑ 귀환 — 반납 뒤 거울 칸이 지워진다(짐 0) · 곳간 = 반출 뒤 + 남은 짐', `곳간 ${A.storage.weapon.toFixed(3)}`);
  //   두 원정 — 같은 마을이 두 상대로(거울 = 두 짐의 합) · 하나가 돌아오면 나머지 하나
  const W3 = mkWorld({ atkPop: 60 });
  const A3 = W3.atk.econ; A3.storage.weapon = 200; W3.def.econ._warCd = 1e9;
  const C2 = { name: '대가C', econ: (Math.random = seeded(11), econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 20, name: '대가C' })), ccx: 0, ccy: 0 };
  Math.random = _origRandom;
  W3.villages.push(C2); C2.econ._warCd = 1e9; C2.econ.storage.weapon = 40;
  W3.war.warMobilize(W3.atk, W3.def, 'feud', 300, W3.world.day);
  A3._warCd = 0;
  W3.war.warMobilize(W3.atk, C2, 'feud', 300, W3.world.day);
  const [wa, wb] = wOf(W3);
  const both = wa && wb && wa._arms && wb._arms;
  ok(both && near(A3._warArmsOut, wa._arms.weapon + wb._arms.weapon), 'ⓑ 두 원정 — 거울 = 두 짐의 합', both ? `짐 ${wa._arms.weapon} + ${wb._arms.weapon} = 거울 ${A3._warArmsOut}` : `원정 ${wOf(W3).length}`);
  if (both) {
    wa.phase = 'return'; wa.eta = W3.world.day; W3.war.daily(W3.world.day);
    ok(wOf(W3).length === 1 && near(A3._warArmsOut, wb._arms.weapon), 'ⓑ 하나가 돌아오면 — 거울 = 남은 짐', `거울 ${A3._warArmsOut} · 남은 짐 ${wb._arms.weapon}`);
  }
}

// ── ④ 켬 — 재기동 ──────────────────────────────────────────────────────────────────────────────────────────
console.log('\n④ 켬 — 재기동(econ 은 실리고 진행 중 전쟁은 안 실린다)');
{
  setK(true);
  const mkOut = () => { const W = mkWorld({}); W.def.econ._warCd = 1e9; W.war.warMobilize(W.atk, W.def, 'feud', 300, W.world.day); return W; };
  //   ⓒ 행군 중 다시 뜬다 — 짐 n 이 곳간으로
  const W = mkOut(); const w = wOf(W)[0]; const a0 = 40, n = w._arms.weapon;
  const W2 = reboot(W);
  ok(wOf(W2).length === 0 && near(W2.atk.econ.storage.weapon, a0) && !('_warArmsOut' in W2.atk.econ),
    'ⓒ ★★행군 중 재기동 — 전쟁은 사라져도 짐의 무기 n 은 곳간에(곳간 + 짐 = 반출 앞 · 소멸 0) · 거울 칸 지움', `반출 ${n} · 다시 뜬 곳간 ${W2.atk.econ.storage.weapon}(반출 앞 ${a0})`);
  //   ⓓ 대조 — 거울이 없으면(T764 앞 글자) 다시 뜬 곳간 = 반출 뒤 그대로 ⇒ n 이 사라진다
  const Wb = mkOut(); delete Wb.atk.econ._warArmsOut;
  const Wb2 = reboot(Wb);
  ok(near(Wb2.atk.econ.storage.weapon, a0 - n), 'ⓓ ★대조 — 거울이 없으면(T764 앞 글자) 다시 뜬 곳간 = 반출 뒤 그대로 — **n 이 사라진다**', `${a0} − ${n} = ${Wb2.atk.econ.storage.weapon}`);
  //   결판 뒤(공격 패 · 귀환 길)에 다시 뜬다 — 남은 짐만큼
  const Wc = mkOut(); const wc = wOf(Wc)[0]; Wc.war.warResolveBattle(wc, Wc.world.day); const left = wc._arms.weapon;
  const Wc2 = reboot(Wc);
  ok(near(Wc2.atk.econ.storage.weapon, a0 - n + left) && !('_warArmsOut' in Wc2.atk.econ), 'ⓒ 결판 뒤 귀환 길에 재기동 — 남은 짐만큼 곳간에(결판이 뺀 몫은 결판 규칙대로 · 두 번 안 빠진다)', `${(a0 - n).toFixed(3)} + ${left.toFixed(3)} = ${Wc2.atk.econ.storage.weapon.toFixed(3)}`);
  //   ⓔ 칸을 본다 — 켬으로 저장하고 끔으로 다시 떠도 돌아온다
  const Wd = mkOut(); setK(false); const Wd2 = reboot(Wd); setK(true);
  ok(near(Wd2.atk.econ.storage.weapon, a0), 'ⓔ 켬으로 저장 · 끔으로 다시 뜸 — 그래도 곳간에(손잡이가 아니라 칸)', `${Wd2.atk.econ.storage.weapon}`);
  //   ⓕ 실린 짐이 있으면(앞날 — 전쟁을 몸째 싣는 고침이 서면) 그만큼은 남긴다(두 번 세지 않는다)
  const We = mkOut(); const we = wOf(We)[0]; const keep = JSON.parse(JSON.stringify({ arms: we._arms }));
  const We2 = reboot(We, (W2) => { W2.world._warWars.push({ id: 99, atk: W2.atk, def: W2.def, phase: 'march', _arms: keep.arms }); });
  ok(near(We2.atk.econ.storage.weapon, a0 - n) && near(We2.atk.econ._warArmsOut, n), 'ⓕ 실린 짐이 있으면 — 그 몫은 곳간에 안 넣고 거울에 남긴다(이중 0)', `곳간 ${We2.atk.econ.storage.weapon} · 거울 ${We2.atk.econ._warArmsOut}`);
  //   이중 재기동 — 두 번 다시 떠도 한 번만 돌아온다
  const W3 = reboot(W2);
  ok(near(W3.atk.econ.storage.weapon, a0), 'ⓒ 두 번 다시 떠도 한 번만(거울 칸이 지워졌다)', `${W3.atk.econ.storage.weapon}`);
}

if (prevK == null) delete process.env.T403_ARMS_LEDGER; else process.env.T403_ARMS_LEDGER = prevK;
console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
