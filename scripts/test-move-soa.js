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

// ★[T350] 아래 절 넷(③④⑤⑥)이 같이 쓴다 — 모듈 자리로 올린다(사본 0).
const codeOnly = require('./code-only.js');
const Z5 = fs.readFileSync(__filename, 'utf8');   // ★[T385 ⓪] 이 하네스 자기 글자(⑤ 대조군 소스 검사)   // ★주석 제거기 **정본**(`test-harness-lint ⑦a` 가 이 꼴을 건다)
const body = (name) => {
  const i = Z.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, j = Z.indexOf('{', i);
  for (let k = j; k < Z.length; k++) { if (Z[k] === '{') d++; else if (Z[k] === '}') { d--; if (!d) return Z.slice(i, k + 1); } }
  return '';
};

console.log('\n③ 남은 할당 — 걸음 하나의 계수(T340 자를 그대로 다시 댄다)');
{
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
  ok(/Math\.hypot/.test(tb), '③ ★`Math.hypot` 은 **그대로 둔다** — `sqrt` 로 바꾸면 마지막 비트가 달라질 수 있다');
  // ⓓ 청크 활성 판정 — 주민마다 틱마다 두 번(결정 문 · 이동 문)
  const pa = codeOnly(body('isPositionActive'));
  ok(!/chunkXY\(/.test(pa), '③ ★★청크 활성 판정이 `{cx,cy}` 객체를 **안 만든다**');
  ok(/activeChunkKeys\.has\(chunkManager\.keyOf\(/.test(pa),
     '③ ★키는 **그 Set 의 꼴 그대로**다(원천 둘 금지 — 정수 키는 다음 카드)');
  ok(!/Math\.random/.test(codeOnly(body('movePlayerStep'))), '③ 이동 문에 `Math.random` 이 없다(주사위 0)');
}


// =============================================================================
// ④ 주사위 0 — 씨 해시 정본과 그 자리 [T350]
// =============================================================================
console.log('\n④ 주사위 0 — `decideNpcBehavior` 의 열다섯 굴림 [T350]');
{
  const S = require(path.join(ROOT, 'server', 'seed-rand.js'));
  const dnb = codeOnly(body('decideNpcBehavior'));
  ok(!/Math\.random/.test(dnb), '④ ★★주민 결정 함수에 `Math.random` 이 **하나도 없다**(T340 계수 15 → 0)');
  ok((dnb.match(/_dn\(\)/g) || []).length === 15, '④ ★그 열다섯이 **같은 수만큼** 씨 흐름으로 갔다',
     `_dn() ${(dnb.match(/_dn\(\)/g) || []).length}개`);
  ok(/_diceNpc\.seed\(_SEED\.seedOf\(_shOf\(npc\), Math\.floor\(npc\.x \/ BUILDING_SIZE\), Math\.floor\(npc\.y \/ BUILDING_SIZE\), zoneGameDay\(\), _tick\.n\)\)/.test(dnb),
     '④ ★씨는 카드가 정한 다섯이다 — (신원 · 셀 x · 셀 y · 게임일 · 틱)');
  // 정본 하나 — 옮겨 온 두 함수가 **바이트 동일**한가(사본 0 의 증명은 "같은 수가 나온다" 다)
  const t340 = (seed) => { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x ^ (x >>> 15), 0x85ebca6b) + 0x9e3779b9) >>> 0; return ((x >>> 8) / 16777216) || 1e-9; }; };
  let dR = 0;
  for (const sd of [0, 1, 7, 12345, 0xdeadbeef, 4294967295]) { const a = t340(sd), c = S.seedRand(sd); for (let i = 0; i < 4000; i++) if (!sameF64(a(), c())) dR++; }
  ok(dR === 0, '④ ★★`seed-rand.seedRand` 가 T340 `_t340Rng` 과 **바이트 동일**(옮겼을 뿐 — 낚시가 안 바뀐다)', `다른 수 ${dR}/24000`);
  const ph = (pid) => { let h = 7; const z = String(pid); for (let i = 0; i < z.length; i++) h = (h * 31 + z.charCodeAt(i)) >>> 0; return h; };
  let dP = 0;
  for (const q of ['npc_hanbando_1_ab', 'x', '', '아주긴한글이름12345', 'simvil_7']) if (ph(q) !== S.pidHash(q)) dP++;
  ok(dP === 0, '④ ★`seed-rand.pidHash` 가 `villages.js:_pidHash` 와 동일(벌수 줄 세우기가 안 바뀐다)');
  const VJ = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
  ok(!/function _t340Rng\(/.test(VJ) && !/function _pidHash\(/.test(VJ) && /require\('\.\/seed-rand'\)/.test(VJ),
     '④ ★사본 0 — `villages.js` 에 그 두 정의가 **없고** 정본을 require 한다');
  ok(!/Math\.random/.test(codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'seed-rand.js'), 'utf8'))),
     '④ 정본 자신에 `Math.random` 0');
}

// =============================================================================
// ⑤ 분포 무변 — 굴림만 결정적이다 [T350]
// =============================================================================
// ★카드: "결정 분포는 그대로(같은 확률 · 굴림만 결정적) — 자: 10만 굴림 히스토그램이 `Math.random` 판과
//   **T252 자로 못 가름**". T252 규약 = 3시드 부호 3/3 + |평균| > 폭 → 가름. 여기선 **안 갈려야** 통과다.
console.log('\n⑤ 분포 무변 — 10만 결정을 T252 자로 견준다 [T350]');
{
  const S = require(path.join(ROOT, 'server', 'seed-rand.js'));
  const BINS = 20, DEC = 100000, PER = 15, N = DEC * PER;    // 결정 하나가 굴리는 수 = 15(T340 계수)
  const CRIT = 43.82;                                        // χ² df=19 · p=0.001(표준표 — 지어낸 수 0)
  const chi2 = (h, n) => { const e = n / h.length; let c = 0; for (const v of h) c += (v - e) * (v - e) / e; return c; };
  // 씨는 **실제 쓰임 그대로** 쓸어 본다 — 주민 10만 명분의 (신원 · 셀 · 게임일 · 틱)
  const sweep = (salt) => {
    const all = new Array(BINS).fill(0), first = new Array(BINS).fill(0); let sum = 0;
    const st = S.makeStream();
    for (let i = 0; i < DEC; i++) {
      const pidH = S.pidHash('npc_hanbando_' + ((i * 7919 + salt) % 65536) + '_zz');
      st.seed(S.seedOf(pidH, (i * 31) % 2189, (i * 17) % 4063, (i / 1440) | 0, i % 46));
      for (let j = 0; j < PER; j++) { const v = st.next(); sum += v; const k = Math.min(BINS - 1, (v * BINS) | 0); all[k]++; if (j === 0) first[k]++; }
    }
    return { all, first, mean: sum / N };
  };
  // ★★[T385 ⓪ 2026-09-26 · 자의 결함 — 대조군에 씨를 박는다] T381 이 잡음 바닥을 세웠지만 대조군은 여전히
  //   `Math.random()` 이었다 ⇒ 판마다 **다른 수**를 냈다(T375 §3 실측 4판 중 1판 · T381 실측 10판 중 1판 붉음).
  //   하네스가 판마다 다른 답을 내면 그것은 자가 아니다. ⇒ 대조군을 **씨 박은 한 줄기 흐름**(`seed-rand.makeStream`
  //   · 씨 한 번 · 15×10만 연속)으로. 비교의 뜻은 그대로다 — 씨 판은 **결정마다 다시 씨를 뿌리고**(해시 → 씨),
  //   대조군은 **한 번 뿌린 긴 흐름**이다. 재는 것은 "결정마다 해시로 씨를 뿌려도 분포가 안 치우친다" 하나.
  //   ★대조군마다 씨가 다르다(`_mSeed` 가 부를 때마다 하나씩) — 같은 씨면 A−B 가 정확히 0 이라 잡음 바닥이 0 이 된다.
  let _mSeed = 0x5EED0;
  const mrun = (seed) => { const all = new Array(BINS).fill(0), first = new Array(BINS).fill(0); let sum = 0;
    const st = S.makeStream(); st.seed(seed != null ? seed : ++_mSeed);
    for (let i = 0; i < DEC; i++) for (let j = 0; j < PER; j++) { const v = st.next(); sum += v; const k = Math.min(BINS - 1, (v * BINS) | 0); all[k]++; if (j === 0) first[k]++; }
    return { all, first, mean: sum / N }; };
  // ⓐ **절대 균등성** — 두 판 각각이 그 자체로 균등한가(이게 1차 관문이다)
  const D = [];
  for (let s2 = 0; s2 < 3; s2++) {
    const A = sweep(s2 * 1013 + 1), B = mrun();
    const ca = chi2(A.all, N), cb = chi2(B.all, N), fa = chi2(A.first, DEC), fb = chi2(B.first, DEC);
    ok(ca < CRIT && cb < CRIT, `⑤ [시드 ${s2}] 150만 굴림이 **둘 다** 균등(씨 χ² ${ca.toFixed(1)} · 대조군 χ² ${cb.toFixed(1)} < ${CRIT})`);
    ok(fa < CRIT, `⑤ [시드 ${s2}] ★**첫 굴림만** 10만 개도 균등(χ² ${fa.toFixed(1)}) — 씨가 바로 낳는 수가 안 치우친다`);
    // 칸별 비율 차 — 히스토그램을 **눈으로 보는** 그 수
    let mx = 0; for (let k = 0; k < BINS; k++) mx = Math.max(mx, Math.abs(A.all[k] - B.all[k]) / N);
    D.push({ dMean: A.mean - B.mean, maxBin: mx });
  }
  // ⓑ **T252 자** — 통계량은 **평균 차**로 잡는다.
  //   ⚠χ² 를 T252 에 넣으면 안 된다: 한 표본의 χ² 는 표준편차가 √(2·19)=6.2 라 3표본으로는 **노이즈가 규약을 켠다**
  //     (실측: `Math.random` 자신의 세 판이 16.9 · 26.1 · 34.3). 평균 차는 표준편차가 3.3e-4 로 작아 자가 선다.
  const t252 = (arr) => { const sg = arr.map((x) => Math.sign(x)); const same = sg.every((x) => x === sg[0] && x !== 0);
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length, band = Math.max(...arr) - Math.min(...arr);
    return { same, mean, band, split: same && Math.abs(mean) > band }; };
  const tM = t252(D.map((x) => x.dMean));
  // ★★[T381 2026-09-23 · 자가 흔들렸다] 이 절이 10판에 1판 붉었다(HEAD 에서 실측). 결함은 제품이 아니라
  //   **자**에 있었다: 대조군이 `Math.random` 이라 통계량에 **대조군 자신의 잡음**이 실린다(150만 굴림의
  //   평균은 표준편차 2.4e-4 로 흔들린다). T252 자는 "부호 3/3 + |평균| > 폭"인데, 셋뿐이라 그 잡음이
  //   규약을 켜는 판이 생긴다. ⇒ **잡음을 지어내지 않고 같은 꼴로 잰다** — 주사위끼리 세 쌍(새 수 0).
  //   씨-대-주사위가 **주사위-대-주사위의 잡음 바닥**을 안 넘으면, 이 자로는 못 가르는 것이다.
  const Dc = []; for (let s2 = 0; s2 < 3; s2++) { const A = mrun(), B = mrun(); Dc.push(A.mean - B.mean); }
  const tC = t252(Dc);
  const floor = Math.max(tC.band, ...Dc.map(Math.abs));
  ok(!tM.split || Math.abs(tM.mean) <= floor,
     '⑤ ★★**T252 자로 못 가른다** — 평균 차가 **대조군 자신의 잡음 바닥**을 안 넘는다',
     `씨-대조군 부호일치 ${tM.same} · 평균 ${tM.mean.toExponential(2)} · 폭 ${tM.band.toExponential(2)} · 대조군-대조군 잡음 바닥 ${floor.toExponential(2)}`);
  const worst = Math.max(...D.map((x) => x.maxBin));
  ok(worst < 0.002, '⑤ ★히스토그램 **칸별 비율 차**가 0.2% 미만(20칸 · 각 칸 기대 5%)', `최대 ${(worst * 100).toFixed(3)}%`);
  // ★자명 통과 금지 — **진짜 치우친** 흐름을 같은 자에 넣으면 갈린다(10% 좁힌 판)
  const bad = [];
  for (let s2 = 0; s2 < 3; s2++) {
    const st = S.makeStream(); st.seed(s2 + 1); let sum = 0;
    for (let i = 0; i < N; i++) sum += st.next() * 0.9;
    bad.push(sum / N - mrun().mean);
  }
  const tB = t252(bad);
  ok(tB.split && Math.abs(tB.mean) > floor, '★⑤ 자명 통과 금지 — 일부러 10% 좁힌 흐름은 **같은 자가 문다**(잡음 바닥도 훌쩍 넘는다)',
     `부호일치 ${tB.same} · 평균 ${tB.mean.toExponential(2)} · 폭 ${tB.band.toExponential(2)} · 잡음 바닥의 ${(Math.abs(tB.mean) / floor).toFixed(0)}배`);
  // ★[T385 ⓪] 자가 **판마다 같은 답**을 내는가 — 그리고 옛 꼴(씨 없는 대조군)이면 그걸 **문다**
  {
    const m1 = mrun(0xABCDE), m2 = mrun(0xABCDE);
    ok(sameF64(m1.mean, m2.mean) && m1.all.join() === m2.all.join(),
       '⑤ ⓪ ★★대조군이 **판마다 같다**(씨 박은 흐름 · 150만 굴림 평균·히스토그램 비트 동일)', `평균 ${m1.mean}`);
    const oldCtl = () => { let sum = 0; const R = Math['ran' + 'dom']; for (let i = 0; i < N; i++) sum += R(); return sum / N; };
    const o1 = oldCtl(), o2 = oldCtl();
    ok(!sameF64(o1, o2), '★⑤ ⓪ 반례 — 옛 꼴(씨 없는 `Math.random` 대조군)은 두 번 돌리면 **다른 수**를 낸다(이 자가 문 결함의 모양)',
       `${o1.toExponential(6)} ≠ ${o2.toExponential(6)}`);
    const _mi = Z5.indexOf('const mrun = (seed) =>'), _mj = _mi < 0 ? -1 : Z5.indexOf('mean: sum / N }; };', _mi);
    const mdef = (_mi < 0 || _mj < 0) ? '' : Z5.slice(_mi, _mj);   // 대조군 정의 한 덩이(자기 글자)
    ok(mdef.length > 100 && !/Math\.random/.test(mdef), '⑤ ⓪ 소스 — 대조군 정의에 `Math.random` 이 **없다**', `${mdef.length}자`);
  }
  console.log(`    [표] 분포 — 칸별 최대 차 ${(worst * 100).toFixed(3)}% · 평균 차 ${tM.mean.toExponential(2)}(폭 ${tM.band.toExponential(2)})`);
}

