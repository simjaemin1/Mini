#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-deforest-game.js — 벌채 · 개간 · 집터 · 곳간 자리가 사냥터 장부를 줄인다(T1053 · 랩 `deforestCell` 그대로 · 정본 함수 · 자식 둘 · 몇 초) ======
//
// ★왜 [T1009 회부 3 · ★PM 결함 "랩 = 목표 · 같은 규칙"] 랩 `deforestCell`(lab/마을실험실.html 19407)은 개발된 셀의 사냥감을 영구히 지운다
//   (`gameRich.delete` — 집터 ±12 · 곳간 자리 ±3 · 개간 끝 그 셀 · 정착 · 재배치). 서버는 같은 문(`huntDeforest`)을 갖고도 부르는 제품 자리가 0 이었다
//   — 벌채 · 개간 · 집터가 사냥터 장부(`_gameRich` · T728 곁 칸 `_t728Game`)를 안 줄였다.
//   T1053(손잡이 `T1053_DEFOREST_GAME` · 켬 기본 · `=0` 되돌림) = 같은 일을 하는 서버 자리가 그 문을 그 식으로 부른다(`_t1053Deforest` — 랩 `deforestArea` 의 장부 몫 · 새 수 0).
// 판 = 손잡이 켬 · 끔 = 자식 둘(손잡이는 모듈을 읽을 때 한 번 — 판마다 새 프로세스). 자식마다 `server/villages.js` 를 그대로 싣고
//   정본 문으로만 판을 꾸민다(지형 `__labProbe._huntProbe.setTa` · 개간 `_clearProbe` · 곳간 `_t435Probe.granAdd` · 의뢰 `lifeRequestPlayerSite` · 장부 `_huntBandBuild`).
//   장부 셀은 랩처럼 2칸 간격 표본이다 — 판마다 개발 자리 둘레에 표본 셀을 깔아 두고(장부 = 셀 → 50), 문이 지운 셀을 센다.
// 보는 것:
//   ① [상황] 판 둘이 섰다 · 손잡이 · 랩 상수 둘(L_DEFOREST_H 12 · 곳간 3)이 랩 글자와 같다 · 끔 판 개발 자리 둘레에 장부 셀이 실제로 있다(자명 통과 금지)
//   ② ★★장부를 다 지은 순간(`_huntBandBuild`) — 켬: 개발된 칸(집 ±12 · 집터 · 곳간 ±3 · 곳간 착공 · 밭)이 장부에 없다 · 기준 총량(`_gameTot0`)도 그만큼 작다 · 끔: 있다(종전)
//   ③ ★★개간 끝(`_clearProbe.day` → `_lifeLiveFarmTile`) — 켬: 그 셀만 지워진다 · 끔: 그대로(이웃 셀은 두 판 다 그대로)
//   ④ ★★곳간 착공(`_lifeGranAdd`) — 켬: 그 자리 ±3 장부 셀이 지워진다 · 끔: 0
//   ⑤ ★★의뢰 집터(`lifeRequestPlayerSite`) — 켬: ±12 지워진다 · 끔: 0 · 자동 집터(`_lifeAddHouseSiteInner`)는 같은 줄 글자(그 문 · 그 반경)
//   ⑥ 부르는 자리 = 다섯 + 장부 지을 때 한 번 · `huntDeforest` 는 `_t1053Deforest` 한 곳에서만 불린다(벌목 · 사냥 길은 장부 문을 안 지난다 — 랩 벌목꾼 = `forestRich` 만)
// 실행: node scripts/test-deforest-game.js   (DB 0 · 존 0 · 라이브 무접촉)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T1053_DG_MODE || '';

if (MODE) child(); else parent();

