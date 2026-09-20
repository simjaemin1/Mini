#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-terrain-memo.js — 타일 지형 메모의 **값 투명성** (T324) ======================
//
// ★왜 [T324 · 보고/T324_2026-09-19.md §2]
//   T316 이 "전원 걷기 = 존 틱 374.6ms" 를 냈고, T324 의 `--cpu-prof` 가 그 틱의 **89%** 를
//   지형 판정(`_pointToSegmentDist`·`_isPointInRiver`)이 쓰고 있다고 지목했다. 고침은 새 알고리즘이
//   아니라 **이미 레포에 있던 메모**(`terrain-tilecache.js`, 2026-08-31 · 그때는 기본 꺼짐)를 켜는 것이다.
//   ⇒ 그 켜기가 **세계를 바꾸지 않는다**는 것을 이 하네스가 건다. 빠르다는 것은 자가 말하고,
//     **같은 답**이라는 것은 여기가 말한다.
//
// ★무엇을 재나 — 메모는 `(tx, ty)` 의 순수 함수라는 주장이다. 그 주장을 **전수로** 민다:
//   ① 메모 판과 무메모 판이 같은 셀에 **같은 답**을 낸다(무작위 20,000 + 강·산 경계 띠).
//   ② 두 번째 질문(캐시 적중)이 첫 번째와 같은 답이다(메모가 값을 뒤집지 않는다).
//   ③ 되돌림이 진짜 되돌림이다 — `TERRAIN_TILE_CACHE=0` 이면 배열조차 안 만든다.
//   ④ 자명 통과 금지 — 메모를 **거짓말하게** 비틀면 ①이 문다.
//
// 실행: node scripts/test-terrain-memo.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

console.log('\n=== 타일 지형 메모 — 값 투명성 (T324) ===');

const ZONE_ID = 'hanbando';
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const ZONE = ZONES[ZONE_ID];
const terrain = require(path.join(ROOT, 'server', 'terrain'));
const { makeTileCache } = require(path.join(ROOT, 'server', 'terrain-tilecache'));
const TW = Math.ceil(ZONE.zoneWidth / 32), TH = Math.ceil(ZONE.zoneHeight / 32);

// 결정론 표본 — 주사위 0(같은 씨면 같은 셀 목록 · 하네스 규약)
let _s = 0x9e3779b9;
const rnd = () => { _s ^= _s << 13; _s >>>= 0; _s ^= _s >> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; };

console.log('\n① 메모 판 ↔ 무메모 판 — 같은 셀에 같은 답');
{
  const C = makeTileCache(TW, TH);
  const cells = [];
  for (let i = 0; i < 20000; i++) cells.push([(rnd() * TW) | 0, (rnd() * TH) | 0]);
  // ★경계 띠 — 강·산의 **가장자리**가 메모가 틀릴 수 있는 유일한 자리다(양자화가 답을 가른다면 거기다).
  //   지형이 참인 셀을 찾아 그 8방을 같이 넣는다(무작위만으로는 경계 표본이 성기다).
  let edge = 0;
  for (const [tx, ty] of cells.slice(0, 4000)) {
    if (terrain.isWaterCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16) || terrain.isRockCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16)) {
      for (const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const a = tx + d[0], b = ty + d[1];
        if (a >= 0 && b >= 0 && a < TW && b < TH) { cells.push([a, b]); edge++; }
      }
    }
  }
  let nW = 0, nR = 0, diffW = 0, diffR = 0, trueW = 0, trueR = 0;
  for (const [tx, ty] of cells) {
    const raw = terrain.isWaterCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);
    const memo = C.water(tx, ty, () => terrain.isWaterCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16));
    nW++; if (raw !== memo) diffW++; if (raw) trueW++;
    const rawR = terrain.isRockCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);
    const memoR = C.rock(tx, ty, () => terrain.isRockCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16));
    nR++; if (rawR !== memoR) diffR++; if (rawR) trueR++;
  }
  console.log(`  · 표본 ${nW}셀(무작위 20,000 + 경계 ${edge}) · 물 참 ${trueW} · 바위 참 ${trueR}`);
  ok(trueW > 0 && trueR > 0, '① [상황] 표본에 물도 바위도 **들어 있다**(빈 들판만 재면 자명 통과다)', `물 ${trueW} · 바위 ${trueR}`);
  ok(diffW === 0, '① ★★물 판정이 **한 셀도 안 다르다**', `다른 셀 ${diffW}/${nW}`);
  ok(diffR === 0, '① ★★바위 판정이 **한 셀도 안 다르다**', `다른 셀 ${diffR}/${nR}`);
  const st = C.stats();
  ok(st.hitW + st.hitR > 0, '① [상황] 적중이 실제로 났다(경계 띠가 같은 셀을 다시 묻는다)', `적중률 ${(st.hitRate * 100).toFixed(1)}%`);
}

