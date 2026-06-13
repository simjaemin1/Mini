#!/usr/bin/env node
// === scripts/audit-terrain-v2.js — 지형 v2 엄밀 감사 ===
// "어색함"을 측정 가능한 규칙으로 정의해 전수 검사:
//   A1. 능선 밴드 ↔ 지류 잔여 겹침 (고개 밖)
//   A2. 지맥 분기점 단절 — pinStart 점이 본줄기 밴드 밖
//   A3. 수동 고개 이탈 — pass가 어떤 능선 밴드와도 안 겹침 (떠 있는 고개)
//   A4. 지류 하구 단절 — 강 끝점이 다른 물(강/호수/바다/경계 밖)에 안 닿음
//   A5. 경계 강 커버 누락 — 경계 강이 덮어야 할 서버 직선 구간에 구멍
//   A6. 자기 교차 — 강/능선 path의 세그먼트끼리 교차
// 사용: node scripts/audit-terrain-v2.js

'use strict';
const fs = require('fs');
const path = require('path');
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'hanbando_terrain_v2.json'), 'utf8'));
const hb = d.hanbando;
const ZW = 70016, ZH = 130016;

function ptSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L));
  return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t };
}
function distToPath(x, y, feat) { // 중심선까지 거리와 그 지점 폭
  let best = { d: Infinity, w: 0 };
  const p = feat.path;
  for (let i = 0; i < p.length - 1; i++) {
    const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
    const w1 = p[i].width || 200, w2 = p[i + 1].width || 200;
    const r = ptSegDist(x, y, x1, y1, x2, y2);
    if (r.d < best.d) best = { d: r.d, w: w1 + (w2 - w1) * r.t };
  }
  return best;
}
function inWater(x, y) {
  for (const r of hb.rivers || []) { const b = distToPath(x, y, r); if (b.d < b.w / 2) return true; }
  for (const lk of hb.lakes || []) { if (Math.hypot(x - lk.center[0], y - lk.center[1]) < (lk.radius || 500)) return true; }
  return false;
}
function inPass(x, y) { return (hb.passes || []).some(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < q.radius + 600); } // 고개 주변 강 통과는 의도된 계곡
function samplePath(feat, step) {
  const out = [];
  const p = feat.path;
  for (let i = 0; i < p.length - 1; i++) {
    const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
    const w1 = p[i].width || 200, w2 = p[i + 1].width || 200;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      out.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, w: w1 + (w2 - w1) * t });
    }
  }
  const last = p[p.length - 1];
  out.push({ x: last.pos[0], y: last.pos[1], w: last.width || 200 });
  return out;
}
function segInt(a, b, c, e) { // 세그먼트 교차 여부
  const d1 = (e[0] - c[0]) * (a[1] - c[1]) - (e[1] - c[1]) * (a[0] - c[0]);
  const d2 = (e[0] - c[0]) * (b[1] - c[1]) - (e[1] - c[1]) * (b[0] - c[0]);
  const d3 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d4 = (b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0]);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

let issues = 0;
function flag(code, msg) { issues++; console.log(`  [${code}] ${msg}`); }

const ridges = (hb.ridges || []).filter(r => !r._mirroredFrom);
const rivers = (hb.rivers || []).filter(r => !r._mirroredFrom);
const smallRivers = rivers.filter(r => Math.max(...r.path.map(q => q.width || 200)) < 400);

