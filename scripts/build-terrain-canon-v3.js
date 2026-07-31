#!/usr/bin/env node
// === scripts/build-terrain-canon-v3.js — 지형 정본 v3 (두 파일을 하나로 끝낸다) ===
//
// ★"합쳐서 v3 만들어"에 대한 실측 기반 답
//   terrain-canon-audit.js 로 재 보니 둘은 **다른 세계가 아니라 조상-자손**이었다:
//     · v2 강의 98.5% 가 이미 게임 파일 안에 있다(게임이 오히려 34% 더 넓다)
//     · v2 산맥 8줄은 전부 게임 산맥과 **같은 선**이다(편차 0.0~2.3셀) — 이름만 갈렸다
//         한울대간≡한밝대간 · 눈메산맥≡죽산맥 · 향목산맥≡매산맥
//         먹뫼산맥≡연산맥 · 솔재산맥≡학산맥 · 너울산맥≡단산맥 · 경계산맥≡옥산맥/화산맥
//     · v2 로 되돌리면 존 6개(중원남·센타리아·힌드강·에우로파·노르단·사하르)와 마을 50개가 사라진다
//     · 기하 합집합은 순이득 +1.1%(강) 뿐이고 산맥은 +19.5% 부풀어 **고개 2개를 새로 막는다**
//   ⇒ 기하를 합치는 건 손해다. v2에만 있는 실질 정보는 **지명**뿐이다.
//   ⇒ v3 = 게임 정본 기하 그대로 + v2 지명을 altName 으로 병기(비파괴).
//      이름을 실제로 바꿀지는 취향 판단이라 여기서 결정하지 않는다. RENAME=1 이면 갈아끼운다(가역).
//
// 출력: ../hanbando_terrain_v3.json   ← 이제 지형 파일은 이것 하나가 정본이다
// 사용: node scripts/build-terrain-canon-v3.js [v2경로]        (병기만)
//       RENAME=1 node scripts/build-terrain-canon-v3.js        (v2 지명으로 실제 개명)
'use strict';
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const V2 = process.argv[2] || path.join(__dirname, '..', '..', 'hanbando_terrain_v2.json');
const OUT = path.join(__dirname, '..', '..', 'hanbando_terrain_v3.json');
const RENAME = process.env.RENAME === '1';
const NEAR = 96;   // 3셀 — 이 안이면 "같은 지형"으로 본다

const d = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const v2all = fs.existsSync(V2) ? JSON.parse(fs.readFileSync(V2, 'utf8')) : {};

const wOf = (p) => (p.width != null ? p.width : 300);
function samp(o, n) {
  const p = o.path || [], seg = []; let L = 0;
  for (let i = 0; i < p.length - 1; i++) { const q = Math.hypot(p[i + 1].pos[0] - p[i].pos[0], p[i + 1].pos[1] - p[i].pos[1]); seg.push(q); L += q; }
  const pts = [];
  for (let t = 0; t <= n && L > 0; t++) {
    let want = L * t / n, acc = 0, i = 0;
    while (i < seg.length && acc + seg[i] < want) { acc += seg[i]; i++; }
    if (i >= seg.length) i = seg.length - 1;
    if (!p[i] || !p[i + 1]) break;
    const f = seg[i] ? (want - acc) / seg[i] : 0;
    pts.push([p[i].pos[0] + (p[i + 1].pos[0] - p[i].pos[0]) * f, p[i].pos[1] + (p[i + 1].pos[1] - p[i].pos[1]) * f]);
  }
  return { pts, L };
}
const meanNear = (a, b) => { let s = 0; for (const q of a.pts) { let m = Infinity; for (const r of b.pts) m = Math.min(m, Math.hypot(q[0] - r[0], q[1] - r[1])); s += m; } return s / Math.max(1, a.pts.length); };

let tagged = 0, renamed = 0;
const log = [];
for (const zid of Object.keys(d)) {
  const gz = d[zid], vz = v2all[zid];
  if (!vz) continue;
  for (const key of ['rivers', 'ridges']) {
    for (const g of (gz[key] || [])) {
      if (g._mirroredFrom) continue;
      const sg = samp(g, 40); if (!(sg.L > 0)) continue;
      let best = null;
      for (const v of (vz[key] || [])) {
        if (v._mirroredFrom) continue;
        // '경계강'·'경계산맥'은 존 경계용 자리표 이름이라 지명 가치가 없다 — 병기해도 정보 0.
        if (/^경계/.test(v.name || '')) continue;
        const sv = samp(v, 40); if (!(sv.L > 0)) continue;
        const dist = (meanNear(sg, sv) + meanNear(sv, sg)) / 2;
        if (!best || dist < best.d) best = { d: dist, name: v.name };
      }
      if (!best || best.d > NEAR || best.name === g.name) continue;
      g.altName = best.name;                       // ★비파괴: 기하·기존 이름 그대로, 지명만 병기
      tagged++;
      log.push('  ' + zid + '/' + key + ' ' + g.name + '  ⟵ v2 지명 「' + best.name + '」 (편차 ' + (best.d / 32).toFixed(1) + '셀)');
      if (RENAME) { g.name = best.name; g.altName = undefined; delete g.altName; renamed++; }
    }
  }
}

d._canon = {
  version: 'v3',
  base: 'server/hanbando-terrain.json (v7/v8 월드 · 마을 50)',
  merged: path.basename(V2) + ' — 기하는 이미 포함되어 있어 지명만 흡수',
  note: '지형 파일은 이제 이것 하나가 정본이다. hanbando_terrain_v2.json 은 조상이므로 참조하지 말 것.',
  renamed: RENAME,
};

fs.writeFileSync(OUT, JSON.stringify(d), 'utf8');
console.log('지형 정본 v3 →', OUT);
console.log('  존 ' + Object.keys(d).filter((k) => k[0] !== '_').length + ' · 한반도 강 ' + d.hanbando.rivers.length
  + ' · 산맥 ' + d.hanbando.ridges.length + ' · 숲 ' + d.hanbando.forests.length
  + ' · 호수 ' + d.hanbando.lakes.length + ' · 고개 ' + (d.hanbando.passes || []).length + ' · 마을 ' + (d.hanbando.villages || []).length);
console.log('  v2 지명 병기 ' + tagged + '건' + (RENAME ? (' · ★실제 개명 ' + renamed + '건') : ' (개명 안 함 — altName 으로만)'));
for (const l of log) console.log(l);
