#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-move-soa.js — 걸음당 할당 0 이 **세계를 안 바꾼다** (T345 1층) ================
//
// ★왜 [T345 · 보고/T345_2026-09-22.md]
//   T340 이 걸음 하나를 세었다: `movePlayerStep` 호출자리 43 · **객체 리터럴 33** · `npcStep` 53/52.
//   그 할당의 정체를 T345 가 짚었다 — 가장 큰 둘은 **판정이 아니라 껍데기**였다:
//     ⓐ `isBlockedByWall` 의 `cellOf(x,y)` 두 번 → `{cx,cy}` 객체 **걸음당 10개**
//     ⓑ 타일 메모 호출의 `() => …` 클로저 → **걸음당 5.3개**
//   둘 다 답을 한 자도 안 바꾸고 없앨 수 있다. **그 "안 바꾼다"를 이 하네스가 전수로 건다.**
//
// ★이 카드엔 손잡이가 없다(재작성은 스위치가 아니다). 그래서 게이트는 **두 구현을 나란히 놓고
//   같은 입력에 같은 답이 나오는가**다 — 옛 꼴을 이 파일 안에 **그대로 복원해** 견준다
//   (제품엔 옛 꼴이 안 남는다 · 죽은 코드 0). 좌표·불린은 **바이트로** 견준다.
//
// 실행: node scripts/test-move-soa.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
// 바이트 비교 — 표시 자릿수로 견주면 1e-13 을 놓친다
const _dv = new DataView(new ArrayBuffer(16));
const sameF64 = (a, b) => { _dv.setFloat64(0, a); _dv.setFloat64(8, b); return _dv.getUint32(0) === _dv.getUint32(8) && _dv.getUint32(4) === _dv.getUint32(12); };
// 결정론 표본 — 주사위 0
let _s = 0x9e3779b9;
const rnd = () => { _s ^= _s << 13; _s >>>= 0; _s ^= _s >> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; };

console.log('\n=== 걸음당 할당 0 — 세계 무변 (T345 1층) ===');

const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const C = fs.readFileSync(path.join(ROOT, 'server', 'terrain-tilecache.js'), 'utf8');

console.log('\n① ⓐ 셀 판정 — 객체 둘 → 정수 넷 (같은 답)');
{
  const SZ = 32;
  // 옛 꼴 — 제품에서 지운 그 줄을 여기 **그대로** 복원한다(대조군)
  const cellOfOld = (x, y) => ({ cx: Math.floor(x / SZ), cy: Math.floor(y / SZ) });
  const sameCellOld = (ox, oy, nx, ny) => { const a = cellOfOld(ox, oy), b = cellOfOld(nx, ny); return a.cx === b.cx && a.cy === b.cy; };
  // 새 꼴 — 제품이 지금 쓰는 그 식
  const sameCellNew = (ox, oy, nx, ny) => (Math.floor(ox / SZ) === Math.floor(nx / SZ)) && (Math.floor(oy / SZ) === Math.floor(ny / SZ));
  let n = 0, diff = 0, trueN = 0;
  // 셀 경계를 **일부러 자주 밟는** 표본: 경계 ±0.5px · 음수 좌표 · 큰 좌표 · 정확히 경계 위
  for (let i = 0; i < 60000; i++) {
    const ox = (rnd() * 2 - 0.5) * 70016, oy = (rnd() * 2 - 0.5) * 130016;
    const k = i % 4;
    const d = k === 0 ? (rnd() - 0.5) * 4 : k === 1 ? (rnd() - 0.5) * 64 : k === 2 ? 0 : (rnd() - 0.5) * 0.001;
    const nx = k === 2 ? Math.floor(ox / SZ) * SZ : ox + d;
    const ny = oy + (k === 2 ? 0 : d);
    const a = sameCellOld(ox, oy, nx, ny), b = sameCellNew(ox, oy, nx, ny);
    n++; if (a !== b) diff++; if (a) trueN++;
  }
  ok(n === 60000, '① [상황] 표본 6만(경계 ±0.5px · 정확히 경계 위 · 음수 · 큰 좌표)', `${n}쌍`);
  ok(trueN > 1000 && trueN < n - 1000, '① [상황] 같은 셀/다른 셀이 **둘 다** 넉넉히 나왔다(한쪽만이면 자명 통과다)', `같은 셀 ${trueN}`);
  ok(diff === 0, '① ★★옛 꼴 ↔ 새 꼴이 **한 쌍도 안 다르다**', `다른 답 ${diff}/${n}`);
  // 자명 통과 금지 — 식을 한 자만 비틀면 갈린다
  const sameCellBad = (ox, oy, nx, ny) => (Math.round(ox / SZ) === Math.round(nx / SZ)) && (Math.floor(oy / SZ) === Math.floor(ny / SZ));
  let bad = 0;
  for (let i = 0; i < 20000; i++) {
    const ox = rnd() * 70016, oy = rnd() * 130016, nx = ox + (rnd() - 0.5) * 64, ny = oy + (rnd() - 0.5) * 64;
    if (sameCellOld(ox, oy, nx, ny) !== sameCellBad(ox, oy, nx, ny)) bad++;
  }
  ok(bad > 0, '① ★자명 통과 금지 — `floor` 를 `round` 로 비틀면 자가 **문다**', `갈린 쌍 ${bad}/20000`);
  ok(/const _ocx = Math\.floor\(oldX \/ BUILDING_SIZE\), _ocy = Math\.floor\(oldY \/ BUILDING_SIZE\);/.test(Z)
     && /if \(_ocx === _ncx && _ocy === _ncy\) return false;/.test(Z),
     '① ★제품이 그 정수 식을 쓴다(조기 반환 앞에 객체가 없다)');
  ok(/const oc = \{ cx: _ocx, cy: _ocy \}, nc = \{ cx: _ncx, cy: _ncy \};/.test(Z),
     '① ★셀을 **넘는** 걸음에서만 객체를 만든다(아래 경로가 그 꼴을 쓴다 — 사본 0)');
}

