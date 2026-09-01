#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-terraincache.js — 타일 지형 메모 하네스 [2026-08-31] =========
//
// 대상: `server/terrain-tilecache.js` + 그것을 무는 `server/zone.js` 의 두 술어.
//   수리의 주장은 딱 하나다 — **답을 안 바꾸고 다시 세는 일만 없앤다.**
//   그래서 이 하네스도 그 하나만 판다: (가) 답이 같은가, (나) 정말 덜 세는가,
//   (다) zone.js 가 캐시 켠 가지와 끈 가지에 **같은 식**을 넣었는가.
//
// ★★자명 통과 금지 — 이 하네스가 스스로를 못 믿게 짠 자리들:
//   · 표본에 true 와 false 가 둘 다 충분히 나왔는지 센다(전부 false 면 등가성은 공짜다).
//   · 캐시 적중이 실제로 일어났는지 compute 호출 횟수로 센다(족보 57).
//   · 속도 판정은 절대 시간이 아니라 **비율**이다(2코어 컨테이너 부하에 안 흔들리게).
//   · zone.js 검사는 정규식 한 방이 아니라 두 가지 인자식을 **뽑아서 비교**한다.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

const terrain = require(path.join(ROOT, 'server', 'terrain.js'));
const { makeTileCache } = require(path.join(ROOT, 'server', 'terrain-tilecache.js'));
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
const ZID = 'hanbando';
const Z = ZONES[ZID];
const TW = Math.ceil(Z.zoneWidth / 32), TH = Math.ceil(Z.zoneHeight / 32);

console.log(`\n=== 타일 지형 메모 — ${ZID} ${TW}×${TH} 타일 ===`);

// ── ⓪ 검사 상황 선행 assert ─────────────────────────────────────────────────
console.log('\n⓪ 검사 상황');
ok(TW > 1000 && TH > 1000, `지도 타일 ${TW}×${TH} — 실제 운영 지도다`, `${(TW * TH).toLocaleString()}칸`);
const T = terrain.ZONE_TERRAIN ? terrain.ZONE_TERRAIN[ZID] : null;
ok(!!T && (T.rivers || []).length > 0 && (T.ridges || []).length > 0,
   `지형 원천 적재 — 강 ${(T && T.rivers || []).length}개 · 산맥 ${(T && T.ridges || []).length}개`,
   `강 path점 ${(T && T.rivers || []).reduce((s, r) => s + (r.path || []).length, 0)}`);

// ── ① 등가 — 같은 타일이면 캐시가 답을 안 바꾼다 ─────────────────────────────
console.log('\n① 등가(답을 안 바꾼다)');
let s = 987654321;
const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const N = 6000;
const tiles = [];
for (let i = 0; i < N; i++) tiles.push([Math.floor(rnd() * TW), Math.floor(rnd() * TH)]);
// 재질문을 일부러 섞는다 — 적중 경로를 타야 등가성이 의미가 있다.
const mixed = tiles.concat(tiles.slice(0, N / 2)).concat(tiles.slice(0, N / 4));

const rawW = (tx, ty) => terrain.isWaterCellLocal(ZID, tx * 32 + 16, ty * 32 + 16);
const rawR = (tx, ty) => terrain.isRockCellLocal(ZID, tx * 32 + 16, ty * 32 + 16);

const cache = makeTileCache(TW, TH);
let mismatch = 0, tW = 0, fW = 0, tR = 0, fR = 0, computeCalls = 0;
for (const [tx, ty] of mixed) {
  const gw = rawW(tx, ty), gr = rawR(tx, ty);
  const cw = cache.water(tx, ty, () => { computeCalls++; return rawW(tx, ty); });
  const cr = cache.rock(tx, ty, () => { computeCalls++; return rawR(tx, ty); });
  if (cw !== gw || cr !== gr) mismatch++;
  gw ? tW++ : fW++; gr ? tR++ : fR++;
}
ok(mismatch === 0, `${mixed.length.toLocaleString()}회 질의 전부 원본과 일치`, `불일치 ${mismatch}`);
// ★자명 통과 금지: 답이 한쪽으로만 나왔으면 위 판정은 공짜다.
ok(tW > 50 && fW > 50, `물 판정에 참·거짓이 둘 다 넉넉히 나왔다`, `참 ${tW} / 거짓 ${fW}`);
ok(tR > 50 && fR > 50, `바위 판정에 참·거짓이 둘 다 넉넉히 나왔다`, `참 ${tR} / 거짓 ${fR}`);