// =============================================================================
// ⑥ ★게이트 — 같은 씨 · 51마을 7게임일 · 주민 전수 좌표 틱마다 바이트 동일 [T350]
// =============================================================================
// ★T345 가 못 건 게이트다. 못 건 이유가 이 카드가 없앤 그것이다 — `decideNpcBehavior` 의 `Math.random` 15.
//
// ★무엇을 거나 · 무엇을 안 거나(정직하게 적는다):
//   거는 것   — **결정이 좌표에 넣던 비결정성**. 제품의 `decideNpcBehavior` **그 글자**를 소스에서 떠다
//               두 판 돌려 주민 전수 좌표를 틱마다 바이트로 견준다.
//   안 거는 것 — 충돌·벽·지형·길찾기. 그건 술어라 T345 ①②③ 이 **전수 대조**로 이미 걸었다.
//               여기 적분기는 고정 스텝(`MOVE_SPEED/TICK_HZ`) 한 줄이고, **자이지 제품이 아니다**.
//   ⚠두 **프로세스**로는 못 건다 — 틱 루프가 `Date.now()` 를 읽어 두 존이 같은 게임일에 같은 틱 수를
//     안 돈다. 시계를 손잡이로 만들면 걸 수 있지만 카드가 손잡이 0 이다(보고 §3-ⓒ · 회부).
console.log('\n⑥ ★게이트 — 같은 씨 · 51마을 7게임일 · 좌표 바이트 동일 [T350]');
{
  const S = require(path.join(ROOT, 'server', 'seed-rand.js'));
  const src = body('decideNpcBehavior');
  ok(src.length > 1000, '⑥ [전제] 제품에서 결정 함수 **그 글자**를 떴다(사본 0 — 하네스가 다시 안 쓴다)', `${src.length}자`);
  const _t394Src = body('_t394OpenTarget');
  let _t394Moves = 0;
  const _t394River = (x, y) => { const c = Math.floor(x / 32); return ((c % 7) + 7) % 7 >= 5; };   // 7칸마다 2칸 물(결정론)
  const _t394Raw = new Function('BUILDING_SIZE', 'isTerrainBlockedLocal', _t394Src + '\nreturn _t394OpenTarget;')(32, _t394River);
  const _t394Fn = (npc, ax, ay) => { const r = _t394Raw(npc, ax, ay); if (r) _t394Moves++; return r; };

  const VILLAGES = 51, PER_VIL = 8, NPCS = VILLAGES * PER_VIL;   // 408명
  const TICK_HZ = 30, MOVE = 64, TPD = 600;                       // 자의 하루 = 600틱(7일 = 4,200틱)
  const DAYS = 7, TICKS = TPD * DAYS;
  const BUILDING_SIZE = 32, NPC_FLEE_RANGE = 260;

  function run(pidSalt) {
    const _tick = { n: 0 };
    let _day = 0;
    const _diceNpc = S.makeStream(), _dn = _diceNpc.next;
    const _shOf = (o) => (o._sh !== undefined ? o._sh : (o._sh = S.pidHash(o.playerId || o.pid || o.id || '')));
    const env = {
      BUILDING_SIZE, NPC_FLEE_RANGE, _SEED: S, _diceNpc, _dn, _shOf, _tick,
      zoneGameDay: () => _day,
      decideCanadiaBehavior: () => {},
      qtMobs: null, mobs: new Map(), qtBuildings: null, qtResources: null,
      resources: new Map(), claims: new Map(),
      Crops: { isReady: () => false },
      SimVillages: { npcLifeTick: null },
      // ★[T394 ②] ⑤ 배회의 막힌 목표 되짚기도 **제품 기본(켬)** 그대로 싣는다 — 제품 글자를 떠서(사본 0),
      //   결정론 모의 지형(세로 줄 강 — 7칸마다 2칸)을 준다. 이 게이트는 그 되짚기까지 **두 판 비트 동일**을 건다.
      T394_WORK_TERRAIN: true,
      _t394OpenTarget: _t394Fn,
    };
    const keys = Object.keys(env);
    const fn = new Function(...keys, src + '\nreturn decideNpcBehavior;')(...keys.map((k) => env[k]));
    // 주민 — 마을 51곳 × 8명. 초기 상태는 **결정적**으로 깐다(rnd() 는 이 파일 머리의 xorshift).
    const st = S.makeStream(); st.seed(0x5eed1);
    const npcs = [];
    for (let v = 0; v < VILLAGES; v++) {
      const vx = 4000 + (v % 8) * 7000, vy = 4000 + ((v / 8) | 0) * 14000;
      for (let k = 0; k < PER_VIL; k++) {
        const job = ['farmer', 'fisher', 'hunter', 'smith'][k % 4];
        const n = {
          playerId: `npc_g_${v}_${k}_${pidSalt}`, x: vx + (st.next() - 0.5) * 400, y: vy + (st.next() - 0.5) * 400,
          npcHomeX: vx, npcHomeY: vy, npcWorkX: vx + (st.next() - 0.5) * 900, npcWorkY: vy + (st.next() - 0.5) * 900,
          npcJob: job, nextDecisionAt: 0, behavior: 'wander', targetX: vx, targetY: vy,
          inventory: { seed_berry: k % 3 === 0 ? 2 : 0 }, hp: 100, maxHp: 100,
          myClaim: k % 4 === 1 ? { x: vx - 300, y: vy - 300, w: 600, h: 600 } : null,
          canadiaVillage: false, simVillageId: null,
        };
        npcs.push(n);
      }
    }
    // 두 판을 같은 시계로 돌린다 — `now` 는 틱에서 난다(벽시계 0)
    const dtm = 1 / TICK_HZ, TICK_MS = 1000 / TICK_HZ;
    const dig = new Uint32Array(TICKS);
    const dv = new DataView(new ArrayBuffer(8));
    let decided = 0;
    for (let t = 0; t < TICKS; t++) {
      _tick.n = t; _day = (t / TPD) | 0;
      const now = t * TICK_MS;
      let h = 2166136261;
      for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        const before = n.nextDecisionAt;
        fn(n, now);
        if (n.nextDecisionAt !== before) decided++;
        // ── 자의 적분기(고정 스텝 한 줄 — 제품의 충돌은 여기 없다) ──
        const dx = n.targetX - n.x, dy = n.targetY - n.y, d = Math.hypot(dx, dy);
        if (d > 2) { n.x += (dx / d) * MOVE * dtm; n.y += (dy / d) * MOVE * dtm; }
        // 좌표를 **바이트로** 접는다(표시 자릿수로 접으면 1e-13 을 놓친다)
        dv.setFloat64(0, n.x); h = (Math.imul(h ^ dv.getUint32(0), 16777619) ^ dv.getUint32(4)) >>> 0;
        dv.setFloat64(0, n.y); h = (Math.imul(h ^ dv.getUint32(0), 16777619) ^ dv.getUint32(4)) >>> 0;
      }
      dig[t] = h;
    }
    return { dig, npcs, decided };
  }

  const A = run('a'), B = run('a');
  ok(A.decided > NPCS * 100, '⑥ [상황] 두 판이 실제로 **결정을 많이 했다** — 주민마다 100번 넘게(자명 통과 금지 — 0 이면 안 움직인 것)',
     `결정 ${A.decided.toLocaleString()}회 · 주민 ${NPCS} · 틱 ${TICKS}`);
  let firstDiff = -1;
  for (let t = 0; t < TICKS; t++) if (A.dig[t] !== B.dig[t]) { firstDiff = t; break; }
  ok(firstDiff < 0, '⑥ ★★★같은 씨 · 51마을 7게임일 — **주민 전수 좌표가 틱마다 바이트 동일**',
     firstDiff < 0 ? `틱 ${TICKS} × 주민 ${NPCS} = ${(TICKS * NPCS).toLocaleString()} 자리 전부 같다` : `첫 다름 틱 ${firstDiff}`);
  // 마지막 틱 좌표를 **바이트로** 한 번 더(요약 해시가 우연히 같을 가능성 0 으로)
  let coordDiff = 0;
  for (let i = 0; i < A.npcs.length; i++) { if (!sameF64(A.npcs[i].x, B.npcs[i].x)) coordDiff++; if (!sameF64(A.npcs[i].y, B.npcs[i].y)) coordDiff++; }
  ok(coordDiff === 0, '⑥ ★끝 자리 좌표도 **바이트 동일**(요약 해시 말고 수 자체로)', `다른 좌표 ${coordDiff}/${NPCS * 2}`);
  // ★자명 통과 금지 — **씨를 바꾸면 달라진다**(신원 한 자만 바꾼다 · 세계는 그대로)
  const C = run('b');
  let sameCnt = 0;
  for (let t = 0; t < TICKS; t++) if (A.dig[t] === C.dig[t]) sameCnt++;
  ok(sameCnt < TICKS * 0.02, '★⑥ 자명 통과 금지 — **씨를 바꾸면 세계가 달라진다**(신원 한 자만 바꿔도)',
     `같은 틱 ${sameCnt}/${TICKS}`);
  ok(_t394Moves > 100, '⑥ [상황] ★[T394 ②] 되짚기가 이 판에서 **실제로 섰다**(모의 강 위 목표를 뭍으로 옮겼다 — 0 이면 안 탄 것)', `${_t394Moves.toLocaleString()}회(세 판 합)`);
  console.log(`    [표] 게이트 — 마을 ${VILLAGES} · 주민 ${NPCS} · 게임일 ${DAYS}(${TICKS}틱) · 결정 ${A.decided.toLocaleString()}회 · 다른 자리 0 · T394 되짚기 ${_t394Moves.toLocaleString()}회`);
  console.log('    접점: decideNpcBehavior · seed-rand.js · seedOf · _tick.n · zoneGameDay');
}


// =============================================================================
// ⑦ T356_SOA — 지형 **셀당 막힘 비트**가 세계를 안 바꾼다 [T356 ②]
// =============================================================================
// ★T356 ① 이 해부해 보니 `isTerrainBlockedLocal` 이 **걸음당 6.2회** 불리고, 한 번이 술어 넷
//   (바위·환호·물·다리)과 `Math.floor` 여덟로 갈라진다. 답은 전부 `(tx,ty)` 의 순수 함수다.
//   ⇒ 셀당 두 비트(계산됨·값)로 굽는다. **정본은 술어 넷이고 비트는 유도다.**
//
// ★게이트 — 카드는 "켬/끔 두 판 4,200틱 좌표 비트 동일"을 요구한다. **두 프로세스로는 못 건다**
//   (T350 §3-ⓑ: 틱 루프가 `Date.now()` 를 읽어 두 존이 같은 게임일에 같은 틱 수를 안 돈다).
//   ⇒ T350 ⑥ 이 세운 그 자를 그대로 쓴다 — 제품의 글자를 떠서 **한 프로세스 두 판**을 돌리고,
//     이번엔 적분기가 **지형에 막히게** 해서 술어가 좌표에 실제로 들어가게 한다.
console.log('\n⑦ T356_SOA 지형 막힘 비트 — 켬/끔이 같은 세계 [T356]');
{
  const src = body('isTerrainBlockedLocal') + '\n' + body('_terrBlocked0');
  ok(/_BLK_BITS/.test(src) && /_terrBlocked0\(x, y\)/.test(src),
     '⑦ [전제] 제품에서 **그 글자**를 떴다(비트 갈래 + 정본 넷)', `${src.length}자`);
  // 켬/끔 두 꼴을 같은 술어 넷 위에 세운다 — 지형은 결정적 합성(같은 씨)
  const W = 70016, H = 130016, WT_W = Math.ceil(W / 32), WT_H = Math.ceil(H / 32);
  const mk = (on, poison) => {
    let q4 = 0;
    // 술어 넷 — 어떤 답이든 좋다. 재는 것은 **비트가 그 넷과 같은 답을 내는가**다.
    const rock = (x, y) => { q4++; const tx = Math.floor(x / 32), ty = Math.floor(y / 32); return (((tx * 73856093) ^ (ty * 19349663)) & 63) === 0; };
    const ditch = (x, y) => { q4++; const tx = Math.floor(x / 32), ty = Math.floor(y / 32); return (((tx * 83492791) ^ (ty * 2971215073)) & 127) === 0; };
    const water = (x, y) => { q4++; const tx = Math.floor(x / 32), ty = Math.floor(y / 32); return (((tx * 2654435761) ^ (ty * 40503)) & 15) === 0; };
    const bridge = (x, y) => { q4++; const tx = Math.floor(x / 32), ty = Math.floor(y / 32); return (((tx * 374761393) ^ (ty * 668265263)) & 255) === 0; };
    const ZONEs = { isOcean: false, zoneWidth: W, zoneHeight: H };
    const _walk = { terrQ: 0 };
    const BITS = on ? new Uint8Array(((WT_W * WT_H) >> 2) + 2) : null;
    const env = { isRockTileLocal: rock, isDitchTileLocal: ditch, isWaterTileLocal: water, isBridgeTileLocal: bridge,
      ZONE: ZONEs, _walk, _BLK_BITS: BITS, _WT_W: WT_W };
    const keys = Object.keys(env);
    const fn = new Function(...keys, src + '\nreturn isTerrainBlockedLocal;')(...keys.map((k) => env[k]));
    return { fn, BITS, get q4() { return q4; }, get terrQ() { return _walk.terrQ; }, poison };
  };
  const OFF = mk(false), ON = mk(true);
  // ⓐ 전수 대조 — 셀 경계·격자 밖·음수·큰 좌표를 일부러 자주 밟는다
  let n = 0, diff = 0, trueN = 0;
  for (let i = 0; i < 400000; i++) {
    const k = i % 5;
    let x, y;
    if (k === 0) { x = rnd() * W; y = rnd() * H; }                                  // 안쪽 아무 데나
    else if (k === 1) { x = Math.floor(rnd() * WT_W) * 32; y = Math.floor(rnd() * WT_H) * 32; }   // 정확히 셀 경계
    else if (k === 2) { x = Math.floor(rnd() * WT_W) * 32 - 0.5; y = Math.floor(rnd() * WT_H) * 32 + 31.5; }
    else if (k === 3) { x = (rnd() * 2 - 0.5) * W; y = (rnd() * 2 - 0.5) * H; }     // 격자 밖(음수·초과)
    else { x = W - rnd() * 40; y = H - rnd() * 40; }                                 // ★오른쪽·아래 끝(px 범위 ≠ tx 범위)
    const a = OFF.fn(x, y), b = ON.fn(x, y);
    n++; if (a !== b) diff++; if (a) trueN++;
  }
  ok(n === 400000, '⑦-a [상황] 표본 40만(셀 경계 · 격자 밖 · 음수 · **존 오른쪽 끝**)', `${n}점`);
  ok(trueN > 20000 && trueN < n - 20000, '⑦-a [상황] 막힘/열림이 **둘 다** 넉넉하다(한쪽만이면 자명 통과다)', `막힘 ${trueN}`);
  ok(diff === 0, '⑦-a ★★★켬 ↔ 끔이 **한 점도 안 다르다**', `다른 답 ${diff}/${n}`);
  // ★비트가 버는 자리는 **같은 셀을 다시 밟을 때**다 — 40만 점을 890만 셀에 흩으면 거의 다 '처음 밟는 셀'이라
  //   덜 부르는 게 안 보인다(위 표본이 그렇다: 1.19M → 0.95M, 20%뿐). 실서버는 주민이 **제 마을 상자**를
  //   하루 종일 다시 밟는다 ⇒ 그 꼴로 잰다: 한 마을 크기(64×64셀) 안을 두 바퀴.
  {
    const W2 = mk(true), C2 = mk(false);
    const BX = 1000, BY = 2000;                       // 마을 상자 한 귀퉁이(셀)
    const sweep = (arm) => { for (let r = 0; r < 2; r++) for (let cy = 0; cy < 64; cy++) for (let cx = 0; cx < 64; cx++) arm.fn((BX + cx) * 32 + 16, (BY + cy) * 32 + 16); };
    sweep(W2); sweep(C2);
    ok(W2.q4 < C2.q4 / 1.9, '⑦-a ★같은 상자를 **두 바퀴** 밟으면 술어 넷 호출이 절반 아래로 (둘째 바퀴는 읽기 하나)',
       `술어 호출 끔 ${C2.q4.toLocaleString()} → 켬 ${W2.q4.toLocaleString()}`);
    console.log(`    ↳ 흩어진 표본에선 20%만 준다(${OFF.q4.toLocaleString()} → ${ON.q4.toLocaleString()}) — **처음 밟는 셀**이 대부분이라서다(T333 이 미리 굽기로 답한 그 자리)`);
  }
  ok(ON.terrQ === OFF.terrQ, '⑦-a 관측 계수(`_walk.terrQ`)는 **그대로**다(자는 안 바뀐다)', `${ON.terrQ}`);
  // ⓑ 4,200틱 좌표 게이트 — 적분기가 **지형에 막힌다**(술어가 좌표에 실제로 든다)
  const run = (arm) => {
    const TICKS = 4200, N = 408, MOVE = 64, dtm = 1 / 30;
    const st = require(path.join(ROOT, 'server', 'seed-rand.js')).makeStream(); st.seed(0x7e44a);
    const ppl = [];
    for (let i = 0; i < N; i++) ppl.push({ x: 4000 + st.next() * 60000, y: 4000 + st.next() * 120000,
      tx: 4000 + st.next() * 60000, ty: 4000 + st.next() * 120000 });
    const dv = new DataView(new ArrayBuffer(8));
    const dig = new Uint32Array(TICKS);
    let blockedN = 0;
    for (let t = 0; t < TICKS; t++) {
      let h = 2166136261;
      for (let i = 0; i < N; i++) {
        const p = ppl[i];
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d > 2) {
          const nx = p.x + (dx / d) * MOVE * dtm, ny = p.y + (dy / d) * MOVE * dtm;
          // 축마다 막힘 — 제품의 성분별 취소와 같은 꼴(여기 자는 그 꼴만 흉내낸다)
          const bx = arm.fn(nx, p.y), by = arm.fn(p.x, ny);
          if (bx || by) blockedN++;
          if (!bx) p.x = nx;
          if (!by) p.y = ny;
          if (bx && by) { p.tx = 4000 + st.next() * 60000; p.ty = 4000 + st.next() * 120000; }   // 막히면 새 목표
        } else { p.tx = 4000 + st.next() * 60000; p.ty = 4000 + st.next() * 120000; }
        dv.setFloat64(0, p.x); h = (Math.imul(h ^ dv.getUint32(0), 16777619) ^ dv.getUint32(4)) >>> 0;
        dv.setFloat64(0, p.y); h = (Math.imul(h ^ dv.getUint32(0), 16777619) ^ dv.getUint32(4)) >>> 0;
      }
      dig[t] = h;
    }
    return { dig, ppl, blockedN };
  };
  const A = run(mk(false)), B = run(mk(true));
  ok(A.blockedN > 10000, '⑦-b [상황] 적분기가 **실제로 막혔다**(자명 통과 금지 — 0 이면 지형이 좌표에 안 든 것)',
     `막힌 걸음 ${A.blockedN.toLocaleString()}`);
  let fd = -1; for (let t = 0; t < A.dig.length; t++) if (A.dig[t] !== B.dig[t]) { fd = t; break; }
  ok(fd < 0, '⑦-b ★★★끔 ↔ 켬 — **주민 408 × 4,200틱 좌표가 비트 동일**',
     fd < 0 ? `${(408 * 4200).toLocaleString()} 자리 전부 같다` : `첫 다름 틱 ${fd}`);
  let cd = 0; for (let i = 0; i < A.ppl.length; i++) { if (!sameF64(A.ppl[i].x, B.ppl[i].x)) cd++; if (!sameF64(A.ppl[i].y, B.ppl[i].y)) cd++; }
  ok(cd === 0, '⑦-b ★끝 자리 좌표도 바이트 동일', `다른 좌표 ${cd}/${A.ppl.length * 2}`);
  // ⓒ 자명 통과 금지 — 비트 한 칸을 일부러 뒤집으면 세계가 갈린다
  const P = mk(true); P.fn(50000, 60000);          // 한 셀을 굽고
  { const b = ((Math.floor(60000 / 32) * WT_W + Math.floor(50000 / 32)) << 1); P.BITS[b >> 3] ^= (2 << (b & 7)); }
  ok(P.fn(50000, 60000) !== OFF.fn(50000, 60000), '★⑦ 자명 통과 금지 — **비트 하나를 뒤집으면 답이 갈린다**(자가 비트를 실제로 본다)');
  // ⓓ 소스 계수 — 정본 하나 · 가드 동형 · 무효화
  const Z2 = codeOnly(Z);
  ok((Z2.match(/function _terrBlocked0\(/g) || []).length === 1, '⑦-d 정본 `_terrBlocked0` 는 **하나**다(사본 0)');
  ok(/x >= 0 && y >= 0 && x < ZONE\.zoneWidth && y < ZONE\.zoneHeight/.test(src),
     '⑦-d ★가드가 술어 넷과 **같은 꼴**이다(px 범위 — `tx` 로 가드하면 존 오른쪽 끝이 갈린다)');
  ok(/refreshDitchCells\(\)[\s\S]{0,200}_BLK_BITS\.fill\(0\)/.test(Z2),
     '⑦-d ★환호가 바뀌면 비트를 **영점**한다(런타임에 바뀌는 원천은 그것 하나다)');
  ok(/const T356_SOA = process\.env\.T356_SOA === '1';/.test(Z2), "⑦-d 손잡이는 `T356_SOA` 하나 · **기본 끔**");
  // ── 값(계측 · 단정 아님) — 같은 프로세스에서 두 꼴의 **한 번 값**을 잰다.
  //   ⚠존 틱 p50 으로는 이 크기를 **못 가른다**(T345 §3-ⓑ · T356 §3-ⓒ 실측: 창 안 흐름이 ±15 %).
  //     그래서 값은 **자리에서** 재고, 틱 환산은 걸음당 호출 수(6.2 · T324 계수)로 **유도**한다.
  {
    const bench = (arm, N) => {
      const BX = 1000, BY = 2000;
      for (let i = 0; i < 4096; i++) arm.fn((BX + (i & 63)) * 32 + 16, (BY + ((i >> 6) & 63)) * 32 + 16);   // 굽기(워밍)
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < N; i++) arm.fn((BX + (i & 63)) * 32 + 16, (BY + ((i >> 6) & 63)) * 32 + 16);
      return Number(process.hrtime.bigint() - t0) / N;
    };
    const N = 4e6, W3 = mk(true), C3 = mk(false);
    const a = Math.min(bench(C3, N), bench(C3, N)), b = Math.min(bench(W3, N), bench(W3, N));
    const PER_STEP = 6.21;                       // 걸음당 지형 질의(T324 `_walk.terrQ/steps` 실측)
    console.log(`    [값·아래끝] 한 번 — 끔 ${a.toFixed(1)}ns → 켬 ${b.toFixed(1)}ns (×${(a / b).toFixed(2)}) · 걸음당 ${PER_STEP}회 ⇒ 사람당 ${((a - b) * PER_STEP / 1000).toFixed(3)} µs(유도)`);
    console.log('    ⚠이 값은 **아래끝**이다 — 여기 술어 넷은 해시 산술 대리물이라 싸다(제품은 메모 조회·Set·floor 여덟). 제품 값은 보고 §3-ⓒ 프로파일.');
  }
  console.log(`    [표] 지형 비트 — 전수 40만 0 다름 · 술어 호출 ${OFF.q4.toLocaleString()} → ${ON.q4.toLocaleString()} · 4,200틱 좌표 0 다름`);
  console.log('    접점: isTerrainBlockedLocal · _terrBlocked0 · T356_SOA · refreshDitchCells · terrain-tilecache');
}


