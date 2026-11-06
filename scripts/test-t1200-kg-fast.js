#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1200-kg-fast.js — NPC 짐 무게(`carry.npcTotalKg`)를 통째 베낌 없이 [T1200 µs 줄기] ===
//   잰다:
//   ① 손잡이 `T1200_KG_FAST` 끔 기본 · `'1'` 켬 · `'verify'` 대조(답은 종전) — 모듈 상수라 팔마다 아이 프로세스.
//   ② 같은 답 — 고칠 것이 없는 꼴 몸 짐(물고기 종 · 로트 품목 · 돌 · 나무 · 광석 덩이 kg · 업은 짐 · 도구 · 장비 · 요리)에서
//      얕은 길(`_npcTotalKgFast`) = 종전 길(`_npcTotalKg0`) — `Object.is` 비트 같음 · 진짜 몸에 쓰기 0.
//   ③ 고칠 꼴(수 항목 · NaN kg · id 없음 · 빈칸 · 문자열 · 로트 n NaN · 장부가 배열 · 항목이 객체 아닌 값)은 종전 길로 간다
//      (셈 `slow` 가 오른다) · 같은 답 · 진짜 몸에 쓰기 0.
//   ④ 결정론 퍼즈 — LCG 시드 셋 × 짐 2,000 개(고칠 꼴 섞음) — 같은 답 · 쓰기 0 · 두 길 다 던지면 같이 던진다.
//   ⑤ 미끼 — 꼴 검사 없이 얕게만 베끼는 길(이 자가 막으려는 실수)은 고칠 꼴에서 **진짜 몸을 고쳐 쓴다** — 이 자의 쓰기 검사가 문다.
//   ⑥ 켬 아이 · verify 아이 — `npcTotalKg` 공개 문이 끔 아이와 같은 수를 낸다(같은 짐 표 · 지문).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const util = require('util');
const ROOT = path.join(__dirname, '..');

const C = require(path.join(ROOT, 'server', 'carry.js'));
const FG = require(path.join(ROOT, 'server', 'fish-goods.js'));
let pass = 0, fail = 0;
const ok = (n, c, why) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (why ? ' — ' + why : '')); } };

// 짐 표(결정론) — seed 로 몸 하나를 짓는다
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const FISH = FG.species().slice(0, 8);
const ITEMS = ['stone', 'wood', 'twig', 'berry', 'meat', 'fish', 'food', 'rice', 'grain_sheaf', 'pebble', 'herb', ...FISH];
function body(r, bad) {
  const p = { isNpc: true, pid: 'n' + Math.floor(r() * 1e6), inventory: {}, kgLedger: {}, lots: {} };
  const k = 1 + Math.floor(r() * 6);
  for (let i = 0; i < k; i++) {
    const it = ITEMS[Math.floor(r() * ITEMS.length)];
    const n = 1 + Math.floor(r() * 5);
    p.inventory[it] = (p.inventory[it] || 0) + n;
    if (r() < 0.6) { const L = p.kgLedger[it] || (p.kgLedger[it] = []); for (let j = 0; j < n - (r() < 0.3 ? 1 : 0); j++) L.push({ id: L.length + 1 + i * 10, kg: +(0.1 + r() * 3).toFixed(3), d: Math.floor(r() * 30) }); }
    if (r() < 0.4) { const L = p.lots[it] || (p.lots[it] = []); L.push({ d: Math.floor(r() * 30), n: n + (r() < 0.3 ? 0.25 : 0), e: +(r() * 2).toFixed(3), k: Math.floor(r() * 1e7) }); }
  }
  if (r() < 0.3) p.inventory.ore_chunk = +(r() * 9).toFixed(3);
  if (r() < 0.2) { p.kgLedger.ore_chunk = [{ id: 99, kg: 4 }]; p.lots.ore_chunk = [{ d: 1, n: 2 }]; }
  if (r() < 0.2) p._carryingKg = +(r() * 60).toFixed(2);
  if (r() < 0.3) p.toolItems = [{ type: 'stone_axe' }];
  if (r() < 0.2) p.equipment = [{ type: 'hide_coat' }];
  if (r() < 0.1) p.dishes = [{}];
  if (bad) {
    const its = Object.keys(p.kgLedger).filter((x) => p.kgLedger[x].length);
    const kind = Math.floor(r() * 9);
    const it = its[0] || 'stone'; const L = p.kgLedger[it] || (p.kgLedger[it] = [{ id: 1, kg: 1 }]);
    if (kind === 0) L.push(2.5);                       // 옛 꼴 수 항목
    else if (kind === 1) L.push({ id: 7, kg: NaN });   // NaN kg
    else if (kind === 2) L.push({ kg: 1.25 });         // id 없음
    else if (kind === 3) { L.length += 1; }            // 빈칸
    else if (kind === 4) L.push('x');                  // 문자열
    else if (kind === 5) p.lots.fish = [{ d: 1, n: NaN }];
    else if (kind === 6) p.kgLedger = [];              // 장부가 배열
    else if (kind === 7) p.kgLedger.wood = { 0: { id: 1, kg: 1 } };   // 배열 아닌 객체
    else p.lots.meat = [{ d: 1, n: Infinity }];
  }
  return p;
}
// 진짜 몸 쓰기 검사 — 셈 앞 깊은 사본과 셈 뒤가 엄격히 같은가(−0 · NaN · 빈칸까지)
const snap = (p) => util.inspect(p, { depth: 20, showHidden: true, sorted: true, maxArrayLength: null });
function same(a, b) { return Object.is(a, b); }
function run2(p) {
  const s0 = snap(p);
  let a, b, ea = null, eb = null;
  try { a = C._npcTotalKgFast(p); } catch (e) { ea = String(e && e.message); }
  const s1 = snap(p);
  try { b = C._npcTotalKg0(p); } catch (e) { eb = String(e && e.message); }
  const s2 = snap(p);
  return { a, b, ea, eb, wroteFast: s0 !== s1, wroteSlow: s1 !== s2 };
}

