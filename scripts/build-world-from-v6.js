#!/usr/bin/env node
// === scripts/build-world-from-v6.js ===
// world v6.json(editorWork, 월드좌표 mf) → 게임 하드코딩 지형 포맷 (hanbando-terrain.json 형식)
//   존별 { rivers, lakes, ridges, passes, forests } — 존-로컬 좌표.
//   경로(강·산맥)는 존 경계에서 분할(경계점 1개 겹쳐 솔기 연속), 경계 넘는 지형은 존마다 그 지역 이름 사용.
// 출력: ../../world_terrain_v6.json  (비파괴 — 게임 파일은 따로 설치)
'use strict';
const fs = require('fs'), path = require('path');
const IN  = path.join(__dirname, '..', '..', process.argv[2] || 'world v7.json');
const OUT = path.join(__dirname, '..', '..', process.argv[3] || 'world_terrain_v7.json');

const { ZONES } = require('../server/zone-config.js');
const Z = {};
for (const id in ZONES) Z[id] = { off: [ZONES[id].worldOffsetX, ZONES[id].worldOffsetY], size: [ZONES[id].zoneWidth, ZONES[id].zoneHeight] };
const DRAWN = new Set(['nordan','europa','sahar','centaria','hindgang','sibara','jungwon_n','jungwon_s','bering','hanbando','nippon']);
const zoneAt = (x, y) => { for (const id in Z){ const o=Z[id].off, s=Z[id].size; if (x>=o[0]&&x<o[0]+s[0]&&y>=o[1]&&y<o[1]+s[1]) return id; } return null; };
const cen = f => f.center ? [f.center.x, f.center.y] : [f.path[0].x, f.path[0].y];
const nameFor = (f, zone) => { if (f.names && f.names.length){ const m=f.names.find(n=>n.zone===zone); return (m&&m.name) || f.names[0].name; } return f.name || ''; };

function runsInZone(p, zone){
  const inb = i => i>=0 && i<p.length && zoneAt(p[i].x, p[i].y)===zone;
  const inc = p.map((_, i) => inb(i) || inb(i-1) || inb(i+1));
  const runs = []; let cur = [];
  for (let i=0;i<p.length;i++){ if (inc[i]) cur.push(p[i]); else { if (cur.length>=2) runs.push(cur); cur=[]; } }
  if (cur.length>=2) runs.push(cur);
  return runs;
}

const j = JSON.parse(fs.readFileSync(IN, 'utf8'));
const F = j.mf;
const out = {};
const ens = z => (out[z] = out[z] || { rivers:[], lakes:[], ridges:[], passes:[], forests:[] });

let nR=0,nG=0,nL=0,nP=0,nF=0,split=0;
for (const f of F){
  if (f.type==='river' || f.type==='ridge'){
    // 이 path가 닿는 drawn 존들
    const zones = new Set(f.path.map(p=>zoneAt(p.x,p.y)).filter(z=>z&&DRAWN.has(z)));
    for (const zone of zones){
      const o = Z[zone].off;
      const runs = runsInZone(f.path, zone);
      if (runs.length>1) split++;
      for (const run of runs){
        const pathL = run.map(p => ({ pos:[Math.round(p.x-o[0]), Math.round(p.y-o[1])], width: p.w||300 }));
        const rec = { name: nameFor(f, zone), path: pathL };
        if (f.type==='river'){ rec._smoothed=true; ens(zone).rivers.push(rec); nR++; }
        else { rec.noValley=false; ens(zone).ridges.push(rec); nG++; }
      }
    }
  } else {
    const [cx,cy] = cen(f);
    // 면적형 bbox (경계에 걸치면 양쪽 존에 모두 넣어 안 잘리게)
    let ex, ey;
    if (f.type==='forest'){ ex=f.rx||4000; ey=f.ry||3000; }
    else if (f.type==='lake'){ ex=(f.rx!=null?f.rx:(f.radius||600)); ey=(f.ry!=null?f.ry:(f.radius||600)); }
    else { ex=ey=(f.radius||1200); }
    const bx0=cx-ex, by0=cy-ey, bx1=cx+ex, by1=cy+ey;
    const zones = [];
    for (const id of DRAWN){ const o=Z[id].off, s=Z[id].size;
      if (bx1>o[0] && bx0<o[0]+s[0] && by1>o[1] && by0<o[1]+s[1]) zones.push(id);
    }
    if (!zones.length) continue;
    for (const zone of zones){
      const o = Z[zone].off; const lc = [Math.round(cx-o[0]), Math.round(cy-o[1])];
      if (f.type==='lake'){
        const rec = { name: nameFor(f,zone), center: lc };
        if (f.rx!=null && f.ry!=null){ rec.shape='ellipse'; rec.a=f.rx; rec.b=f.ry; rec.rotation=0; }
        else { rec.shape='circle'; rec.radius=f.radius||600; }
        ens(zone).lakes.push(rec); nL++;
      } else if (f.type==='pass'){ ens(zone).passes.push({ name:nameFor(f,zone), pos:lc, radius:f.radius||1200 }); nP++; }
      else if (f.type==='forest'){ ens(zone).forests.push({ name:nameFor(f,zone), center:lc, rx:f.rx||4000, ry:f.ry||3000, densityMult:f.density||2 }); nF++; }
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(out));
console.log('빌드 완료 →', OUT);
console.log(`  존 ${Object.keys(out).length}개 | 강 ${nR} 산맥 ${nG} 호수 ${nL} 고개 ${nP} 숲 ${nF} (경계분할 ${split}건)`);
for (const z of Object.keys(out)){ const d=out[z]; console.log(`   ${z.padEnd(11)} 강${d.rivers.length} 산맥${d.ridges.length} 호수${d.lakes.length} 고개${d.passes.length} 숲${d.forests.length}`); }