// =============================================================================
// ⑧ T370_PATH_REUSE — 끄면 **비트 동일**, 켜면 경로를 덜 묻는다 [T370 ②]
// =============================================================================
// ★T370 ① 이 센 것: 낮에 `needPath` 가 틱마다 **894.5회**(주민의 61.1 %) 참이 되고, 그중
//   **98.8 %가 `pathIndex >= length`** 다 — 도착한 주민이 다음 결정이 올 때까지 매 틱 길을 다시 묻는다
//   (목표까지 평균 15px · 행동 100 % `wander` · 28.6 %는 10틱 넘게 연속).
//   ⇒ **네 조건 중 '경로 끝' 하나만 참이면 안 묻는다.** 5000ms 만료는 원래 있던 수다(새 수 0).
console.log('\n⑧ T370_PATH_REUSE — 경로를 두 번 묻지 않는다 [T370]');
{
  const Z3 = codeOnly(Z);
  ok(/const T370_PATH_REUSE = process\.env\.T370_PATH_REUSE === '1';/.test(Z3),
     '⑧ 손잡이는 `T370_PATH_REUSE` 하나 · **기본 끔**');
  ok(/const _skip = T370_PATH_REUSE && needPath/.test(Z3),
     '⑧ ★`_skip` 의 **첫 항이 손잡이**다 — 끄면 단락되어 불리언 읽기 하나(종전과 비트 동일)');
  ok(/npc\._pathAt > 5000/.test(Z3) && !/T370[^\n]*\b(?!5000)\d{3,}/.test(Z3.split('T370_PATH_REUSE')[1] || ''),
     '⑧ ★새 수 0 — 만료는 **있던 5000ms** 그대로다');
  ok(!/pathfind|path-core/.test(Z3.slice(Z3.indexOf('const _skip'), Z3.indexOf('const _skip') + 400)),
     '⑧ A\\* 알고리즘 무접촉 — 고친 것은 **부르는 조건**뿐이다');
  // ── 네 조건의 진리표를 그대로 복원해 켬/끔을 견준다(제품 글자를 뜬다) ──
  const nb = body('npcStep');
  const m = nb.match(/const needPath = [\s\S]*?const _skip = [\s\S]*?\n  if \(needPath && !_skip\) \{/);
  ok(!!m, '⑧ [전제] 제품에서 조건 묶음 **그 글자**를 떴다', m ? `${m[0].length}자` : '못 찾음');
  const mkAsk = (on) => new Function('npc', 'now', 'targetKey', 'T370_PATH_REUSE',
    m[0].replace('\n  if (needPath && !_skip) {', '') + '\nreturn needPath && !_skip;');
  const ask = mkAsk();
  // 진리표 16칸 × 상황(경로 있음/없음)
  let rows = 0, offAsk = 0, onAsk = 0, diffWhenOff = 0;
  for (let bits = 0; bits < 16; bits++) {
    const hasPath = !(bits & 1), atEnd = !!(bits & 2), keyDiff = !!(bits & 4), expired = !!(bits & 8);
    const npc = { path: hasPath ? [{ x: 0, y: 0 }, { x: 1, y: 1 }] : null,
      pathIndex: atEnd ? 2 : 0, _pathFor: keyDiff ? 'other' : 'K', _pathAt: expired ? 1 : 1000000 };
    const now = expired ? 1000000 : 1001;
    const legacy = !npc.path || npc.pathIndex >= npc.path.length || npc._pathFor !== 'K' || (npc._pathAt && now - npc._pathAt > 5000);
    const a = ask(npc, now, 'K', false), b = ask(npc, now, 'K', true);
    rows++; if (a) offAsk++; if (b) onAsk++;
    if (a !== legacy) diffWhenOff++;
  }
  ok(rows === 16 && offAsk > 0 && offAsk < 16, '⑧ [상황] 진리표 16칸을 다 밟았고 묻는/안 묻는 칸이 둘 다 있다', `끔 묻는 칸 ${offAsk}/16`);
  ok(diffWhenOff === 0, '⑧ ★★★**끔 = 종전 식과 한 칸도 안 다르다**(비트 동일)', `다른 칸 ${diffWhenOff}/16`);
  ok(onAsk < offAsk, '⑧ ★켬은 **덜 묻는다**', `끔 ${offAsk} → 켬 ${onAsk} 칸`);
  // ★켬이 줄이는 칸은 **'경로 끝'만 참인 칸 하나**여야 한다 — 목표가 바뀌거나 5초가 지나면 여전히 묻는다
  const onlyEnd = { path: [{ x: 0, y: 0 }], pathIndex: 1, _pathFor: 'K', _pathAt: 1000000 };
  ok(ask(onlyEnd, 1001, 'K', false) === true && ask(onlyEnd, 1001, 'K', true) === false,
     '⑧ ★줄이는 칸은 **경로 끝만 참**인 칸이다');
  const endAndKey = { path: [{ x: 0, y: 0 }], pathIndex: 1, _pathFor: 'other', _pathAt: 1000000 };
  ok(ask(endAndKey, 1001, 'K', true) === true, '⑧ ★목표가 바뀌면 켬도 **여전히 묻는다**(끝+목표)');
  const endAndOld = { path: [{ x: 0, y: 0 }], pathIndex: 1, _pathFor: 'K', _pathAt: 1 };
  ok(ask(endAndOld, 1000000, 'K', true) === true, '⑧ ★★5초가 지나면 켬도 **묻는다** — 제자리에서 막힌 사람을 있는 만료가 깨운다');
  // 자명 통과 금지 — 손잡이를 무시하는 식으로 바꾸면 위 둘이 갈린다
  const bad = new Function('npc', 'now', 'targetKey', 'T370_PATH_REUSE',
    m[0].replace('const _skip = T370_PATH_REUSE &&', 'const _skip = true &&').replace('\n  if (needPath && !_skip) {', '') + '\nreturn needPath && !_skip;');
  ok(bad(onlyEnd, 1001, 'K', false) === false, '★⑧ 자명 통과 금지 — 손잡이를 `true` 로 비틀면 **끔 칸이 갈린다**(자가 손잡이를 실제로 본다)');
  console.log('    접점: needPath · _pathFor · _pathAt · pathIndex · computeNpcPath · T370_PATH_REUSE');
}

// =============================================================================
// ⑨ T385_ONE_SWEEP — 순회 일곱을 둘로 합쳐도 세계가 안 바뀐다 [T385] (T375 ⑨ 의 자리 · 그 손잡이는 흡수됐다)
// =============================================================================
// ★T375 가 문지기를 싸게 해 보니 값이 반대였고(그 밖 +27 %), 음수의 정체는 **순회 한 바퀴**였다.
//   T385 는 순회를 줄인다: 앞 묶음 {spatial, inputTO} · 뒤 묶음 {stairs, fall, gauge, hpRegen, gaugeNet} = 일곱 → 둘.
// ★★이 절이 재는 것은 하나다: **몸마다 종전 순서로 단계를 밟으면 같은 세계인가** — 의존 표(보고 §1)가 "예" 라 했다.
//   그 표가 틀리면(한 단계가 **다른 몸의** 같은 틱 결과를 읽으면) 합친 바퀴는 다른 세계를 낸다 ⇒ 이 자가 문다.
//   ⓐ 가 제품의 **뒤 묶음 글자 전부**(계단 정의 ~ 몹 AI 앞 · 끔 순회 다섯 + 켬 한 바퀴)를 떠서 한 프로세스 두 판을 돌린다.
//   ⓑ 는 앞 묶음(격자 재구축 + 입력 타임아웃). ⓒ 는 ③ 계단 정수 키. ⓓ 는 소스 계수.
//   ★자명 통과 금지 둘: 벗 화살(`_followPayload`)이 **벗의 hp**(같은 틱에 HP 단계가 쓰는 칸)를 읽게 비틀면 갈린다 ·
//     벗의 `z`(계단 단계가 쓰는 칸)를 읽게 비틀어도 갈린다 — 표가 "안 읽는다" 고 한 자리를 자가 실제로 본다.
console.log('\n⑨ T385_ONE_SWEEP 순회 일곱 → 둘 — 켬/끔이 같은 세계 [T385]');
{
  const ZSRC = Z;
  const cut = (a, b) => { const i = ZSRC.indexOf(a), j = ZSRC.indexOf(b, i + 1); return (i < 0 || j < 0) ? '' : ZSRC.slice(i, j); };
  const POST = cut('  // === Phase 14.49-e: PZ식 다단 계단', '  // === Mob AI ===');
  ok(POST.length > 8000 && /function _stairStepP\(p\)/.test(POST) && /function _gaugeStep\(p\)/.test(POST) && /if \(T385_ONE_SWEEP\) \{/.test(POST),
     '⑨ [전제] 제품에서 **뒤 묶음 글자 전부**를 떴다(단계 함수 다섯 · 끔 순회 · 켬 한 바퀴)', `${POST.length}자`);
  const KDEF = (ZSRC.match(/const _STAIR_K = \d+;/) || [''])[0];   // 키의 상수도 제품 글자 그대로
  const LIFT = KDEF + '\n' + ['isPositionActive', '_needAct', '_stairKey', 'rebuildStairCellCache', 'findStairBuildingForCell', 'dirVecForCollider']
    .map((n) => body(n)).join('\n');
  ok(LIFT.length > 800, '⑨ [전제] 계단 캐시·키·활성 술어도 **제품 글자 그대로**', `${LIFT.length}자`);

  const CS = 512, BS = 32, FH = 64;
  // ── 세계 하나 — 씨 하나에서 결정적으로 선다. `stairs` 가 true 면 계단·바닥이 있고, false 면 계단 0(③ 한 비트가 켜진다).
  const mkWorld = (opt) => {
    const st = require(path.join(ROOT, 'server', 'seed-rand.js')).makeStream(); st.seed(opt.seed || 0x385);
    const W = 24000, H = 24000;
    const players = new Map(), mobs = new Map(), buildings = new Map();
    let bid = 0;
    if (opt.stairs) {
      for (let i = 0; i < 60; i++) {                   // 계단 60 + 그 위층 바닥 — 몸이 오르내리고 떨어진다
        const cx = 20 + Math.floor(st.next() * 700), cy = 20 + Math.floor(st.next() * 700);
        const dir = ['N', 'S', 'E', 'W'][Math.floor(st.next() * 4)];
        buildings.set('s' + bid, { id: 's' + bid, type: 'stair', x: cx * BS + 16, y: cy * BS + 16, floor: 0, data: { dir } }); bid++;
        for (let k = 0; k < 6; k++) buildings.set('f' + bid, { id: 'f' + bid, type: 'floor', x: (cx + k - 3) * BS + 16, y: (cy - 3) * BS + 16, floor: 1 }), bid++;
      }
      // 존 가장자리 계단 — 격자 밖으로 삐져나간다(③ 키가 부딪치면 여기서 난다)
      buildings.set('edgeN', { id: 'edgeN', type: 'stair', x: 5 * BS + 16, y: 0 * BS + 16, floor: 0, data: { dir: 'N' } });
      buildings.set('edgeW', { id: 'edgeW', type: 'stair', x: 0 * BS + 16, y: 9 * BS + 16, floor: 0, data: { dir: 'W' } });
    }
    const N = 360, M = 48;
    for (let i = 0; i < N; i++) {
      const kind = i % 6;                            // 0,1,2 마을 NPC · 3 떠돌이 NPC · 4 canadia · 5 사람(ws)
      const human = kind === 5;
      const p = { pid: 'p' + i, playerId: human ? 'u' + i : undefined, name: 'n' + i,
        isNpc: !human, canadiaVillage: kind === 4, simVillageId: kind <= 2 ? 'v' + (i % 7) : null,
        x: st.next() * W, y: st.next() * H, tx: st.next() * W, ty: st.next() * H, vx: 0, vy: 0,
        z: (i % 23 === 0) ? 20 : 0, floor: (i % 17 === 0) ? 1 : 0, hp: 60 + (i % 40), maxHp: 100,
        hunger: 30 + (i % 50), thirst: 25 + (i % 60), vp: 10, lastDamagedAt: -1e9,
        onStairId: (i % 29 === 0) ? 'gone' + i : null,        // 지워진 계단 위에 서 있던 몸(③ 한 비트가 빠뜨리면 안 된다)
        ws: human ? { id: i } : null, inventory: {}, _follow: human ? { id: 'u' + ((i + 30) % N) } : null };
      if (human) p._follow = { id: 'u' + (((Math.floor(i / 6) + 3) % Math.floor(N / 6)) * 6 + 5), name: 'f' };
      players.set(p.pid, p);
    }
    for (let i = 0; i < M; i++) mobs.set('m' + i, { pid: 'm' + i, x: st.next() * W, y: st.next() * H, vx: 1, vy: 0, z: 0, floor: (i % 9 === 0) ? 1 : 0, hp: 40, onStairId: null });
    return { st, W, H, players, mobs, buildings };
  };
  // ── 제품 글자를 한 판에 세운다 — 바깥 도우미는 **자기 몸만 읽는** 가짜다(의존 표 그대로). `bait` 가 그 표를 일부러 어긴다.
  const mkArm = (world, on, bait, src) => {
    const log = [];
    const activeChunkKeys = new Set();
    const chunkManager = { chunkSize: CS, keyOf: (cx, cy) => `${cx}_${cy}` };
    const stairCellCache = new Map();
    const qtBuildings = { queryCircle: (x, y, r) => { const o = []; for (const b of world.buildings.values()) if (Math.abs(b.x - x) <= r + BS && Math.abs(b.y - y) <= r + BS) o.push(b); return o; } };
    const onlineById = new Map(); for (const p of world.players.values()) if (!p.isNpc) onlineById.set(p.playerId, p);
    const env = {
      players: world.players, mobs: world.mobs, buildings: world.buildings, activeChunkKeys, chunkManager, stairCellCache, qtBuildings,
      T385_ONE_SWEEP: on, BUILDING_SIZE: BS, FLOOR_HEIGHT: FH, HUNGER_MAX: 100, THIRST_MAX: 100,
      COLD_CLOTH_WEAR_MS: 60000, CARRIER_WEAR_MS: 60000, VP_DECAY_PER_SEC: 0.5,
      send: (ws, m) => log.push('S' + ws.id + ':' + m.type + ':' + (m.hp ?? m.floor ?? '') + (m.follow ? ':' + JSON.stringify(m.follow) : '')),
      broadcast: (m) => log.push('B:' + m.type + ':' + m.pid + ':' + (m.floor ?? m.hp ?? '')),
      setHp: (p, v, why) => { const n = Math.max(0, Math.min(p.maxHp || 100, v)); if (n === p.hp) return n; p.hp = n; log.push('H:' + p.pid + ':' + why + ':' + n.toFixed(3)); return n; },
      damagePlayer: null,   // 아래에서 채운다(setHp 를 부른다)
      getEquippedEquipment: (p) => (p.pid.charCodeAt(1) % 2 ? { attrs: { warmth: 1 } } : null),
      bodyNight: (t) => ((t / 1000) % 20) > 10, isNearCampfire: (p) => ((p.x / 800) | 0) % 5 === 0, isIndoorAt: (p) => (p.floor || 0) > 0,
      Carry: { effects: (p) => ({ ratio: ((p.x | 0) % 7) / 7 }), carrierWorking: (p) => (p.vp | 0) % 2 === 0, CARRIER_SLOT: 'back', reconcile: () => {}, payload: () => ({}) },
      gameDayNow: () => 12, villageShelterOf: (p) => (p.simVillageId ? 0.5 : 0), elevKmAt: (p) => p.y / 1e5,
      windExposureOf: (p) => (p.x % 100) / 100, coverOf: (p) => (p.y % 50) / 50, seasonColdNow: () => 0.3,
      wearEquipment: (p, slot) => { p._wear = (p._wear || 0) + 1; },
      zoneGameDay: () => 12, Lots: { isLot: () => false, reconcile: () => {} },
      weatherFor: (p) => ({ t: (p.x | 0) % 10 }), moveMultOf: (p) => 1,
      _followPayload: (p) => {                       // ★벗의 **x·y** 만 읽는다 — 일곱 단계 중 누구도 안 쓰는 칸(표 그대로)
        const f = p._follow; if (!f) return null; const t = onlineById.get(f.id); if (!t) return null;
        if (bait === 'hp') return { follow: { v: t.hp } };      // ★미끼 ① — 같은 틱에 HP 단계가 쓰는 칸
        if (bait === 'z') return { follow: { v: t.z } };        // ★미끼 ② — 같은 틱에 계단 단계가 쓰는 칸
        return { follow: { x: Math.round(t.x), y: Math.round(t.y) } };
      },
      Body: {
        tick: (p, dt, c) => { p.hunger = Math.max(0, p.hunger - dt * (c.moving ? 3 : 1) * (c.night ? 1.5 : 1)); p.thirst = Math.max(0, p.thirst - dt * 2 * (1 + c.carryRatio));
          p._stam = (p._stam ?? 50) + (c.sprint ? -dt * 10 : dt * 2); p._acc = (p._acc || 0) + (p.hunger <= 0 ? dt * 3 : 0); },
        takeHpDamage: (p) => { const d = Math.floor(p._acc || 0); p._acc = (p._acc || 0) - d; return d; },
        extremeHpRate: (p) => ({ rate: p.hunger <= 0 ? 0.3 : 0, parts: [{ axis: 'hunger' }] }),
        ensure: (p) => ({ cold: p._night ? 0.1 : 0, injury: 0 }), canSprint: (p) => (p._stam ?? 50) > 5,
        recoverMult: (p) => Math.min(1, (p.hunger + p.thirst) / 100), onDamage: () => 0, selfPayload: () => ({}),
      },
    };
    env.damagePlayer = (p, dmg, src) => { if (p.hp <= 0 || p.isDown) return; env.setHp(p, p.hp - dmg, 'damage'); p.lastDamagedAt = env.__now;
      if (p.hp <= 0 && !p.isNpc) { p.isDown = true; p.vx = 0; p.vy = 0; for (const m of world.mobs.values()) if (m.aggroTarget === p.pid) m.aggroTarget = null;
        env.broadcast({ type: 'player_down_state', pid: p.pid }); } };
    const keys = Object.keys(env);
    const fn = new Function(...keys, 'dt', 'now',
      'let stairCellDirty = true;\n' + LIFT + '\n' +
      'return function __tick(dt, now) {\n' + (src || POST) + '\n};')(...keys.map((k) => env[k]));
    return { env, log, activeChunkKeys, tick: (dt, now) => { env.__now = now; return fn(dt, now); } };
  };
  // ── 4,200틱 한 판 — 이동 문 대신 몸을 옮기고(두 판에 **같은 흐름**), 관측자를 돌려 활성 청크를 바꾼다
  const run = (opt, on, bait, src) => {
    const w = mkWorld(opt), A = mkArm(w, on, bait, src);
    const TICKS = opt.ticks || 4200, dtt = 1 / 30;
    const dv = new DataView(new ArrayBuffer(8));
    const dig = new Uint32Array(TICKS), msgMulti = [], msgSeq = [];
    let seqDiffTicks = 0;
    const H = (h, v) => { dv.setFloat64(0, +v || 0); h = (Math.imul(h ^ dv.getUint32(0), 16777619) ^ dv.getUint32(4)) >>> 0; return h; };
    for (let t = 0; t < TICKS; t++) {
      const now = 1_700_000_000_000 + t * 33;
      const ox = w.W / 2 + Math.cos(t / 11) * (w.W / 3), oy = w.H / 2 + Math.sin(t / 7) * (w.H / 3);
      A.activeChunkKeys.clear();
      const ocx = Math.floor(ox / CS), ocy = Math.floor(oy / CS);
      for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) A.activeChunkKeys.add(`${ocx + dx}_${ocy + dy}`);
      for (const p of w.players.values()) {           // 이동 문 대역 — 두 판이 같은 순서·같은 수로 옮긴다
        if (p.isDown) continue;
        const ddx = p.tx - p.x, ddy = p.ty - p.y, d = Math.hypot(ddx, ddy);
        if (d > 3) { p.vx = ddx / d * 90; p.vy = ddy / d * 90; p.x += p.vx * dtt * 4; p.y += p.vy * dtt * 4; }
        else { p.tx = w.st.next() * w.W; p.ty = w.st.next() * w.H; p.vx = 0; p.vy = 0; }
        p.sprint = (t + p.pid.length) % 50 < 10;
      }
      for (const m of w.mobs.values()) { m.x += m.vx; if (m.x > w.W) m.x = 0; }
      A.log.length = 0;
      A.tick(dtt, now);
      msgMulti.push(A.log.slice().sort().join('|')); msgSeq.push(A.log.join('|'));
      let h = 2166136261;
      for (const p of w.players.values()) for (const k of ['x', 'y', 'z', 'floor', 'hp', 'hunger', 'thirst', 'vp', 'stairStep', 'stairSubStep', 'fallVz', '_stam', '_acc', '_wear', 'lastDamagedAt'])
        h = H(h, p[k]);
      for (const p of w.players.values()) h = (Math.imul(h ^ ((p.falling ? 1 : 0) | (p.isDown ? 2 : 0) | (p._cold ? 4 : 0) | (p.sprint ? 8 : 0) | (p.onStairId ? 16 : 0)), 16777619)) >>> 0;
      for (const m of w.mobs.values()) for (const k of ['z', 'floor', 'hp', 'stairStep']) h = H(h, m[k]);
      dig[t] = h;
    }
    const cnt = { falls: 0, onStair: 0, down: 0, msgs: 0 };
    for (const p of w.players.values()) { if ((p.floor || 0) === 0 && p.fallStartFloor === 0) cnt.falls++; if (p.stairStep) cnt.onStair++; if (p.isDown) cnt.down++; }
    return { dig, msgMulti, msgSeq, w, cnt };
  };
  const firstDiff = (a, b) => { for (let t = 0; t < a.length; t++) if (a[t] !== b[t]) return t; return -1; };

  // ⓐ 계단이 있는 세계 — 몸이 오르고 떨어지고 굶고 아문다
  {
    const OFF = run({ stairs: true }, false), ON = run({ stairs: true }, true);
    const touched = OFF.msgSeq.reduce((a, s) => a + (s ? s.split('|').length : 0), 0);
    ok(touched > 2000, '⑨-a [상황] 단계들이 **실제로 일했다** — 메시지(층 바뀜·HP·게이지·쓰러짐)', `${touched.toLocaleString()}건`);
    ok(OFF.cnt.onStair + OFF.cnt.falls > 0 || /floor_changed/.test(OFF.msgSeq.join('')), '⑨-a [상황] 계단을 오르내린 몸이 있다(층 바뀜 메시지)',
       `층 바뀜 ${(OFF.msgSeq.join('|').match(/floor_changed/g) || []).length}건`);
    const fd = firstDiff(OFF.dig, ON.dig);
    ok(fd < 0, '⑨-a ★★★끔(순회 다섯) ↔ 켬(한 바퀴) — **몸 360 + 몹 48 × 4,200틱, 좌표·z·층·HP·게이지·쓰러짐 비트 동일**',
       fd < 0 ? `${(4200).toLocaleString()}틱 전부 같다` : `첫 다름 틱 ${fd}`);
    const fm = firstDiff(OFF.msgMulti, ON.msgMulti);
    ok(fm < 0, '⑨-a ★틱마다 **보낸 메시지의 모음**도 같다(무엇을 보냈나 — 순서 말고)', fm < 0 ? '0 다름' : `첫 다름 틱 ${fm}`);
    let sd = 0; for (let t = 0; t < OFF.msgSeq.length; t++) if (OFF.msgSeq[t] !== ON.msgSeq[t]) sd++;
    console.log(`    [표] ★메시지 **순서**는 ${sd.toLocaleString()}/4,200틱에서 다르다 — 같은 틱 안, **서로 다른 몸**의 메시지가 섞이는 순서(몸마다 자기 메시지 순서는 같다). 켜기 판정 몫(보고 §1-ⓒ)`);
    // 몸마다 자기 메시지 순서는 같은가 — 보낸 몸별로 줄 세워 견준다
    const perBody = (seq) => seq.map((s) => { const m = new Map(); for (const x of (s ? s.split('|') : [])) { const k = x.split(':').slice(0, 3).join(':').replace(/^(S\d+|B:[^:]+|H):?/, ''); const who = (x.match(/p\d+/) || [x.split(':')[0]])[0]; if (!m.has(who)) m.set(who, []); m.get(who).push(x); } return [...m.entries()].sort().map(([k, v]) => k + '=' + v.join(',')).join(';'); });
    const pa = perBody(OFF.msgSeq), pb = perBody(ON.msgSeq);
    ok(firstDiff(pa, pb) < 0, '⑨-a ★**몸마다** 자기 메시지 순서는 같다(섞이는 건 몸 사이뿐)');
  }
  // ⓐ′ 계단이 **없는** 세계 — ③ 한 비트가 켜진다. 지워진 계단 위에 서 있던 몸·z>0 인 몸을 빠뜨리면 여기서 갈린다
  {
    const OFF = run({ stairs: false, seed: 0x3850 }, false), ON = run({ stairs: false, seed: 0x3850 }, true);
    const w0 = mkWorld({ stairs: false, seed: 0x3850 });
    let left = 0, zup = 0; for (const p of w0.players.values()) { if (p.onStairId) left++; if (p.z > 0) zup++; }
    ok(left > 0 && zup > 0, '⑨-a′ [상황] 계단 0 인 세계에 **지워진 계단 위의 몸**과 **z>0 인 몸**이 있다(한 비트가 빠뜨리면 안 되는 몸)', `onStairId ${left} · z>0 ${zup}`);
    const fd = firstDiff(OFF.dig, ON.dig);
    ok(fd < 0, '⑨-a′ ★★계단 0 — **한 비트로 빠져도** 4,200틱 비트 동일', fd < 0 ? '전부 같다' : `첫 다름 틱 ${fd}`);
    // 자명 통과 금지 — 한 비트가 `onStairId`·`z` 를 안 보면(계단 0 이면 무조건 빠지면) 갈린다
    const bad = POST.replace('if (T385_ONE_SWEEP && _stairNone && !p.onStairId && !((p.z || 0) > 0)) return;', 'if (T385_ONE_SWEEP && _stairNone) return;');
    ok(bad !== POST, '⑨-a′ [전제] 한 비트 줄을 제품에서 찾았다(미끼를 만들 수 있다)');
    const BAD = run({ stairs: false, seed: 0x3850 }, true, null, bad);
    const fb = firstDiff(OFF.dig, BAD.dig);
    ok(fb >= 0, '★⑨-a′ 자명 통과 금지 — 한 비트가 `onStairId`·`z` 를 **안 보면**(계단 0 이면 무조건 빠지면) 갈린다',
       fb >= 0 ? `첫 다름 틱 ${fb}` : '안 갈렸다(자가 한 비트의 조건을 못 문다)');
  }
  // ⓑ 앞 묶음 — 격자 재구축 + 입력 타임아웃(켬이면 격자 바퀴가 입력 타임아웃을 싣는다)
  {
    const RSI = body('rebuildSpatialIndex'), ITO = body('_inputTOStep');
    ok(RSI.length > 300 && ITO.length > 100, '⑨-b [전제] 제품의 격자 재구축·입력 타임아웃 **글자 그대로**', `${RSI.length}+${ITO.length}자`);
    const OFFLOOP = (ZSRC.match(/  if \(!T385_ONE_SWEEP\) for \(const p of players\.values\(\)\) _inputTOStep\(p, now\);/) || [''])[0];
    ok(OFFLOOP.length > 0, '⑨-b [전제] 끔 순회 줄(입력 타임아웃)을 떴다');
    const runPre = (on) => {
      const w = mkWorld({ stairs: true, seed: 0x3851 });
      const ins = [];
      class Quadtree { constructor() { this.n = 0; } insert(o) { ins.push((o.ref && (o.ref.pid || o.ref.id)) + '@' + o.x.toFixed(3) + ',' + o.y.toFixed(3)); this.n++; } }
      const activeChunkKeys = new Set(), chunkManager = { chunkSize: CS, keyOf: (cx, cy) => `${cx}_${cy}`, chunks: new Map() };
      const env = { players: w.players, mobs: w.mobs, resources: new Map(), activeChunkKeys, chunkManager, Quadtree, ZONE: { zoneWidth: w.W, zoneHeight: w.H },
        T385_ONE_SWEEP: on, T421_SPATIAL_INC: false };   // ★[T421] 격자 증분은 ⑫ 가 따로 잰다(여기선 끔 — 옛 나무에 넣는 차례를 본다)
      const keys = Object.keys(env);
      const api = new Function(...keys, 'let qtPlayers, qtMobs, qtBuildings, qtResources = {}, resourcesDirty = false, _lastResRebuild = 0;\n' +
        body('isPositionActive') + '\n' + ITO + '\n' + RSI + '\n' + body('_rebuildResources') + '\nreturn { rebuildSpatialIndex, _inputTOStep };')(...keys.map((k) => env[k]));
      const dig = [];
      for (let t = 0; t < 4200; t++) {
        const now = 1_700_000_000_000 + t * 33;
        activeChunkKeys.clear();
        const ox = w.W / 2 + Math.cos(t / 11) * (w.W / 3), oy = w.H / 2 + Math.sin(t / 7) * (w.H / 3);
        for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) activeChunkKeys.add(`${Math.floor(ox / CS) + dx}_${Math.floor(oy / CS) + dy}`);
        for (const p of w.players.values()) { p.x += (p.pid.length % 3 - 1) * 7; p.lastSeen = (t % 90 < 60) ? now : now - 3000; p.vx = 5; p.vy = -5; p.inputQueue = [1, 2]; }
        ins.length = 0;
        api.rebuildSpatialIndex(on ? now : undefined);
        if (!on) for (const p of w.players.values()) api._inputTOStep(p, now);   // 끔 순회 줄(위에서 뜬 그 줄과 같은 꼴)
        let h = ins.join('|');
        for (const p of w.players.values()) h += '|' + p.vx + ',' + p.vy + ',' + p.inputQueue.length;
        dig.push(h);
      }
      return dig;
    };
    const A = runPre(false), B = runPre(true);
    const stops = A.filter((s) => /\|0,0,0/.test(s)).length;
    ok(stops > 100, '⑨-b [상황] 입력 타임아웃이 **실제로 멈춰 세웠다**(사람 몸 vx·vy·큐 0)', `${stops}틱`);
    const fd = firstDiff(A, B);
    ok(fd < 0, '⑨-b ★★끔(격자 → 입력 순회) ↔ 켬(한 바퀴) — **4,200틱 격자 삽입 순서·좌표·입력 상태 동일**', fd < 0 ? '전부 같다' : `첫 다름 틱 ${fd}`);
  }
  // ⓒ 자명 통과 금지 — 표가 "안 읽는다" 고 한 칸을 **읽게** 비틀면 갈린다(자가 몸 사이 의존을 실제로 본다)
  {
    const H1 = run({ stairs: true, ticks: 600 }, false, 'hp'), H2 = run({ stairs: true, ticks: 600 }, true, 'hp');
    const f1 = firstDiff(H1.msgMulti, H2.msgMulti);
    ok(f1 >= 0, '★⑨-c 미끼 ① — 벗 화살이 **벗의 hp**(같은 틱 HP 단계가 쓰는 칸)를 읽으면 끔 ↔ 켬이 **갈린다**',
       f1 >= 0 ? `첫 다름 틱 ${f1}` : '안 갈렸다(자가 몸 사이 의존을 못 문다)');
    const Z1 = run({ stairs: true, ticks: 600 }, false, 'z'), Z2 = run({ stairs: true, ticks: 600 }, true, 'z');
    const f2 = firstDiff(Z1.msgMulti, Z2.msgMulti);
    ok(f2 >= 0, '★⑨-c 미끼 ② — 벗 화살이 **벗의 z**(같은 틱 계단 단계가 쓰는 칸)를 읽어도 **갈린다**',
       f2 >= 0 ? `첫 다름 틱 ${f2}` : '안 갈렸다');
  }
  // ⓓ ③ 계단 정수 키 — 문자열 판과 **모든 칸에서** 같은 답(격자 밖·가장자리·음수 포함)
  {
    const w = mkWorld({ stairs: true });
    const mk = (on) => {
      const stairCellCache = new Map();
      const env = { buildings: w.buildings, stairCellCache, T385_ONE_SWEEP: on, BUILDING_SIZE: 32 };
      const keys = Object.keys(env);
      return new Function(...keys, 'let stairCellDirty = true;\n' + LIFT + '\nreturn { findStairBuildingForCell, stairCellCache: () => stairCellCache };')(...keys.map((k) => env[k]));
    };
    const S = mk(false), I = mk(true);
    const st = require(path.join(ROOT, 'server', 'seed-rand.js')).makeStream(); st.seed(0x5a1);
    let n = 0, diff = 0, hit = 0; const hitCells = new Set();
    const probe = (cx, cy) => { const a = S.findStairBuildingForCell(cx, cy), b = I.findStairBuildingForCell(cx, cy); n++;
      const sa = a ? a.stair.id + ':' + a.step : '-', sb = b ? b.stair.id + ':' + b.step : '-'; if (sa !== sb) diff++; if (a) { hit++; hitCells.add(cx + '_' + cy); } };
    for (const b of w.buildings.values()) if (b.type === 'stair') { const ax = Math.floor(b.x / 32), ay = Math.floor(b.y / 32);
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) probe(ax + dx, ay + dy); }
    for (let i = 0; i < 200000; i++) probe(Math.floor((st.next() * 2 - 0.5) * 800), Math.floor((st.next() * 2 - 0.5) * 800));
    for (const [cx, cy] of [[-1, 0], [0, -1], [-1, -1], [5, -1], [5, -2], [-1, 9], [-2, 9], [40000, 5], [5, -40000], [-32768, 0], [32767, 32767]]) probe(cx, cy);
    ok(hitCells.size === S.stairCellCache().size && hitCells.size > 150, '⑨-d [상황] 계단 칸을 **하나도 빠짐없이** 밟았다(가장자리·격자 밖 포함)', `밟은 계단 칸 ${hitCells.size} = 캐시 ${S.stairCellCache().size} · 조회 ${n.toLocaleString()}`);
    ok(diff === 0, '⑨-d ★★정수 키 ↔ 문자열 키 — **한 칸도 안 다르다**(격자 밖 ·음수 · ±32,768 경계)', `다른 답 ${diff}`);
    ok(S.stairCellCache().size === I.stairCellCache().size, '⑨-d 캐시 크기가 같다(키가 한 점에 겹치지 않았다)', `${S.stairCellCache().size} = ${I.stairCellCache().size}`);
    // 자명 통과 금지 — 있는 자 `_cellKey`(격자 안에서만 전단사)를 쓰면 가장자리에서 갈린다
    const WTH = Math.ceil(24000 / 32);
    const naive = new Map(); for (const b of w.buildings.values()) if (b.type === 'stair') { const ax = Math.floor(b.x / 32), ay = Math.floor(b.y / 32);
      const d = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[b.data.dir]; for (let s2 = 0; s2 <= 2; s2++) naive.set((ax + d[0] * s2) * WTH + (ay + d[1] * s2), b.id); }
    // 격자 밖 계단 칸 (5,−1)·(5,−2) 의 `_cellKey` 는 격자 안 (4, H−1)·(4, H−2) 와 **같은 수**다 — 거기를 밟는다
    let clash = 0; const cells = [];
    for (let cx = -2; cx <= 30; cx++) for (let cy = -2; cy <= 30; cy++) cells.push([cx, cy]);
    for (let cx = 0; cx <= 8; cx++) for (let cy = WTH - 3; cy < WTH; cy++) cells.push([cx, cy]);
    for (const [cx, cy] of cells) { const a = S.findStairBuildingForCell(cx, cy); const nb = naive.get(cx * WTH + cy);
      if ((a ? a.stair.id : undefined) !== nb) clash++; }
    ok(clash > 0, '★⑨-d 자명 통과 금지 — 있는 자 `_cellKey`(cx·H+cy)를 그대로 쓰면 **가장자리에서 갈린다**(그래서 안 썼다)', `갈린 칸 ${clash}`);
  }
  // ⓔ 소스 계수 — 손잡이 하나 · 단계 함수 하나씩 · T375 흡수
  {
    const Z2 = codeOnly(Z);
    ok(/const T385_ONE_SWEEP = process\.env\.T385_ONE_SWEEP !== '0';/.test(Z2), "⑨-e 손잡이는 `T385_ONE_SWEEP` 하나 · **기본 켬**(T421 ⓪ · 되돌림 `=0`)");
    for (const f of ['_inputTOStep', '_stairStepP', '_fallStepP', '_gaugeStep', '_hpRegenStep', '_gaugeNetStep'])
      ok((Z2.match(new RegExp('function ' + f + '\\(', 'g')) || []).length === 1, `⑨-e 단계 \`${f}\` 는 **하나**다(끔·켬이 같은 함수)`);
    ok(!/T375_ACTIVE_FLAG|_t375Refresh|_isActive\(|_activeGen/.test(Z2), '⑨-e ★T375 손잡이는 **흡수됐다**(필드·새 순회·손잡이 0)');
    ok((Z2.match(/if \(!T385_ONE_SWEEP\) for \(const p of players\.values\(\)\)/g) || []).length === 6,
       '⑨-e 끔 순회는 **여섯 줄 그대로**(입력·계단·낙하·게이지·HP·방송 — `spatial` 은 격자 함수 안)', `${(Z2.match(/if \(!T385_ONE_SWEEP\) for \(const p of players\.values\(\)\)/g) || []).length}줄`);
    ok(/rebuildSpatialIndex\(T385_ONE_SWEEP \? now : undefined\)/.test(Z2), '⑨-e 앞 묶음 — 켬이면 격자 바퀴가 입력 타임아웃을 싣는다');
  }
  console.log('    접점: T385_ONE_SWEEP · rebuildSpatialIndex · _inputTOStep · stepStairFor · findStairBuildingForCell · stairCellCache · _stairKey · processFalling · _gaugeStep · _hpRegenStep · _gaugeNetStep · isPositionActive');
}

