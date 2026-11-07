#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1219-step-fast.js — 어장 칸 읽기를 같은 값으로 [T1219 µs 줄기] ===
//   잰다(손잡이 `T1219_STEP_FAST` — 끔 기본 · `'1'` 켬 · `'verify'` 대조(답은 종전) — 모듈 상수라 팔마다 아이 프로세스):
//   ① 열쇠 글자 — `_t1219Key(x, y)` = 종전 식 `x + '_' + y`(정수 · 음수 · −0 · ±2^20 경계 안팎 · 소수 · NaN · ∞ · 문자열 좌표) 글자 같음.
//   ② 결정론 퍼즈 — 어장 칸 표(일부 칸만 · 깎인 재고 · 여러 `t`)에서 `stockRatioAt` · `drawWholeStock` · `drawWholeFish` 를 차례로 부른다
//      (좌표: 음수 · 0 · 소수 · 문자열 · NaN · 시각: 앞 · 같음 · 뒤) → 답 하나하나 `Object.is` · 마지막 어장 칸 표(칸 · s · t · fresh)의 지문이 끔 = 켬 = verify.
//   ③ 켬 아이에 새 길이 섰다(읽기 수 · 지은 열쇠 수) · verify 아이 견줌 > 0 · 어긋남 0 · 끔 아이 새 길 셈 0.
//   ④ 미끼 — 열쇠를 다른 꼴(`x + ',' + y`)로 짓는 길 · 있는 칸 되살림(regen)을 빼먹는 길은 이 자의 퍼즈에서 종전과 갈린다(자가 문다).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const enc = (x) => (typeof x === 'number' ? (Object.is(x, -0) ? '-0' : Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Inf' : x === -Infinity ? '-Inf' : x) : x);
const H = (s) => require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);

