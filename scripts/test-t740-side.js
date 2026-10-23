#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t740-side.js — T740 메모리 전용 마을 칸 영속(`T740_SIDE_KEEP`) 계약 ======================================
//   정본 함수를 그대로 부른다(`villages.__labProbe._t740Probe` — 실을 칸 · 되돌림 규칙을 하네스가 다시 적지 않는다).
//   ① 손잡이 기본 끔(env 를 지운 자식이 읽은 값) · 끔이면 저장 줄에 곁 칸이 없다
//   ② Map · Set 을 어느 깊이에서든 차례 그대로 왕복(작물 · 장 기록 꼴)
//   ③ 켬: 저장 줄(`serializeEcon`) → JSON → 새 마을 객체로 되돌림 = 칸마다 같다(Map · Set 풀어서) · econ 에 곁 칸이 안 남는다
//   ④ 집터: 저장된 단계로 그 자리에 다시 선다(종전 단계 1) · 그새 완공(행 없음)이면 안 세운다 · 의뢰 집터는 자리가 같을 때만
//   실행: node scripts/test-t740-side.js
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const canon = (x) => JSON.stringify(x, (k, v) => (v instanceof Map ? { M: [...v.entries()] } : v instanceof Set ? { S: [...v] } : v));

console.log('\n=== T740 메모리 전용 마을 칸 영속 ===');
// ① 기본값 — env 를 지운 자식
{
  const env = Object.assign({}, process.env); delete env.T740_SIDE_KEEP;   // ★[PM 10-14] 기본 켬 — env 없는 자식은 true
  const v = execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./server/villages.js').__labProbe._t740Probe.T740_SIDE))"], { cwd: ROOT, env }).toString();
  ok(v === 'true', '① 손잡이 기본 켬(env 없는 자식 · PM 10-14)', v);
}
function load(on) {
  for (const k of Object.keys(require.cache)) if (k.indexOf(path.join(ROOT, 'server')) === 0 || k.indexOf(path.join(ROOT, 'sim')) === 0) delete require.cache[k];
  process.env.T740_SIDE_KEEP = on ? '1' : '0';   // ★[PM 10-14] 끔 = '0'(기본 켬)
  return require(path.join(ROOT, 'server', 'villages.js')).__labProbe._t740Probe;
}
function fakeVil(name, id) {
  const econ = { name, npcs: [], storage: { food: 1 } };
  const crop = new Map([['10,20', { c: 'rice', p: 7000000001, td: 7000000003, w: 7000000002, wd: 1, ps: 0, q: 0.85 }], ['11,20', { c: 'curled_mallow', p: 7000000005, td: 7000000005, w: 7000000005, wd: 0, ps: 1, q: 0.4 }]]);
  return { dbId: id, name, ccx: 100, ccy: 200, econ, npcPids: ['p1', 'p2'],
    _crop: crop, _mkt: { d: 31, end: 1791971659541.6667, at: new Map([['p2', 0], ['p1', 1]]), cars: new Set([63, 7]), body: 1 },
    _potSet: new Set(['5,5', '4,5', '9,1']), _siteMissDay: 30, _siteDirty: false, _siteRejS: new Set(['1,1']), _siteRejL: null,
    _maxRPx: 512, _hEvD: 4, _mineLvl: 2.37, _t724Hit: 9, _t724Cut: 1.25, _granStock: new Map([['3,4', 12.5]]),
    _mCl: 2, _mSt: 1, _mTk: 7, _dCl: 3, _dSt: 0, _dTk: 6, _gameTook: 92.9, _hlDay: 7000000009,
    _site: { cx: 120, cy: 210, stage: 3, bo: { id: 'b1', dbId: 1 }, mat: { log: 18, thatch: 0 } }, _pendSite: null, _psite: null,
    _t400Crew: ['p1', 'p2'], _t400Sum: { days: 1, adv: 0 }, _t400Dbg: { day: 1, crew: 2 } };
}
// ② 왕복
{
  const P = load(true);
  const x = new Map([['a', new Set([1, 2, new Map([[3, { z: [new Set(['q'])] }]])])], ['b', { m: new Map([['k', 1]]) }]]);
  const y = P.dec(JSON.parse(JSON.stringify(P.enc(x))));
  ok(canon(x) === canon(y), '② Map · Set 깊은 왕복 — 차례 그대로');
  const off = load(false), v0 = fakeVil('갑', 1);
  const st0 = off.setup({ villages: [v0], byEcon: new Map([[v0.econ, v0]]), byDbId: new Map([[1, v0]]), zoneId: 't' });
  ok(!('_t740Side' in JSON.parse(off.serialize(v0.econ))), '① 끔 — 저장 줄에 곁 칸이 없다(종전 글자)');
  off.setup(st0);
}
// ③ 켬 왕복(저장 줄 → 새 마을)
{
  const P = load(true);
  const v = fakeVil('을', 2);
  const keep = P.setup({ villages: [v], byEcon: new Map([[v.econ, v]]), byDbId: new Map([[2, v]]), zoneId: 't' });
  const row = P.serialize(v.econ);
  const ev = JSON.parse(row);
  ok(ev._t740Side && typeof ev._t740Side === 'object', '③ 켬 — 저장 줄에 곁 칸 하나(`_t740Side`)');
  // 다시 뜬 마을 — 부팅이 만드는 꼴(빈 작물 · 행에서 다시 잰 잠재 농지 · 반경 · 집터는 행에서 `_pendSite`)
  const made = [];
  const nv = { dbId: 2, name: '을', ccx: 100, ccy: 200, econ: ev, npcPids: ['p1', 'p2'], _crop: new Map(), _potSet: new Set(['5,5', '4,5', '9,1', '7,7']), _maxRPx: 600,
    _site: null, _pendSite: { cx: 120, cy: 210 }, _psite: null };
  const deps = { liveBuildRow: (type, x, y, data, oid, onm) => { const bo = { id: 'b9', dbId: 9, type, x, y, data }; made.push(bo); return bo; }, broadcast: () => {} };
  P.setup({ villages: [nv], byEcon: new Map([[ev, nv]]), byDbId: new Map([[2, nv]]), clientPayload: [{ id: 2, r: 600 }], deps });
  const R = P.restore();
  let same = 0, diff = [];
  for (const k of P.KEYS) { if (canon(v[k]) === canon(nv[k])) same++; else diff.push(k); }
  ok(!diff.length, `③ 칸 ${P.KEYS.length} 이 저장 순간과 같다(Map · Set 풀어서)`, diff.join(','));
  ok(nv._crop instanceof Map && nv._crop.size === 2 && [...nv._crop.keys()].join('|') === '10,20|11,20', '③ 작물 — 셀 · 심은 날 · 단계 · 차례 그대로(종전: 빈 Map = 재파종)');
  ok(nv._mkt && nv._mkt.at instanceof Map && nv._mkt.cars instanceof Set && nv._mkt.end === v._mkt.end, '③ 장 — 명부(Map) · 선 캐러밴(Set) · 장 끝 시각 그대로');
  //   ★[T862 ②] 켬(★[T876 ①] 기본 · 끔 탐침 `T862_ECON_FAST=0`)이면 지우지 않고 `undefined` 를 놓는다(econ 객체를 사전 모드로 안 내리려고) — 남는 곁 값이 없다는 뜻은 같다:
  //     값이 `undefined` 이고(데이터 0) 저장 줄은 그 칸을 안 싣는다(`test-econ-fast` ① · ② 바이트 같음). 끔 갈래는 종전 단언 그대로.
  ok(process.env.T862_ECON_FAST !== '0' ? ev._t740Side === undefined : !('_t740Side' in ev), '③ econ 에 곁 칸이 안 남는다(되돌린 뒤 지운다 · 켬이면 값 `undefined`)');
  ok(made.length === 1 && made[0].data.stage === 3 && nv._site && nv._site.stage === 3 && nv._pendSite === null && canon(nv._site.mat) === canon(v._site.mat), '④ 집터 — 저장된 단계(3) · 놓인 자재로 그 자리에 선다(종전: 다음 마감에 단계 1 · 자재 0)', made[0] && JSON.stringify(made[0].data));
  ok(R && R.site === 1 && R.crop === 2 && R.mkt === 1, '③ 되돌림 셈', JSON.stringify(R));
  // 그새 완공(집터 행 없음 → `_pendSite` null) — 안 세운다
  const ev2 = JSON.parse(row); made.length = 0;
  const nv2 = { dbId: 2, name: '을', econ: ev2, npcPids: [], _crop: new Map(), _site: null, _pendSite: null };
  P.setup({ villages: [nv2], byEcon: new Map([[ev2, nv2]]), byDbId: new Map([[2, nv2]]), clientPayload: [], deps });
  P.restore();
  ok(made.length === 0 && nv2._site === null, '④ 집터 행이 없으면(완공) 다시 안 세운다 — 생성 0');
  // 의뢰 집터 — 자리가 같을 때만 저장값
  const vp = { econ: { _t740Side: { psite: { cx: 5, cy: 6, stage: 2, bo: 77 } } } };
  ok(P.savedPsite(vp, { cx: 5, cy: 6 }) && P.savedPsite(vp, { cx: 5, cy: 6 }).stage === 2 && P.savedPsite(vp, { cx: 5, cy: 7 }) === null, '④ 의뢰 집터 — 같은 자리일 때만 저장된 단계 · 행 번호');
  P.setup(keep);
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