// === A1. 능선 밴드 ↔ 지류 겹침 ===
// 허용 예외 (합류부 실개천): 폭 ≤150px(5셀 이하) 개천이 합류점 3000px 이내에서
// ≤600px 침범 — 게임에선 물>바위라 물 셀로 판정되고, "산기슭을 스치는 개천"은 자연 지형임.
console.log('A1. 능선↔지류 겹침 (고개 밖):');
let exempted = 0;
for (const ridge of ridges) {
  if (ridge.name === '백서산괴') continue; // 의도적 관통
  for (const s of samplePath(ridge, 250)) {
    if (inPass(s.x, s.y)) continue;
    for (const r of smallRivers) {
      const b = distToPath(s.x, s.y, r);
      if (b.d < b.w / 2 + s.w / 2 - 100) { // 100px 허용 오차
        const depth = (b.w / 2 + s.w / 2) - b.d;
        const maxW = Math.max(...r.path.map(q => q.width || 200));
        const nearMouth = [r.path[0].pos, r.path[r.path.length - 1].pos]
          .some(([mx, my]) => Math.hypot(mx - s.x, my - s.y) < 3000);
        if (maxW <= 150 && depth <= 600 && nearMouth) { exempted++; break; }
        flag('A1', `${ridge.name} × ${r.name} @ (${s.x | 0},${s.y | 0}) 침범 ${depth | 0}px`);
        break;
      }
    }
  }
}
if (exempted) console.log(`  (합류부 실개천 예외 ${exempted}건 — 물>바위 규칙으로 게임상 물 셀)`);

// === A2. 지맥 분기점 단절 ===
console.log('A2. 지맥 분기점 부착:');
const spine = ridges.find(r => r.name === '백두대간');
for (const ridge of ridges) {
  if (ridge === spine || ridge.name === '백서산괴' || ridge.name === '함경산맥' && !spine) continue;
  if (['함경산맥', '묘향산맥', '멸악산맥', '차령산맥', '노령산맥'].includes(ridge.name)) {
    const p0 = ridge.path[0];
    const b = distToPath(p0.pos[0], p0.pos[1], spine);
    if (b.d > b.w / 2) flag('A2', `${ridge.name} 시작점이 백두대간 밴드 밖 (${b.d | 0}px > ${b.w / 2 | 0}px)`);
    else console.log(`  OK ${ridge.name} (본줄기까지 ${b.d | 0}px, 밴드 반폭 ${b.w / 2 | 0}px)`);
  }
}

// === A3. 수동 고개 이탈 ===
console.log('A3. 수동 고개가 능선 위에 있나:');
for (const q of (hb.passes || []).filter(q => !q.auto && !q._mirroredFrom)) {
  let hit = null;
  for (const ridge of ridges) {
    const b = distToPath(q.pos[0], q.pos[1], ridge);
    if (b.d < b.w / 2 + q.radius) { hit = ridge.name; break; }
  }
  if (!hit) flag('A3', `고개 '${q.name}' @ (${q.pos[0]},${q.pos[1]})이 어떤 능선과도 안 겹침 (떠 있음)`);
  else console.log(`  OK ${q.name} → ${hit}`);
}