console.log('\n② 두 번째 질문 = 첫 번째 질문 (메모가 값을 뒤집지 않는다)');
{
  const C = makeTileCache(TW, TH);
  let diff = 0, n = 0;
  for (let i = 0; i < 4000; i++) {
    const tx = (rnd() * TW) | 0, ty = (rnd() * TH) | 0;
    const a = C.water(tx, ty, () => terrain.isWaterCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16));
    const b = C.water(tx, ty, () => { throw new Error('적중이어야 하는데 다시 계산했다'); });
    const c = C.rock(tx, ty, () => terrain.isRockCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16));
    const d = C.rock(tx, ty, () => { throw new Error('적중이어야 하는데 다시 계산했다'); });
    n += 2; if (a !== b) diff++; if (c !== d) diff++;
  }
  ok(diff === 0, '② ★재질문이 같은 답이다(그리고 재계산을 **안 한다** — 아니면 위에서 던진다)', `${n}쌍`);
  const C2 = makeTileCache(8, 8);
  ok(C2.water(3, 3, () => false) === false && C2.water(3, 3, () => true) === false,
     '② ★★거짓도 기억한다(참만 기억하면 물 아닌 셀을 매번 다시 센다 — 실측 비용의 절반이 거기였다)');
}

console.log('\n③ 되돌림 — `TERRAIN_TILE_CACHE=0` 이면 배열조차 안 만든다');
{
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/process\.env\.TERRAIN_TILE_CACHE !== '0'/.test(Z),
     "③ ★★기본이 **켬**이고 되돌림이 `=0` 하나다(T324 · 손잡이 새로 안 만들었다)");
  ok(/const _TERR_CACHE = \(process\.env\.TERRAIN_TILE_CACHE !== '0' && !ZONE\.isOcean\)\s*\n\s*\? require/.test(Z),
     '③ 끄면 `require` 자체를 안 한다 — 8.5MB 를 안 잡는다(종전 경로 그대로)');
  ok(/if \(_TERR_CACHE\) return _TERR_CACHE\.water\(tx, ty, \(\) => _terrain\.isWaterCellLocal\(ZONE_ID, cellCx, cellCy\)\);/.test(Z)
     && /if \(_TERR_CACHE\) return _TERR_CACHE\.rock\(tx, ty, \(\) => _terrain\.isRockCellLocal\(ZONE_ID, tx \* 32 \+ 16, ty \* 32 \+ 16\)\);/.test(Z),
     '③ ★메모는 **양자화된 두 술어에만** 걸린다(terrain 안쪽에 걸면 chunk·fishing 의 임의 점 답이 달라진다)');
  ok(!/_TERR_CACHE/.test(fs.readFileSync(path.join(ROOT, 'server', 'terrain.js'), 'utf8')),
     '③ ★`terrain.js` 는 메모를 **모른다**(사본 0 · 원천은 그대로다)');
}