// ── ② 적중 — 정말 덜 센다(족보 57: 자기 행동이 일어났는지 먼저 세라) ────────
console.log('\n② 적중(정말 덜 센다)');
const uniq = new Set(mixed.map(([a, b]) => a + ',' + b)).size;
ok(computeCalls === uniq * 2, `원본 계산은 서로 다른 타일 수만큼만 일어났다`,
   `compute ${computeCalls}회 = 고유 ${uniq}×2(물·바위)`);
const st = cache.stats();
ok(st.hitW > 0 && st.hitR > 0, `적중이 실제로 발생`, `물 적중 ${st.hitW} · 바위 적중 ${st.hitR}`);
ok(Math.abs(st.hitRate - (1 - uniq / mixed.length)) < 0.01,
   `적중률이 재질문 비율과 일치`, `${(st.hitRate * 100).toFixed(1)}%`);

// ── ③ 이득 — 같은 표본 2회차가 눈에 띄게 싸다 ──────────────────────────────
console.log('\n③ 이득(2코어 부하에 안 흔들리게 — **3회 중 최소**로 잰다)');
// ★★측정 자체를 고쳤다 [2026-08-31 회귀에서 실제로 걸렸다]
//   처음엔 1회 측정 + "20배" 문턱이었다. 그런데 같은 날 들어온 ⓑ 선분 색인이 원본 술어를
//   9.7배 싸게 만들자 배수가 134배 → 13배로 줄었고, 부하까지 겹치자 **4~14배로 요동**했다.
//   ⇒ 문턱을 계속 낮추는 건 바를 낮추는 짓이다. 고칠 것은 **재는 법**이었다:
//     · 벤치마크는 **최소값**이 가장 덜 오염된 추정치다(부하 스파이크는 위로만 튄다) → 3회 중 최소.
//     · 판정의 뜻은 "적중이 미적중보다 훨씬 싸다"이다. 캐시가 **실제로** 캐시한다는 하드 증명은
//       ②(compute 가 고유 타일 수만큼만 불렸다)가 이미 맡고 있다. ③ 은 '이득의 크기'만 본다.
const bench = (fn, pts) => { const t0 = process.hrtime.bigint(); for (const [a, b] of pts) fn(a, b); return Number(process.hrtime.bigint() - t0) / 1e6; };
const best = (f) => Math.min(f(), f(), f());
const warm = tiles.slice(0, 3000);
const rawBoth = (tx, ty) => rawW(tx, ty) || rawR(tx, ty);
const mk = () => { const c = makeTileCache(TW, TH); return (tx, ty) => c.water(tx, ty, () => rawW(tx, ty)) || c.rock(tx, ty, () => rawR(tx, ty)); };
bench(rawBoth, warm.slice(0, 300));                              // JIT 워밍업
const msCold = best(() => bench(mk(), warm));                    // 매번 새 캐시 = 전부 미적중
const hot = mk(); bench(hot, warm);                              // 채워 두고
const msHot = best(() => bench(hot, warm));                      // 전부 적중
// ★대조군도 **양쪽 다** 3회 중 최소로 잰다 — 한쪽만 최소로 재면 '단발 잡음 ÷ 최소값'이 되어
//   대조 비가 1 이 아니라 3~5 로 부풀고, 그 부푼 값이 다시 아래 문턱을 밀어 올린다(자기 발등).
const msRawA = best(() => bench(rawBoth, warm)), msRawB = best(() => bench(rawBoth, warm));
const gain = msCold / Math.max(0.001, msHot), ctrl = msRawA / Math.max(0.001, msRawB);
console.log(`     캐시 1회차 ${msCold.toFixed(0)}ms · 2회차 ${msHot.toFixed(0)}ms | 원본 1회차 ${msRawA.toFixed(0)}ms · 2회차 ${msRawB.toFixed(0)}ms`);
ok(gain > 3, `캐시 적중이 미적중보다 3배 넘게 싸다`,
   `${gain.toFixed(1)}배 · 색인 ${process.env.TERRAIN_SEG_INDEX === '1' ? '켬' : '끔'}`);