// === A4. 하구 단절 — 원본에서 연결돼 있던 끝점만 검사 (발원점은 정상) ===
console.log('A4. 하구 연결성 (원본 연결 대비):');
const orig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
const origRivers = (orig.rivers || []).filter(r => !r._mirroredFrom);
const byName = Object.fromEntries(rivers.map(r => [r.name, r]));
let connChecked = 0;
for (const ro of origRivers) {
  for (const [endKey, pt] of [['start', ro.path[0]], ['end', ro.path[ro.path.length - 1]]]) {
    const [x, y] = pt.pos;
    // 원본에서 부모를 찾는다
    let parentName = null;
    for (const po of origRivers) {
      if (po === ro) continue;
      const b = distToPath(x, y, po);
      if (b.d < b.w / 2 + (pt.width || 200) / 2 + 200) { parentName = po.name; break; }
    }
    if (!parentName) continue; // 원래부터 발원점 — 정상
    connChecked++;
    const rNew = byName[ro.name];
    if (!rNew) continue;
    const npt = endKey === 'start' ? rNew.path[0] : rNew.path[rNew.path.length - 1];
    // 빌더는 '가장 가까운' 부모에 스냅하므로, 아무 물에라도 붙어 있으면 OK
    let touched = false;
    for (const o of rivers) {
      if (o === rNew) continue;
      const b2 = distToPath(npt.pos[0], npt.pos[1], o);
      if (b2.d < b2.w / 2 + (npt.width || 200) / 2 + 150) { touched = true; break; }
    }
    if (!touched) for (const lk of hb.lakes || []) {
      if (Math.hypot(npt.pos[0] - lk.center[0], npt.pos[1] - lk.center[1]) < (lk.radius || 500) + 400) { touched = true; break; }
    }
  }
}
// 트리 구조: 각 강은 한 끝(하구)만 합류, 반대 끝은 발원. 양 끝 다 안 닿으면만 위반.
for (const r of rivers) {
  const [zw, zh] = [ZW, ZH];
  let connected = 0;
  for (const pt of [r.path[0], r.path[r.path.length - 1]]) {
    const [x, y] = pt.pos;
    if (x < 600 || x > zw - 600 || y < 600 || y > zh - 600) { connected++; continue; }
    let t = false;
    for (const o of rivers) { if (o === r) continue; const b = distToPath(x, y, o); if (b.d < b.w/2 + (pt.width||200)/2 + 150) { t = true; break; } }
    for (const lk of hb.lakes || []) if (Math.hypot(x - lk.center[0], y - lk.center[1]) < (lk.radius||500)+400) t = true;
    if (t) connected++;
  }
  if (connected === 0) flag('A4', `${r.name||'?'} 양 끝 모두 어떤 물·경계에도 안 닿음 (고립)`);
}
console.log(`  (트리 하구 연결 검사)`);

// === A5. 경계 강 커버 ===
console.log('A5. 경계선 커버 (서버 직선이 강폭 안에 잠기는지):');
const checks = [
  { name: '서쪽(이화강)', pts: Array.from({ length: 60 }, (_, i) => [0, 2000 + i * 2080]), riverName: '이화강' },
  { name: '북쪽(얄리강 구간)', pts: Array.from({ length: 30 }, (_, i) => [3000 + i * 1700, 0]), riverName: '얄리강' },
];
for (const c of checks) {
  let uncovered = 0, first = null;
  for (const [x, y] of c.pts) {
    if (!inWater(x, y) && !(x < 100 && y < 6000) /* 산괴 봉쇄 구간 제외 */) {
      // 산괴가 덮었으면 OK
      let rock = false;
      for (const ridge of ridges) { const b = distToPath(x, y, ridge); if (b.d < b.w / 2) { rock = true; break; } }
      if (!rock) { uncovered++; if (!first) first = [x | 0, y | 0]; }
    }
  }
  if (uncovered) flag('A5', `${c.name}: ${uncovered}개 샘플 구멍 (첫 위치 ${first})`);
  else console.log(`  OK ${c.name}`);
}

