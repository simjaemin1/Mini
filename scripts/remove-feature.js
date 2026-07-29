#!/usr/bin/env node
// === scripts/remove-feature.js — 이름으로 지형 피처를 지운다(딸린 것까지 재 보고) ===
//
// 지형에서 무언가를 지우는 건 그 자체로는 한 줄이지만, **딸린 것들**이 있다:
//   · 그 물로 흘러들던 강 — 하구가 허공에 남는다
//   · 그 물에 붙어 살던 마을 — 특히 어촌이면 물이 없어진다
//   · 그 위를 건너던 다리 — 헛다리가 된다
// 그래서 지우기 **전에** 전부 재서 보여 주고, --apply 라야 실제로 지운다.
//
// 실행: node scripts/remove-feature.js --name 명호 [--kind lakes] [--zone hanbando] [--apply]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const NAME = val('--name', null);
const KIND = val('--kind', null);
const ZID = val('--zone', 'hanbando');
if (!NAME) { console.error('--name 필요'); process.exit(2); }

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const d = world[ZID];
const P = (q) => q.pos || [q.x, q.y];
const KINDS = KIND ? [KIND] : ['lakes', 'rivers', 'ridges', 'forests', 'passes', 'ores'];

const hits = [];
for (const k of KINDS) for (const f of (d[k] || [])) if (f.name === NAME) hits.push({ k, f });
if (!hits.length) { console.error('없음: ' + NAME + ' (존 ' + ZID + ')'); process.exit(1); }
console.log('=== 「' + NAME + '」 제거 · ' + ZID + (APPLY ? ' · 기록' : ' · 계산만') + ' ===');

for (const { k, f } of hits) {
  const c = f.center || f.pos;
  const r = f.radius || Math.max(f.rx || 0, f.ry || 0) || 0;
  console.log('  ' + k + ' 「' + f.name + '」' + (c ? ' @' + c.map(Math.round) + (r ? ' r' + Math.round(r) : '') : ' 경로 ' + (f.path || []).length + '점'));
  if (!c) continue;

  // ① 이 물로 흘러들던 강
  for (const rv of (d.rivers || [])) {
    if (rv === f || rv._mirroredFrom) continue;
    const p = rv.path || []; if (p.length < 2) continue;
    for (const [lab, q0] of [['시작', p[0]], ['끝', p[p.length - 1]]]) {
      const q = P(q0);
      const gap = Math.hypot(q[0] - c[0], q[1] - c[1]) - r;
      if (gap > 8 * 32) continue;
      // 이 물 말고 다른 물이 받아 주는가
      let alt = null;
      for (const o of (d.rivers || [])) {
        if (o === rv || o === f || o._mirroredFrom) continue;
        const op = o.path || [];
        for (let i = 0; i < op.length - 1; i++) {
          const a = P(op[i]), b = P(op[i + 1]);
          const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
          let t = ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
          const w = ((op[i].width || 200) + ((op[i + 1].width || 200) - (op[i].width || 200)) * t) / 2;
          const dd = Math.hypot(q[0] - (a[0] + vx * t), q[1] - (a[1] + vy * t)) - w;
          if (!alt || dd < alt.d) alt = { d: dd, n: o.name };
        }
      }
      const ok = alt && alt.d <= 2 * 32;
      console.log('    ↳ 강 ' + rv.name + '(' + lab + ') 이 여기로 흘러든다 — 대체 수용처: '
        + (alt ? alt.n + ' ' + (alt.d / 32).toFixed(1) + '셀' : '없음') + (ok ? '  ✔이미 닿아 있음' : '  ★하구가 허공에 남는다'));
    }
  }
  // ② 붙어 살던 마을
  for (const v of (terrain.getZoneVillages(ZID) || [])) {
    const gap = Math.hypot(v.x - c[0], v.y - c[1]) - r;
    if (gap > 60 * 32) continue;
    let alt = Infinity, an = '';
    for (const o of (d.rivers || [])) {
      if (o._mirroredFrom) continue;
      const op = o.path || [];
      for (let i = 0; i < op.length - 1; i++) {
        const a = P(op[i]), b = P(op[i + 1]);
        const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
        let t = ((v.x - a[0]) * vx + (v.y - a[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
        const w = ((op[i].width || 200) + ((op[i + 1].width || 200) - (op[i].width || 200)) * t) / 2;
        const dd = Math.hypot(v.x - (a[0] + vx * t), v.y - (a[1] + vy * t)) - w;
        if (dd < alt) { alt = dd; an = o.name; }
      }
    }
    for (const l of (d.lakes || [])) {
      if (l === f) continue; const lc = l.center; if (!lc) continue;
      const lr = l.radius || Math.max(l.rx || 0, l.ry || 0);
      const dd = Math.hypot(v.x - lc[0], v.y - lc[1]) - lr;
      if (dd < alt) { alt = dd; an = '호수 ' + l.name; }
    }
    const fishy = /어촌/.test(v.name);
    console.log('    ↳ 마을 ' + v.name + ' 이 ' + (gap / 32).toFixed(0) + '셀 거리 — 제거 후 가장 가까운 물: '
      + an + ' ' + (alt / 32).toFixed(0) + '셀' + (fishy && alt > 20 * 32 ? '  ★어촌인데 물이 멀어진다' : ''));
  }
  // ③ 위를 건너던 다리
  const b = (ZONES[ZID] || {}).bridges || [];
  let onIt = 0;
  for (let i = 0; i + 1 < b.length; i += 2) {
    const x = b[i] * 32 + 16, y = b[i + 1] * 32 + 16;
    if (Math.hypot(x - c[0], y - c[1]) <= r + 64) onIt++;
  }
  console.log('    ↳ 이 위를 지나는 다리 셀 ' + onIt + (onIt ? '  ★헛다리가 된다' : ''));
}

if (APPLY) {
  for (const k of KINDS) if (d[k]) d[k] = d[k].filter((f) => f.name !== NAME);
  // 이웃 존 미러 사본도 같이
  for (const z of Object.keys(world)) {
    if (z[0] === '_' || z === ZID) continue;
    for (const k of KINDS) if (world[z][k]) world[z][k] = world[z][k].filter((f) => !(f.name === NAME && f._mirroredFrom));
  }
  fs.copyFileSync(GAME, GAME + '.bak');
  fs.writeFileSync(GAME, JSON.stringify(world));
  console.log('\n★제거·기록 완료 (백업 .bak) — 도달성·다리·품질 검증을 이어서 돌릴 것');
} else console.log('\n계산만 — 지우려면 --apply');
