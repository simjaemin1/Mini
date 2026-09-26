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
   `${gain.toFixed(1)}배 · 색인 ${process.env.TERRAIN_SEG_INDEX !== '0' ? '켬' : '끔'}`);
// ★대조군: 캐시가 없으면 2회차도 안 싸진다. 이게 없으면 "두 번째가 원래 빠르다"와 구별이 안 된다.
ok(gain > ctrl * 2.5, `이득이 대조군의 2.5배 넘는다 — 빨라진 건 캐시 덕이지 '두 번째라서'가 아니다`,
   `캐시 ${gain.toFixed(1)}배 vs 대조군 ${ctrl.toFixed(2)}배`);

// ── ④ zone.js 배선 — 켠 가지와 끈 가지에 같은 식이 들어갔나 ─────────────────
console.log('\n④ zone.js 배선');
const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
// ★★[T344 2026-09-21] **이 두 줄이 옛 계약을 물고 있었다 — 자 결함이다(제품 회귀 아님).**
//   `9b61d49f`[T324 · 09-19]가 **기본을 켬으로 돌렸다**(`!== '0'` · 되돌림은 `TERRAIN_TILE_CACHE=0`).
//   근거는 그 커밋이 실측으로 냈다: 51마을·1,476명 전원 걷기에서 존 틱 p50 **261.062ms → 8.035ms**(32.5배),
//   틱의 89%가 지형 판정이었다. 세계는 무변(값 투명)이고 `test-terrain-memo` 가 켬/끔을 전수 대조한다.
//   그런데 이 하네스는 `=== '1'` 이라는 **글자**를 계속 물어서 09-21 야간에 빨개졌다(3초 · 부하 무관 · 결정적).
//   ⇒ 계약을 새 것으로 옮긴다. 재는 성질은 바뀌지 않았다 — **끌 문이 하나 있다**와 **해양 존은 안 만든다**.
ok(/process\.env\.TERRAIN_TILE_CACHE !== '0'/.test(zsrc),
   `기본 켜짐 — 끄는 문은 env TERRAIN_TILE_CACHE='0' 하나다 [T324]`);
ok(/_TERR_CACHE\s*=\s*\(process\.env\.TERRAIN_TILE_CACHE !== '0' && !ZONE\.isOcean\)/.test(zsrc),
   `해양 존은 캐시를 아예 안 만든다(isWaterTileLocal 이 상수 true 라 무의미)`);
// ★자명 통과 금지 — 옛 글자(`=== '1'`)가 **남아 있지 않다**. 둘 다 통과하는 소스는 없다(배타).
ok(!/process\.env\.TERRAIN_TILE_CACHE === '1'/.test(zsrc),
   `★자명 통과 금지 — 옛 계약 글자 \`=== '1'\` 가 zone.js 에 없다(있으면 위 둘 중 하나가 거짓말이다)`);