console.log('\n① 손잡이');
{
  const arm = (v) => {
    const env = { ...process.env }; delete env.T1200_KG_FAST; if (v !== undefined) env.T1200_KG_FAST = v;
    return JSON.parse(execFileSync(process.execPath, ['-e', "const s=require('./server/carry').t1200Stat();console.log(JSON.stringify([s.on,s.verify]))"], { cwd: ROOT, env, encoding: 'utf8' }).trim().split('\n').pop());
  };
  ok('미설정 = 끔', util.isDeepStrictEqual(arm(undefined), [false, false]));
  ok("'0' = 끔", util.isDeepStrictEqual(arm('0'), [false, false]));
  ok("'' = 끔", util.isDeepStrictEqual(arm(''), [false, false]));
  ok("'1' = 켬", util.isDeepStrictEqual(arm('1'), [true, false]));
  ok("'verify' = 켬 + 견줌", util.isDeepStrictEqual(arm('verify'), [true, true]));
}

console.log('\n② 고칠 것 없는 꼴 — 같은 답 · 쓰기 0');
{
  const st0 = C.t1200Stat();
  let n = 0, bad = 0, wrote = 0;
  for (const seed of [1, 7, 42, 1020]) { const r = lcg(seed); for (let i = 0; i < 400; i++) { const x = run2(body(r, false)); n++; if (!same(x.a, x.b) || x.ea || x.eb) bad++; if (x.wroteFast || x.wroteSlow) wrote++; } }
  const st1 = C.t1200Stat();
  ok(`몸 ${n} — 얕은 길 = 종전 길(비트)`, bad === 0, `어긋남 ${bad}`);
  ok('진짜 몸에 쓰기 0(두 길 다)', wrote === 0, `쓴 몸 ${wrote}`);
  ok('전부 얕은 길로 갔다(꼴 검사가 정상 짐을 막지 않는다)', st1.fast - st0.fast === n && st1.slow === st0.slow, `fast +${st1.fast - st0.fast} · slow +${st1.slow - st0.slow}`);
  const p = { isNpc: true, inventory: { carp: 2, ore_chunk: 3.5, stone: 1 }, kgLedger: { carp: [{ id: 1, kg: 1.2 }, { id: 2, kg: 0.8 }], ore_chunk: [{ id: 3, kg: 9 }] }, lots: { fish: [{ d: 1, n: 0.75 }] } };
  const x = run2(p);
  ok(`손 계산 짐(잉어 둘 2.0 + 돌 하나 + 광석 3.5kg + 물고기 로트 0.75) — ${x.a} = ${x.b}`, same(x.a, x.b) && !x.wroteFast);
}

