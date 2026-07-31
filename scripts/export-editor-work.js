#!/usr/bin/env node
// === scripts/export-editor-work.js — 게임 지형 → 맵 에디터 **작업 파일**(editorWork) ===
//
// ★재민 지적: "파일 중에 v9까지 있는데 그건 뭐야? 그걸 기준으로 해야 하는 거 아냐?
//   그리고 향목호 옆 강 이상한데? 기존 강 그대로에 옅은 강이 추가되기만 했어. 경계강 이름도 그대로고."
//
// 실측으로 정리된 관계(전부 디바이스 ~/Mini 파일):
//   world v9.json           = 맵 에디터 **작업 파일**(editorWork:true) — 사람이 그리는 원본
//                             · features(174) = 한반도 단일존 작업 — ★낡았다(향목호·한울못·경계강/산맥/숲/고개 36건)
//                             · mf(540)       = 전체 월드 작업 — 현행(경계고개 4건만)
//   world_terrain_v9.json   = 그 작업을 빌드한 결과 = **게임이 로드하는 파일과 동일**(빈 villages 키만 차이)
//   server/hanbando-terrain.json = 정본(게임). 11차 수정은 전부 여기에 들어갔다.
//
// ⇒ "옅은 강이 추가되기만 했다"의 정체: 에디터가 그리는 건 **참조(옅음) + 작업 피처(진함)** 두 겹인데,
//    단일존 모드의 작업 피처가 낡은 v2 세계였다. 참조만 갈아 끼워선 안 보이는 게 당연했다.
// ⇒ 그리고 **더 큰 문제**: 11차 수정은 빌드 결과에만 있고 작업 파일에는 없다.
//    저 작업 파일로 다시 빌드하면 고친 게 전부 날아간다. 그래서 이 스크립트로 작업 파일을 되돌려 만든다.
//
// 출력: ../world v10.json   (에디터 「작업 불러오기」로 연다)
// 사용: node scripts/export-editor-work.js
'use strict';
const fs = require('fs');
const path = require('path');

const V3 = path.join(__dirname, '..', '..', 'hanbando_terrain_v3.json');
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const SRC = fs.existsSync(V3) ? V3 : GAME;
const OUT = path.join(__dirname, '..', '..', 'world v10.json');
const MAIN = 'hanbando';
const R = Math.round;

const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));

// ★에디터 전체 월드 모드의 존 배치(map-editor.html WZONES 와 **같아야 한다**).
//   zone-config 의 worldOffsetX/Y 가 곧 그 값이다 — 한반도 409984/49984 로 대조 확인했다.
const offOf = (zid) => {
  const z = ZONES[zid] || {};
  return [z.worldOffsetX || 0, z.worldOffsetY || 0];
};

let nextId = 1;
const P = (p) => p.pos ? p.pos : [p.x, p.y];
const wOf = (p, rv) => (p.width != null) ? p.width : (rv.width || 200);
const FLAGS = { noFit: false, noValley: false, pinStart: false };

function featsOf(zid, ox, oy) {
  const d = all[zid] || {};
  const out = [];
  const line = (kind, arr) => {
    for (const f of (arr || [])) {
      if (f._mirroredFrom) continue;
      const p = (f.path || []);
      if (p.length < 2) continue;
      out.push({
        id: nextId++, type: kind, name: f.name, flags: { ...FLAGS },
        path: p.map((q) => ({ x: R(P(q)[0] + ox), y: R(P(q)[1] + oy), w: R(wOf(q, f)) })),
      });
    }
  };
  const blob = (kind, arr, rk) => {
    for (const f of (arr || [])) {
      if (f._mirroredFrom) continue;
      const c = f.center || f.pos; if (!c) continue;
      const o = { id: nextId++, type: kind, name: f.name, center: { x: R(c[0] + ox), y: R(c[1] + oy) } };
      if (kind === 'forest') { o.rx = R(f.rx || 4000); o.ry = R(f.ry || 3000); o.density = f.densityMult || 1.5; }
      else o.radius = R(f[rk] || Math.max(f.rx || 0, f.ry || 0) || 600);
      out.push(o);
    }
  };
  line('river', d.rivers);
  line('ridge', d.ridges);
  line('valley', d.valleys);   // ★[11차] 계곡 = 산맥을 가로지르는 선형 통로(강·산맥과 같은 path+width)
  blob('forest', d.forests);
  blob('lake', d.lakes, 'radius');
  blob('pass', d.passes, 'radius');
  blob('ore', d.ores, 'radius');
  for (const v of (d.villages || [])) out.push({ id: nextId++, type: 'village', name: v.name, center: { x: R(v.x + ox), y: R(v.y + oy) }, radius: 500 });
  return out;
}

// features = 한반도 단일존(존 로컬 좌표) · mf = 전 존(월드 좌표)
const features = featsOf(MAIN, 0, 0);
let mf = [];
for (const zid of Object.keys(all)) {
  if (zid[0] === '_' || !ZONES[zid]) continue;
  const [ox, oy] = offOf(zid);
  mf = mf.concat(featsOf(zid, ox, oy));
}

// ★스탬프 — "지금 화면에 뜬 게 언제 것인가"를 에디터가 스스로 말하게 하려면 판본 식별자가 필요하다.
//   재민이 두 번 당한 함정이 이것이다: 참조 파일도, 작업 파일도 옛것이 조용히 되살아났다.
//   에디터는 localStorage 에 작업을 자동저장하고 **시작할 때 되살린다** — 새로고침으로는 안 바뀐다.
//   그래서 ①스탬프를 붙이고 ②HTML에 최신본을 통째로 내장(WORK_BAKED)해 버튼 한 번으로 불러오게 하고
//   ③되살린 작업의 스탬프가 내장본과 다르면 배너로 경고한다. 파일 고르는 절차 자체를 없앤다.
const crypto = require('crypto');
const stamp = 'f' + features.length + '/m' + mf.length + '/'
  + crypto.createHash('sha1').update(JSON.stringify([features, mf])).digest('hex').slice(0, 10);
const work = { editorWork: true, stamp, features, mf, zone: MAIN };
fs.writeFileSync(OUT, JSON.stringify(work));
// 에디터 내장용 스니펫 — map-editor.html 의 `const WORK_BAKED = {...};` 를 이걸로 갈아끼운다
fs.writeFileSync(path.join(__dirname, '..', '..', 'work-baked.js'), 'const WORK_BAKED = ' + JSON.stringify(work) + ';');
console.log('  스탬프 ' + stamp);

const count = (a) => a.reduce((m, f) => (m[f.type] = (m[f.type] || 0) + 1, m), {});
const bad = (a) => a.filter((f) => /^경계/.test(f.name || '')).map((f) => f.name);
console.log('에디터 작업 파일 ← ' + path.basename(SRC) + ' (게임 로드본)');
console.log('  → ' + OUT);
console.log('  features(한반도 단일존) ' + features.length + ' ' + JSON.stringify(count(features)));
console.log('    경계* : ' + (bad(features).length || '없음 ✔'));
console.log('  mf(전 월드) ' + mf.length + ' ' + JSON.stringify(count(mf)));
console.log('    경계* : ' + (bad(mf).length || '없음 ✔'));
console.log('  ★이 파일이 새 원본이다 — 에디터 「작업 불러오기」로 열고, 이제부터 여기서 그린다.');