if (process.argv[2] === '--child') {
  const F = require(path.join(ROOT, 'server', 'fishing'));
  const out = { mode: process.env.T1219_STEP_FAST || '' };
  // ① 열쇠 글자
  { const xs = [0, -0, 1, -1, 7, -7, 1048575, -1048575, 1048576, -1048576, 2097153, 0.5, -2.25, NaN, Infinity, -Infinity, '5', '-3', 123456];
    let n = 0, bad = 0, bait = 0;
    for (const x of xs) for (const y of xs) { n++; if (F._t1219Key(x, y) !== x + '_' + y) bad++; if ((x + ',' + y) !== x + '_' + y) bait++; }
    out.key = { n, bad, bait }; }
  // ② 퍼즈
  { const R = lcg(1219), log = [];
    F.setDayMs(60000);
    const now0 = 5e9;
    // 깎인 칸 · 여러 t 로 표를 채운다(종전 그릇 그대로 — 칸 열쇠 = 종전 글자)
    for (let i = 0; i < 400; i++) { const x = Math.floor(R() * 40) - 20, y = Math.floor(R() * 40) - 20; F.fishCells.set(x + '_' + y, { s: +(R() * F.CFG.CELL_K).toFixed(4), t: now0 - Math.floor(R() * 5) * 60000 }); }
    let now = now0;
    for (let t = 0; t < 3000; t++) {
      const op = t % 5, step = Math.floor(R() * 3);   // 시각: 같음 · 앞으로 · 하루 넘게
      now += step === 0 ? 0 : step === 1 ? 1500 : 90000;
      let cx = Math.floor(R() * 44) - 22, cy = Math.floor(R() * 44) - 22;
      const odd = R();
      if (op === 0) {   // stockRatioAt — 이상한 좌표 섞기
        if (odd < 0.05) cx = cx + 0.5; else if (odd < 0.08) cx = String(cx); else if (odd < 0.1) cy = NaN; else if (odd < 0.12) cx = -0;
        log.push(['r', enc(F.stockRatioAt(cx, cy, now))]);
      } else if (op === 1 || op === 3) {
        const stock = +(R() * 3).toFixed(3);
        log.push(['w', enc(F.drawWholeStock(cx, cy, stock, now, null))]);
      } else if (op === 2) {
        const per = +(0.2 + R() * 2).toFixed(3), n = 1 + Math.floor(R() * 4);
        log.push(['f', enc(F.drawWholeFish(cx, cy, per, n, now, null))]);
      } else {
        log.push(['r2', enc(F.stockRatioAt(cx, cy, now))]);
      }
    }
    const cells = [...F.fishCells.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, r]) => [k, enc(r.s), enc(r.t), !!r.fresh]);
    out.log = H(JSON.stringify(log)); out.logN = log.length; out.cells = H(JSON.stringify(cells)); out.cellN = cells.length;
    out.kinds = { r: log.filter((x) => x[0] === 'r' || x[0] === 'r2').length, w: log.filter((x) => x[0] === 'w' && x[1] > 0).length, f: log.filter((x) => x[0] === 'f' && x[1] > 0).length }; }
  // ④ 미끼 — 되살림을 빼먹은 읽기(있는 칸의 s 를 그대로) · 다른 꼴 열쇠는 ①의 bait 셈
  { const R = lcg(7), now = 9e9; let diff = 0;
    for (let i = 0; i < 200; i++) { const x = Math.floor(R() * 10), y = Math.floor(R() * 10); const k = x + '_' + y; const r = F.fishCells.get(k); if (!r) continue;
      const s0 = r.s, t0 = r.t; const lazy = s0; const real = F._t1219RecS(k, now); r.s = s0; r.t = t0; if (!Object.is(lazy, real)) diff++; }
    out.baitRegen = diff; }
  // ⑤ 해 질 녘 머리(`_t720Step`) — 돌 든 몸 · 정산 길 위/밖 · 가득 참 · 시각을 섞어 차례로 부른다 → 답 · 몸 칸 지문
  { for (const k of ['T312_FISH_ACT', 'T325_WOOD_ACT', 'T347_FORAGE_ACT']) if (process.env[k] == null) process.env[k] = '1';
    process.env.ENABLE_VILLAGES = '0';
    const E = require(path.join(ROOT, 'sim', 'economy-sim')), V = require(path.join(ROOT, 'server', 'villages'));
    const api = V.__p3Bind({}), state = api.state, P = V.__labProbe._t1180Probe, R = lcg(720), fps = [];
    const world = {}; E.bindProductionActs(world);
    for (let t = 0; t < 600; t++) {
      const vil = { name: 'g' + t, ccx: 3, ccy: 3, _granList: [], econ: { _world: world, storage: { stone: 0 }, treasury: {}, npcs: new Array(4).fill({}) }, npcPids: ['s' + t] };
      const npc = { pid: 's' + t, simJob: R() < 0.7 ? 'forager' : 'farmer', x: 100 + Math.floor(R() * 50), y: 100, inventory: R() < 0.8 ? { stone: Math.floor(R() * 8), pebble: R() < 0.3 ? 2 : 0 } : {}, hp: 100, maxHp: 100 };
      if (R() < 0.5) npc._t720 = { k: R() < 0.7 ? 1 : 0, tx: 112, ty: 112, at: 0, aw: 0, last: 0, d0: 1, dd: -1, fw: -1 };
      state.deps = { players: new Map([[npc.pid, npc]]) };
      const seq = [];
      for (let i = 0; i < 6; i++) { const now = 1000 * (t * 10 + i * 700), fv = R(); if (R() < 0.3) { npc.x = 112; npc.y = 112; }
        seq.push(enc(P.returnStep(vil, npc, now, fv, 0.7, 1, R() < 0.1))); }
      fps.push([seq, npc._t720 ? [npc._t720.k, npc._t720.at, npc._t720.aw, npc._t720.dd] : null, npc.behavior || null, JSON.stringify(npc.inventory), JSON.stringify(vil.econ.storage)]);
    }
    out.t720 = H(JSON.stringify(fps)); out.t720Stat = V.__labProbe._t1219Probe.stat(); }
  out.stat = F.t1219Stat();
  process.stdout.write('\n@@T1219@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (n, c, why) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (why ? ' — ' + why : '')); } };
function child(mode) {
  const env = Object.assign({}, process.env);
  if (mode == null) delete env.T1219_STEP_FAST; else env.T1219_STEP_FAST = mode;
  const s = execFileSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
  const i = s.lastIndexOf('@@T1219@@'); if (i < 0) throw new Error('아이 출력에 표가 없다: ' + s.slice(-400));
  return JSON.parse(s.slice(i + 9).trim());
}
const off = child(null), on = child('1'), vf = child('verify');
ok(`끔 아이 — 손잡이 끔 · 새 길 셈 0`, off.stat.on === false && off.stat.q === 0, JSON.stringify(off.stat));
ok(`① 열쇠 글자 = 종전 식(${off.key.n} 쌍 · 어긋남 ${on.key.bad})`, off.key.bad === 0 && on.key.bad === 0 && vf.key.bad === 0 && off.key.n > 300);
ok(`② 답 차례 끔 = 켬 = verify(${off.logN} 부름 · 읽기 ${off.kinds.r} · 뺀 판 ${off.kinds.w} · 마리 ${off.kinds.f})`, off.log === on.log && off.log === vf.log && off.kinds.w > 0 && off.kinds.f > 0, `${off.log} ${on.log} ${vf.log}`);
ok(`② 마지막 어장 칸 표(${off.cellN} 칸 · s · t · fresh) 끔 = 켬 = verify`, off.cells === on.cells && off.cells === vf.cells, `${off.cells} ${on.cells} ${vf.cells}`);
ok(`③ 켬 아이 — 새 길 읽기 ${on.stat.q} · 지은 열쇠 ${on.stat.keys}(표 ${on.stat.keyN})`, on.stat.on === true && on.stat.q > 1000 && on.stat.keys > 100);
ok(`③ verify 아이 — 견줌 ${vf.stat.vq} · 어긋남 ${vf.stat.bad}`, vf.stat.vq > 1000 && vf.stat.bad === 0);
ok(`⑤ 해 질 녘 머리 — 답 · 몸 칸 끔 = 켬 = verify(600 몸 × 6 걸음 · 켬 건너뜀 ${on.t720Stat.t720Skip} · verify 셈 ${vf.t720Stat.t720Vq})`, off.t720 === on.t720 && off.t720 === vf.t720 && on.t720Stat.t720Skip > 0 && vf.t720Stat.t720Vq > 0 && off.t720Stat.t720Skip === 0, `${off.t720} ${on.t720} ${vf.t720}`);
ok(`④ 미끼 — 다른 꼴 열쇠(${off.key.bait} 쌍) · 되살림 빼먹기(${off.baitRegen} 칸)는 종전과 갈린다`, off.key.bait > 0 && off.baitRegen > 0);
console.log(`\nT1219 step-fast: ${pass}/${fail}`);
process.exitCode = fail ? 1 : 0;