console.log('\n③-b 적재 순서 — 관측 창이 술어보다 **앞**에 있다(TDZ)');
{
  // ★★실측이 가르친 것 — `isTerrainBlockedLocal` 은 **모듈 적재 중에도** 불린다(`spawnMob` 초기 스폰).
  //   그 안에서 세는 `_walk` 를 파일 아래쪽에 `const` 로 두면 그 한 번이 TDZ 에 걸려 **존이 기동조차 못 한다**.
  //   `test-war-world ⓖ` 가 그걸 잡았다. 소스만 봤으면 못 봤을 자리라, 그 순서를 여기서 굳힌다.
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const iWalk = Z.indexOf('const _walk = {');
  const iTerr = Z.indexOf('function isWaterTileLocal(');
  const iBlock = Z.indexOf('function isTerrainBlockedLocal(');
  ok(iWalk > 0 && iTerr > 0 && iBlock > 0, '③-b [상황] 세 자리를 다 찾았다');
  ok(iWalk < iTerr && iWalk < iBlock,
     '③-b ★★`_walk` 선언이 지형 술어 **둘보다 앞**이다(적재 중 호출이 TDZ 에 안 걸린다)',
     `_walk@${iWalk} < water@${iTerr} · blocked@${iBlock}`);
  ok(Z.indexOf('let _npcCursor') < iTerr, '③-b 커서 선언도 같은 자리에 있다');
}

console.log('\n⑤ [T333] 미리 굽기 — 상자를 통째로 채워도 답이 같다');
{
  // ★굽는 것은 **언제 내느냐**만 바꾼다. 값을 바꾸면 이 절이 문다.
  const A = makeTileCache(TW, TH), B = makeTileCache(TW, TH);
  const cw = (tx, ty) => terrain.isWaterCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);
  const cr = (tx, ty) => terrain.isRockCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);
  // 상자 하나 — 실제 마을 생활권과 같은 크기대(반경 약 75셀)
  const bx = 900, by = 1500, R = 40;   // 이 상자엔 강이 지난다(아래 [상황] 이 그걸 센다)
  const baked = A.prebake(bx - R, by - R, bx + R, by + R, cw, cr);
  ok(baked === (2 * R + 1) * (2 * R + 1) * 2, '⑤ [상황] 상자 전부를 한 번씩 구웠다(물+바위 두 칸)', `${baked}칸`);
  // ⚠`water/rock` 의 계약은 **인수 없는** `compute()` 다(부르는 쪽이 좌표를 가둔다). `prebake` 만 (tx,ty) 를 넘긴다.
  //   첫 판에서 이걸 헷갈려 `cw` 를 그대로 넘겼다가 B 가 NaN 좌표를 물어 501칸이 갈렸다 — 자가 아니라 자를 든 손이 틀렸다.
  let diff = 0, n = 0, trueW = 0, trueR = 0;
  for (let ty = by - R; ty <= by + R; ty++) for (let tx = bx - R; tx <= bx + R; tx++) {
    const a1 = A.water(tx, ty, () => { throw new Error('미리 구웠는데 다시 계산했다'); });
    const b1 = B.water(tx, ty, () => cw(tx, ty));
    const a2 = A.rock(tx, ty, () => { throw new Error('미리 구웠는데 다시 계산했다'); });
    const b2 = B.rock(tx, ty, () => cr(tx, ty));
    n += 2; if (a1 !== b1) diff++; if (a2 !== b2) diff++;
    if (b1) trueW++; if (b2) trueR++;
  }
  ok(trueW + trueR > 100, '⑤ [상황] 그 상자에 물·바위가 **넉넉히** 있다(빈 들판이면 자명 통과다)', `물 ${trueW} · 바위 ${trueR}`);
  ok(diff === 0, '⑤ ★★미리 구운 판 ↔ 그때그때 구운 판이 **한 칸도 안 다르다**', `${n}칸 중 ${diff}`);
  ok(A.prebake(bx - R, by - R, bx + R, by + R, () => { throw new Error('두 번 굽는다'); }, () => { throw new Error('두 번 굽는다'); }) === 0,
     '⑤ ★이미 구운 칸은 **다시 안 굽는다**(두 번째 호출이 0칸)');
  ok(A.prebake(-50, -50, -10, -10, cw, cr) === 0, '⑤ 격자 밖 상자는 0칸(경계 가드)');
}

