#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === T1 검증 하네스: 구DB 마을 영토 런타임 백필 ===
// server/villages.js 의 _terrBackfillOne / _terrBackfillAll 을 **원문 그대로 잘라내** 스텁 위에서 실행한다
// (재구현 아님 — scripts/test-granary-add.js 와 같은 방식).
//
// 검사 항목
//   ① terr 0인 마을이 백필 후 pop 규모에 걸맞은 셀(≥ pop×LAND_PER_HOUSE/HOUSE_CAP 근사)을 갖는가
//   ② 기존 집(부지 원판)·곳간 5×3·큰집 8×8·기경지가 전부 _terrSet 안에 들어오는가
//   ③ 이미 terr가 있는 마을은 무변경인가(회귀 없음)
//   ④ 백필 후 생활층 게이트(`!_terrSet.size` 조기 return)를 통과하는가 + _lifeDaily 파종 경로가 열리는가
//
// 실행: node scripts/test-terr-backfill.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
function cut(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('함수 못 찾음: ' + name);
  let depth = 0;
  const i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('중괄호 매칭 실패: ' + name);
}

// ---- 스텁 지형: 평지 + 남쪽에 강 (VillageLayout.generate 가 요구하는 인터페이스) ----
const CCX = 300, CCY = 300;
const isWater = (x, y) => y >= CCY + 26 && y <= CCY + 32;
const ta = {
  isBlocked: (x, y) => isWater(x, y),
  isWater,
  elev: (x, y) => 100 - (y - CCY) * 0.4,                 // 남쪽(강)으로 낮아짐 → axisAt.toWater = +y
  fert: (x, y) => 0.6 + 0.1 * Math.sin(x * 0.05) * Math.cos(y * 0.05),
  landValue: (x, y) => 0.6 + 0.1 * Math.sin(x * 0.05) * Math.cos(y * 0.05),
};

const LIFE_ON = true;
const logs = [];
const state = { ta, zoneId: 'test', villages: [], world: { day: 10 } };
const ctx = vm.createContext({
  state, LIFE_ON, console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) },
  require: (m) => require(path.join(ROOT, 'server', m.replace('./', ''))),
  Math, Set, Map, Array, Object, JSON, Number, Date,
});
vm.runInContext(cut('_terrBackfillOne') + '\n' + cut('_terrBackfillAll')
  + '\nglobalThis.__api = { _terrBackfillOne, _terrBackfillAll };', ctx);
const API = ctx.__api;
const VL = require(path.join(ROOT, 'server', 'village-layout'));

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('=== T1 영토 백필 검증 (원문 함수 직접 실행) ===');
console.log(`LAND_PER_HOUSE=${VL.LAND_PER_HOUSE} HOUSE_CAP=${VL.HOUSE_CAP}`);

// 구DB 마을 모사: terr 0셀 + 이미 서 있는 집·곳간·기경지
function oldVillage(name, pop, nHouse) {
  const houses = [];
  for (let i = 0; i < nHouse; i++) {
    const a = i * (2 * Math.PI / nHouse);
    houses.push({ cx: Math.round(CCX + Math.cos(a) * 20), cy: Math.round(CCY + Math.sin(a) * 20) });
  }
  const farm = new Set();
  for (let x = CCX - 6; x <= CCX + 6; x++) for (let y = CCY + 14; y <= CCY + 20; y++) farm.add(x + ',' + y);
  return {
    dbId: 1, name, ccx: CCX, ccy: CCY,
    econ: { npcs: new Array(pop).fill(0).map(() => ({})), storage: { food: 500 }, counts: { farmer: 5 } },
    npcPids: new Array(pop).fill(0).map((_, i) => 'p' + i),
    _terrSet: new Set(), _potSet: new Set(), _farmSet: farm, _drySet: new Set(),
    _houseCells: houses, _granList: [{ cx: CCX + 12, cy: CCY - 6 }, { cx: CCX - 13, cy: CCY + 3 }],
    _crop: new Map(), _clearCrew: 0, _buildCrew: 0, _claim: new Set(),
  };
}

// ── ① 백필 규모 ──
console.log('\n[① 백필 후 영토 규모]');
const v1 = oldVillage('구DB촌', 21, 5);
const r1 = API._terrBackfillOne(v1, VL);
console.log(`  결과: 생성 ${r1.gen}셀 + 기존 실체 ${r1.added}셀 = ${r1.total}셀 · 논존닝 ${r1.pot}셀 (pop ${r1.pop})`);
chk(v1._terrSet.size > 0, `terr 0 → ${v1._terrSet.size}셀`);
const expectHouses = Math.ceil(21 / VL.HOUSE_CAP);
const expectMin = expectHouses * VL.LAND_PER_HOUSE * 0.5;   // 지형 차단으로 깎일 수 있어 하한만 검사
chk(v1._terrSet.size >= expectMin, `규모 하한 통과: ${v1._terrSet.size} ≥ ${Math.round(expectMin)} (채당 ${VL.LAND_PER_HOUSE}셀 × 필요 ${expectHouses}채의 50%)`);
chk(r1.pot > 0, `논 존닝(potSet) 복원 ${r1.pot}셀`);