// =============================================================================
// ⑩ T381_PATH_DEAD — **못 갈 칸엔 길을 안 묻는다** [T381 ②]
// =============================================================================
// ★왜 [T381 · 보고/T381_2026-09-25.md]
//   T370 이 "A\* 갈래의 90.9 % 는 `pfFindPath` 한 번"이라 했고, T381 ① 이 **그 한 번의 안**을 셌다:
//   호출의 **37.3 % 가 `maxCells` 1500 을 다 태우고 null** 이고 그 갈래가 **시간의 92.9 %** 다
//   (한 번 6.42ms · 찾은 호출 0.485ms). 그 절반은 **목표 칸이 애초에 못 가는 칸**이다 —
//   그 89 %는 생활 층이 넘긴 결정의 ⑤ 배회(`npcWorkX ± 80`)이고, 주민 10.8 %의 일터가 물·바위다
//   (`villages.js` 태어나기 도넛 · 지형 안 봄 · 회부). 어부는 0 이다(생활 층이 물가 셀만 고른다).
//
// ★★그리고 이 자가 **결함 하나를 더 찾았다**(처음엔 "켬도 비트 동일"이라 적었다가 자에 걸렸다):
//   `localPath` 는 **끝점이 막혔는지 안 본다**. 그런데 커널이 왕복 대칭을 위해 **끝점을 사전순으로
//   정규화**하므로(`_searchBegin` 의 `rev`), 막힌 목표가 사전순으로 앞서면 탐색이 **그 막힌 칸에서
//   출발**한다 — 출발 칸은 아무도 검사하지 않으므로 **길이 나온다**. 같은 질문이 끝점 순서에 따라
//   답이 갈린다. `routePath` 는 이미 `if (blocked(sx,sy) || blocked(gx,gy)) return null;` 로 막아 둔
//   자리다 — 즉 **새 규칙이 아니라 있는 규칙을 `localPath` 부르는 쪽에도 같게 댄 것**이다(사본 0).
//   ⇒ 그래서 켬은 **비트 동일이 아니다**. 이 절이 거는 것은 넷이다:
//     ⓐ 끔 = 손잡이가 한 번도 안 선다(단락 — 종전과 비트 동일)
//     ⓑ ★결함 증인 — 끔에서 막힌 목표의 답이 **끝점 사전순으로 갈린다**
//     ⓒ 켬 = 막힌 목표엔 **언제나** null(대칭이 선다)
//     ⓓ ★봉쇄 — 켬이 바꾸는 것은 **막힌 목표뿐**이다(열린 목표는 전수 비트 동일)
console.log('\n⑩ T381_PATH_DEAD — 못 갈 칸엔 길을 안 묻는다 [T381]');
{
  const { findPath: pfFindPath } = require(path.join(ROOT, 'server', 'pathfind.js'));
  const m = Z.match(/ {2}if \(T381_PATH_DEAD\) \{[\s\S]*?\n {2}\}/);
  ok(!!m, '⑩ [전제] 제품에서 손잡이 블록 **그 글자**를 떴다', m ? `${m[0].length}자` : '못 찾음');
  const blk = m ? m[0] : '';
  const ZC = codeOnly(Z);
  // ★[T394 ④ 2026-09-26] **기본 켬**으로 뒤집혔다(PM 위임 판정) — 끄는 문은 env `T381_PATH_DEAD=0` 하나다.
  ok((ZC.match(/T381_PATH_DEAD/g) || []).length === 3
     && /const T381_PATH_DEAD = process\.env\.T381_PATH_DEAD !== '0';/.test(Z)
     && !/process\.env\.T381_PATH_DEAD === '1'/.test(Z),
     '⑩ 손잡이는 `T381_PATH_DEAD` 하나 · **기본 켬**(T394 ④) · 끄는 문은 `=0` 하나 · 옛 글자(`=== \'1\'`) 0',
     `제품 자리 ${(ZC.match(/T381_PATH_DEAD/g) || []).length}개(선언 2 + 갈래 1)`);
  const PC = fs.readFileSync(path.join(ROOT, 'sim', 'path-core.js'), 'utf8');
  const PF = fs.readFileSync(path.join(ROOT, 'server', 'pathfind.js'), 'utf8');
  // ★[T394 ③] 정본은 이제 **끝점 규칙**을 가졌다(`routePath` 첫 줄과 같게) — 그러나 이 손잡이는 여전히 **부르는 쪽에만** 있다.
  ok(!/T381_PATH_DEAD/.test(PC) && !/T381_PATH_DEAD/.test(PF), '⑩ ★손잡이 글자는 `sim/path-core.js`·`server/pathfind.js` 에 0 — 손잡이는 부르는 쪽에만');
  const lits = (codeOnly(blk).match(/(?<![\w.])\d+(?![\w.])/g) || []).filter((v) => v !== '2');
  ok(lits.length === 0, '⑩ ★새 수 0 — 블록 안 숫자 리터럴이 없다(`BUILDING_SIZE`·그 절반만)', lits.join(',') || '0개');
  // 있는 규칙 — `routePath` 는 이미 끝점 막힘을 거른다. 이 카드는 그걸 `localPath` 쪽에 같게 댄 것이다.
  ok(/routePath[\s\S]{0,400}?if \(blocked\(sx, sy\) \|\| blocked\(gx, gy\)\) return null;/.test(PC),
     '⑩ ★[정본] `routePath` 에 **끝점 막힘 = null** 규칙이 이미 있다(새 규칙 0 — 같은 규칙을 걸음 쪽에 댄다)');

  // ── 판 하나 — 막힌 칸이 섞인 격자(결정론) ──────────────────────────────
  const B = 32, W = 48, H = 48;
  const BLK = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) BLK[i] = rnd() < 0.34 ? 1 : 0;
  const cell = (px) => Math.floor(px / B);
  const isWaterFn = (x, y) => { const cx = cell(x), cy = cell(y); if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true; return !!BLK[cy * W + cx]; };
  const isBlockedFn = () => false;
  const call = (sx, sy, gx, gy) => pfFindPath(sx, sy, gx, gy, { floor: 0, isBlockedFn, isWaterFn, maxCells: 1500, searchRadiusCells: 64 });
  // 제품 글자 그대로의 손잡이 — `return null;` 만 `return true;` 로 바꿔 **판정만** 꺼낸다
  const mk = (mut) => new Function('npc', 'T381_PATH_DEAD', 'BUILDING_SIZE', 'isTerrainBlockedLocal',
    (mut ? mut(blk) : blk).replace('return null;', 'return true;') + '\nreturn false;');
  const guard = mk(null);

  const SAMP = 4000;
  const pts = [];
  for (let i = 0; i < SAMP; i++) pts.push({ x: rnd() * W * B, y: rnd() * H * B, targetX: rnd() * W * B, targetY: rnd() * H * B });
  // 끝점 사전순 — `_searchBegin` 이 쓰는 그 식(셀 좌표)
  const revOf = (n) => { const sx = cell(n.x), sy = cell(n.y), gx = cell(n.targetX), gy = cell(n.targetY);
    return gx < sx || (gx === sx && gy < sy); };

  let deadN = 0, aliveN = 0, sameCellDead = 0;
  let fwdN = 0, fwdNull = 0, revN = 0, revNull = 0, aliveHit = 0;
  for (const n of pts) {
    const g = guard(n, true, B, isWaterFn);
    const r = call(n.x, n.y, n.targetX, n.targetY);
    if (g) { deadN++;
      if (revOf(n)) { revN++; if (r === null) revNull++; } else { fwdN++; if (r === null) fwdNull++; } }
    else { aliveN++; if (r !== null) aliveHit++; }
    if (cell(n.x) === cell(n.targetX) && cell(n.y) === cell(n.targetY) && isWaterFn(n.targetX, n.targetY)) sameCellDead++;
  }
  ok(deadN > 400 && aliveN > 400, '⑩ [상황] 표본 4,000에 막힌 목표/열린 목표가 **둘 다** 넉넉하다', `막힘 ${deadN} · 열림 ${aliveN}`);
  ok(aliveHit > 100, '⑩ [상황] 열린 목표는 길을 **찾기도 한다**(자명 통과 아님)', `${aliveHit}/${aliveN}`);
  ok(sameCellDead > 0, '⑩ [상황] "출발 셀 == 목표 셀인데 막힌 칸" 표본이 **있다**(미끼가 밟을 자리)', `${sameCellDead}개`);
  // ⓑ ★결함 증인 — 같은 질문이 끝점 순서로 갈린다
  ok(fwdN > 100 && revN > 100, '⑩-b [상황] 막힌 목표 표본이 **사전순 앞/뒤 양쪽**에 있다', `앞(정방향) ${fwdN} · 뒤(뒤집힘) ${revN}`);
  ok(fwdNull === fwdN, '⑩-b 사전순이 **안 뒤집히면** 막힌 목표는 언제나 null', `${fwdNull}/${fwdN}`);
  // ★[T394 ③] 결함은 **고쳐졌다** — 어댑터가 `localPath` 에 끝점 규칙(`blocked`)을 넘기므로 뒤집혀도 null 이다.
  ok(revNull === revN, '⑩-b ★★★[T394 ③] 사전순이 **뒤집혀도** 막힌 목표엔 길이 **안 난다**(끝점 규칙 · 비대칭 0)', `${revNull}/${revN}`);
  // 미끼 — 규칙을 **안 넘기고** 커널을 직접 부르면 결함이 되살아난다(자가 규칙을 실제로 본다)
  const PCk = require(path.join(ROOT, 'sim', 'path-core.js'));
  let revRaw = 0;
  for (const n of pts) {
    if (!isWaterFn(n.targetX, n.targetY) || !revOf(n)) continue;
    const bs = (fx, fy, tx, ty) => isWaterFn(tx * B + B / 2, ty * B + B / 2);
    if (PCk.localPath(cell(n.x), cell(n.y), cell(n.targetX), cell(n.targetY), { blockedStep: bs, maxNodes: 1500, radius: 64 })) revRaw++;
  }
  ok(revRaw > revN * 0.2, '★⑩-b 자명 통과 금지 — 끝점 규칙을 **빼고** 부르면 뒤집힌 막힌 목표에 **길이 다시 난다**(결함 증인 · T381 그대로)',
     `뒤집힌 표본 ${revN} 중 ${revRaw}(${(revRaw / revN * 100).toFixed(1)}%)`);

  // ⓒ/ⓓ — 켬의 답과 봉쇄
  const eq = (a, b) => {
    if (a === null || b === null) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameF64(a[i].x, b[i].x) || !sameF64(a[i].y, b[i].y)) return false;
    return true;
  };
  const sweep = (g) => { let deadNotNull = 0, aliveDiff = 0, skip = 0;
    for (const n of pts) {
      const off = call(n.x, n.y, n.targetX, n.targetY);
      const fired = g(n, true, B, isWaterFn);
      const on = fired ? (skip++, null) : call(n.x, n.y, n.targetX, n.targetY);
      const dead = isWaterFn(n.targetX, n.targetY);
      const sameCell = cell(n.x) === cell(n.targetX) && cell(n.y) === cell(n.targetY);
      if (dead && !sameCell) { if (on !== null) deadNotNull++; }
      else if (!dead && !eq(off, on)) aliveDiff++;
    }
    return { deadNotNull, aliveDiff, skip }; };
  const r1 = sweep(guard);
  ok(r1.deadNotNull === 0, '⑩-c ★★★켬 = **막힌 목표엔 언제나 null**(대칭이 선다 — 끝점 순서가 답을 안 가른다)', `길이 난 것 ${r1.deadNotNull}/${deadN - sameCellDead}`);
  // ★유일한 예외("출발 셀 == 목표 셀")는 **`computeNpcPath` 가 못 닿는 자리**다 — 그래서 뺀다.
  //   32px 셀 안의 두 점은 아무리 멀어도 대각선 √2·32 = 45.25px 이고, 그 앞의 `d < 48` 갈래가 이미 돌려보낸 뒤다.
  const cm = Z.match(/ {2}const d = Math\.hypot\(npc\.targetX - npc\.x, npc\.targetY - npc\.y\);\n {2}if \(d < (\d+)\)/);
  ok(!!cm && Math.SQRT2 * 32 < Number(cm[1]),
     '⑩-c2 ★그 예외는 `computeNpcPath` 가 **못 닿는 자리**다 — 같은 셀이면 거리 ≤ √2·32 이고 앞선 `d < 48` 갈래가 이미 돌려보낸 뒤다',
     cm ? `셀 대각선 ${(Math.SQRT2 * 32).toFixed(2)}px < 제품의 ${cm[1]}px` : '앞 갈래를 못 찾음');
  ok(r1.aliveDiff === 0, '⑩-d ★★★**봉쇄** — 켬이 바꾸는 것은 막힌 목표뿐이다(열린 목표 전수 비트 동일)', `다른 표본 ${r1.aliveDiff}/${aliveN}`);
  ok(r1.skip > 400, '⑩ ★켬이 **실제로 A\\* 를 건너뛴다**', `${r1.skip}회`);
  const off0 = pts.filter((n) => guard(n, false, B, isWaterFn)).length;
  ok(off0 === 0, '⑩-a ★★끔이면 손잡이가 **한 번도 안 선다**(단락 — 종전과 비트 동일)', `${off0}회`);

  // ── 자명 통과 금지 — 비틀면 반드시 깨진다 ──────────────────────────────
  const rs = sweep(mk((b) => b.replace(/\(_gcx !== Math\.floor\(npc\.x \/ BUILDING_SIZE\) \|\| _gcy !== Math\.floor\(npc\.y \/ BUILDING_SIZE\)\)\n\s*&& /, '')));
  ok(rs.deadNotNull === 0 && rs.skip > r1.skip,
     '★⑩ 자명 통과 금지 ①(전제) — 같은-셀 예외를 빼면 **더 많이 건너뛴다**(그 자리는 `findPath` 가 탐색 없이 답을 주는 자리다)', `건너뜀 ${r1.skip} → ${rs.skip}`);
  const rsSame = pts.filter((n) => cell(n.x) === cell(n.targetX) && cell(n.y) === cell(n.targetY) && isWaterFn(n.targetX, n.targetY))
    .filter((n) => call(n.x, n.y, n.targetX, n.targetY) !== null).length;
  ok(rsSame > 0, '★⑩ 자명 통과 금지 ②(미끼가 밟는다) — 같은 셀이면 막힌 칸이라도 `findPath` 가 **답을 준다**', `${rsSame}개`);
  const rp = sweep(mk((b) => b.replace(/isTerrainBlockedLocal\([^)]*\)\)/, 'true)')));
  ok(rp.aliveDiff > 0, '★⑩ 자명 통과 금지 ③ — **술어를 비틀면**(항상 참) 열린 목표까지 갈린다 — 자가 정본 술어를 실제로 본다', `열린 목표 다른 표본 ${rp.aliveDiff}`);
  console.log('    접점: T381_PATH_DEAD · computeNpcPath · pfFindPath · localPath · isTerrainBlockedLocal · BUILDING_SIZE · maxCells 1500');
}