function child() {
  const OUT = process.env.T1053_DG_OUT;
  const _log = console.log; console.log = () => {}; console.warn = () => {};
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const P = V.__labProbe;
  // 둘레 반경은 **랩 글자**에서 읽는다(서버 상수가 아니라 — 자기 수로 자기를 재면 자명 통과다) · 서버 상수 = 랩 글자는 ① 이 따로 본다.
  const LAB = fs.readFileSync(path.join(ROOT, 'lab', '마을실험실.html'), 'utf8');
  const LH = +(LAB.match(/const L_DEFOREST_H=(\d+);/) || [])[1], LG = +(LAB.match(/deforestArea\(s,g\.cx,g\.cy,(\d+)\)/) || [])[1];
  const stat = () => (typeof V.t1053Stat === 'function' ? V.t1053Stat() : null);   // T1053 앞 트리엔 셈이 없다(그 트리에서도 판은 선다 — 끔 대조 · 앞 트리 빨강을 보이려고)
  const res = { knob: V.T1053_DEFOREST_GAME, H: V.L_DEFOREST_H, G: V.L_DEFOREST_GRAN, LH, LG, stat0: stat() };
  const CX = 200, CY = 200;
  const ta = { forestMult: () => 2, isRock: () => false, isBlocked: () => false, isWater: () => false };
  const sq = (cx, cy, r) => { const ks = []; for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) ks.push((cx + dx) + ',' + (cy + dy)); return ks; };
  const present = (m, cx, cy, r) => sq(cx, cy, r).filter((k) => m && m.has(k)).length;
  // ── A: 장부를 다 지은 순간 — 개발된 칸(랩 정착 · 재배치 몫)
  {
    const keep = P._huntProbe.setTa(ta);
    process.env.T146_BUILD_MS = '600000';   // 하루에 다 짓는다(끊어 짓기는 test-hunt-port ⑦' 가 쥔다)
    const v = { name: 'T1053A', ccx: CX, ccy: CY, npcPids: [], econ: { land: { game: 1 } },
      _houseCells: [{ cx: CX + 36, cy: CY }], _site: { cx: CX, cy: CY - 36, stage: 1 }, _psite: null, _pendSite: null,
      _granList: [{ cx: CX - 44, cy: CY }], _granPend: { cx: CX, cy: CY + 44, day: 9 },
      _farmSet: new Set([(CX + 42) + ',' + (CY + 20), (CX + 44) + ',' + (CY + 20), (CX + 42) + ',' + (CY + 22)]) };   // 밭은 집 ±12 밖(겹치면 밭 줄이 자명 통과다)
    let g = null, d = 0; while (!g && d < 50) { g = V._huntBandBuild(v); d++; }
    P._huntProbe.setTa(keep);
    const areas = { house: [CX + 36, CY, LH], site: [CX, CY - 36, LH], gran: [CX - 44, CY, LG], granPend: [CX, CY + 44, LG] };
    res.A = { built: !!g, days: d, size: g ? g.size : 0, tot0: v._gameTot0, area: {}, fields: [...v._farmSet].map((k) => !!(g && g.has(k))) };
    for (const [n, a] of Object.entries(areas)) res.A.area[n] = present(g, a[0], a[1], a[2]);
    res.A.stat = stat();
  }
  // ── B: 개간 끝 — 그 셀(랩 `clearCell` → `deforestCell`)
  {
    let rows = 0;
    P._clearProbe.setup(ta, { day: 1 }, { insertVillageBuilding: () => ++rows });
    const npcs = []; for (let i = 0; i < 10; i++) npcs.push({ id: i });
    const econ = { npcs, storage: { food: 0 }, land: { fertility: 0.55, game: 1 }, counts: { farmer: 3 } };
    const K = (CX + 42) + ',' + (CY + 20), NB = (CX + 44) + ',' + (CY + 20);
    const v = P._clearProbe.attach({ dbId: 2, name: 'T1053B', ccx: CX, ccy: CY, econ,
      layout: { farmland: [], dryfield: [], nongZone: [{ cx: CX + 42, cy: CY + 20 }], territory: [[CX + 42, CY + 20]], houses: [] } });
    v._gameRich = new Map([[K, 50], [NB, 50]]);
    const before = { K: v._gameRich.has(K), NB: v._gameRich.has(NB) };
    const n = P._clearProbe.day(v, 3);
    res.B = { cleared: n, farm: v._farmSet.has(K), before, after: { K: v._gameRich.has(K), NB: v._gameRich.has(NB) }, rows };
  }
  // ── C: 곳간 착공 — 그 자리 ±3(랩 곳간 자리 `deforestArea(±3)`)
  {
    const terr = new Set(); for (let x = CX - 30; x <= CX + 30; x++) for (let y = CY - 30; y <= CY + 30; y++) terr.add(x + ',' + y);
    P._clearProbe.setup(ta, { day: 3 }, { insertVillageBuilding: () => 1 });
    const v = { dbId: 3, name: 'T1053C', ccx: CX, ccy: CY, econ: { storage: { food: 20000 }, npcs: [] },
      _terrSet: terr, _potSet: new Set(), _farmSet: new Set(), _houseCells: [], _granList: [], _granPend: null };
    v._gameRich = new Map(); for (let x = CX - 30; x <= CX + 30; x += 2) for (let y = CY - 30; y <= CY + 30; y += 2) v._gameRich.set(x + ',' + y, 50);
    const n0 = v._gameRich.size;
    P._t435Probe.granAdd(v);
    const gp = v._granPend;
    res.C = { pend: gp ? { cx: gp.cx, cy: gp.cy } : null, left: gp ? present(v._gameRich, gp.cx, gp.cy, LG) : -1, n0, n1: v._gameRich.size,
      grid: gp ? present(new Map(sq(gp.cx, gp.cy, LG).filter((k) => { const [x, y] = k.split(',').map(Number); return (x - CX) % 2 === 0 && (y - CY) % 2 === 0; }).map((k) => [k, 1])), gp.cx, gp.cy, LG) : 0 };
  }
  // ── D: 의뢰 집터 — ±12(랩 집터 고름 `deforestArea(±L_DEFOREST_H)`)
  {
    const terr = new Set(); for (let x = CX - 40; x <= CX + 40; x++) for (let y = CY - 40; y <= CY + 40; y++) terr.add(x + ',' + y);
    P._clearProbe.setup(ta, { day: 4 }, { insertVillageBuilding: () => 1 });
    P._t400Probe.setup({ deps: { broadcast: () => {} } });   // 방송 자리만(라이브 건물 행 없음 — 집터 표지 0 · 문은 그대로)
    const v = { dbId: 4, name: 'T1053D', ccx: CX, ccy: CY, econ: { storage: { food: 0 }, npcs: [] },
      _terrSet: terr, _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(), _houseCells: [], housesPx: [], _granList: [], _granPend: null, _site: null, _psite: null };
    v._gameRich = new Map(); for (let x = CX - 40; x <= CX + 40; x += 2) for (let y = CY - 40; y <= CY + 40; y += 2) v._gameRich.set(x + ',' + y, 50);
    const n0 = v._gameRich.size;
    let r = null; try { r = V.lifeRequestPlayerSite(v, CX + 26, CY + 4, 'p_t1053', '시험'); } catch (e) { r = { err: 'throw ' + e.message }; }
    const ps = v._psite;
    res.D = { r: r && (r.err || 'ok'), site: ps ? { cx: ps.cx, cy: ps.cy } : null, left: ps ? present(v._gameRich, ps.cx, ps.cy, LH) : -1, n0, n1: v._gameRich.size,
      grid: ps ? sq(ps.cx, ps.cy, LH).filter((k) => { const [x, y] = k.split(',').map(Number); return (x - CX) % 2 === 0 && (y - CY) % 2 === 0 && Math.abs(x - CX) <= 40 && Math.abs(y - CY) <= 40; }).length : 0 };
  }
  res.stat = stat();
  fs.writeFileSync(OUT, JSON.stringify(res));
  console.log = _log;
  process.exit(0);
}

