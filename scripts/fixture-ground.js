// === scripts/fixture-ground.js — 지면 화소 픽스처 [T500 2026-09-28] ===========================
//
// ★지면 색을 재는 픽셀 하네스가 쓰는 도구 한 벌 — 상자 평균 · 설 때까지 기다리기 · 보이는 땅 몫 · 맨땅 뙈기 찾기.
//   문법은 `e2e-snow`(T487) 가 세운 그대로다(자리 규칙·상자·정지 판정). 그 하네스는 제 안에 같은 도구를 들고 있고
//   이 카드는 **남의 하네스를 안 고친다** — 새 하네스(`e2e-frost`)가 여기서 부른다(옮길지는 회부 · 이름만 하나로 모은다).
//   (`scripts/client-src.js`·`fixture-clock.js` 선례 — 하네스가 공유하는 헬퍼는 `test-*`·`e2e-*` 이름을 안 쓴다.
//    러너도 린트도 그 두 이름만 줍기 때문에 이 파일은 하네스로 세어지지 않는다.)
'use strict';
const fs = require('fs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lum = (r, g, b) => r * 0.30 + g * 0.59 + b * 0.11;
/** 두 장의 상자 안 평균 |Δ|(채널 평균 · 0..255). */
function meanAbsDiff(a, b, box) {
  const [x0, y0, x1, y1] = box; let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * a.width + x) * 4;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n++;
  }
  return n ? s / n / 3 : 0;
}
function meanLum(p, box) {
  const [x0, y0, x1, y1] = box; let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * p.width + x) * 4; s += lum(p.data[i], p.data[i + 1], p.data[i + 2]); n++; }
  return n ? s / n : 0;
}
/** 상자 속이 **보이는 땅**인가 — 시야 밖(검정)이면 잴 것이 없다(보이는 화소 몫). */
function seenFrac(p, box) {
  const [x0, y0, x1, y1] = box; let n = 0, t = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * p.width + x) * 4; t++; if (lum(p.data[i], p.data[i + 1], p.data[i + 2]) > 25) n++; }
  return t ? n / t : 0;
}
/** 세계 리터럴 `ICE_COLOR`(00-const.js) — 소스에서 읽는다(옮겨 적지 않는다). */
function iceColor(root) {
  const m = fs.readFileSync(require('path').join(root, 'public', 'client', '00-const.js'), 'utf8').match(/const ICE_COLOR = '#([0-9a-f]{6})'/i);
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
}
/** 화면이 설 때까지(카메라 트윈·타일 굽기) — 두 장이 **재는 상자들에서** 같아질 때까지 본다(전화면은 물이 늘 흐른다).
 *  `grab(page, 이름)` 은 하네스가 준다 — 스크린샷은 하네스 자신이 찍는다(`@pixel` 표의 증인 · 린트 ⑤c). */
async function still(page, grab, boxes, tag) {
  for (let i = 0; i < 30; i++) {
    await sleep(700);
    const a = await grab(page, `zz-${tag}-a`), b = await grab(page, `zz-${tag}-b`);
    if (boxes.every((bx) => meanAbsDiff(a, b, bx) === 0)) return true;
  }
  return false;
}
const warp = async (page, x, y) => { await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]); await sleep(1500); };
const boxOf = async (page, cells) => {
  const pts = await page.evaluate((cs) => cs.map(([a, b]) => window.__cellScreen(a, b)), cells);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return [Math.round(Math.min(...xs) - 30), Math.round(Math.min(...ys) - 14), Math.round(Math.max(...xs) + 30), Math.round(Math.max(...ys) + 14)];
};
const innerOf = (bx) => { const cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2; return [Math.round(cx - 70), Math.round(cy - 34), Math.round(cx + 70), Math.round(cy + 34)]; };
const patchAt = (c, ox, oy) => { const a = []; for (let d1 = 0; d1 < 5; d1++) for (let d2 = 0; d2 < 5; d2++) a.push([c[0] + ox + d1, c[1] + oy + d2]); return a; };
const OFFS = [[5, -9], [-9, 5], [8, -6], [-6, 8], [11, -3], [-3, 11], [7, 1], [1, 7], [10, -10], [-10, 10], [4, -12], [-12, 4]];
/**
 * 마을 좌표에서 멀어지며 **카메라 둘레 뙈기 둘이 전부 뭍**인 첫 자리를 잡는다(좌표를 지어내지 않는다 · e2e-snow 규칙 그대로).
 * @returns {spot:[x,y], G, Rd} | null — G = 시험 뙈기 · Rd = 떨어진 둘째 뙈기(길을 깔 자리)
 */
async function findLandSpot(page, grab, V) {
  for (const r of [2400, 4000, 6400, 9600]) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const tx = V.cx * 32 + 16 + dx * r, ty = V.cy * 32 + 16 + dy * r;
    if (tx < 400 || ty < 400) continue;
    await warp(page, tx, ty);
    await sleep(4000);                                  // 카메라가 닿고 타일이 구워질 틈(정찰 한 장 — 판정 아님)
    const cam = await page.evaluate(() => window.__camCellLocal());
    if (!cam) continue;
    const scout = await grab(page, 'zz-scout');
    const good = [];
    for (const [ox, oy] of OFFS) {
      const cells = patchAt(cam, ox, oy);
      const kinds = await page.evaluate((cs) => cs.map(([a, b]) => { const t = window.__tileStateAt(a, b); return t ? t.kind + (t.road ? 'r' : '') : 'x'; }), cells);
      if (!kinds.every((k) => k === 'land')) continue;
      const bx = await boxOf(page, cells);
      if (bx[0] < 70 || bx[2] > 1330 || bx[1] < 260 || bx[3] > 850) continue;
      if (seenFrac(scout, innerOf(bx)) < 0.98) continue;   // 시야 밖(검정)이 섞인 뙈기는 잴 것이 없다
      good.push({ ox, oy, cells });
    }
    const far = good.length ? good.slice(1).find((c) => Math.abs(c.ox - good[0].ox) + Math.abs(c.oy - good[0].oy) >= 8) : null;
    if (far) return { spot: [tx, ty], G: good[0], Rd: far };
  }
  return null;
}

module.exports = { sleep, lum, meanAbsDiff, meanLum, seenFrac, iceColor, still, warp, boxOf, innerOf, patchAt, OFFS, findLandSpot };
