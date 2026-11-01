#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1063-terr-draw.js — [T1063] 화면의 영토 = 서버 영토(`T1063_TERR_BUILD` 켬 기본 후보 · `=0` 종전) ===
//
// ★무엇을 지키나: 클라가 그리는 초록 외곽선(`b` = [dx,dy,mask] flat)이 **서버 `vil._terrSet`**(짓기 술어 `_lifeSiteFilters` "마을 영토 밖" 이
//   묻는 그 집합)의 외곽선과 같은가. 종전엔 시딩 스냅샷(hall `data.bnd`)이라 자란 영토에 선 건물이 화면에선 밖에 섰다(보고/T1063).
//   ① 켬 — 하루 방송 칸(`_t1063DayBnd`)이 영토가 바뀐 마을만 지금 `_terrSet` 외곽선을 낸다 · welcome 페이로드(`clientPayload`)도 같이 · 안 바뀐 날은 칸 없음.
//   ② 자명 통과 금지 — 그 외곽선은 시딩 스냅샷과 **다르다**(자란 칸이 있다) · 칸 하나 더 자라면 다시 낸다.
//   ③ 끔(`T1063_TERR_BUILD=0`) — 칸 없음 · 방송 글자 = 종전(키 0) · 페이로드 무변.
// 서버 0 · 1초 · `__p3Bind` 목 state(운영 부팅 경로 무접촉).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
if (process.argv[2] === '--child') {
  process.env.ENABLE_VILLAGES = '0';
  const V = require(path.join(__dirname, '..', 'server', 'villages'));
  const disc = (cx, cy, r) => { const s = new Set(); for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) s.add(x + ',' + y); return s; };
  const seed = disc(100, 100, 5), grown = new Set(seed); for (const k of disc(100, 100, 7)) grown.add(k);
  const B = V.__p3Bind({ villages: [], clientPayload: [] });
  const toCells = (S) => [...S].map((k) => k.split(',').map(Number));
  const seedB = B.territoryBoundary(toCells(seed), 100, 100);
  const vil = { dbId: 7, name: '시험', ccx: 100, ccy: 100, _terrSet: grown, _bnd: seedB };
  B.state.villages = [vil]; B.state.clientPayload = [{ id: 7, name: '시험', cx: 100, cy: 100, b: seedB }];
  const d1 = B._t1063DayBnd([vil]);
  const pay1 = B.state.clientPayload[0].b;
  const d2 = B._t1063DayBnd([vil]);
  grown.add('108,100');
  const d3 = B._t1063DayBnd([vil]);
  const msg = B._t1063Msg({ bnd: d1 }, { type: 'sim_village_day' }), msg0 = B._t1063Msg({ bnd: null }, { type: 'sim_village_day' });
  process.stdout.write(JSON.stringify({ on: B.T1063_TERR_BUILD, d1, d2, d3, seedB, want: B.territoryBoundary(toCells(new Set([...disc(100, 100, 7)])), 100, 100),
    want3: B.territoryBoundary(toCells(grown), 100, 100), pay: pay1, pay3: B.state.clientPayload[0].b, vilBnd: vil._bnd === seedB, vilKeys: Object.keys(vil).sort(), msgKeys: Object.keys(msg), msg0Keys: Object.keys(msg0) }));
  process.exit(0);
}
const run = (env) => JSON.parse(execFileSync(process.execPath, [__filename, '--child'], { encoding: 'utf8', env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'ignore'] }));
console.log('\n=== T1063 화면의 영토 = 서버 영토 ===');
const E = { ...process.env }; delete E.T1063_TERR_BUILD;
const A = JSON.parse(execFileSync(process.execPath, [__filename, '--child'], { encoding: 'utf8', env: E, stdio: ['ignore', 'pipe', 'ignore'] }));
ok(A.on === true, '손잡이 기본 = 켬(env 없음)');
ok(A.d1 && JSON.stringify(A.d1['7']) === JSON.stringify(A.want), '① 켬 — 하루 방송 칸 = 지금 `_terrSet` 외곽선(같은 꼴 [dx,dy,mask])', A.d1 ? `${A.d1['7'].length / 3}칸` : 'null');
ok(JSON.stringify(A.pay) === JSON.stringify(A.want), '① welcome 페이로드(`clientPayload`)도 지금 외곽선으로 고쳤다(늦게 들어온 사람)');
ok(JSON.stringify(A.want) !== JSON.stringify(A.seedB), '★② 자명 통과 금지 — 지금 외곽선 ≠ 시딩 스냅샷(자란 칸이 있다)', `${A.want.length / 3} vs ${A.seedB.length / 3}칸`);
ok(A.d2 === null, '안 바뀐 날은 칸 없음(바뀐 마을만)');
ok(A.d3 && JSON.stringify(A.d3['7']) === JSON.stringify(A.want3) && JSON.stringify(A.want3) !== JSON.stringify(A.want) && JSON.stringify(A.pay3) === JSON.stringify(A.want3), '★② 칸 하나 더 자라면 다시 낸다(그 칸이 든 외곽선 · 페이로드도)');
ok(A.vilBnd && !A.vilKeys.some((k) => /t1063/i.test(k)), '마을 칸 무접촉(`vil._bnd` 그대로 · 새 칸 0 — 판 자 마을 칸 지문 무변)', A.vilKeys.join(','));
ok(A.msgKeys.includes('bnd') && !A.msg0Keys.includes('bnd'), '방송 — 바뀐 마을이 있을 때만 `bnd` 칸');
const O = run({ T1063_TERR_BUILD: '0' });
ok(O.on === false && O.d1 === null && O.d3 === null, '③ 끔(`=0`) — 칸 없음(방송 글자 = 종전)');
ok(JSON.stringify(O.pay) === JSON.stringify(O.seedB), '③ 끔 — 페이로드 = 시딩 스냅샷 그대로');
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
