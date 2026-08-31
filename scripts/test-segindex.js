#!/usr/bin/env node
// === scripts/test-segindex.js — 선분 격자 색인 하네스 [2026-08-31] =============
//
// 대상: `server/terrain-segindex.js` + 그것을 무는 `server/terrain.js` 의 `_isPointInRiver`.
//   주장은 하나다 — **답을 안 바꾸고, 안 볼 선분을 안 본다.**
//
// ★★이 하네스가 스스로를 못 믿게 짠 자리들 (자명 통과 금지):
//   · 플래그는 **모듈 적재 때** 읽힌다 ⇒ 한 프로세스 안에서 on/off 를 비교할 수 없다.
//     그래서 **자식 프로세스 둘**을 띄워 각자 진짜 제품 경로로 답을 내고, 부모가 **비트 단위**로 맞춘다.
//     (같은 프로세스에서 색인을 흉내 내면 내 사본을 검사하게 된다 — 사본 금지)
//   · 표본을 **강 가장자리에 몰아서** 만든다. 무작위 점만 쓰면 99%가 물 밖이라 등가성이 공짜가 된다.
//     경계(halfWidth 안팎 ±)가 색인 버그가 드러나는 유일한 자리다.
//   · **셀 중심이 아닌 점**도 넣는다 — chunk.js:447(x±D)·fishing.js 가 실제로 그렇게 묻는다.
//   · 참·거짓이 둘 다 넉넉히 나왔는지 센다.
//   · 색인이 **정말 일을 줄였는지**를 후보 수로 센다(족보 57 — 자기 행동을 먼저 세라).
//   · 속도는 절대 시간이 아니라 **비율**로 본다(2코어 컨테이너 부하에 안 흔들리게).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

const ZID = 'hanbando';
const PTS = '/tmp/segidx-pts.json';
const OUT_OFF = '/tmp/segidx-off.bin', OUT_ON = '/tmp/segidx-on.bin';

console.log('\n=== 선분 격자 색인 — hanbando ===');

// ── ⓪ 표본을 만든다: 강·산맥 가장자리 집중 + 무작위 + 비-셀중심 ────────────────
const terrain = require(path.join(ROOT, 'server', 'terrain.js'));
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
const Z = ZONES[ZID], W = Z.zoneWidth, H = Z.zoneHeight;
const T = terrain.ZONE_TERRAIN[ZID];
let s = 20260831;
const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const pts = [];
// (가) 강·산맥 path 점 주변 — halfWidth 안팎을 고루 훑는다(경계가 요점)
for (const list of [T.rivers || [], T.ridges || [], T.valleys || []]) {
  for (const r of list) {
    const P = r.path || [];
    for (let i = 0; i < P.length; i += Math.max(1, Math.floor(P.length / 40))) {
      const p = P[i];
      const cx = p.pos ? p.pos[0] : p[0], cy = p.pos ? p.pos[1] : p[1];
      const w = (p.width != null ? p.width : (r.width || 200));
      for (const k of [0, 0.25, 0.5, 0.75, 0.95, 1.0, 1.05, 1.3, 2.0]) {
        const a = rnd() * Math.PI * 2, d = w / 2 * k;
        pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);   // ★소수점 좌표 그대로(비-셀중심)
      }
    }
  }
}
// (나) 전 지도 무작위 — 셀 중심 절반, 임의 점 절반
for (let i = 0; i < 30000; i++) {
  const x = rnd() * W, y = rnd() * H;
  pts.push(i % 2 ? [Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16] : [x, y]);
}
fs.writeFileSync(PTS, JSON.stringify(pts));
console.log('\n⓪ 표본');
ok(pts.length > 20000, `질의점 ${pts.length.toLocaleString()}개 — 강·산맥 가장자리 집중 + 전 지도 무작위`,
   `강 ${(T.rivers || []).length} · 산맥 ${(T.ridges || []).length} · 계곡 ${(T.valleys || []).length}`);
const nonCenter = pts.filter(([x, y]) => (x % 32) !== 16 || (y % 32) !== 16).length;
ok(nonCenter > pts.length * 0.5, `셀 중심이 **아닌** 점이 과반 — chunk.js(x±D)·fishing.js 의 호출 모양`,
   `${nonCenter.toLocaleString()} / ${pts.length.toLocaleString()}`);

