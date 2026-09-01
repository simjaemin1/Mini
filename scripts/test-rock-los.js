#!/usr/bin/env node
// === scripts/test-rock-los.js — 바위 시야 차단(실루엣 선분) 정합·비용 실측 ===
//
// ★[11차 재민 확정] "산은 완벽한 콜라이더라 건너편이 절대 안 보여."
//   client.js 의 fog 광선 알고리즘은 O(6 × 선분²)라, 바위를 통째로 선분화하면 메인루프가 멈춘다.
//   그래서 **실루엣(비바위와 맞닿은 변)만 + 런 병합**으로 넣었다. 이 하네스가 재는 것:
//     ① 실루엣 선분이 실제로 바위 경계와 일치하는가(빠뜨린 변 0)
//     ② 최악 지점에서 선분이 몇 개인가 — 나무 상한(22그루=132선분)과 같은 자릿수인가
//     ③ 런 병합이 실제로 몇 배를 줄이는가
// 실행: node scripts/test-rock-los.js
'use strict';
const path = require('path');
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const ZID = 'hanbando';
const isR = (cx, cy) => terrain.isRockCellLocal(ZID, cx * 32 + 16, cy * 32 + 16);

// client.js 와 **같은 상수**여야 한다 — 바뀌면 여기부터 깨져서 알려 준다
const R = 20, MAX_ROCK_SEGS = 90;

function silhouette(rcx, rcy) {
  const segs = [];
  let rawEdges = 0;
  for (let cy = rcy - R; cy <= rcy + R; cy++) {
    for (const [dy, edge] of [[-1, 0], [1, 1]]) {
      let run = null;
      for (let cx = rcx - R; cx <= rcx + R + 1; cx++) {
        const on = cx <= rcx + R && isR(cx, cy) && !isR(cx, cy + dy);
        if (on) { rawEdges++; if (!run) run = [cx, cx]; else run[1] = cx; }
        else if (run) { const y = (cy + edge) * 32; segs.push({ ax: run[0] * 32, ay: y, bx: (run[1] + 1) * 32, by: y }); run = null; }
      }
    }
  }
  for (let cx = rcx - R; cx <= rcx + R; cx++) {
    for (const [dx, edge] of [[-1, 0], [1, 1]]) {
      let run = null;
      for (let cy = rcy - R; cy <= rcy + R + 1; cy++) {
        const on = cy <= rcy + R && isR(cx, cy) && !isR(cx + dx, cy);
        if (on) { rawEdges++; if (!run) run = [cy, cy]; else run[1] = cy; }
        else if (run) { const x = (cx + edge) * 32; segs.push({ ax: x, ay: run[0] * 32, bx: x, by: (run[1] + 1) * 32 }); run = null; }
      }
    }
  }
  return { segs, rawEdges };
}

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