console.log('\n③ 고칠 꼴 — 종전 길 · 같은 답 · 쓰기 0');
{
  const st0 = C.t1200Stat();
  let n = 0, bad = 0, wrote = 0;
  for (const seed of [3, 9, 77]) { const r = lcg(seed); for (let i = 0; i < 300; i++) { const x = run2(body(r, true)); n++; if (!(same(x.a, x.b) && x.ea === x.eb)) bad++; if (x.wroteFast || x.wroteSlow) wrote++; } }
  const st1 = C.t1200Stat();
  ok(`몸 ${n}(아홉 갈래 고칠 꼴) — 같은 답 · 같은 던짐`, bad === 0, `어긋남 ${bad}`);
  ok('진짜 몸에 쓰기 0', wrote === 0, `쓴 몸 ${wrote}`);
  ok('전부 종전 길로 갔다', st1.slow - st0.slow === n && st1.fast === st0.fast, `fast +${st1.fast - st0.fast} · slow +${st1.slow - st0.slow}`);
}

console.log('\n④ 퍼즈(고칠 꼴 섞음)');
{
  let n = 0, bad = 0, wrote = 0;
  for (const seed of [11, 12, 13]) { const r = lcg(seed); for (let i = 0; i < 2000; i++) { const x = run2(body(r, r() < 0.25)); n++; if (!(same(x.a, x.b) && x.ea === x.eb)) bad++; if (x.wroteFast || x.wroteSlow) wrote++; } }
  ok(`몸 ${n} — 같은 답`, bad === 0, `어긋남 ${bad}`);
  ok('쓰기 0', wrote === 0, `쓴 몸 ${wrote}`);
}

console.log('\n⑤ 미끼 — 꼴 검사 없는 얕은 베낌');
{
  const naive = (p) => { const s = { inventory: { ...p.inventory }, kgLedger: { ...(p.kgLedger || {}) }, lots: { ...(p.lots || {}) }, _carryingKg: p._carryingKg, toolItems: p.toolItems, equipment: p.equipment, dishes: p.dishes };
    const ore = Math.max(0, +s.inventory.ore_chunk || 0); delete s.inventory.ore_chunk; delete s.kgLedger.ore_chunk; delete s.lots.ore_chunk; return C.totalKg(s) + ore; };
  const p = { isNpc: true, inventory: { stone: 2 }, kgLedger: { stone: [3.5, { id: 2, kg: 4 }] }, lots: {} };
  const s0 = snap(p); naive(p); const s1 = snap(p);
  ok('미끼(수 항목 장부)는 진짜 몸을 고쳐 쓴다 — 이 자의 쓰기 검사가 문다', s0 !== s1);
  const q = { isNpc: true, inventory: { stone: 2 }, kgLedger: { stone: [3.5, { id: 2, kg: 4 }] }, lots: {} };
  const x = run2(q);
  ok('같은 짐에서 켬 길은 쓰지 않는다 · 답 같음', !x.wroteFast && same(x.a, x.b));
}

console.log('\n⑥ 공개 문 — 끔 · 켬 · verify 아이 같은 수');
{
  const code = `const C=require('./server/carry');const T=${JSON.stringify(Array.from({ length: 1 }, () => 0))};
    function lcg(seed){let s=seed>>>0;return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}
    const r=lcg(5);const out=[];const crypto=require('crypto');const h=crypto.createHash('sha1');
    const body=${body.toString()};const FISH=${JSON.stringify(FISH)};const ITEMS=${JSON.stringify(ITEMS)};
    for(let i=0;i<1500;i++){const p=body(r,r()<0.2);let v;try{v=C.npcTotalKg(p);}catch(e){v='E'+e.message;}h.update(String(Object.is(v,-0)?'-0':v)+'|');}
    console.log(JSON.stringify({h:h.digest('hex').slice(0,16),s:C.t1200Stat()}));`;
  const arm = (v) => { const env = { ...process.env }; delete env.T1200_KG_FAST; if (v !== undefined) env.T1200_KG_FAST = v;
    return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop()); };
  const off = arm(undefined), on = arm('1'), ver = arm('verify');
  ok(`지문 끔 ${off.h} = 켬 ${on.h} = verify ${ver.h}`, off.h === on.h && on.h === ver.h);
  ok(`켬 아이가 얕은 길을 탔다(${on.s.fast} · 종전 ${on.s.slow})`, on.s.fast > 0);
  ok(`verify 견줌 ${ver.s.vq} · 어긋남 ${ver.s.vbad}`, ver.s.vq === 1500 && ver.s.vbad === 0);
}

console.log(`\n=== T1200 짐 무게 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