// ── 자식: 진짜 제품 경로로 답을 내고 비트로 적는다 ──────────────────────────────
const CHILD = `
const fs=require('fs');
const terrain=require(${JSON.stringify(path.join(ROOT, 'server', 'terrain.js'))});
const pts=JSON.parse(fs.readFileSync(${JSON.stringify(PTS)},'utf8'));
const buf=Buffer.alloc(Math.ceil(pts.length/4));
let nW=0,nR=0;
const t0=process.hrtime.bigint();
for(let i=0;i<pts.length;i++){
  const w=terrain.isWaterCellLocal('${ZID}',pts[i][0],pts[i][1])?1:0;
  const r=terrain.isRockCellLocal('${ZID}',pts[i][0],pts[i][1])?1:0;
  nW+=w; nR+=r;
  const bit=(i%4)*2; buf[i>>2]|=(w<<bit)|(r<<(bit+1));
}
const ms=Number(process.hrtime.bigint()-t0)/1e6;
fs.writeFileSync(process.argv[1],buf);
console.log(JSON.stringify({nW,nR,ms}));
`;
const run = (out, env) => {
  const o = execFileSync(process.execPath, ['-e', CHILD, out], { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 24 });
  return JSON.parse(o.trim().split('\n').pop());
};
console.log('\n① 등가(답을 안 바꾼다) — 자식 프로세스 둘, 진짜 제품 경로');
const rOff = run(OUT_OFF, { TERRAIN_SEG_INDEX: '' });
const rOn = run(OUT_ON, { TERRAIN_SEG_INDEX: '1' });
const bOff = fs.readFileSync(OUT_OFF), bOn = fs.readFileSync(OUT_ON);
let firstBad = -1;
if (!bOff.equals(bOn)) {
  outer: for (let i = 0; i < pts.length; i++) {
    const bit = (i % 4) * 2, j = i >> 2;
    if (((bOff[j] >> bit) & 3) !== ((bOn[j] >> bit) & 3)) { firstBad = i; break outer; }
  }
}
ok(firstBad === -1, `${pts.length.toLocaleString()}점 × (물·바위) 답이 **비트까지 동일**`,
   firstBad === -1 ? `물 ${rOff.nW.toLocaleString()} · 바위 ${rOff.nR.toLocaleString()}` : `첫 불일치 #${firstBad} @(${pts[firstBad]})`);
ok(rOff.nW === rOn.nW && rOff.nR === rOn.nR, `참 개수도 같다`, `물 ${rOff.nW}/${rOn.nW} · 바위 ${rOff.nR}/${rOn.nR}`);
// ★자명 통과 금지 — 전부 거짓이면 위 두 판정은 공짜다
ok(rOff.nW > 200 && rOff.nR > 200, `참이 넉넉히 나왔다 — 등가 판정이 공짜가 아니다`,
   `물 ${rOff.nW.toLocaleString()} · 바위 ${rOff.nR.toLocaleString()} (전체 ${pts.length.toLocaleString()})`);
ok((pts.length - rOff.nW) > 200 && (pts.length - rOff.nR) > 200, `거짓도 넉넉히 나왔다`, `물 밖 ${(pts.length - rOff.nW).toLocaleString()}`);

// ── ② 색인이 정말 일을 줄였나 — 후보 수를 센다 ────────────────────────────────
console.log('\n② 일을 줄였나(후보 수로 센다)');
const { buildSegIndex, CELL } = require(path.join(ROOT, 'server', 'terrain-segindex.js'));
let tot = 0, cand = 0, built = 0, worst = 0;
for (const r of [...(T.rivers || []), ...(T.ridges || [])]) {
  const idx = buildSegIndex(r);
  if (!idx) continue;
  built++;
  for (let k = 0; k < 400; k++) {
    const x = idx.gx0 * CELL + rnd() * idx.gw * CELL, y = idx.gy0 * CELL + rnd() * idx.gh * CELL;
    const c = idx.at(x, y).length;
    tot += idx.segs; cand += c; if (c > worst) worst = c;
  }
}
ok(built === (T.rivers || []).length + (T.ridges || []).length, `강·산맥 전부 색인이 세워졌다`, `${built}개`);
ok(cand < tot * 0.05, `bbox 안 질의에서 후보가 전체 선분의 5% 미만`,
   `평균 후보 ${(cand / (built * 400)).toFixed(1)} vs 전체 평균 ${(tot / (built * 400)).toFixed(0)} (${(100 * cand / tot).toFixed(2)}%)`);
ok(worst > 0, `★대조 — 후보가 0만 나오면 색인이 빈 격자란 뜻이다`, `최대 후보 ${worst}개`);

// ── ③ 이득 — 비율로 ───────────────────────────────────────────────────────────
console.log('\n③ 이득(비율)');
console.log(`     자식 소요: 색인 끔 ${rOff.ms.toFixed(0)}ms · 색인 켬 ${rOn.ms.toFixed(0)}ms (색인 구축 포함)`);
ok(rOn.ms * 3 < rOff.ms, `색인 켬이 3배 넘게 빠르다(구축 비용 포함)`, `${(rOff.ms / Math.max(1, rOn.ms)).toFixed(1)}배`);

// ── ④ 배선·기본값 ─────────────────────────────────────────────────────────────
console.log('\n④ 배선·기본값');
const tsrc = fs.readFileSync(path.join(ROOT, 'server', 'terrain.js'), 'utf8');
ok(/_SEG_INDEX_ON = process\.env\.TERRAIN_SEG_INDEX === '1'/.test(tsrc), `기본 꺼짐 — env 로만 켜진다`);
ok(/const cnt = cand \? cand\.length : N;/.test(tsrc), `색인이 없으면 N(전체 선분)을 그대로 훑는다 — 종전 경로 보존`);
const body = tsrc.slice(tsrc.indexOf('function _isPointInRiver'), tsrc.indexOf('function isWaterCellLocal'));
ok((body.match(/_pointToSegmentDist\(/g) || []).length === 1,
   `거리 계산이 **한 곳**뿐 — 색인 가지와 종전 가지가 같은 식을 쓴다(둘로 갈리면 언젠가 어긋난다)`);
const ssrc = fs.readFileSync(path.join(ROOT, 'server', 'terrain-segindex.js'), 'utf8');
ok(/Math\.max\(pw\(p1\), pw\(p2\)\) \/ 2/.test(ssrc),
   `적재 확장이 구간 halfWidth 의 **상한**을 쓴다 — 이게 등가성의 근거다`);

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