// 표본 지점 — 광산마을(산 바로 옆), 계곡 안, 평지
const spots = [];
for (const v of (terrain.getZoneVillages(ZID) || [])) if (/광산/.test(v.name)) spots.push([v.name, Math.round(v.x / 32), Math.round(v.y / 32)]);
// ★계곡 표본은 **지형 파일에서 뽑는다** — 좌표를 손으로 박아 두면 계곡을 옮긴 뒤 조용히 엉뚱한 곳을 재게 된다
//   (11차에 너덜계곡을 T자 접점에서 33셀 밖으로 옮기고 나서 실제로 그럴 뻔했다).
for (const v of (require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json'))[ZID].valleys || [])) {
  const c = v.path[Math.floor(v.path.length / 2)];
  const q = c.pos ? c.pos : [c.x, c.y];
  spots.push([v.name + ' 한복판', Math.round(q[0] / 32), Math.round(q[1] / 32)]);
}
spots.push(['평지(스폰)', 1094, 2031]);
// ★최악 표본 — 산맥 **가장자리 바로 옆**(실루엣이 가장 길게 잡히는 자리). 광산마을은 실측상 바위까지 27~55셀이라
//   수집 반경 20셀 밖이다 — 그것만 보면 '선분 0'이라 아무것도 재지 못한다.
{
  let best = null;
  for (const rg of (require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json'))[ZID].ridges || [])) {
    if (rg._mirroredFrom) continue;
    const p0 = rg.path[Math.floor(rg.path.length / 2)];
    const c = p0.pos ? p0.pos : [p0.x, p0.y];
    const cx = Math.round(c[0] / 32), cy = Math.round(c[1] / 32);
    if (!best) best = [rg.name + ' 한복판', cx, cy];
  }
  if (best) spots.push(best);
}

console.log('[① 실루엣이 바위 경계를 빠짐없이 덮는가]');
{
  // ★표본은 **경계가 실제로 있는 자리**여야 한다. 광산마을은 바위까지 27~55셀이라 반경 20셀 안에
  //   경계 변이 0개다 — 그걸로 검사하면 "0개 중 0개 빠짐 ✔"라는 아무 말도 안 하는 통과가 나온다.
  const vv = require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json'))[ZID].valleys[0];
  const vc = vv.path[Math.floor(vv.path.length / 2)];
  const vq = vc.pos ? vc.pos : [vc.x, vc.y];
  const cx = Math.round(vq[0] / 32), cy = Math.round(vq[1] / 32);
  const { segs } = silhouette(cx, cy);
  // 선분 집합을 셀 변으로 되돌려, 브루트포스로 센 경계 변과 대조
  const have = new Set();
  for (const s of segs) {
    if (s.ay === s.by) for (let x = s.ax / 32; x < s.bx / 32; x++) have.add('H' + x + '_' + (s.ay / 32));
    else for (let y = s.ay / 32; y < s.by / 32; y++) have.add('V' + (s.ax / 32) + '_' + y);
  }
  let want = 0, miss = 0;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (!isR(x, y)) continue;
    if (!isR(x, y - 1)) { want++; if (!have.has('H' + x + '_' + y)) miss++; }
    if (!isR(x, y + 1)) { want++; if (!have.has('H' + x + '_' + (y + 1))) miss++; }
    if (!isR(x - 1, y)) { want++; if (!have.has('V' + x + '_' + y)) miss++; }
    if (!isR(x + 1, y)) { want++; if (!have.has('V' + (x + 1) + '_' + y)) miss++; }
  }
  ok(miss === 0, '경계 변 ' + want + '개 중 빠뜨린 것 ' + miss);
}

console.log('\n[② 최악 지점 선분 수 — 나무 상한 132선분과 같은 자릿수인가]');
let worst = 0, worstName = '';
for (const [name, cx, cy] of spots) {
  const t0 = process.hrtime.bigint();
  const { segs, rawEdges } = silhouette(cx, cy);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (segs.length > worst) { worst = segs.length; worstName = name; }
  console.log('  ' + name.padEnd(14) + ' 셀변 ' + String(rawEdges).padStart(4) + ' → 선분 ' + String(segs.length).padStart(3)
    + ' (병합 ×' + (rawEdges / Math.max(1, segs.length)).toFixed(1) + ') · 생성 ' + ms.toFixed(0) + 'ms'
    + (segs.length > MAX_ROCK_SEGS ? '  → 상한 ' + MAX_ROCK_SEGS + '로 잘림' : ''));
}
ok(worst > 0, '최악(' + worstName + ') 병합 후 ' + worst + '선분 — 상한 ' + MAX_ROCK_SEGS
  + (worst > MAX_ROCK_SEGS ? '에 실제로 걸린다' : ' 안'));
// 광선 비용 실측(이 기계): 선분 140 → 0.64ms · 190 → 1.35 · 230 → 1.65 · 270 → 2.13 · 320 → 2.95 (프레임당)
//   기존 부하는 나무 22그루=132선분 + 벽. 바위 90을 얹으면 ~140→230 = **+1ms/프레임**이고 60fps 예산 16.7ms 안이다.
//   상한을 올리고 싶으면 이 표를 다시 재고 나서 올릴 것 — 제곱으로 는다.

console.log('\n[③ 계곡은 시야가 통해야 한다 — 뚫린 곳이 막혀 보이면 안 된다]');
{
  const w = require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json'))[ZID];
  const vs = w.valleys || [];
  ok(vs.length > 0, '계곡 ' + vs.length + '개 정의됨' + (vs.length ? ' (' + vs.map((v) => v.name).join(', ') + ')' : ''));
  for (const v of vs) {
    let open = 0, tot = 0;
    for (const p of v.path) { tot++; if (!isR(Math.round(p.x / 32), Math.round(p.y / 32))) open++; }
    ok(open === tot, '「' + v.name + '」 경로점 ' + tot + '개 전부 통행 가능(' + open + ')');
  }
}

console.log('\n[④ 서버/클라 바위 판정 거울 — 계곡을 한쪽만 알면 유령 벽이 된다]');
{
  const fs = require('fs');
  const cl = fs.readFileSync(path.join(__dirname, '..', 'public', 'terrain.js'), 'utf8');
  ok(/data\.valleys\s*=\s*hc\.valleys/.test(cl), '클라가 valleys 를 적재한다');
  ok(/for \(const v of t\.valleys \|\| \[\]\)/.test(cl), '클라 isRockCellLocal 이 valleys 를 통행 가능으로 본다');
  const cj = require('./client-src.js').readClientSrc();
  ok(/_rockOccCache/.test(cj), 'client.js 가 바위 실루엣을 시야 차단에 넣는다');
  const m = cj.match(/const ROCK_RANGE_CELLS = (\d+)[\s\S]*?const MAX_ROCK_SEGS = (\d+)/);
  ok(!!m && +m[1] === R && +m[2] === MAX_ROCK_SEGS, '상수 일치 — client(' + (m ? m[1] + ',' + m[2] : '못 찾음') + ') vs 하네스(' + R + ',' + MAX_ROCK_SEGS + ')');
  // ★강이 산보다 위 — 세 갈래 렌더 경로가 전부 '물 먼저'여야 한다(판정도 물 우선이라 안 맞으면 지도가 거짓말한다)
  ok(/const isRock = !isWater && isRockAtAbs/.test(cj), '월드 타일: 물이 바위를 이긴다');
  ok(/isWaterCellLocal\(zid, lx \+ 16, ly \+ 16\)\) col = waterColor;[\s\S]{0,120}isRockCellLocal/.test(cj), '전체지도 셀 경로: 물 먼저');
  const vi = cj.indexOf('5. ridge(산맥) stroke'), li = cj.indexOf('6. lake'), ri = cj.indexOf('7. river stroke');
  ok(vi > 0 && vi < li && li < ri, '전체지도 벡터 경로: 산맥 → 호수 → 강 순서(나중에 그린 물이 위)');
  ok(/destination-out/.test(cj) && /for \(const v of \(td\.valleys\|\|\[\]\)\)/.test(cj), '전체지도가 고개·계곡을 산맥에서 도로 뚫는다');
}

console.log('\n결과: ' + (fail ? 'FAIL(' + fail + ')' : 'PASS'));
process.exit(fail ? 1 : 0);
