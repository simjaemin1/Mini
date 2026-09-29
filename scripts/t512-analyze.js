#!/usr/bin/env node
// === scripts/t512-analyze.js — 유령이 얼마나 늦고 어디에 있나 · 화살 판정이 두 존에서 같은가(T512 · 러너 밖) ===========
//   node scripts/t512-analyze.js <판 디렉터리>…   (t512-flows 가 남긴 probe-*.jsonl)
//   ⓐ 받는 존(닛폰)의 유령 표본마다 **같은 벽시계**의 참 자리(보낸 존 한반도 20ms 표본 · 선형 보간)와 견준 오차 px
//      · 유령 나이 = 그 유령 자리가 참이었던 가장 늦은 때부터 지금까지(ms) · 뒤로 튐 = 보낸 시각(`t` · 팔 켬 판만 실린다)이 앞 유령보다 이른 새 유령(순서 뒤바뀜)
//      · 팔 켬 판은 화살 판정이 실제로 쓰는 자리(보낸 시각 `t` 부터 속도로 민 자리)로 잰다.
//   ⓑ 화살: 유령 자리 한가운데로 반경 R(=ARROW_HIT_R 40) 안을 지나는 화살이 참 몸 반경 R 에 **안** 드는 몫 = 1 − 겹침/πR² (두 원 렌즈)
//      — 받는 존이 "맞았다"고 판정해 보낸 `/cross_damage` 를 보낸 존은 **다시 재지 않는다**(zone.js `/cross_damage` — 자리 검사 0).
//   ⓒ `/ghost_sync` 날아가는 중 최대 · ms 분포 · 실패 · `fire`(떠나는 존 인계 ms).
'use strict';
const fs = require('fs');
const path = require('path');
const R = 40;
const lens = (d) => d >= 2 * R ? 0 : 2 * R * R * Math.acos(d / (2 * R)) - (d / 2) * Math.sqrt(4 * R * R - d * d);
const miss = (e) => 1 - lens(e) / (Math.PI * R * R);
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const r1 = (x) => x == null ? '-' : (+x).toFixed(1);
for (const dir of process.argv.slice(2)) {
  const rd = (z) => { const f = path.join(dir, `probe-${z}.jsonl`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
  const H = rd('hanbando'), N = rd('nippon');
  const truth = new Map();   // playerId → [[t,x,y,vx,vy]…]
  for (const o of H) if (o.k === 's') for (const [id, x, y, vx, vy] of o.me) { if (!truth.has(id)) truth.set(id, []); truth.get(id).push([o.t, x, y, vx, vy]); }
  const at = (arr, t) => { let lo = 0, hi = arr.length - 1; if (!arr.length || t < arr[0][0] || t > arr[hi][0]) return null;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][0] <= t) lo = m; else hi = m; }
    const a = arr[lo], b = arr[hi], f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3]]; };
  const lagOf = (arr, t, gx, gy) => { let best = null, bd = 1e9; for (let i = arr.length - 1; i >= 0; i--) { const s = arr[i]; if (s[0] > t) continue; if (t - s[0] > 2000) break; const d = Math.hypot(s[1] - gx, s[2] - gy); if (d < bd - 1e-9) { bd = d; best = t - s[0]; } if (d < 0.5) break; } return best; };
  const rows = { walk: { e: [], lag: [], mis: [] }, run: { e: [], lag: [], mis: [] } };
  let back = null, prevTs = null, nG = 0;
  for (const o of N) {
    if (o.k !== 's') continue;
    for (const [id, ax, ay, vx, vy, recvAt, ts] of o.gh) {
      const arr = truth.get(id); if (!arr) continue;
      const tr = at(arr, o.t); if (!tr) continue;
      const spd = Math.abs(tr[2]); if (spd < 1) continue;     // 서 있는 동안은 오차가 0 이라 판정이 자명 — 움직일 때만
      const age = (typeof ts === 'number') ? Math.min(1500, Math.max(0, o.t - ts)) / 1000 : 0;
      const gx = ax + vx * age, gy = ay + vy * age;
      const e = Math.hypot(gx - tr[0], gy - tr[1]);
      const lag = lagOf(arr, o.t, ax, ay);
      const k = spd > 100 ? 'run' : 'walk';
      rows[k].e.push(e); rows[k].mis.push(miss(e)); if (lag != null) rows[k].lag.push(lag);
      if (typeof ts === 'number') { if (back == null) back = 0; if (prevTs != null && ts < prevTs) back++; prevTs = ts; }   // 순서 뒤바뀜 = 보낸 시각이 뒤로 간 새 유령(팔 켬 판만 잰다)
      nG++;
    }
  }
  const posts = H.filter((o) => o.k === 'post' && o.p === '/ghost_sync').map((o) => o.ms);
  const fails = H.filter((o) => o.k === 'postfail').length;
  const maxIn = Math.max(0, ...H.filter((o) => o.k === 'max').map((o) => o.maxIn));
  const fireH = H.filter((o) => o.k === 'fire').map((o) => o.ms), fireN = N.filter((o) => o.k === 'fire').map((o) => o.ms);
  const prepH = H.filter((o) => o.k === 'post' && o.p === '/handoff_prepare').map((o) => o.ms), prepN = N.filter((o) => o.k === 'post' && o.p === '/handoff_prepare').map((o) => o.ms);
  console.log(`\n## ${path.basename(dir)} — 유령 표본 ${nG}`);
  for (const k of ['walk', 'run']) { const R2 = rows[k]; if (!R2.e.length) continue;
    const mm = R2.mis.reduce((a, b) => a + b, 0) / R2.mis.length;
    console.log(`| ${k === 'walk' ? '걷기 64px/s' : '달리기 160px/s'} | 오차 중앙 ${r1(q(R2.e, 0.5))} · p95 ${r1(q(R2.e, 0.95))} · 최대 ${r1(Math.max(...R2.e))}px | 유령 나이 중앙 ${r1(q(R2.lag, 0.5))} · p95 ${r1(q(R2.lag, 0.95))}ms | 화살 판정 어긋남 ${(mm * 100).toFixed(1)}% (p95 오차에서 ${(miss(q(R2.e, 0.95)) * 100).toFixed(1)}%) |`); }
  console.log(`| 흐름 | /ghost_sync ms 중앙 ${r1(q(posts, 0.5))} · p95 ${r1(q(posts, 0.95))} · 날아가는 중 최대 ${maxIn} · 실패 ${fails} · 뒤로 튐 ${back == null ? '-(끔 판은 시각 없음)' : back} | 인계 한→닛 ${r1(q(fireH, 0.5))}ms(${fireH.length}) · 닛→한 ${r1(q(fireN, 0.5))}ms(${fireN.length}) · prepare 한→닛 ${r1(q(prepH, 0.5))} · 닛→한 ${r1(q(prepN, 0.5))}ms |`);
  fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify({ nG, rows: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { n: v.e.length, e50: q(v.e, 0.5), e95: q(v.e, 0.95), lag50: q(v.lag, 0.5), lag95: q(v.lag, 0.95), mis: v.mis.length ? v.mis.reduce((a, b) => a + b, 0) / v.mis.length : null }])), posts: { n: posts.length, p50: q(posts, 0.5), p95: q(posts, 0.95), maxIn, fails, back }, fire: { h: q(fireH, 0.5), n: q(fireN, 0.5), nh: fireH.length, nn: fireN.length }, prep: { h: q(prepH, 0.5), n: q(prepN, 0.5) } }, null, 1));
}