// ★대조군: 캐시가 없으면 2회차도 안 싸진다. 이게 없으면 "두 번째가 원래 빠르다"와 구별이 안 된다.
ok(gain > ctrl * 2.5, `이득이 대조군의 2.5배 넘는다 — 빨라진 건 캐시 덕이지 '두 번째라서'가 아니다`,
   `캐시 ${gain.toFixed(1)}배 vs 대조군 ${ctrl.toFixed(2)}배`);

// ── ④ zone.js 배선 — 켠 가지와 끈 가지에 같은 식이 들어갔나 ─────────────────
console.log('\n④ zone.js 배선');
const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
ok(/process\.env\.TERRAIN_TILE_CACHE === '1'/.test(zsrc),
   `기본 꺼짐 — env TERRAIN_TILE_CACHE='1' 일 때만 켜진다`);
ok(/_TERR_CACHE\s*=\s*\(process\.env\.TERRAIN_TILE_CACHE === '1' && !ZONE\.isOcean\)/.test(zsrc),
   `해양 존은 캐시를 아예 안 만든다(isWaterTileLocal 이 상수 true 라 무의미)`);

function bodyOf(name) {
  const i = zsrc.indexOf(`function ${name}(localX, localY) {`);
  if (i < 0) return null;
  let d = 0, j = zsrc.indexOf('{', i);
  for (let k = j; k < zsrc.length; k++) { if (zsrc[k] === '{') d++; else if (zsrc[k] === '}') { d--; if (!d) return zsrc.slice(i, k + 1); } }
  return null;
}
// 두 술어 각각: terrain 호출의 **인자식**을 전부 뽑아 서로 같은지 본다.
for (const [fn, call] of [['isWaterTileLocal', 'isWaterCellLocal'], ['isRockTileLocal', 'isRockCellLocal']]) {
  const b = bodyOf(fn);
  if (!b) { ok(false, `${fn} 본문을 찾지 못했다`); continue; }
  const args = [...b.matchAll(new RegExp(`_terrain\\.${call}\\(([^)]*)\\)`, 'g'))].map((m) => m[1].trim());
  ok(args.length === 2, `${fn}: terrain 호출이 캐시 가지 1 + 종전 가지 1 = 2개`, `${args.length}개`);
  ok(args.length === 2 && args[0] === args[1],
     `${fn}: 두 가지에 **글자까지 같은 인자식** — 캐시가 다른 점을 묻지 않는다`,
     args.length === 2 ? `「${args[0]}」` : '');
  ok(new RegExp(`_TERR_CACHE\\.${call.includes('Water') ? 'water' : 'rock'}\\(tx, ty,`).test(b),
     `${fn}: 캐시 키가 (tx, ty) — 술어가 이미 양자화한 그 좌표다`);
}
// ★terrain.js 안쪽에는 캐시를 걸지 않았다 — chunk.js:447 이 x±D 오프셋 점을 묻기 때문.
const tsrc = fs.readFileSync(path.join(ROOT, 'server', 'terrain.js'), 'utf8');
ok(!/terrain-tilecache/.test(tsrc),
   `terrain.js 는 캐시를 안 문다 — 셀 중심이 아닌 점을 묻는 호출자(chunk.js x±D·fishing.js)의 답이 바뀌면 안 된다`);
const csrc = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
ok(/isWaterCellLocal\(zone\.id, x - D, y\)/.test(csrc),
   `대조 근거 실재: chunk.js 가 실제로 오프셋 점을 묻는다(그래서 안쪽 양자화는 금지)`);

// ── ⑤ 메모리 ────────────────────────────────────────────────────────────────
console.log('\n⑤ 메모리');
const mb = (TW * TH) / 1048576;
ok(mb < 32, `타일당 1바이트 — ${mb.toFixed(1)}MB`, `존 힙 8GB 대비 무시할 수준`);

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