// =============================================================================
// ⑪ T394 ①② — **몸 비비기의 뿌리 둘**: 일터 도넛에 지형 · ⑤ 배회 목표 되짚기 [T394]
// =============================================================================
// ★왜 [T394 · 보고/T394_2026-09-26.md] T381 이 쟀다 — 주민 159/1,476(10.8 %)의 일터(`npcWorkX/Y` · 회관 둘레 180~320px
//   도넛)가 물·바위였고, 막힌 목표의 89 %가 그 일터 ±80 에서 나왔다(생활 층이 넘긴 결정의 ⑤ 배회).
//   ① `villages.js` 태어나기: 도넛 후보를 A* 의 그 술어(`isTerrainBlockedLocal` · 셀 중심)로 거르고, 막히면 **같은 씨 흐름**으로
//      다시 뽑는다(상한 = 도넛 바깥 둘레 셀 수 63) · 다 막히면 남문 앞 마당.
//   ② `zone.js` ⑤: 목표 셀이 막혔으면 **일터 쪽으로 32px 씩 되짚어** 첫 열린 칸으로(새 탐색 0 · 주사위 0).
//   이 절이 거는 것: ⓐ 끔 = 종전 비트 동일 ⓑ 첫 점이 열린 몸은 켬도 **비트 동일**(흐름도 안 민다) ⓒ 켬 = 막힌 일터 0
//     ⓓ 몸 자리 굴림 순서 무변 ⓔ ② 열린 목표 무변 · 막힌 목표는 선분 위 첫 열린 칸 · 주사위 0 ⓕ 미끼.
console.log('\n⑪ T394 ①② — 일터 도넛에 지형 · ⑤ 목표 되짚기 [T394]');
{
  const S = require(path.join(ROOT, 'server', 'seed-rand.js'));
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const bodyV = (name) => {
    const i = V.indexOf('function ' + name + '(');
    if (i < 0) return '';
    let d = 0, j = V.indexOf('{', i);
    for (let k = j; k < V.length; k++) { if (V[k] === '{') d++; else if (V[k] === '}') { d--; if (!d) return V.slice(i, k + 1); } }
    return '';
  };
  const wsSrc = bodyV('_t394WorkSite'), blSrc = bodyV('_t394Blocked'), spSrc = bodyV('spawnOneNpc');
  ok(wsSrc.length > 200 && blSrc.length > 50 && spSrc.length > 500, '⑪ [전제] 제품에서 **그 글자** 셋을 떴다(일터 고르기 · 막힘 술어 · 태어나기)',
     `${wsSrc.length} · ${blSrc.length} · ${spSrc.length}자`);
  const tries = V.match(/const _T394_TRIES = Math\.ceil\(2 \* Math\.PI \* \(180 \+ 140\) \/ SZ\);/);
  ok(!!tries && Math.ceil(2 * Math.PI * 320 / 32) === 63, '⑪ ★새 수 0 — 시도 상한은 **도넛 바깥 둘레 셀 수**(2π·(180+140)/32 = 63 · 180·140 은 도넛 그 수)');
  ok(/const T394_WORK_TERRAIN = process\.env\.T394_WORK_TERRAIN !== '0';/.test(V) && /const T394_WORK_TERRAIN = process\.env\.T394_WORK_TERRAIN !== '0';/.test(Z),
     '⑪ 손잡이 `T394_WORK_TERRAIN` 하나(두 파일이 같은 env 를 읽는다) · **기본 켬** · 되돌림 `=0`');
  // ⓓ 몸 자리 굴림 순서 — wAng · wR · 몸 x · 몸 y 다음에 일터(다시 뽑기는 그 뒤)
  const iA = spSrc.indexOf('const wAng = _dv()'), iB = spSrc.indexOf('const bodyX = hx + (_dv() - 0.5) * 60, bodyY = hy + (_dv() - 0.5) * 60;'), iW = spSrc.indexOf('_t394WorkSite(vil, cxPx, cyPx, wAng, wR)');
  ok(iA > 0 && iB > iA && iW > iB && /x: bodyX,\s*\n\s*y: bodyY,/.test(spSrc),
     '⑪-d ★몸 자리 굴림은 **종전 순서 그대로**(셋째·넷째) — 일터 다시 뽑기는 그 **뒤** 흐름을 쓴다(몸·pid·집·침대 무변)');
  // 판 — 모의 지형(가로 줄 강: 5칸마다 2칸 물) · 도넛이 반쯤 강에 걸리게
  const SZ = 32;
  const river = (x, y) => { const r = Math.floor(y / SZ); return ((r % 5) + 5) % 5 >= 3; };
  const mk = (on, pred, T = 63) => {
    const st = S.makeStream();
    const state = { deps: { isTerrainBlockedLocal: pred } };
    const stat = { spawn: 0, first: 0, redraw: 0, yard: 0 };
    const f = new Function('state', 'SZ', '_dv', 'T394_WORK_TERRAIN', '_T394_TRIES', '_t394Stat',
      blSrc + '\n' + wsSrc + '\nreturn _t394WorkSite;')(state, SZ, st.next, on, T, stat);
    return { f, st, stat };
  };
  const N = 5000, vil = { ccx: 300, ccy: 300 }, cx = 300 * SZ + 16, cy = 300 * SZ + 16;
  const run = (on, pred) => {
    const M = mk(on, pred); const out = [];
    for (let i = 0; i < N; i++) {
      M.st.seed(0x394 + i * 7919);
      const wAng = M.st.next() * Math.PI * 2, wR = 180 + M.st.next() * 140;
      const bx = M.st.next(), by = M.st.next();                 // 몸 자리 두 굴림(종전 셋째·넷째)
      const w = M.f(vil, cx, cy, wAng, wR);
      out.push({ x: w.x, y: w.y, first: !pred(Math.floor((cx + Math.cos(wAng) * wR) / SZ) * SZ + 16, Math.floor((cy + Math.sin(wAng) * wR) / SZ) * SZ + 16),
                 old: { x: cx + Math.cos(wAng) * wR, y: cy + Math.sin(wAng) * wR }, next: M.st.next(), bx, by });
    }
    return { out, stat: M.stat };
  };
  const cellBlk = (p, pred) => pred(Math.floor(p.x / SZ) * SZ + 16, Math.floor(p.y / SZ) * SZ + 16);
  const OFF = run(false, river), ON = run(true, river);
  let offDiff = 0; for (const o of OFF.out) if (!sameF64(o.x, o.old.x) || !sameF64(o.y, o.old.y)) offDiff++;
  ok(offDiff === 0, '⑪-a ★★끔 = **종전 식과 비트 동일**(도넛 첫 점 그대로)', `다른 표본 ${offDiff}/${N}`);
  const oldDead = OFF.out.filter((o) => cellBlk(o, river)).length, newDead = ON.out.filter((o) => cellBlk(o, river)).length;
  ok(oldDead > N * 0.2, '⑪ [상황] 모의 강이 도넛에 **넉넉히** 걸렸다(끔의 막힌 일터가 많다 — 0 이면 자명 통과)', `${oldDead}/${N}`);
  ok(newDead === 0, '⑪-c ★★★켬 = **막힌 일터 0**(같은 도넛 · 같은 흐름에서 다시 뽑았다)', `${oldDead} → ${newDead}`);
  let firstSame = 0, firstN = 0, firstStream = 0;
  for (let i = 0; i < N; i++) { const a = ON.out[i], b = OFF.out[i]; if (!a.first) continue; firstN++;
    if (sameF64(a.x, b.x) && sameF64(a.y, b.y)) firstSame++; if (a.next === b.next) firstStream++; }
  ok(firstN > N * 0.3 && firstSame === firstN && firstStream === firstN,
     '⑪-b ★★★첫 점이 열린 몸은 켬도 **비트 동일** — 일터도, 뒤따르는 흐름도 한 자도 안 민다', `${firstSame}/${firstN} · 흐름 ${firstStream}/${firstN}`);
  let bodySame = 0; for (let i = 0; i < N; i++) if (ON.out[i].bx === OFF.out[i].bx && ON.out[i].by === OFF.out[i].by) bodySame++;
  ok(bodySame === N, '⑪-d 몸 자리 두 굴림은 켬/끔이 **같다**(다시 뽑기는 그 뒤에서만)', `${bodySame}/${N}`);
  ok(ON.stat.redraw === oldDead && ON.stat.yard === 0, '⑪ [표] 다시 뽑아 열린 곳을 찾은 수 = 막혔던 수 · 마당 폴백 0', `다시 뽑기 ${ON.stat.redraw} · 마당 ${ON.stat.yard}`);
  // 온 땅이 막히면 — 마당 폴백
  const ALL = run(true, () => true);
  ok(ALL.stat.yard === N && ALL.out.every((o) => o.x === vil.ccx * SZ + SZ / 2 && o.y === (vil.ccy + 6) * SZ + SZ / 2),
     '⑪ ★온 도넛이 막히면 **남문 앞 마당**(집 폴백과 같은 점 `(ccx, ccy+6)`)', `마당 ${ALL.stat.yard}/${N}`);
  // 미끼 — 술어를 안 보는 꼴로 비틀면 막힌 일터가 되살아난다
  const BAD = (() => { const M = mk(true, () => false); const r = []; for (let i = 0; i < N; i++) { M.st.seed(0x394 + i * 7919);
    const wAng = M.st.next() * Math.PI * 2, wR = 180 + M.st.next() * 140; M.st.next(); M.st.next(); r.push(M.f(vil, cx, cy, wAng, wR)); } return r; })();
  ok(BAD.filter((o) => cellBlk(o, river)).length === oldDead, '★⑪ 자명 통과 금지 — 술어가 늘 거짓이면(= 안 보면) 막힌 일터가 **그대로 남는다**',
     `${BAD.filter((o) => cellBlk(o, river)).length}/${N}`);

  // ② — ⑤ 배회 목표 되짚기(zone.js)
  const otSrc = body('_t394OpenTarget');
  ok(otSrc.length > 200 && !/_dn\(|_dt\(|_dl\(|_dv\(|Math\.random/.test(otSrc), '⑪-e [전제] 되짚기 함수를 떴다 · ★주사위 0(흐름 무소비)', `${otSrc.length}자`);
  const ds = body('decideNpcBehavior');
  ok(/npc\.targetY = npc\.npcWorkY \+ \(_dn\(\) - 0\.5\) \* 160;\n\s*\}\n\s*if \(T394_WORK_TERRAIN\) _t394OpenTarget\(npc, npc\.npcWorkX, npc\.npcWorkY\);/.test(ds),
     '⑪-e 되짚기는 ⑤ 의 **두 굴림 뒤**에만 선다(일터 ±50/80 을 뽑은 다음 줄 · 켬일 때만)');
  const OT = new Function('BUILDING_SIZE', 'isTerrainBlockedLocal', otSrc + '\nreturn _t394OpenTarget;')(32, river);
  let untouched = 0, openN = 0, moved = 0, deadN = 0, onSeg = 0, stuck = 0;
  for (let i = 0; i < 20000; i++) {
    const ax = 5000 + (i % 97) * 3, ay = 5000 + ((i * 37) % 400);                 // 일터(열림/막힘 섞임)
    const tx = ax + ((i * 7919) % 160) - 80, ty = ay + ((i * 104729) % 160) - 80;  // ⑤ 상자 ±80
    const n = { targetX: tx, targetY: ty };
    const wasDead = river(Math.floor(tx / 32) * 32 + 16, Math.floor(ty / 32) * 32 + 16);
    const anchorOpen = !river(Math.floor(ax / 32) * 32 + 16, Math.floor(ay / 32) * 32 + 16);
    const r = OT(n, ax, ay);
    if (!wasDead) { openN++; if (!r && n.targetX === tx && n.targetY === ty) untouched++; continue; }
    if (!anchorOpen) continue;
    deadN++;
    if (r && !river(Math.floor(n.targetX / 32) * 32 + 16, Math.floor(n.targetY / 32) * 32 + 16)) moved++;
    const cr = (n.targetX - tx) * (ay - ty) - (n.targetY - ty) * (ax - tx);          // 선분 위(외적 0)
    const along = (n.targetX - tx) * (ax - tx) + (n.targetY - ty) * (ay - ty);
    if (Math.abs(cr) < 1e-6 * (1 + Math.hypot(ax - tx, ay - ty) ** 2) && along >= 0 && along <= (ax - tx) ** 2 + (ay - ty) ** 2 + 1e-9) onSeg++;
  }
  ok(openN > 5000 && untouched === openN, '⑪-e ★★열린 목표는 **안 건드린다**(비트 동일)', `${untouched}/${openN}`);
  ok(deadN > 2000 && moved === deadN, '⑪-e ★★★막힌 목표는 **전부 열린 칸으로**(일터가 열려 있으면)', `${moved}/${deadN}`);
  ok(onSeg === deadN, '⑪-e 옮긴 자리는 **목표→일터 선분 위**다(되짚기 · 새 탐색 0)', `${onSeg}/${deadN}`);
  const yA = 158 * 32 + 5, yB = 159 * 32 + 5;                                        // 줄 158·159 = 모의 강(%5 ≥ 3) — 선분 전체가 물
  ok(river(5000, yA) && river(5100, yB), '⑪-e [상황] 목표·일터·그 사이가 전부 막힌 판을 골랐다');
  const nS = { targetX: 5000, targetY: yA };
  const rS = OT(nS, 5100, yB);
  ok(rS === false && nS.targetX === 5000 && nS.targetY === yA, '⑪-e 일터마저 막혔으면 목표를 **그대로** 둔다(beeline 안 넣는다 · T381 §4-5)');
  const OTbad = new Function('BUILDING_SIZE', 'isTerrainBlockedLocal', otSrc.replace('if (!blk(x, y))', 'if (true)') + '\nreturn _t394OpenTarget;')(32, river);
  let badDead = 0;
  for (let i = 0; i < 2000; i++) { const ax = 5000 + (i % 97) * 3, ay = 5000 + ((i * 37) % 400), n = { targetX: ax + ((i * 7919) % 160) - 80, targetY: ay + ((i * 104729) % 160) - 80 };
    if (!river(Math.floor(n.targetX / 32) * 32 + 16, Math.floor(n.targetY / 32) * 32 + 16)) continue; OTbad(n, ax, ay);
    if (river(Math.floor(n.targetX / 32) * 32 + 16, Math.floor(n.targetY / 32) * 32 + 16)) badDead++; }
  ok(badDead > 0, '★⑪-e 자명 통과 금지 — 되짚기가 술어를 **안 보면**(첫 걸음에 멈추면) 막힌 목표가 남는다', `${badDead}건`);
  console.log(`    [표] ① 막힌 일터 ${oldDead} → ${newDead}(다시 뽑기 ${ON.stat.redraw} · 마당 ${ON.stat.yard}) · 첫 점 열린 몸 비트 동일 ${firstSame}/${firstN} · ② 막힌 목표 ${deadN} → 0 · 열린 목표 무변 ${untouched}/${openN}`);
  console.log('    접점: npcWorkX · npcWorkY · isTerrainBlockedLocal · decideNpcBehavior · _t394WorkSite · _t394OpenTarget · T394_WORK_TERRAIN · seed-rand');
}

// =============================================================================
// ⑫ T399 ② — 튕김 도약이 강으로 뛰지 않는다 [T399]
// =============================================================================
// ★왜 [T399 · 보고/T399_2026-09-26.md] T394 뒤 남은 막힌 목표 여행 548 의 94 %가 `unstuckNpc` 의 무작위 도약(±80px)이었다.
//   ⇒ 도약 점이 막혔으면 T394 의 **그 되짚기 함수**(`_t394OpenTarget` · 사본 0)로 **제 몸 쪽** 첫 열린 점으로.
//   거는 것: ⓐ 끔 = 종전 비트 동일 ⓑ 켬 = 막힌 도약 0(몸 칸이 열려 있으면) ⓒ 주사위 한 알 그대로(흐름 무소비)
//     ⓓ 열린 도약은 안 건드린다 ⓔ 되짚기는 도약 점을 정한 **다음 줄** · 결정 시각 앞 ⓕ 미끼.
console.log('\n⑫ T399 ② — 튕김 도약이 강으로 뛰지 않는다 [T399]');
{
  const S = require(path.join(ROOT, 'server', 'seed-rand.js'));
  const us = body('unstuckNpc'), ot = body('_t394OpenTarget');
  ok(us.length > 400 && ot.length > 200, '⑫ [전제] 제품에서 **그 글자** 둘을 떴다(튕겨냄 · 되짚기)', `${us.length} · ${ot.length}자`);
  ok(/npc\.targetY = npc\.y \+ Math\.sin\(ang\) \* 80;[\s\S]{0,700}?if \(T394_WORK_TERRAIN\) _t394OpenTarget\(npc, npc\.x, npc\.y\);\n\s*npc\.nextDecisionAt = now \+ 800;/.test(us),
     '⑫-e 되짚기는 도약 점을 정한 **다음 줄**이고 결정 시각 **앞**이다(제 몸 쪽으로)');
  const SZ = 32;
  const river = (x, y) => { const c = Math.floor(x / SZ); return ((c % 6) + 6) % 6 >= 4; };   // 6칸마다 2칸 물(세로 줄)
  const mk = (on, pred) => {
    const dn = S.makeStream();
    const env = { _diceNpc: dn, _SEED: S, _shOf: (o) => S.pidHash(o.playerId), BUILDING_SIZE: SZ, zoneGameDay: () => 3, _tick: { n: 77 },
      _dn: dn.next, T394_WORK_TERRAIN: on, isTerrainBlockedLocal: pred };
    const keys = Object.keys(env);
    const f = new Function(...keys, ot + '\n' + us + '\nreturn unstuckNpc;')(...keys.map((k) => env[k]));
    return { f, dn };
  };
  const N = 6000;
  const run = (on, pred) => {
    const M = mk(on, pred), out = [];
    for (let i = 0; i < N; i++) {
      // 몸은 열린 칸(물 줄 밖)에만 세운다 — 콜라이더 계약(T381 실측: 막힌 칸 안에 선 몸 0) · 자리는 **세계**(모의 강)가 정한다
      let x = 1000 + (i * 7919 % 3000), y = 1000 + (i * 104729 % 3000);
      while (river(Math.floor(x / SZ) * SZ + 16, Math.floor(y / SZ) * SZ + 16)) x += SZ;
      const npc = { playerId: 'npc_u_' + i, x, y, simVillageId: null, targetX: x + 5, targetY: y, _stuckN: 5 };
      M.f(npc, 1000);
      out.push({ tx: npc.targetX, ty: npc.targetY, x, y, next: M.dn.next() });
    }
    return out;
  };
  const OFF = run(false, river), ON = run(true, river);
  const cellBlk = (x, y) => river(Math.floor(x / SZ) * SZ + 16, Math.floor(y / SZ) * SZ + 16);
  const deadOff = OFF.filter((o) => cellBlk(o.tx, o.ty)).length, deadOn = ON.filter((o) => cellBlk(o.tx, o.ty)).length;
  // ⓐ 끔 = 종전 식 — 제품 글자에서 되짚기 줄만 지운 판과 견준다
  const usOld = us.replace(/\n\s*\/\/ ★★\[T399 ②[\s\S]*?if \(T394_WORK_TERRAIN\) _t394OpenTarget\(npc, npc\.x, npc\.y\);/, '');
  ok(usOld !== us && !/_t394OpenTarget/.test(usOld), '⑫ [전제] 종전 꼴을 제품 글자에서 **되짚기 줄만** 지워 되살렸다(대조군)');
  const OLD = (() => { const dn = S.makeStream(); const env = { _diceNpc: dn, _SEED: S, _shOf: (o) => S.pidHash(o.playerId), BUILDING_SIZE: SZ, zoneGameDay: () => 3, _tick: { n: 77 }, _dn: dn.next };
    const keys = Object.keys(env); const f = new Function(...keys, usOld + '\nreturn unstuckNpc;')(...keys.map((k) => env[k]));
    return OFF.map((o, i) => { const npc = { playerId: 'npc_u_' + i, x: o.x, y: o.y, simVillageId: null, targetX: o.x + 5, targetY: o.y, _stuckN: 5 }; f(npc, 1000); return { tx: npc.targetX, ty: npc.targetY, next: dn.next() }; }); })();
  let offDiff = 0; for (let i = 0; i < N; i++) if (!sameF64(OFF[i].tx, OLD[i].tx) || !sameF64(OFF[i].ty, OLD[i].ty) || OFF[i].next !== OLD[i].next) offDiff++;
  ok(offDiff === 0, '⑫-a ★★끔 = **종전과 비트 동일**(도약 점 · 뒤따르는 흐름)', `다른 표본 ${offDiff}/${N}`);
  ok(deadOff > N * 0.15, '⑫ [상황] 모의 강 위로 뛰는 도약이 **넉넉하다**(0 이면 자명 통과)', `${deadOff}/${N}`);
  ok(deadOn === 0, '⑫-b ★★★켬 = **막힌 도약 0**(몸 칸이 열려 있으므로 되짚기는 언제나 끝난다)', `${deadOff} → ${deadOn}`);
  let streamSame = 0, openSame = 0, openN = 0;
  for (let i = 0; i < N; i++) { if (ON[i].next === OFF[i].next) streamSame++;
    if (!cellBlk(OFF[i].tx, OFF[i].ty)) { openN++; if (sameF64(ON[i].tx, OFF[i].tx) && sameF64(ON[i].ty, OFF[i].ty)) openSame++; } }
  ok(streamSame === N, '⑫-c ★주사위 **한 알 그대로** — 켬/끔 뒤따르는 흐름이 같다', `${streamSame}/${N}`);
  ok(openN > N * 0.5 && openSame === openN, '⑫-d ★★열린 도약은 **안 건드린다**(비트 동일)', `${openSame}/${openN}`);
  let shorter = 0; for (let i = 0; i < N; i++) { if (!cellBlk(OFF[i].tx, OFF[i].ty)) continue;
    if (Math.hypot(ON[i].tx - ON[i].x, ON[i].ty - ON[i].y) <= 80 + 1e-9) shorter++; }
  ok(shorter === deadOff, '⑫-b 옮긴 도약은 **제 몸 쪽**이다(도약 거리 80px 이하)', `${shorter}/${deadOff}`);
  const BAD = run(true, () => false);
  ok(BAD.filter((o) => cellBlk(o.tx, o.ty)).length === deadOff, '★⑫ 자명 통과 금지 — 술어가 늘 거짓이면(= 안 보면) 막힌 도약이 **그대로 남는다**');
  console.log(`    [표] 도약 ${N} · 막힌 도약 ${deadOff} → ${deadOn} · 열린 도약 무변 ${openSame}/${openN} · 흐름 ${streamSame}/${N}`);
  console.log('    접점: unstuckNpc · _t394OpenTarget · T394_WORK_TERRAIN · isTerrainBlockedLocal · _dn');
}

// =============================================================================
// ⑬ T399_CELL_CAP — **상한 하나**: 칸 예산은 반경에서 난다(반경 원의 절반) [T399 ③]
// =============================================================================
// ★왜 [T399 · 보고/T399_2026-09-26.md] T394 뒤 A* 시간의 81~85 %가 "1500 × 뭍"(목표 칸은 열렸는데 1,500칸을 다 태우고 null).
//   예산 없이 다시 돌리면 **전부 닿는다**(필요 칸 p50 3,643 · 최대 5,584 · 다리를 도는 우회). 반경 64 는 그 우회를 허락하는데
//   예산 1,500 이 막았다 — 두 상한이 서로를 몰랐다. ⇒ 켬: 예산 = ⌈π·R²/2⌉(반원 — 우회는 직선의 한쪽으로 돈다).
//   거는 것: ⓐ 손잡이 하나 · 기본 끔 · 끔 = 종전 수(1500·200) ⓑ 켬 = 반원(6,434·905) · 새 수 0 ⓒ 예산 안의 질문은 켬/끔 **비트 동일**
//     ⓓ 1,500 을 넘는 우회를 켬은 **찾는다**(진짜 `pfFindPath` · 물 벽 + 먼 다리) · 길은 물을 안 밟는다 ⓔ 반원을 넘는 우회는 둘 다 null(최악이 묶인다)
//     ⓕ 미끼 — 켬의 예산을 1,500 으로 비틀면 ⓓ 가 깨진다.
console.log('\n⑬ T399_CELL_CAP — 상한 하나(칸 예산 = 반경 원의 절반) [T399]');
{
  const { findPath: pf } = require(path.join(ROOT, 'server', 'pathfind.js'));
  ok(/const T399_CELL_CAP = process\.env\.T399_CELL_CAP === '1';/.test(Z) && (codeOnly(Z).match(/T399_CELL_CAP/g) || []).length === 3,
     '⑬-a 손잡이 `T399_CELL_CAP` 하나 · **기본 끔**(env 가 그 글자일 때만 참 · 제품 자리 선언 2 + 갈래 1)');
  const cn = body('computeNpcPath');
  const mR = cn.match(/const _pfR = isVil \? (\d+) : (\d+);/);
  const mC = cn.match(/maxCells: (T399_CELL_CAP \? Math\.ceil\(Math\.PI \* _pfR \* _pfR \/ 2\) : \(isVil \? 1500 : 200\)),/);
  ok(!!mR && !!mC && /searchRadiusCells: _pfR,/.test(cn), '⑬ [전제] 제품에서 반경 한 줄 · 예산 식 · 반경 넘기기 **그 글자**를 떴다');
  const cap = new Function('T399_CELL_CAP', 'isVil', '_pfR', `return (${mC ? mC[1] : '0'});`);
  const R1 = mR ? +mR[1] : 0, R0 = mR ? +mR[2] : 0;
  ok(R1 === 64 && R0 === 24 && cap(false, true, R1) === 1500 && cap(false, false, R0) === 200,
     '⑬-a ★★끔 = **종전 수 그대로**(주민 1,500 · 비주민 200 · 반경 64 · 24)', `${cap(false, true, R1)} · ${cap(false, false, R0)}`);
  ok(cap(true, true, R1) === 6434 && cap(true, false, R0) === 905 && Math.ceil(Math.PI * 64 * 64 / 2) === 6434,
     '⑬-b ★켬 = **반원** ⌈π·R²/2⌉ — 주민 6,434 · 비주민 905(새 수 0 — 반경과 원의 넓이 · 한쪽)', `${cap(true, true, R1)} · ${cap(true, false, R0)}`);
  // ── 판: **주머니 강**(U 자 물길 — 출발은 주머니 안, 목표는 바로 건너편) · 우회는 주머니 입구로 나가 돌아온다(다리를 도는 꼴)
  const B = 32, cellOf = (p) => Math.floor(p / B);
  const pocket = (top, bot, left, right) => ({ isWaterFn: (x, y) => { const cx = cellOf(x), cy = cellOf(y);
    if (cx < 0 || cy < 0 || cx >= 300 || cy >= 300) return true;
    if (cx === right && cy >= top && cy <= bot) return true;
    return (cy === top || cy === bot) && cx >= left && cx <= right; } });
  const call = (w, sx, sy, gx, gy, mc) => pf(sx * B + 16, sy * B + 16, gx * B + 16, gy * B + 16, { floor: 0, isBlockedFn: () => false, isWaterFn: w.isWaterFn, maxCells: mc, searchRadiusCells: 64 });
  const W1 = pocket(112, 188, 122, 155);          // 주머니 76 × 33 · 출발 (145,150) · 목표 (165,150) = 강 건너 20칸
  const offP = call(W1, 145, 150, 165, 150, cap(false, true, 64)), sqP = call(W1, 145, 150, 165, 150, 64 * 64), onP = call(W1, 145, 150, 165, 150, cap(true, true, 64));
  const wet = (w, p) => p && p.some((q) => w.isWaterFn(q.x, q.y));
  ok(offP === null, '⑬-d [상황] 끔(1,500)은 이 우회를 **못 찾는다** — "1500 × 뭍" 을 판에 세웠다', offP ? '찾음' : 'null');
  ok(sqP === null, '⑬-d [표] 반경²(4,096 · `pathfind.js` 기본)도 **모자란다** — 실측 55 %만 닿던 그 자리', sqP ? '찾음' : 'null');
  ok(onP !== null && !wet(W1, onP), '⑬-d ★★★켬(반원 6,434)은 **찾는다** — 길은 물을 안 밟고 주머니 입구로 돈다', onP ? `웨이포인트 ${onP.length}` : 'null');
  // ⓔ 닫힌 주머니(사방 물 · 안 넓이 > 반원) — 둘 다 null 이고 켬도 **반원 칸에서 멈춘다**(최악이 묶인다)
  const ring = { isWaterFn: (x, y) => { const cx = cellOf(x), cy = cellOf(y); if (cx < 0 || cy < 0 || cx >= 300 || cy >= 300) return true;
    return ((cx === 100 || cx === 200) && cy >= 100 && cy <= 200) || ((cy === 100 || cy === 200) && cx >= 100 && cx <= 200); } };
  const t0 = Date.now(); const rOff = call(ring, 150, 150, 210, 150, 1500); const rOn = call(ring, 150, 150, 210, 150, cap(true, true, 64)); const dt = Date.now() - t0;
  ok(rOff === null && rOn === null, '⑬-e 닫힌 주머니(안 넓이 9,801 > 반원) — 켬/끔 **둘 다 null** · 켬은 반원 칸에서 멈춘다', `두 질문 ${dt}ms`);
  // ⓒ 예산 안의 질문(열린 들판 · 짧은 우회)은 켬/끔 비트 동일 — 무작위 300쌍
  let same = 0, tot = 0, foundN = 0;
  const W3 = { isWaterFn: (x, y) => { const cx = cellOf(x), cy = cellOf(y); return cx < 0 || cy < 0 || cx >= 200 || cy >= 200 || ((cx * 73856093 ^ cy * 19349663) >>> 0) % 7 === 0; } };
  for (let i = 0; i < 300; i++) {
    const sx = 30 + (i * 37) % 90, sy = 30 + (i * 53) % 90, gx = sx + ((i * 11) % 21) - 10, gy = sy + ((i * 17) % 21) - 10;
    if (W3.isWaterFn(sx * B + 16, sy * B + 16) || W3.isWaterFn(gx * B + 16, gy * B + 16) || (sx === gx && sy === gy)) continue;
    const a = call(W3, sx, sy, gx, gy, 1500), b = call(W3, sx, sy, gx, gy, cap(true, true, 64));
    tot++; if (a) foundN++;
    if (JSON.stringify(a) === JSON.stringify(b)) same++;
  }
  ok(tot > 150 && foundN > tot * 0.8 && same === tot, '⑬-c ★★예산 안의 질문은 켬/끔 **비트 동일**(흩뿌린 물 들판 · 반경 10칸 안 쌍)', `${same}/${tot} · 찾음 ${foundN}`);
  // ⓕ 미끼 — 켬의 예산을 1,500 으로 비틀면 ⓓ 가 깨진다
  const capBad = new Function('T399_CELL_CAP', 'isVil', '_pfR', `return (${mC ? mC[1].replace('Math.ceil(Math.PI * _pfR * _pfR / 2)', '1500') : '0'});`);
  ok(call(W1, 145, 150, 165, 150, capBad(true, true, 64)) === null, '★⑬ 자명 통과 금지 — 켬의 예산을 1,500 으로 비틀면 그 우회를 **다시 못 찾는다**');
  console.log(`    [표] 예산 끔 ${cap(false, true, 64)}·${cap(false, false, 24)} → 켬 ${cap(true, true, 64)}·${cap(true, false, 24)} · 주머니 강 우회: 1,500 ${offP ? '찾음' : 'null'} · 4,096 ${sqP ? '찾음' : 'null'} · 6,434 ${onP ? '찾음' : 'null'} · 예산 안 ${same}/${tot} 동일`);
  console.log('    접점: T399_CELL_CAP · computeNpcPath · maxCells · searchRadiusCells · _pfR · pfFindPath');
}

// =============================================================================
// ⑭ T421_SPATIAL_INC — 격자를 **다시 안 세워도** 조회가 비트 동일하다 [T421 ①]
// =============================================================================
// ★T385 뒤 그 밖에서 두 번째로 큰 것이 `spatial`(틱마다 나무 셋을 비우고 전수를 다시 넣는다)이다.
//   T421 은 나무를 그대로 두고, **새로 세운 나무가 지금 나무와 같을 때** 안 세운다(차례가 같고 · 움직인 몸마다
//   들 칸이 같으면 = 같은 나무 ⇒ x·y 만 고친다). 주민 활성 술어도 (청크, 활성 집합)이 같으면 지난 답을 쓴다.
// ★★이 절이 재는 것 — **조회가 무엇을, 어떤 순서로 내나**가 끔(틱마다 새로 세움)과 같은가.
//   제품의 글자(`rebuildSpatialIndex`·`_rebuildSpatialInc`·`_spKeep`·`_rebuildResources`·`isPositionActive`)와
//   **진짜 나무**(`server/quadtree.js`)를 떠서, 같은 세계에 두 판을 나란히 세우고 틱마다 조회 500번을 견준다.
//   ⚠조회 사이에 몸을 한 번 더 움직인다 — 제품 조회는 **세운 때의 자리**(칸)와 **지금 자리**(거리)를 섞어 쓴다.
console.log('\n⑭ T421_SPATIAL_INC 격자 증분 — 조회 결과 비트 동일 [T421]');
{
  const { Quadtree, QuadtreeInc } = require(path.join(ROOT, 'server', 'quadtree.js'));
  const SRC = ['rebuildSpatialIndex', '_rebuildSpatialInc', '_spKeep', '_rebuildResources', 'isPositionActive', '_inputTOStep'].map((n) => body(n));
  const SPDEF = (Z.match(/const _spInc = \{[^\n]*\};/) || [''])[0];
  ok(SRC.every((x) => x.length > 60) && SPDEF.length > 50, '⑭ [전제] 제품의 격자 글자 여섯 + 상태 한 줄을 떴다', SRC.map((x) => x.length).join('+') + '자');
  const QSRC = fs.readFileSync(path.join(ROOT, 'server', 'quadtree.js'), 'utf8');
  const qBase = QSRC.slice(QSRC.indexOf('class Quadtree {'), QSRC.indexOf('class QuadtreeInc'));
  ok(qBase.length > 1000 && !/_n\b/.test(codeOnly(qBase)), '⑭ [전제] 원판 `Quadtree` 에는 `_n` 이 **없다**(끔 = 옛 나무 그대로)');
  const CS = 512, W = 24000, H = 24000;
  const mkWorld = (seed) => {
    const st = require(path.join(ROOT, 'server', 'seed-rand.js')).makeStream(); st.seed(seed);
    const players = new Map(), mobs = new Map(), resources = new Map();
    const chunks = new Map();
    const chunkManager = { chunkSize: CS, keyOf: (cx, cy) => `${cx}_${cy}`, chunks };
    for (let cx = 0; cx < W / CS; cx++) for (let cy = 0; cy < H / CS; cy++) chunks.set(`${cx}_${cy}`, { buildings: new Map() });
    let bid = 0;
    const addB = (x, y) => { const c = chunks.get(`${Math.floor(x / CS)}_${Math.floor(y / CS)}`); const b = { id: 'b' + (bid++), x, y }; c.buildings.set(b.id, b); return b; };
    for (let i = 0; i < 2400; i++) addB(Math.floor(st.next() * (W / 32)) * 32 + 16, Math.floor(st.next() * (H / 32)) * 32 + 16);
    let pid = 0;
    const addP = () => { const i = pid++; const k = i % 7; const p = { pid: 'p' + i, isNpc: k !== 6, canadiaVillage: k === 5,
      x: st.next() * W, y: st.next() * H, vx: 0, vy: 0, lastSeen: 0, handingOff: false, sp: (i % 3) === 0 ? 0 : (1 + st.next() * 40) };
      if (i % 97 === 0) { p.x = W / 2; p.y = H / 4; }   // 나무 가르는 선 위(경계 규칙)
      players.set(p.pid, p); return p; };
    for (let i = 0; i < 600; i++) addP();
    let mid = 0;
    const addM = () => { const m = { pid: 'm' + (mid++), x: st.next() * W, y: st.next() * H, sp: st.next() < 0.3 ? 1 + st.next() * 30 : 0 }; mobs.set(m.pid, m); return m; };
    for (let i = 0; i < 160; i++) addM();
    for (let i = 0; i < 50; i++) resources.set('r' + i, { x: st.next() * W, y: st.next() * H });
    return { st, players, mobs, resources, chunks, chunkManager, addB, addP, addM };
  };
  const mkIdx = (w, on, twist) => {
    let src = SRC.join('\n');
    if (twist === 'nopath') src = src.replace('if (qt.nodeFor(x, y) !== e._n) return false; ', '');
    if (twist === 'nomove') src = src.replace('e.x = x; e.y = y; }', '}');
    if (twist === 'nokeys') src = src.replace('if (keysSame && S.ref[i] === p', 'if (S.ref[i] === p');
    if (twist && src === SRC.join('\n')) throw new Error('미끼를 못 만들었다: ' + twist);
    const env = { players: w.players, mobs: w.mobs, resources: w.resources, chunkManager: w.chunkManager, Quadtree, QuadtreeInc,
      ZONE: { zoneWidth: W, zoneHeight: H }, T421_SPATIAL_INC: on };
    const keys = Object.keys(env);
    return new Function(...keys,
      'let activeChunkKeys = new Set(), qtPlayers = null, qtMobs = null, qtBuildings = null, qtResources = null, resourcesDirty = true, _lastResRebuild = 0;\n' +
      SPDEF + '\n' + src + '\n' +
      'return { setKeys: (s) => { activeChunkKeys = s; }, rebuild: () => rebuildSpatialIndex(undefined), qt: () => ({ p: qtPlayers, m: qtMobs, b: qtBuildings }), S: _spInc };')(...keys.map((k) => env[k]));
  };
  const idOf = (r) => r.pid || r.id;
  const run = (seed, twist, TICKS = 4200, Q = 500) => {
    const w = mkWorld(seed);
    const A = mkIdx(w, false), B = mkIdx(w, true, twist);
    const q = require(path.join(ROOT, 'server', 'seed-rand.js')).makeStream(); q.seed(seed ^ 0x5eed);
    const viewers = [{ x: W * 0.3, y: H * 0.3 }, { x: W * 0.7, y: H * 0.6 }];
    let nQ = 0, diffQ = 0, firstT = -1, nonEmpty = 0;
    for (let t = 0; t < TICKS; t++) {
      // 관측자 — 어떤 틱엔 가만히(활성 집합이 같다 ⇒ 캐시 길), 어떤 틱엔 움직인다
      if (t % 40 < 25) for (const v of viewers) { v.x = (v.x + 97) % W; v.y = (v.y + 61) % H; }
      const keys = new Set(); const r = 2;
      for (const v of viewers) { const vx = Math.floor(v.x / CS), vy = Math.floor(v.y / CS);
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const cx = vx + dx, cy = vy + dy; if (cx < 0 || cy < 0 || cx >= W / CS || cy >= H / CS) continue; keys.add(`${cx}_${cy}`); } }
      A.setKeys(keys); B.setKeys(keys);
      // 몸 — 일부는 가만히, 일부는 칸 안에서, 일부는 칸을 넘는다 · 가끔 들고 난다 · 가끔 존 밖
      // 300틱 중 앞 150틱은 주민이 멈춘다(밤처럼) — 주민 나무를 **그대로 두는 길**도 밟는다
      if (t % 300 >= 150) for (const p of w.players.values()) if (p.sp) { p.x += (q.next() - 0.5) * p.sp; p.y += (q.next() - 0.5) * p.sp; }
      if (t % 53 === 0) { const it = w.players.keys().next().value; w.players.delete(it); w.addP(); }
      if (t % 211 === 7) { const p = [...w.players.values()][t % 300]; p.x = -5; }            // 존 밖 한 틱
      if (t % 211 === 8) { const p = [...w.players.values()][(t - 1) % 300]; p.x = 100; }
      for (const m of w.mobs.values()) if (m.sp) { m.x += (q.next() - 0.5) * m.sp; m.y += (q.next() - 0.5) * m.sp; }
      if (t % 71 === 0) { const it = w.mobs.keys().next().value; w.mobs.delete(it); w.addM(); }
      if (t % 97 === 0) w.addB(Math.floor(q.next() * (W / 32)) * 32 + 16, Math.floor(q.next() * (H / 32)) * 32 + 16);
      if (t % 131 === 0) { const c = w.chunks.get([...keys][0]); const it = c && c.buildings.keys().next().value; if (it) c.buildings.delete(it); }
      A.rebuild(); B.rebuild();
      // 세운 뒤에 몇 몸이 또 움직인다 — 조회는 세운 자리(칸)와 지금 자리(거리)를 섞는다(제품 그대로)
      for (const p of w.players.values()) if (p.sp > 30) { p.x += 3; }
      const a = A.qt(), b = B.qt();
      for (let k = 0; k < Q; k++) {
        const which = k % 3, cx = q.next() * W, cy = q.next() * H, rr = 20 + q.next() * 900;
        const ta = which === 0 ? a.p : which === 1 ? a.m : a.b, tb = which === 0 ? b.p : which === 1 ? b.m : b.b;
        let ra, rb;
        if (k % 5 === 4) { ra = ta.findNearest(cx, cy, rr); rb = tb.findNearest(cx, cy, rr); ra = [ra.ref && idOf(ra.ref), ra.dist]; rb = [rb.ref && idOf(rb.ref), rb.dist]; }
        else if (k % 5 === 3) { ra = ta.queryRect(cx, cy, rr, rr).map(idOf); rb = tb.queryRect(cx, cy, rr, rr).map(idOf); }
        else { ra = ta.queryCircle(cx, cy, rr).map(idOf); rb = tb.queryCircle(cx, cy, rr).map(idOf); }
        const sa = JSON.stringify(ra), sb = JSON.stringify(rb);
        nQ++; if (sa !== sb) { diffQ++; if (firstT < 0) firstT = t; } if (sa.length > 12) nonEmpty++;
      }
    }
    return { nQ, diffQ, firstT, nonEmpty, S: B.S };
  };
  const R = run(0x421);
  ok(R.nonEmpty > 200000, '⑭-a [상황] 조회가 **실제로 걸렸다**(빈 답만이면 자명 통과다)', `빈 답 아님 ${R.nonEmpty.toLocaleString()}/${R.nQ.toLocaleString()}`);
  ok(R.S.kept.pl > 100 && R.S.rebuilt.pl > 100 && R.S.kept.mob > 500 && R.S.rebuilt.mob > 100 && R.S.kept.bld > 500 && R.S.rebuilt.bld > 100,
     '⑭-a [상황] 두 길을 **다 밟았다** — 그대로 둔 판(증분)과 통째로 세운 판(칸이 바뀜·들고 남)',
     `주민 둠 ${R.S.kept.pl}/세움 ${R.S.rebuilt.pl} · 몹 ${R.S.kept.mob}/${R.S.rebuilt.mob} · 건물 ${R.S.kept.bld}/${R.S.rebuilt.bld}`);
  ok(R.diffQ === 0, '⑭-a ★★★끔(틱마다 새로 세움) ↔ 켬(증분) — **4,200틱 × 조회 500 = 210만 조회, 무엇을·어떤 순서로 비트 동일**',
     R.diffQ === 0 ? `${R.nQ.toLocaleString()} 조회 전부 같다` : `다른 조회 ${R.diffQ} · 첫 틱 ${R.firstT}`);
  // ⓑ 미끼 셋 — 자가 **실제로** 무는가
  for (const [tw, what] of [['nopath', '들 칸을 안 보고 x·y 만 고치면'], ['nomove', '**한 몸의 자리를 안 옮기면**(칸 안에서 움직인 몸의 x·y 를 안 고치면)'], ['nokeys', '활성 집합이 바뀐 걸 안 보고 지난 활성 답을 쓰면']]) {
    const Bt = run(0x421, tw, 900, 200);
    ok(Bt.diffQ > 0, `★⑭-b 미끼 — ${what} 갈린다`, Bt.diffQ > 0 ? `다른 조회 ${Bt.diffQ.toLocaleString()} · 첫 틱 ${Bt.firstT}` : '안 갈렸다(자가 못 문다)');
  }
  // ⓒ 왜 셀 격자로 안 갈아탔나 — 같은 몸들을 내도 **순서**가 다르다(나무 순서가 곧 답이다)
  {
    const w = mkWorld(0x422);
    const qt = new Quadtree(0, 0, W, H); const G = new Map(); const GS = 256;
    for (const p of w.players.values()) { qt.insert({ x: p.x, y: p.y, ref: p }); const k = Math.floor(p.x / GS) * 65536 + Math.floor(p.y / GS); if (!G.has(k)) G.set(k, []); G.get(k).push(p); }
    const gq = (cx, cy, r) => { const o = []; for (let gx = Math.floor((cx - r) / GS); gx <= Math.floor((cx + r) / GS); gx++) for (let gy = Math.floor((cy - r) / GS); gy <= Math.floor((cy + r) / GS); gy++) { const a = G.get(gx * 65536 + gy); if (a) for (const p of a) { const dx = p.x - cx, dy = p.y - cy; if (dx * dx + dy * dy <= r * r) o.push(p); } } return o; };
    const q = require(path.join(ROOT, 'server', 'seed-rand.js')).makeStream(); q.seed(9);
    let sameSet = 0, sameOrder = 0, n = 0;
    for (let k = 0; k < 20000; k++) { const cx = q.next() * W, cy = q.next() * H, r = 300 + q.next() * 1500;
      const a = qt.queryCircle(cx, cy, r).map(idOf), b = gq(cx, cy, r).map(idOf); if (a.length < 2) continue; n++;
      if ([...a].sort().join() === [...b].sort().join()) sameSet++; if (a.join() === b.join()) sameOrder++; }
    ok(sameSet === n && sameOrder < n, '⑭-c 셀 격자는 **같은 몸들을 다른 순서로** 낸다 — 그래서 나무를 그대로 두었다(`findNearest` 동점·첫 번째 걸린 것이 갈린다)',
       `같은 모음 ${sameSet}/${n} · 같은 순서 ${sameOrder}/${n}`);
  }
  // ⓓ 소스 — 손잡이 하나 · 기본 끔 · 끔 몸통 그대로 · 자원 문 하나
  {
    const Z2 = codeOnly(Z);
    ok(/const T421_SPATIAL_INC = process\.env\.T421_SPATIAL_INC === '1';/.test(Z2), "⑭-d 손잡이는 `T421_SPATIAL_INC` 하나 · **기본 끔**");
    const RS = codeOnly(body('rebuildSpatialIndex'));
    ok(/qtPlayers   = new Quadtree\(0, 0, W, H\);/.test(RS) && /for \(const m of mobs\.values\(\)\)       qtMobs\.insert\(\{ x: m\.x, y: m\.y, ref: m \}\);/.test(RS),
       '⑭-d 끔 몸통은 **옛 글자 그대로**(옛 나무 · 전수 삽입)');
    ok((Z2.match(/function _rebuildResources\(/g) || []).length === 1 && (RS.match(/_rebuildResources\(W, H\)/g) || []).length === 2,
       '⑭-d 자원 나무 문은 **하나**(끔·켬이 같은 함수)');
  }
  console.log('    접점: rebuildSpatialIndex · _rebuildSpatialInc · _spKeep · _spInc · QuadtreeInc.nodeFor · isPositionActive · activeChunkKeys · T421_SPATIAL_INC');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