function bodyOf(name) {
  const i = zsrc.indexOf(`function ${name}(localX, localY) {`);
  if (i < 0) return null;
  let d = 0, j = zsrc.indexOf('{', i);
  for (let k = j; k < zsrc.length; k++) { if (zsrc[k] === '{') d++; else if (zsrc[k] === '}') { d--; if (!d) return zsrc.slice(i, k + 1); } }
  return null;
}
// ★★[T383 2026-09-25] **글자 대신 동작으로 잰다 — 그리고 정적 절은 지금 모양을 따라간다.**
//   종전 절은 "두 술어 본문에 `_terrain.*CellLocal(...)` 이 **두 번**(캐시 가지 · 종전 가지) 나오고 인자식이
//   글자까지 같다" 를 물었다. 그런데 `faae1b04`[T345 · 09-22]가 걸음당 클로저를 없애려고 캐시 가지의 호출을
//   **모듈 수준 함수**(`_computeWaterCell`·`_computeRockCell` · `zone.js:969·970`)로 한 칸 옮겼다 ⇒ 본문엔 하나만 남는다.
//   계약("캐시가 다른 점을 묻지 않는다")은 그대로인데 **자가 옮겨 간 자리를 못 따라갔다** — 09-23 부터 밤마다 4 빨강.
//   ⇒ 이 절이 원래 재려던 것을 **동작**으로 잰다: 실제 zone.js 를 캐시 켬/끔 두 판으로 띄워 **같은 1,000점**에
//     두 술어를 묻고 답이 비트 동일한지 본다. 정적 절은 그 동작 절이 초록일 때만 지금 모양으로 옮긴다.
const { spawnSync } = require('child_process');
function probeZone(cacheEnv, pts) {
  //   자식에서 zone.js 를 띄운다(`TERRAIN_TILE_CACHE` 는 모듈 적재 때 읽힌다 — 한 프로세스로는 두 팔을 못 만든다).
  //   ⚠`zone.js` 는 적재하면 `listen` 한다 — `PORT=0`(임시 포트)으로 충돌을 없앤다(밤 러너 포트 충돌 교훈).
  const code = `
    for (const k of ['ENABLE_VILLAGES','ENABLE_WILDLIFE','ENABLE_BANDITS','ENABLE_ROADS']) process.env[k] = '0';
    const _l = console.log; console.log = () => {};
    const H = require(${JSON.stringify(path.join(ROOT, 'server', 'zone.js'))}).__testBind();
    console.log = _l;
    const pts = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    let w = '', r = '';
    for (const [x, y] of pts) { w += H.isWaterTileLocal(x, y) ? '1' : '0'; r += H.isRockTileLocal(x, y) ? '1' : '0'; }
    _l(JSON.stringify({ w, r })); process.exit(0);`;
  const env = Object.assign({}, process.env, { PORT: '0', ZONE_ID: ZID, TERRAIN_TILE_CACHE: cacheEnv });
  const out = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env, input: JSON.stringify(pts), encoding: 'utf8', timeout: 180000 });
  const line = String(out.stdout || '').trim().split('\n').pop();
  try { return JSON.parse(line); } catch (e) { return null; }
}
{
  //   표본 1,000점 — 무작위 400 + **강 가장자리 300 + 산 가장자리 300**(경계에서 참·거짓이 갈린다).
  //   좌표는 **픽셀**이고 타일 안 오프셋이 섞인다 — 두 가지가 같은 양자화를 하는지까지 같이 잰다.
  let s2 = 20260925;
  const rn = () => (s2 = (s2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push([Math.floor(rn() * Z.zoneWidth), Math.floor(rn() * Z.zoneHeight)]);
  const edge = (paths, n) => { const all = []; for (const g of paths) for (const q of (g.path || [])) all.push(q);
    for (let i = 0; i < n; i++) { const q = all[Math.floor(rn() * all.length)]; const w0 = (q.width || 64);
      pts.push([Math.floor(q.pos[0] + (rn() - 0.5) * 2 * w0), Math.floor(q.pos[1] + (rn() - 0.5) * 2 * w0)]); } };
  edge(T.rivers, 300); edge(T.ridges, 300);
  const on = probeZone('1', pts), off = probeZone('0', pts);
  ok(!!on && !!off && on.w.length === 1000 && off.w.length === 1000,
     `★동작 게이트 — 실제 zone.js 두 판(캐시 켬 · 끔)이 같은 1,000점에 답했다`, on && off ? '' : '자식 실패');
  if (on && off) {
    const cnt = (b, c) => [...b].filter((x) => x === c).length;
    ok(cnt(off.w, '1') >= 50 && cnt(off.w, '0') >= 50 && cnt(off.r, '1') >= 50 && cnt(off.r, '0') >= 50,
       `(상황) 끈 판의 답에 참·거짓이 둘 다 넉넉하다 — 전부 같은 답이면 등가는 공짜다`,
       `물 ${cnt(off.w, '1')}/${cnt(off.w, '0')} · 바위 ${cnt(off.r, '1')}/${cnt(off.r, '0')}`);
    const dW = [...on.w].filter((c, i) => c !== off.w[i]).length, dR = [...on.r].filter((c, i) => c !== off.r[i]).length;
    ok(dW === 0, `★★isWaterTileLocal: 캐시 켬/끔 답이 **비트 동일** — 캐시가 다른 점을 묻지 않는다`, `다른 점 ${dW}/1000`);
    ok(dR === 0, `★★isRockTileLocal: 캐시 켬/끔 답이 **비트 동일** — 캐시가 다른 점을 묻지 않는다`, `다른 점 ${dR}/1000`);
    //   ★자명 통과 금지 — 이 표본이 "다른 점을 묻는 캐시"를 **실제로 잡는가**: 셀 중심 대신 모서리를 물으면 답이 갈려야 한다.
    let baitW = 0, baitR = 0;
    for (const [x, y] of pts) { const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
      if (terrain.isWaterCellLocal(ZID, tx * 32 + 16, ty * 32 + 16) !== terrain.isWaterCellLocal(ZID, tx * 32, ty * 32)) baitW++;
      if (terrain.isRockCellLocal(ZID, tx * 32 + 16, ty * 32 + 16) !== terrain.isRockCellLocal(ZID, tx * 32, ty * 32)) baitR++; }
    ok(baitW > 0 && baitR > 0,
       `★자명 통과 금지 — 미끼(셀 중심 대신 **모서리**를 묻는 캐시)라면 이 표본에서 답이 갈린다 ⇒ 위 비트 동일은 공짜가 아니다`,
       `물 ${baitW} · 바위 ${baitR} 점에서 갈림`);
  }
}
//   ★정적 절 — 동작 절이 초록이므로 **지금 모양**을 따라간다(T345 가 옮긴 그 한 칸):
//     캐시 가지는 (tx, ty) 와 **모듈 수준 계산 함수 이름**을 넘기고, 그 함수는 **셀 중심**(tx*32+16, ty*32+16)을 묻는다.
function helperAsksCenter(src, fn, call, which) {
  const b = (() => { const i = src.indexOf(`function ${fn}(localX, localY) {`); if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return null; })();
  if (!b) return { ok: false, why: '본문 없음' };
  const m = b.match(new RegExp(`_TERR_CACHE\\.${which}\\(tx, ty, (_[A-Za-z0-9]+)\\)`));
  if (!m) return { ok: false, why: '캐시 가지가 (tx, ty, 함수이름) 꼴이 아니다' };
  const def = src.match(new RegExp(`const ${m[1]} = \\(tx, ty\\) => [^;\\n]*_terrain\\.${call}\\(([^)]*)\\)`));
  if (!def) return { ok: false, why: `${m[1]} 정의를 못 찾았다` };
  const argsOk = def[1].replace(/\s+/g, ' ').trim() === 'ZONE_ID, tx * 32 + 16, ty * 32 + 16';
  return { ok: argsOk, why: `${m[1]}(${def[1].trim()})` };
}
for (const [fn, call, which] of [['isWaterTileLocal', 'isWaterCellLocal', 'water'], ['isRockTileLocal', 'isRockCellLocal', 'rock']]) {
  const r = helperAsksCenter(zsrc, fn, call, which);
  ok(r.ok, `${fn}: 캐시 가지 → 모듈 수준 계산 함수 → **셀 중심**(tx*32+16, ty*32+16)을 묻는다 [T345 모양]`, r.why);
  ok(new RegExp(`_TERR_CACHE\\.${which}\\(tx, ty,`).test(zsrc),
     `${fn}: 캐시 키가 (tx, ty) — 술어가 이미 양자화한 그 좌표다`);
}
//   ★자명 통과 금지 — 위 정적 검사기가 **옛 결함 모양**(모서리를 묻는 계산 함수)을 실제로 거절하는가
{
  const bait = zsrc.replace('const _computeWaterCell = (tx, ty) => _terrain.isWaterCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);',
                            'const _computeWaterCell = (tx, ty) => _terrain.isWaterCellLocal(ZONE_ID, tx * 32, ty * 32);');
  ok(bait !== zsrc && !helperAsksCenter(bait, 'isWaterTileLocal', 'isWaterCellLocal', 'water').ok,
     `★자명 통과 금지 — 미끼 소스(계산 함수가 모서리를 묻는다)를 정적 절이 **거절한다**`);
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