console.log('\n⑥ [T333] 정수 키 — 문자열 키와 **같은 집합**');
{
  // ★★T324 프로파일: `isWaterTileLocal` 자기시간 4.7%·`isDitchTileLocal` 1.7%·GC 3.6% 의 정체는
  //   판정이 아니라 **키**였다(질의마다 `` `${tx}_${ty}` `` 새 문자열). 비트/정수 색인으로 바꾼다.
  //   바꾼 것은 **색인**뿐이고 집합은 그대로다 — 그 동치를 여기서 **전수로** 건다.
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(!/WATER_TILES\.has\(/.test(Z), '⑥ ★★뜨거운 자리에 `WATER_TILES.has(문자열)` 이 **없다**');
  ok(/const _waterBit = \(tx, ty\) =>/.test(Z), '⑥ 비트 색인 술어가 하나다(`_waterBit`)');
  ok(/const _cellKey = \(cx, cy\) => cx \* _WT_H \+ cy;/.test(Z), '⑥ 다리·도랑 키도 정수 하나다(`_cellKey`)');
  ok(!/BRIDGE_CELLS\.has\([^)]*'_'/.test(Z) && !/DITCH_CELLS\.has\([^)]*'_'/.test(Z),
     '⑥ ★다리·도랑도 문자열 키를 안 쓴다');
  ok(/for \(const k of WATER_TILES\)/.test(Z), '⑥ ★비트 색인이 **그 Set 에서** 유도된다(두 원천 0 · 사본 0)');
  // 동치 — 같은 유도를 여기서 다시 해 보고 개수·구성원을 맞춘다(집합이 곧 답이다)
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const Zn = ZONES[ZONE_ID];
  const W = Math.ceil(Zn.zoneWidth / 32), H = Math.ceil(Zn.zoneHeight / 32);
  const chunk = require(path.join(ROOT, 'server', 'chunk'));
  const oceanRects = Object.values(ZONES).filter((z) => z.isOcean)
    .map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
  const findZoneAt = (x, y) => Object.entries(ZONES).map(([id, z]) => ({ id, ...z }))
    .find((z) => x >= z.worldOffsetX && x < z.worldOffsetX + z.zoneWidth && y >= z.worldOffsetY && y < z.worldOffsetY + z.zoneHeight) || null;
  const WT = chunk.generateCoastlineWaterTiles({ ...Zn, id: ZONE_ID }, 32, findZoneAt, oceanRects);
  const bits = new Uint8Array(((W * H) >> 3) + 1);
  let bad = 0;
  for (const k of WT) { const u = k.indexOf('_'); const tx = +k.slice(0, u), ty = +k.slice(u + 1);
    if (!(tx >= 0 && ty >= 0 && tx < W && ty < H)) { bad++; continue; }
    const b = ty * W + tx; bits[b >> 3] |= (1 << (b & 7)); }
  let pop = 0; for (let i = 0; i < bits.length; i++) { let v = bits[i]; while (v) { pop += v & 1; v >>= 1; } }
  ok(WT.size > 0, '⑥ [상황] 해안선 타일이 실제로 있다', `${WT.size}개`);
  ok(bad === 0, '⑥ 격자 밖 키가 하나도 없다(색인이 집합을 통째로 담는다)');
  ok(pop === WT.size, '⑥ ★★비트 색인의 켜진 비트 수 = 집합 크기(**전수 일치** · 빠짐도 덤도 없다)', `${pop} = ${WT.size}`);
  let miss = 0;
  for (const k of WT) { const u = k.indexOf('_'); const tx = +k.slice(0, u), ty = +k.slice(u + 1);
    const b = ty * W + tx; if (!((bits[b >> 3] >> (b & 7)) & 1)) miss++; }
  ok(miss === 0, '⑥ ★★집합의 **모든** 원소가 색인에 켜져 있다', `빠진 원소 ${miss}/${WT.size}`);
  ok((bits.length / 1048576) < 2, '⑥ 색인 값이 2MB 미만이다(타일당 1비트)', `${(bits.length / 1048576).toFixed(2)}MB`);
  // 자명 통과 금지 — 비트 하나를 끄면 위 둘이 문다
  const b0 = (() => { for (const k of WT) { const u = k.indexOf('_'); return (+k.slice(u + 1)) * W + (+k.slice(0, u)); } return 0; })();
  bits[b0 >> 3] &= ~(1 << (b0 & 7));
  let pop2 = 0; for (let i = 0; i < bits.length; i++) { let v = bits[i]; while (v) { pop2 += v & 1; v >>= 1; } }
  ok(pop2 === WT.size - 1, '⑥ ★비트 하나를 끄면 개수가 갈린다(자가 실제로 문다)');
}

console.log('\n⑦ [T333] 생활층 지형 어댑터가 메모를 지나간다');
{
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/if \(deps\.isRockTileLocal\) \{ try \{ return deps\.isRockTileLocal\(px\(cx\), px\(cy\)\); \}/.test(V),
     '⑦ ★★`isRock` 이 **존의 술어**를 부른다(메모 통과 — 옛 직통은 폴백으로만 남았다)');
  ok(/isRockTileLocal,\n/.test(Z) || /\n  isRockTileLocal,/.test(Z),
     '⑦ 존이 그 술어를 `SimVillages.init` 에 실제로 넘긴다');
  ok(Z.indexOf('r = Math.ceil((((v.r || 800) | 0) + 1600) / 32)') > 0,
     '⑦ ★마을 생활권 상자를 미리 굽는다 — 반경은 `anyViewerNear` 가 쓰는 그 수다(새 수 0)');
  // ★★기동을 막으면 안 된다 — 첫 판은 통째로 굽다가 `server.listen` 전에 **61초를 멎었다**(/health 사망).
  ok(/server\.listen\(PORT, \(\) => \{\n  _t333Prebake\(\);/.test(Z),
     '⑦ ★★굽기는 **기동 뒤**에 시작한다(`server.listen` 콜백) — 기동을 61초 막지 않는다');
  ok(/setTimeout\(step, 0\);\n  \};\n  setTimeout\(step, 0\);/.test(Z),
     '⑦ ★★**이벤트 루프에 자리를 내주며** 굽는다(한 덩어리 금지)');
  // ★상자 단위로 쪼개도 한 번이 1.2초라 틱 하나를 통째로 먹는다(실측 lag 18% · drop 252) ⇒ **한 줄씩**.
  ok(/_TERR_CACHE\.prebake\(b\.x0, b\.y, b\.x1, b\.y, cw, cr\)/.test(Z),
     '⑦ ★★한 번에 굽는 단위가 **상자의 가로 한 줄**이다(30Hz 틱 예산 안에 얹힌다)');
}

console.log('\n④ 자명 통과 금지 — 메모를 거짓말하게 비틀면 ①이 문다');
{
  // 참을 안 기억하는 판(= 늘 다시 계산)은 통과해야 하고, **답을 뒤집는 판**은 걸려야 한다
  const liar = (() => {
    const memo = new Uint8Array(TW * TH);
    return { water(tx, ty, compute) { const i = ty * TW + tx; if (memo[i] & 1) return (memo[i] & 2) === 0; /* ← 뒤집었다 */
             const v = compute(); memo[i] = 1 | (v ? 2 : 0); return v; } };
  })();
  let diff = 0, hit = 0;
  for (let i = 0; i < 3000; i++) {
    const tx = (rnd() * TW) | 0, ty = (rnd() * TH) | 0;
    const raw = terrain.isWaterCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);
    liar.water(tx, ty, () => raw);                       // 첫 질문 — 기억
    const again = liar.water(tx, ty, () => raw);         // 두 번째 — 뒤집힌 값이 나와야 한다
    hit++; if (again !== raw) diff++;
  }
  ok(diff > 0, '④ ★★답을 뒤집은 메모는 ①의 대조에 **걸린다**(자가 실제로 문다)', `${diff}/${hit} 셀이 갈렸다`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