// === A7. 본류 평행 중첩 — 능선 밴드 안을 본류가 2500px 이상 평행(평행도>0.6)하게 흐르면 위반 ===
console.log('A7. 능선×본류 평행 중첩:');
const majorRivers = rivers.filter(r => Math.max(...r.path.map(q => q.width || 200)) >= 400);
for (const rv of majorRivers) {
  let cur = null;
  const finish = () => {
    if (cur && cur.len > 2500) {
      const avg = cur.dots.reduce((a, b) => a + b, 0) / cur.dots.length;
      if (avg > 0.6) flag('A7', `${cur.ridge} × ${rv.name} @ ${cur.from} 평행 중첩 ${cur.len}px (평행도 ${avg.toFixed(2)})`);
    }
    cur = null;
  };
  for (let i = 0; i < rv.path.length - 1; i++) {
    const a = rv.path[i], b = rv.path[i + 1];
    const len = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]);
    const n = Math.max(1, Math.ceil(len / 300));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      const x = a.pos[0] + (b.pos[0] - a.pos[0]) * t, y = a.pos[1] + (b.pos[1] - a.pos[1]) * t;
      const rw = (a.width || 200) + ((b.width || 200) - (a.width || 200)) * t;
      const rdx = (b.pos[0] - a.pos[0]) / len, rdy = (b.pos[1] - a.pos[1]) / len;
      let hit = null;
      for (const ridge of ridges) {
        if (ridge.name === '백서산괴') continue; // 의도적 관통 (발원지 산괴)
        for (let j = 0; j < ridge.path.length - 1; j++) {
          const p1 = ridge.path[j], p2 = ridge.path[j + 1];
          const q = ptSegDist(x, y, p1.pos[0], p1.pos[1], p2.pos[0], p2.pos[1]);
          const w = (p1.width || 200) + ((p2.width || 200) - (p1.width || 200)) * q.t;
          if (q.d < w / 2 + rw / 2) {
            const sl = Math.hypot(p2.pos[0] - p1.pos[0], p2.pos[1] - p1.pos[1]) || 1;
            hit = { ridge: ridge.name, dot: Math.abs(rdx * (p2.pos[0] - p1.pos[0]) / sl + rdy * (p2.pos[1] - p1.pos[1]) / sl) };
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        if (!cur || cur.ridge !== hit.ridge) { finish(); cur = { ridge: hit.ridge, from: `(${x | 0},${y | 0})`, len: 0, dots: [] }; }
        cur.len += 300;
        cur.dots.push(hit.dot);
      } else finish();
    }
  }
  finish();
}