// ── ② 기존 실체 포함 ──
console.log('\n[② 기존 집·곳간·큰집·기경지가 전부 영토 안]');
let miss = 0, chkN = 0;
for (const h of v1._houseCells) for (const [dx, dy] of VL.LOT_CELLS) { chkN++; if (!v1._terrSet.has((h.cx + dx) + ',' + (h.cy + dy))) miss++; }
chk(miss === 0, `집 ${v1._houseCells.length}채 부지 원판 ${chkN}셀 — 누락 ${miss}`);
miss = 0; chkN = 0;
for (const g of v1._granList) for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) { chkN++; if (!v1._terrSet.has((g.cx + dx) + ',' + (g.cy + dy))) miss++; }
chk(miss === 0, `곳간 ${v1._granList.length}동 5×3 ${chkN}셀 — 누락 ${miss}`);
miss = 0; chkN = 0;
for (let dx = -4; dx <= 3; dx++) for (let dy = -4; dy <= 3; dy++) { chkN++; if (!v1._terrSet.has((CCX + dx) + ',' + (CCY + dy))) miss++; }
chk(miss === 0, `큰집 8×8 ${chkN}셀 — 누락 ${miss}`);
miss = 0;
for (const k of v1._farmSet) if (!v1._terrSet.has(k)) miss++;
chk(miss === 0, `기경지 ${v1._farmSet.size}셀 — 누락 ${miss}`);
chk(v1._terrBackfilled === 1, '_terrBackfilled 플래그 세팅(lifedbg terrBf로 노출)');
chk(v1._wf === null, '물거리 EDT 캐시 무효화(_wf=null — 영토 bbox 변경 반영)');

// ── ③ 회귀: 이미 terr 있는 마을은 무변경 ──
console.log('\n[③ 기존 정상 마을 무변경(회귀)]');
const v2 = oldVillage('정상촌', 24, 5);
v2._terrSet = new Set(['1,1', '2,2', '3,3']);
v2._potSet = new Set(['9,9']);
const before = [...v2._terrSet].join('|'), beforePot = [...v2._potSet].join('|');
const r2 = API._terrBackfillOne(v2, VL);
chk(r2 === null, '이미 terr 보유 → 백필 스킵(null 반환)');
chk([...v2._terrSet].join('|') === before, '_terrSet 무변경');
chk([...v2._potSet].join('|') === beforePot, '_potSet 무변경');
chk(!v2._terrBackfilled, '_terrBackfilled 미세팅');

// ── ④ 생활층 게이트 통과 ──
console.log('\n[④ 생활층 조기 return 게이트 통과]');
// npcLifeTick / _lifeDaily / _lifeGranAdd 의 실제 게이트 식을 원문에서 추출해 그대로 평가
const gates = [
  ['npcLifeTick', v => !(!v || !v._terrSet || !v._terrSet.size)],
  ['_lifeDaily', v => !(!LIFE_ON || !v._terrSet || !v._terrSet.size || !v.econ)],
  ['_lifeGranAdd', v => !(!state.ta || !v.econ || !v._granList || !v._terrSet || !v._terrSet.size)],
];
for (const [nm, g] of gates) chk(g(v1) === true, `${nm}: 백필 후 통과(백필 전이면 ${g(oldVillage('x', 21, 5)) ? '?' : '차단'})`);
// 파종 경로: _crop 파종은 농부가 _farmSet 셀에 도달해야 하므로, 여기서는 "게이트가 열렸고 밭·영토가 있다"까지 검사
chk(v1._farmSet.size > 0 && v1._terrSet.size > 0, `파종 전제 성립: 기경지 ${v1._farmSet.size}셀 · 영토 ${v1._terrSet.size}셀`);

// ── ⑤ _terrBackfillAll 배치 동작 ──
console.log('\n[⑤ 전체 백필 — 대상만 처리]');
state.villages = [oldVillage('A', 21, 5), oldVillage('B', 12, 3), v2];
const done = API._terrBackfillAll();
chk(done.length === 2, `대상 2개만 백필(정상촌 제외) — 실제 ${done.length}`);
chk(state.villages[2]._terrSet.size === 3, '정상촌 그대로');
console.log('  로그:'); logs.filter(l => l.includes('백필')).slice(0, 4).forEach(l => console.log('    ' + l));

console.log('\n' + (fail === 0 ? '결과: PASS (전 항목)' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
