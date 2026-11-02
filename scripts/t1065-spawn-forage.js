#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1065 ④ 탐침 · 제품 무변)
// === scripts/t1065-spawn-forage.js — 마을마다 도착 자리 곁에 **맨손으로 주울 것**(잔가지 · 자갈 · 풀)과 덤불이 실제로 있나 =======
//   T1065 는 맨손 벌목 · 채석 · 공격 · 낚시를 닫는다 → 첫 급조 도구(조잡한 돌도끼 = 자갈 2 · 잔가지 1 · 풀 2)의 재료가
//   도착 자리 곁에 없으면 첫 10분이 막힌다. 이 탐침은 존을 그대로 띄워(마을 전부) 온보딩 도착 자리(`Onboarding.arrivals`)마다
//   줍기 정본(`Forage.sourceAt` — `tryForage` 가 묻는 그 술어 · 사람 몸 ctx 그대로)과 청크 정본 덤불(`generateChunkResources`)까지
//   가장 가까운 거리를 16px 격자로 잰다(반경 상한 R).
//   node scripts/t1065-spawn-forage.js [R=1200] [--json out]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const RMAX = +(A.find((x) => /^\d+$/.test(x)) || 1200);
const TMP = `/tmp/t1065-spawn-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando'; process.env.PORT = String(42000 + (process.pid % 900)); process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0';
const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
const H = Zone.__testBind();
const Onb = require(path.join(ROOT, 'server', 'onboarding.js'));
const CH = require(path.join(ROOT, 'server', 'chunk.js'));
const ZB = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando.biome;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 600 && !Onb.ready(); i++) await sleep(500);
  const SV = require(path.join(ROOT, 'server', 'villages.js'));
  for (let i = 0; i < 600 && !((SV.clientVillages && SV.clientVillages()) || []).length; i++) await sleep(500);
  const list = (SV.clientVillages && SV.clientVillages()) || [];
  const arr = [];
  const vids = new Set([...Onb.arrivals().keys()]);
  for (const v of list) vids.add(v.id);
  for (const vid of vids) { const a = Onb.arrivalOf(vid); if (a) arr.push({ vid, a, name: (list.find((v) => v.id === vid) || {}).name || String(vid) }); }
  const body = { x: 0, y: 0, inventory: {}, toolItems: [], thirst: 100 };
  const ctx = H._forageCtx(body);
  const rows = [];
  for (const { vid, a, name } of arr) {
    const ax = a.x, ay = a.y;
    const best = { twig: null, pebble: null, fiber: null };
    for (let r = 0; r <= RMAX; r += 16) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / 16));
      for (let k = 0; k < n; k++) {
        const x = ax + r * Math.cos((2 * Math.PI * k) / n), y = ay + r * Math.sin((2 * Math.PI * k) / n);
        const src = H.Forage.sourceAt(x, y, ctx);
        if (src && best[src.kind] === null && src.kind in best) best[src.kind] = Math.round(r);
      }
      if (best.twig !== null && best.pebble !== null && best.fiber !== null) break;
    }
    // 덤불(잔가지 · 풀이 함께 나온다) — 청크 정본
    const S = CH.CHUNK_SIZE;   // px(청크 한 변)
    let bush = null, rock = null;
    const ccx = Math.floor(ax / S), ccy = Math.floor(ay / S);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const e of (CH.generateChunkResources('hanbando', ZB, ccx + dx, ccy + dy, CH.CHUNK_SIZE, new Set(), 0) || [])) {
        const d = Math.hypot(e.x - ax, e.y - ay);
        if (e.type === 'berry_bush' && d <= RMAX && (bush === null || d < bush)) bush = Math.round(d);
        if (e.type === 'rock' && d <= RMAX && (rock === null || d < rock)) rock = Math.round(d);   // 바위 개체(맨손 캐면 자갈 2 — T1065 켬이면 돌괭이가 있어야)
      }
    }
    rows.push({ vid, name, kind: a.kind || null, x: Math.round(ax), y: Math.round(ay), ...best, bush, rock });
  }
  console.log = _l; console.warn = _w; console.error = _e;
  const f = (v) => (v === null ? `> ${RMAX}` : `${v}`);
  console.log(`=== T1065 ④ 도착 자리 곁 맨손 재료 — 마을 ${rows.length}곳 · 반경 ${RMAX}px(16px 격자) ===`);
  console.log('| 마을 | 도착 | 잔가지 px | 자갈 px | 풀 px | 덤불 px | 바위 px |');
  console.log('|---|---|---:|---:|---:|---:|---:|');
  for (const r of rows) console.log(`| ${r.name} | ${r.kind || '-'} | ${f(r.twig)} | ${f(r.pebble)} | ${f(r.fiber)} | ${f(r.bush)} | ${f(r.rock)} |`);
  const q = (k) => { const v = rows.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b); return { n: v.length, med: v.length ? v[v.length >> 1] : null, max: v.length ? v[v.length - 1] : null }; };
  for (const k of ['twig', 'pebble', 'fiber', 'bush', 'rock']) { const s = q(k); console.log(`  ${k}: 반경 안 ${s.n}/${rows.length} · 가운데 ${s.med}px · 가장 먼 ${s.max}px`); }
  // 첫 급조 도구(자갈 · 잔가지 · 풀)를 반경 안에서 맨손으로 모을 수 있나 — 잔가지 · 풀 = 줍기 또는 덤불 · 자갈 = 줍기(켬) / 줍기 또는 맨손 바위(끔)
  const tf = (r) => (r.twig !== null || r.bush !== null) && (r.fiber !== null || r.bush !== null);
  const onOk = rows.filter((r) => tf(r) && r.pebble !== null), offOk = rows.filter((r) => tf(r) && (r.pebble !== null || r.rock !== null));
  //   켬 ③′(바위 개체 둘레 자갈 — `forage.sourceAt`) 뒤: 바위가 반경 안이면 그 곁 자갈을 손으로 줍는다 ⇒ 끔과 같은 셈
  const onOk2 = rows.filter((r) => tf(r) && (r.pebble !== null || r.rock !== null));
  console.log(`  반경 안에서 첫 급조 도구 재료가 맨손으로 다 모이는 곳: 끔(맨손 바위 됨) ${offOk.length}/${rows.length} · 켬 ③′ 앞(바위는 돌괭이) ${onOk.length}/${rows.length} · 켬 ③′ 뒤(바위 곁 자갈) ${onOk2.length}/${rows.length}`);
  const lost = offOk.filter((r) => !onOk.includes(r));
  console.log(`  ③′ 앞 켬에서 자갈이 반경 밖이 되던 곳(맨손 바위가 유일한 자갈이던 곳): ${lost.length}곳${lost.length ? ' — ' + lost.map((r) => `${r.name}(바위 ${r.rock}px)`).join(' · ') : ''}`);
  const none = rows.filter((r) => !offOk.includes(r));
  console.log(`  끔에서도 반경 안에 다 없는 곳: ${none.length}곳${none.length ? ' — ' + none.map((r) => r.name).join(' · ') : ''}`);
  const j = A.indexOf('--json'); if (j >= 0) fs.writeFileSync(A[j + 1], JSON.stringify({ RMAX, rows }, null, 1));
  for (const x of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(x); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.log = _l; console.error(e); process.exit(1); });