console.log('\n② ⓑ 타일 메모 — 클로저 → 인수 (같은 답 · 같은 적중)');
{
  const { makeTileCache } = require(path.join(ROOT, 'server', 'terrain-tilecache.js'));
  const terrain = require(path.join(ROOT, 'server', 'terrain.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
  const ZN = ZONES.hanbando;
  const TW = Math.ceil(ZN.zoneWidth / 32), TH = Math.ceil(ZN.zoneHeight / 32);
  const A = makeTileCache(TW, TH), B = makeTileCache(TW, TH);
  const computeW = (tx, ty) => terrain.isWaterCellLocal('hanbando', tx * 32 + 16, ty * 32 + 16);
  const computeR = (tx, ty) => terrain.isRockCellLocal('hanbando', tx * 32 + 16, ty * 32 + 16);
  let n = 0, diff = 0, tw = 0, tr = 0;
  for (let i = 0; i < 40000; i++) {
    const tx = (rnd() * TW) | 0, ty = (rnd() * TH) | 0;
    const a1 = A.water(tx, ty, () => terrain.isWaterCellLocal('hanbando', tx * 32 + 16, ty * 32 + 16));   // 옛 꼴(클로저)
    const b1 = B.water(tx, ty, computeW);                                                                 // 새 꼴(인수)
    const a2 = A.rock(tx, ty, () => terrain.isRockCellLocal('hanbando', tx * 32 + 16, ty * 32 + 16));
    const b2 = B.rock(tx, ty, computeR);
    n += 2; if (a1 !== b1) diff++; if (a2 !== b2) diff++;
    if (b1) tw++; if (b2) tr++;
  }
  ok(tw > 0 && tr > 0, '② [상황] 표본에 물도 바위도 들어 있다', `물 ${tw} · 바위 ${tr}`);
  ok(diff === 0, '② ★★클로저 판 ↔ 인수 판이 **한 칸도 안 다르다**', `다른 답 ${diff}/${n}`);
  const sa = A.stats(), sb = B.stats();
  ok(sa.missW === sb.missW && sa.missR === sb.missR && sa.hitW === sb.hitW && sa.hitR === sb.hitR,
     '② ★적중·실패 수까지 같다(메모가 같은 순서로 같은 칸을 채운다)', `miss ${sa.missW}/${sa.missR} = ${sb.missW}/${sb.missR}`);
  ok(/const v = compute\(tx, ty\);/.test(C) && (C.match(/const v = compute\(tx, ty\);/g) || []).length === 2,
     '② ★메모가 `compute(tx, ty)` 로 부른다(물·바위 둘 다)');
  ok(/const _computeWaterCell = \(tx, ty\) =>/.test(Z) && /const _computeRockCell = \(tx, ty\) =>/.test(Z),
     '② ★계산 함수는 **모듈 수준 하나**다 — 질의마다 새로 안 만든다');
  ok(!/_TERR_CACHE\.(water|rock)\([^;]*\(\) =>/.test(Z), '② ★★제품의 메모 호출에 **화살표 함수가 없다**(걸음당 클로저 0)');
}

console.log('\n③ 남은 할당 — 걸음 하나의 계수(T340 자를 그대로 다시 댄다)');
{
  const codeOnly = require('./code-only.js');   // ★주석 제거기 **정본**(사본 0 · `test-harness-lint ⑦a` 가 이 꼴을 건다)
  const body = (name) => {
    const i = Z.indexOf('function ' + name + '(');
    if (i < 0) return '';
    let d = 0, j = Z.indexOf('{', i);
    for (let k = j; k < Z.length; k++) { if (Z[k] === '{') d++; else if (Z[k] === '}') { d--; if (!d) return Z.slice(i, k + 1); } }
    return '';
  };
  const mv = codeOnly(body('movePlayerStep'));
  ok(mv.length > 1000, '③ [상황] 이동 문 본문을 통째로 잡았다', `${mv.length}자`);
  ok(!/cellOf\(/.test(mv), '③ ★이동 문 본문에 `cellOf(` 호출이 없다');
  const lits = (mv.match(/\{\s*[A-Za-z_$"']/g) || []).length;
  console.log(`    ↳ 이동 문 **본문**의 객체 리터럴 자리 ${lits}개 (T340 계수 33 — 이 카드가 고친 곳은 본문이 아니라 **부르는 곳**이다)`);
  // ★이 카드가 없앤 할당은 이동 문 본문이 아니라 **그 아래 두 술어**에 있었다. 자를 거기에 댄다.
  const wall = codeOnly(body('isBlockedByWall'));
  const head = wall.slice(0, wall.indexOf('return false;') + 13);
  ok(head.length > 100, '③ [상황] 벽 술어의 **조기 반환까지**를 잡았다(열에 아홉이 여기서 끝난다)', `${head.length}자`);
  ok(!/\{\s*cx:/.test(head) && !/cellOf\(/.test(head),
     '③ ★★열에 아홉이 밟는 그 길에 **객체가 하나도 없다**(종전엔 둘이었다 — 걸음당 10개)');
  const wt = codeOnly(body('isWaterTileLocal')), rt = codeOnly(body('isRockTileLocal'));
  ok(!/\(\) =>/.test(wt) && !/\(\) =>/.test(rt),
     '③ ★★지형 두 술어에 **인수 없는 화살표가 없다**(종전엔 질의마다 하나 — 걸음당 5.3개)');
  // ⓒ 나무·바위 콜라이더 — `queryCircle` 이 배열을 **둘** 만들던 자리(걸음당 최대 5회 = 배열 10개)
  const tb = codeOnly(body('treeBlockerAt'));
  ok(!/queryCircle\(/.test(tb), '③ ★★나무 콜라이더가 `queryCircle` 을 **안 부른다**(배열 둘이 사라졌다)');
  ok(/qtResources\.queryRect\(x - _R, y - _R, _R \* 2, _R \* 2, _treeScratch\);/.test(tb) && /const _treeScratch = \[\];/.test(Z),
     '③ ★버퍼 **하나를 재사용**한다(모듈 수준 · 재진입 없음)');
  ok(/if \(_dx \* _dx \+ _dy \* _dy > _R2\) continue;/.test(tb),
     '③ ★원 거리 필터를 **같은 식으로** 여기서 건다(순회 순서 같음 ⇒ 첫 적중도 같다)');
  ok(/Math\.hypot/.test(tb), '③ ★`Math.hypot` 은 **그대로 둥다** — `sqrt` 로 바꾸면 마지막 비트가 달라질 수 있다');
  // ⓓ 청크 활성 판정 — 주민마다 틱마다 두 번(결정 문 · 이동 문)
  const pa = codeOnly(body('isPositionActive'));
  ok(!/chunkXY\(/.test(pa), '③ ★★청크 활성 판정이 `{cx,cy}` 객체를 **안 만든다**');
  ok(/activeChunkKeys\.has\(chunkManager\.keyOf\(/.test(pa),
     '③ ★키는 **그 Set 의 꼴 그대로**다(원천 둘 금지 — 정수 키는 다음 카드)');
  ok(!/Math\.random/.test(codeOnly(body('movePlayerStep'))), '③ 이동 문에 `Math.random` 이 없다(주사위 0)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