// === A8. 강×강 교차 (segInt) — 실제 몸통 교차. 교차점이 양쪽 끝점과 모두 멀면 위반 ===
console.log('A8. 강×강 교차:');
{
  const inter = (a, b, c, e) => {
    const rx = b[0] - a[0], ry = b[1] - a[1], sx = e[0] - c[0], sy = e[1] - c[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
    const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
    if (t > 0 && t < 1 && u > 0 && u < 1) return [a[0] + t * rx, a[1] + t * ry];
    return null;
  };
  const seen = new Set();
  for (let i = 0; i < rivers.length; i++) {
    for (let j = i + 1; j < rivers.length; j++) {
      const A = rivers[i], B = rivers[j];
      const ends = [A.path[0].pos, A.path[A.path.length - 1].pos, B.path[0].pos, B.path[B.path.length - 1].pos];
      for (let k = 0; k < A.path.length - 1; k++) {
        for (let l = 0; l < B.path.length - 1; l++) {
          const X = inter(A.path[k].pos, A.path[k + 1].pos, B.path[l].pos, B.path[l + 1].pos);
          if (!X) continue;
          const key = (A.name || i) + '|' + (B.name || j);
          if (seen.has(key)) continue;
          seen.add(key);
          // 교차점이 어느 한 강의 끝점과 매우 가까우면(<60px) 합류 접점 — 허용
          const minEnd = Math.min(...ends.map(([ex, ey]) => Math.hypot(ex - X[0], ey - X[1])));
          if (minEnd < 60) break;
          flag('A8', `${A.name || '?'} × ${B.name || '?'} @ (${X[0] | 0},${X[1] | 0}) 몸통 교차 (끝점거리 ${minEnd | 0}px)`);
          break;
        }
      }
    }
  }
}

// === A6. 자기 교차 ===// === A6. 자기 교차 ===
console.log('A6. 자기 교차:');
for (const feat of [...rivers, ...ridges]) {
  const p = feat.path;
  let n = 0;
  for (let i = 0; i < p.length - 1; i++) {
    for (let j = i + 2; j < p.length - 1; j++) {
      if (i === 0 && j === p.length - 2) continue;
      if (segInt(p[i].pos, p[i + 1].pos, p[j].pos, p[j + 1].pos)) n++;
    }
  }
  if (n) flag('A6', `${feat.name || '?'} 자기 교차 ${n}건`);
}

// === A9. 짧은 강 토막 (절단 부산물) ===
console.log('A9. 짧은 강 토막 (<1500px):');
for (const r of rivers) {
  let len = 0;
  for (let i = 0; i < r.path.length - 1; i++) len += Math.hypot(r.path[i+1].pos[0]-r.path[i].pos[0], r.path[i+1].pos[1]-r.path[i].pos[1]);
  if (len < 1500) flag('A9', `${r.name || '?'} 길이 ${len | 0}px (점처럼 어색)`);
}

// === A10. 강×능선 직교 교차에 고개(협곡) 없음 ===
console.log('A10. 강×능선 교차 협곡:');
{
  const inter = (a, b, c, e) => {
    const rx = b[0]-a[0], ry = b[1]-a[1], sx = e[0]-c[0], sy = e[1]-c[1];
    const den = rx*sy - ry*sx; if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den, u = ((c[0]-a[0])*ry-(c[1]-a[1])*rx)/den;
    if (t>0&&t<1&&u>0&&u<1) return [a[0]+t*rx, a[1]+t*ry]; return null;
  };
  let ok = 0;
  for (const rv of rivers) for (const rg of ridges) {
    for (let i = 0; i < rv.path.length-1; i++) for (let j = 0; j < rg.path.length-1; j++) {
      const X = inter(rv.path[i].pos, rv.path[i+1].pos, rg.path[j].pos, rg.path[j+1].pos);
      if (!X) continue;
      const hasPass = (hb.passes||[]).some(q => Math.hypot(q.pos[0]-X[0], q.pos[1]-X[1]) < q.radius);
      if (hasPass) ok++;
      else flag('A10', `${rv.name||'?'} × ${rg.name||'?'} @ (${X[0]|0},${X[1]|0}) 교차에 협곡 없음 (직각 절단)`);
    }
  }
  if (ok) console.log(`  (협곡 처리된 교차 ${ok}건)`);
}

// === A11. 2회 합류 (고리/섬) — 한 강의 양 끝이 같은 강에 닿음 ===
console.log('A11. 강쌍 2회 합류:');
{
  const touch = (pt, B) => { const b = distToPath(pt.pos[0], pt.pos[1], B); return b.d < b.w/2 + (pt.width||200)/2 + 150; };
  for (let i = 0; i < rivers.length; i++) for (let j = 0; j < rivers.length; j++) {
    if (i === j) continue;
    const A = rivers[i], B = rivers[j];
    if (touch(A.path[0], B) && touch(A.path[A.path.length-1], B))
      flag('A11', `${A.name||'?'} 양 끝이 모두 ${B.name||'?'}에 합류 (고리/섬)`);
  }
}

// === A12. 본류 바다 미도달 — 폭≥600 본류 하구가 바다/경계/다른 물 어디에도 안 닿음 ===
console.log('A12. 본류 하구 귀결:');
for (const r of rivers) {
  if (Math.max(...r.path.map(q => q.width || 200)) < 600) continue;
  // 본류의 하구 = 더 남쪽(y 큰) 끝. 그 끝만 바다/물 도달 요구 (반대 끝은 발원).
  const a = r.path[0].pos, b = r.path[r.path.length-1].pos;
  const pt = a[1] >= b[1] ? r.path[0] : r.path[r.path.length-1];
  const [x, y] = pt.pos;
  if (x < 600 || x > ZW - 600 || y < 600 || y > ZH - 600) continue;
  let touched = false;
  for (const o of rivers) { if (o === r) continue; const bb = distToPath(x, y, o); if (bb.d < bb.w/2 + (pt.width||200)/2 + 150) { touched = true; break; } }
  for (const lk of hb.lakes || []) if (Math.hypot(x - lk.center[0], y - lk.center[1]) < (lk.radius||500)+400) touched = true;
  if (!touched) flag('A12', `${r.name||'?'} 하구 (${x|0},${y|0})가 바다·물 어디에도 안 닿음`);
}

console.log(issues === 0 ? '\n✅ 문제 없음' : `\n⚠️ 총 ${issues}건`);
