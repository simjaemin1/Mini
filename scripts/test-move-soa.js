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
const codeOnly = require('./code-only.js');   // ★주석 제거기 **정본**(`test-harness-lint ⑦a` 가 이 꼴을 건다)
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
  const mrun = () => { const all = new Array(BINS).fill(0), first = new Array(BINS).fill(0); let sum = 0;
    for (let i = 0; i < DEC; i++) for (let j = 0; j < PER; j++) { const v = Math.random(); sum += v; const k = Math.min(BINS - 1, (v * BINS) | 0); all[k]++; if (j === 0) first[k]++; }
    return { all, first, mean: sum / N }; };
  // ⓐ **절대 균등성** — 두 판 각각이 그 자체로 균등한가(이게 1차 관문이다)
  const D = [];
  for (let s2 = 0; s2 < 3; s2++) {
    const A = sweep(s2 * 1013 + 1), B = mrun();
    const ca = chi2(A.all, N), cb = chi2(B.all, N), fa = chi2(A.first, DEC), fb = chi2(B.first, DEC);
    ok(ca < CRIT && cb < CRIT, `⑤ [시드 ${s2}] 150만 굴림이 **둘 다** 균등(씨 χ² ${ca.toFixed(1)} · 주사위 χ² ${cb.toFixed(1)} < ${CRIT})`);
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
  ok(!tM.split, '⑤ ★★**T252 자로 못 가른다** — 평균 차의 부호가 3/3 이면서 |평균| > 폭 인 경우가 아니다',
     `부호일치 ${tM.same} · 평균 ${tM.mean.toExponential(2)} · 폭 ${tM.band.toExponential(2)}`);
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
  ok(tB.split, '★⑤ 자명 통과 금지 — 일부러 10% 좁힌 흐름은 **같은 자가 문다**',
     `부호일치 ${tB.same} · 평균 ${tB.mean.toExponential(2)} · 폭 ${tB.band.toExponential(2)}`);
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
  console.log(`    [표] 게이트 — 마을 ${VILLAGES} · 주민 ${NPCS} · 게임일 ${DAYS}(${TICKS}틱) · 결정 ${A.decided.toLocaleString()}회 · 다른 자리 0`);
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
// ⑨ T375_ACTIVE_FLAG — 문지기를 **불리언 필드 하나**로 바꿔도 세계가 안 바뀐다 [T375]
// =============================================================================
// ★T371 이 '그 밖' 을 열일곱으로 갈랐고, 앞자리 넷(`stairs`·`spatial`·`fall`·`hpRegen`)이 **주민 전수를
//   매 틱 훑으며 몸엔 못 들어가는** 순회였다(0.717 µs/사람 = 그 밖의 69.4 %). 넷의 문지기는 문자열 키
//   Set(`isPositionActive`)이고, `p.isNpc` 불리언으로 빠지는 순회 셋은 5.8배 쌌다.
//   ⇒ 틱 안에서 `isPositionActive` 를 **한 번** 계산해 `_active` 에 적고 넷이 그 필드를 읽는다.
//
// ★★이 절이 재는 것은 하나다: **문지기가 답을 안 바꾼다.** 위험은 낡음(staleness)이다 —
//   결정 문·이동 문이 x·y 를 바꾸므로, 한 번만 적으면 **이동 뒤 순회 셋이 이동 전 답**을 본다.
//   그래서 제품은 새로 고치는 자리를 둘 두었다(틱 머리 · 이동 문 직후). 이 자가 그 둘을 **실제로 문다**:
//   ⓒ 가 둘째 자리를 빼고 돌려서 **갈라지는 것을 보인다**(자명 통과 금지).
//
// ★자는 T350 ⑥ · T356 ⑦ 의 그 자다 — 제품의 글자를 떠서 **한 프로세스 두 판**(두 존은 못 쓴다: 틱 루프가
//   `Date.now()` 를 읽어 같은 게임일에 같은 틱 수를 안 돈다 · T350 §3-ⓑ).
console.log('\n⑨ T375_ACTIVE_FLAG 문지기 필드 — 켬/끔이 같은 세계 [T375]');
{
  const srcA = body('isPositionActive'), srcR = body('_t375Refresh'), srcI = body('_isActive');
  ok(srcA.length > 50 && srcR.length > 50 && srcI.length > 20,
     '⑨ [전제] 제품에서 **그 글자 셋**을 떴다(술어 · 새로 고침 · 읽기)', `${srcA.length}+${srcR.length}+${srcI.length}자`);
  ok(/_t375Gen\+\+/.test(srcR) && /_activeGen = _t375Gen/.test(srcR),
     '⑨ [전제] 새로 고침이 **세대**를 적는다(뒤에 들어온 몸은 종전 길로 떨어진다)');
  ok(/e\._activeGen === _t375Gen/.test(srcI) && /isPositionActive\(e\.x, e\.y\)/.test(srcI),
     '⑨ [전제] 읽기가 세대를 확인하고, 아니면 **정본 술어**를 부른다');

  const CS = 512;                                  // 청크 크기(자리수만 같으면 된다)
  const mk = (on, skipR2) => {
    const activeChunkKeys = new Set();
    const chunkManager = { chunkSize: CS, keyOf: (cx, cy) => `${cx}_${cy}` };
    const players = new Map(), mobs = new Map();
    const env = { activeChunkKeys, chunkManager, players, mobs, T375_ACTIVE_FLAG: on };
    const keys = Object.keys(env);
    const api = new Function(...keys,
      'let _t375Gen = 0;\n' + srcA + '\n' + srcR + '\n' + srcI +
      '\nreturn { _t375Refresh, _isActive, isPositionActive };')(...keys.map((k) => env[k]));
    return { activeChunkKeys, players, mobs, api, on, skipR2 };
  };

  // ── 한 판 — 제품 틱의 **순서 그대로**: 청크 갱신 → (R1) → 공간 인덱스 문지기 → 이동 → (R2) → 계단·낙하·HP
  const run = (arm) => {
    const TICKS = 4200, N = 408, M = 64;
    const st = require(path.join(ROOT, 'server', 'seed-rand.js')).makeStream(); st.seed(0x375a1);
    const W = 24000, H = 24000;   // ★작은 세계 — 활성 상자(13청크 = 6,656px)가 자리의 한 몫을 덮어야 **자주 뒤집힌다**
    for (let i = 0; i < N; i++) arm.players.set('p' + i, { isNpc: true, canadiaVillage: false,
      x: st.next() * W, y: st.next() * H, tx: st.next() * W, ty: st.next() * H, hp: 50, z: 0 });
    for (let i = 0; i < M; i++) arm.mobs.set('m' + i, { x: st.next() * W, y: st.next() * H, z: 0 });
    const { _t375Refresh, _isActive } = arm.api;
    const dv = new DataView(new ArrayBuffer(8));
    const dig = new Uint32Array(TICKS);
    let flips = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0;
    const prev = new Map();
    // 관측자 하나가 돈다 ⇒ 활성 청크 집합이 **틱마다 달라진다**(낡음이 실제로 생기는 조건)
    for (let t = 0; t < TICKS; t++) {
      const ox = W / 2 + Math.cos(t / 11) * (W / 3), oy = H / 2 + Math.sin(t / 7) * (H / 3);   // 관측자가 빨리 돈다
      arm.activeChunkKeys.clear();
      const ocx = Math.floor(ox / CS), ocy = Math.floor(oy / CS);
      for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) arm.activeChunkKeys.add(`${ocx + dx}_${ocy + dy}`);
      // (R1) 틱 머리 — 주민만
      _t375Refresh(false);
      // ① 공간 인덱스 문지기
      for (const p of arm.players.values()) { if (p.isNpc && !p.canadiaVillage && !_isActive(p)) continue; g1++; }
      // 이동 문 — x·y 가 **여기서** 바뀐다(낡음의 원천)
      for (const p of arm.players.values()) {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d > 2) { p.x += (dx / d) * 220; p.y += (dy / d) * 220; }
        else { p.tx = st.next() * W; p.ty = st.next() * H; }
      }
      // (R2) 이동 문 직후 — 주민 + 몹. ⓒ 는 이 자리를 뺀다.
      if (!arm.skipR2) _t375Refresh(true);
      // ② 계단(몹) · ③ 낙하(주민+몹) · ④ HP 회복(주민) — 문지기를 **통과한 몸만** 상태가 움직인다
      for (const m of arm.mobs.values()) { if (!_isActive(m)) continue; g2++; m.z += 1; }
      for (const p of arm.players.values()) { if (p.isNpc && !p.canadiaVillage && !_isActive(p)) continue; g3++; p.z += 2; }
      for (const m of arm.mobs.values()) { if (!_isActive(m)) continue; g3++; m.z += 3; }
      for (const p of arm.players.values()) { if (p.isNpc && !p.canadiaVillage && !_isActive(p)) continue; g4++; p.hp += 1; }
      // 자리 바뀜 계수 — 활성/비활성이 실제로 자주 뒤집혀야 이 자가 무언가를 문 것이다
      for (const [k, p] of arm.players) { const a = arm.api.isPositionActive(p.x, p.y); if (prev.get(k) !== undefined && prev.get(k) !== a) flips++; prev.set(k, a); }
      let h = 2166136261;
      for (const p of arm.players.values()) {
        dv.setFloat64(0, p.x); h = (Math.imul(h ^ dv.getUint32(0), 16777619) ^ dv.getUint32(4)) >>> 0;
        dv.setFloat64(0, p.y); h = (Math.imul(h ^ dv.getUint32(0), 16777619) ^ dv.getUint32(4)) >>> 0;
        h = (Math.imul(h ^ p.hp, 16777619) ^ p.z) >>> 0;
      }
      for (const m of arm.mobs.values()) h = (Math.imul(h ^ m.z, 16777619) ^ 0x375) >>> 0;
      dig[t] = h;
    }
    return { dig, players: arm.players, mobs: arm.mobs, flips, gates: [g1, g2, g3, g4] };
  };

  const A = run(mk(false)), B = run(mk(true));
  ok(A.flips > 20000, '⑨-a [상황] 활성/비활성이 **실제로 자주 뒤집혔다**(자명 통과 금지 — 안 뒤집히면 낡음이 안 난다)',
     `뒤집힘 ${A.flips.toLocaleString()}`);
  ok(A.gates.every((g) => g > 5000), '⑨-a [상황] 문지기 넷이 **다 통과도 하고 막기도 했다**',
     `통과 ${A.gates.map((g) => g.toLocaleString()).join(' · ')}`);
  let fd = -1; for (let t = 0; t < A.dig.length; t++) if (A.dig[t] !== B.dig[t]) { fd = t; break; }
  ok(fd < 0, '⑨-a ★★★끔 ↔ 켬 — **주민 408 + 몹 64 × 4,200틱 좌표·HP·낙하가 비트 동일**',
     fd < 0 ? `${((408 + 64) * 4200).toLocaleString()} 자리 전부 같다` : `첫 다름 틱 ${fd}`);
  {
    let cd = 0; const ap = [...A.players.values()], bp = [...B.players.values()];
    for (let i = 0; i < ap.length; i++) { if (!sameF64(ap[i].x, bp[i].x)) cd++; if (!sameF64(ap[i].y, bp[i].y)) cd++;
      if (ap[i].hp !== bp[i].hp) cd++; if (ap[i].z !== bp[i].z) cd++; }
    const am = [...A.mobs.values()], bm = [...B.mobs.values()];
    for (let i = 0; i < am.length; i++) if (am[i].z !== bm[i].z) cd++;
    ok(cd === 0, '⑨-a ★끝 자리 좌표·HP·낙하도 바이트 동일', `다른 수 ${cd}/${ap.length * 4 + am.length}`);
    ok(A.gates.join() === B.gates.join(), '⑨-a ★문지기 넷의 **통과 수가 한 번도 안 갈렸다**', `${A.gates.join(' · ')}`);
  }
  // ⓒ 자명 통과 금지 — **둘째 자리를 빼면 갈린다**(그 자리가 실어 나르는 것이 있다는 증거)
  {
    const C = run(mk(true, true));
    let f2 = -1; for (let t = 0; t < A.dig.length; t++) if (A.dig[t] !== C.dig[t]) { f2 = t; break; }
    ok(f2 >= 0, '★⑨ 자명 통과 금지 — 새로 고치는 자리를 **하나만** 두면(이동 뒤 갱신 없음) 세계가 갈린다',
       f2 >= 0 ? `첫 다름 틱 ${f2} · 문지기 통과 ${C.gates.join(' · ')}` : '안 갈렸다(자가 낡음을 못 문다)');
  }
  // ⓓ 소스 계수 — 손잡이 하나 · 기본 끔 · 문지기 넷만 · 정본 하나
  {
    const Z2 = codeOnly(Z);
    ok(/const T375_ACTIVE_FLAG = process\.env\.T375_ACTIVE_FLAG === '1';/.test(Z2),
       "⑨-d 손잡이는 `T375_ACTIVE_FLAG` 하나 · **기본 끔**");
    ok((Z2.match(/function _t375Refresh\(/g) || []).length === 1 && (Z2.match(/function _isActive\(/g) || []).length === 1,
       '⑨-d 새로 고침·읽기는 **하나씩**이다(사본 0)');
    ok((Z2.match(/_t375Refresh\(/g) || []).length === 3,
       '⑨-d 새로 고치는 자리는 **정확히 둘**이다(정의 1 + 부름 2)', `${(Z2.match(/_t375Refresh\(/g) || []).length}자리`);
    ok(/updateActiveChunks\(\);\s*\n\s*_t375Refresh\(false\);/.test(Z2),
       '⑨-d ★첫 자리는 `updateActiveChunks()` **바로 뒤**다(청크 집합이 정해진 직후)');
    ok(/_t375Refresh\(true\);[\s\S]{0,200}PZ식 다단 계단/.test(Z) ,
       '⑨-d ★둘째 자리는 **이동 문 직후**다(계단·낙하·HP 앞)');
    ok((Z2.match(/_isActive\(/g) || []).length === 6,
       '⑨-d 읽는 자리는 **다섯**이다(정의 1 + 문지기 5: 공간·계단몹·낙하주민·낙하몹·HP)',
       `${(Z2.match(/_isActive\(/g) || []).length}자리`);
    const rest = (Z2.match(/isPositionActive\(/g) || []).length;
    ok(rest >= 6, '⑨-d ★정본 `isPositionActive` 는 **그대로 남아 있다**(결정 문·이동 문·진단은 이 카드 밖)', `${rest}자리`);
    ok(!/stairCellCache/.test(body('_t375Refresh')) && !/stairCellCache/.test(body('_isActive')),
       '⑨-d ★`stairCellCache` 문자열 키는 **안 만졌다**(회부 · 카드 지정)');
  }
  console.log('    [표] 문지기 — 4,200틱 좌표·HP·낙하 0 다름 · 뒤집힘 ' + A.flips.toLocaleString() + ' · 새로 고침 자리 2(머리 · 이동 뒤)');
  console.log('    접점: isPositionActive · activeChunkKeys · updateActiveChunks · _active · _activeGen · T375_ACTIVE_FLAG · rebuildSpatialIndex · stepStairFor · processFalling');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
