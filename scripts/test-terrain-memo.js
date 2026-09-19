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