function parent() {
  const { spawnSync } = require('child_process');
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const seen = (m) => console.log(`  [관찰] ${m}`);
  const TMPD = fs.mkdtempSync('/tmp/t1053-dg-');
  const R = {};
  for (const knob of ['on', 'off']) {
    const out = path.join(TMPD, `${knob}.json`);
    const env = Object.assign({}, process.env, { T1053_DG_MODE: 'run', T1053_DG_OUT: out });
    for (const k of ['T1053_DEFOREST_GAME', 'T146_GAME', 'T146_BAND', 'T146_BAND_ALL', 'T146_BUILD_MS', 'T435_GRANARY_ACT', 'NODE_OPTIONS']) delete env[k];
    if (knob === 'off') env.T1053_DEFOREST_GAME = '0';
    const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 120000, env });
    try { R[knob] = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { R[knob] = { err: `결과 없음(종료 ${r.status} · 신호 ${r.signal}) ${(r.stderr || '').split('\n').slice(-3).join(' | ')}` }; }
  }
  try { fs.rmSync(TMPD, { recursive: true, force: true }); } catch (e) {}
  console.log('\n=== 벌채 · 개간 · 집터 · 곳간 자리 → 사냥터 장부 — T1053(`T1053_DEFOREST_GAME` 켬 · 끔 · 랩 `deforestCell` 그대로) ===');
  const allOk = ['on', 'off'].every((k) => !R[k].err);
  ok(allOk, '[상황] 판 둘 다 섰다(자식 결과)', ['on', 'off'].map((k) => `${k} ${R[k].err || 'ㅇ'}`).join(' · '));
  if (!allOk) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`); process.exit(1); }
  const on = R.on, off = R.off;
  console.log('\n① 상황');
  const LAB = fs.readFileSync(path.join(ROOT, 'lab', '마을실험실.html'), 'utf8');
  const labH = (LAB.match(/const L_DEFOREST_H=(\d+);/) || [])[1], labG = (LAB.match(/deforestArea\(s,g\.cx,g\.cy,(\d+)\)/) || [])[1];
  ok(on.knob === true && off.knob === false, '[상황] 손잡이가 판대로 섰다(켬 기본 · `=0` 끔)', `켬 ${on.knob} · 끔 ${off.knob}`);
  ok(+labH === on.H && +labG === on.G && on.H === 12 && on.G === 3 && on.LH === 12 && on.LG === 3, '[상황] 반경 둘이 랩 글자 그대로다(집 `L_DEFOREST_H` · 곳간 `deforestArea(s,g.cx,g.cy,3)` — 아래 둘레는 랩 글자로 잰다)', `랩 ${labH} · ${labG} = 서버 ${on.H} · ${on.G}`);
  ok(on.A.built && off.A.built && Object.values(off.A.area).every((n) => n > 0) && off.A.fields.every(Boolean),
    '[상황] 장부를 다 지었다 · 끔 판 개발 자리 둘레에 장부 셀이 있다(집 · 집터 · 곳간 · 곳간 착공 · 밭 셋) — 아래가 자명 통과가 아니다', `끔 ${JSON.stringify(off.A.area)} · 밭 ${off.A.fields.join('/')}`);
  ok(on.B.cleared === 1 && off.B.cleared === 1 && on.B.farm && off.B.farm && on.B.before.K && off.B.before.K,
    '[상황] 개간 하루가 그 셀 하나를 밭으로 만들었다(두 판 다 · 정본 `_lifeClearDay` → `_lifeLiveFarmTile`)', `켬 ${on.B.cleared} · 끔 ${off.B.cleared}`);
  ok(!!on.C.pend && !!off.C.pend && on.C.pend.cx === off.C.pend.cx && on.C.pend.cy === off.C.pend.cy && on.C.grid > 0,
    '[상황] 곳간 착공 자리가 두 판 같다 · 그 둘레 ±3 에 장부 셀이 있다', `(${on.C.pend && on.C.pend.cx},${on.C.pend && on.C.pend.cy}) · 셀 ${on.C.grid}`);
  ok(on.D.r === 'ok' && off.D.r === 'ok' && on.D.site && off.D.site && on.D.site.cx === off.D.site.cx && on.D.grid > 0,
    '[상황] 의뢰 집터가 두 판 다 섰다(같은 자리) · 그 둘레 ±12 에 장부 셀이 있다', `켬 ${on.D.r} · 끔 ${off.D.r} · 셀 ${on.D.grid}`);

  console.log('\n② 장부를 다 지은 순간 — 이미 개발된 칸(랩 정착 · 재배치 몫)');
  seen(`켬 ${JSON.stringify(on.A.area)} · 밭 ${on.A.fields.join('/')} · 칸 ${on.A.size} · ΣG₀ ${on.A.tot0} | 끔 ${JSON.stringify(off.A.area)} · 칸 ${off.A.size} · ΣG₀ ${off.A.tot0} | 켬 셈 ${JSON.stringify(on.A.stat)}`);
  const offRemoved = Object.values(off.A.area).reduce((a, b) => a + b, 0) + off.A.fields.filter(Boolean).length;
  ok(Object.values(on.A.area).every((n) => n === 0) && on.A.fields.every((x) => !x),
    '★★② 켬 — 집 ±12 · 집터 ±12 · 곳간 ±3 · 곳간 착공 ±3 · 밭 셀이 장부에 없다', JSON.stringify(on.A.area));
  const onCells = on.A.stat ? on.A.stat.cells : null;
  ok(on.A.size < off.A.size && off.A.size - on.A.size === onCells && on.A.tot0 === on.A.size * 100 && off.A.tot0 === off.A.size * 100,
    '★② 지운 만큼만 줄었고 기준 총량(`_gameTot0`)은 지운 뒤의 칸으로 박힌다(랩: 정착이 장부보다 먼저 — 그 칸은 처음부터 장부 밖)', `켬 ${on.A.size} × 100 = ${on.A.tot0} · 끔 ${off.A.size} × 100 = ${off.A.tot0} · 차 ${off.A.size - on.A.size} = 켬 지운 셀 ${onCells}(끔 판 개발 자리 셀 합 ${offRemoved} — 겹침 없음)`);

  console.log('\n③ 개간 끝 — 그 셀');
  ok(!on.B.after.K && on.B.after.NB, '★★③ 켬 — 밭이 된 그 셀의 장부가 지워진다 · 이웃 셀은 그대로', JSON.stringify(on.B.after));
  ok(off.B.after.K && off.B.after.NB, '★★③ 끔 — 밭이 돼도 장부 그대로(종전 · 부르는 자리 0)', JSON.stringify(off.B.after));

  console.log('\n④ 곳간 착공 — ±3');
  ok(on.C.left === 0 && on.C.n0 - on.C.n1 === on.C.grid, '★★④ 켬 — 착공 자리 ±3 장부 셀이 다 지워진다(그만큼만)', `지움 ${on.C.n0 - on.C.n1} = ±3 안 셀 ${on.C.grid}`);
  ok(off.C.left === off.C.grid && off.C.n1 === off.C.n0, '★★④ 끔 — 그대로(종전)', `남음 ${off.C.left}/${off.C.grid}`);

  console.log('\n⑤ 집터 — ±12');
  ok(on.D.left === 0 && on.D.n0 - on.D.n1 === on.D.grid, '★★⑤ 켬 — 의뢰 집터 ±12 장부 셀이 다 지워진다(그만큼만)', `지움 ${on.D.n0 - on.D.n1} = ±12 안 셀 ${on.D.grid}`);
  ok(off.D.left === off.D.grid && off.D.n1 === off.D.n0, '★★⑤ 끔 — 그대로(종전)', `남음 ${off.D.left}/${off.D.grid}`);
  const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(VS.includes("      vil._site = { cx: x, cy: y, stage: 1, bo };\n      _t1053Deforest(vil, x, y, L_DEFOREST_H);"),
    '★⑤ 자동 집터(`_lifeAddHouseSiteInner`)는 터를 세운 바로 다음 줄이 같은 문 · 같은 반경이다(의뢰 집터와 같은 규칙)');

  console.log('\n⑥ 부르는 자리 — 다섯 + 장부 지을 때');
  const code = VS.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l));
  const calls = code.filter((l) => /_t1053Deforest\(vil,/.test(l) && !/function _t1053Deforest/.test(l)).length;
  const doors = code.filter((l) => /huntDeforest\(/.test(l) && !/function huntDeforest/.test(l));
  seen(`_t1053Deforest 부르는 줄 ${calls} · huntDeforest 부르는 줄 ${doors.length}(${doors.map((l) => l.trim().slice(0, 60)).join(' | ')})`);
  ok(calls === 9 && doors.length === 1 && /_t1053Deforest/.test(VS.slice(VS.indexOf('function _t1053Deforest'), VS.indexOf('function _t1053Developed'))) && /huntDeforest\(vil, cx \+ dx, cy \+ dy\)/.test(doors[0]),
    '★⑥ 장부 지우는 문은 하나(`huntDeforest` ← `_t1053Deforest`) · 부르는 줄 아홉 = 개간 · 자동 집터 · 의뢰 집터 · 곳간 착공 넷 + 장부 지을 때 다섯(집 · 집터 셋 · 곳간 · 착공 · 밭)', `${calls}줄`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
