#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === T4 검증 하네스: 곳간 증설 런타임(_granAdd 링) ===
// server/villages.js 의 pickGranarySpot / _lifeGranAdd / _lifeCompleteGranary 를 **원문 그대로 잘라내
// (재구현 아님)** 스텁 state 위에서 실행한다. 랩 상수(G_CAP 2500·G_MAX 8·G_BUILDD 6)와
// 자리 회피 규칙(집채+1·텃밭·큰집·기존 곳간·물 16 이격·영토·농지)을 검사.
//
// 실행: node scripts/test-granary-add.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
function cut(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('함수 못 찾음: ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('중괄호 매칭 실패: ' + name);
}
const constLine = src.match(/const G_CAP = \d+, G_MAX = \d+, G_BUILDD = \d+;/)[0];

// ---- 스텁 월드 ----
const SZ = 32;
const CCX = 200, CCY = 200;               // 큰집 중심
const WATER = new Set();                  // 물 셀 "x,y"
const BLOCK = new Set();                  // 차단 셀
const ta = {
  isBlocked: (x, y) => BLOCK.has(x + ',' + y),
  isWater: (x, y) => WATER.has(x + ',' + y),
};
const terrSet = new Set();
for (let x = CCX - 30; x <= CCX + 30; x++) for (let y = CCY - 30; y <= CCY + 30; y++) terrSet.add(x + ',' + y);

const dbRows = [];
const broadcasts = [];
const liveRows = [];
const state = {
  ta, zoneId: 'test', world: { day: 0 },
  db: { insertVillageBuilding: (b) => { dbRows.push(b); return dbRows.length; } },
  deps: {
    broadcast: (m) => broadcasts.push(m),
    liveBuildRow: (type, x, y, data, ownerId, ownerName, made) => {
      const o = { id: 'lb' + liveRows.length, type, x, y, data, ownerId, ownerName };
      liveRows.push(o); if (made) made.push(o); return o;
    },
  },
};

// ★★[T49 2026-09-03] **잘라내 실행하는 자의 값과 삯.**
//   이 하네스는 `villages.js` 의 함수를 **원문 그대로 잘라내** vm 위에서 돌린다(재구현 금지 —
//   그게 이 하네스의 값이다). 삯은 이것이다: 제품이 그 함수 안에서 **헬퍼를 하나 더 부르는 순간**
//   샌드박스에 그 이름이 없어 `ReferenceError` 로 죽는다.
//   실제로 그랬다 — T50 이 `_lifeCompleteGranary` 안에 `noteVillageBuilt(vil,'granary')` 한 줄을
//   넣었고, 이 하네스는 **러너에 들어온 첫날 그 줄에 죽었다**(`noteVillageBuilt is not defined`).
//   ⇒ 제품은 멀쩡하다. 잘라낸 조각이 부르는 **바깥 이름을 여기서 받아 준다.**
//     장부 기록은 이 하네스가 재는 대상이 아니므로 **아무 일도 안 하는 스텁**이 맞다.
//     (더 잘라 넣지 않는 이유: `noteVillageBuilt` 는 모듈 상태 `_evBuilds` 를 만지는데
//      그걸 같이 끌고 오면 이 하네스가 재지도 않는 층을 떠안는다.)
const _stubs = {
  noteVillageBuilt() {},           // T50 사건 장부 접점 — 여기선 무시한다
};
const ctx = vm.createContext(Object.assign({ state, SZ, console, Math, Set, Map, Array, Object, JSON, Number }, _stubs));
vm.runInContext(constLine + '\n' + cut('pickGranarySpot') + '\n' + cut('_lifeCompleteGranary') + '\n' + cut('_lifeGranAdd')
  + '\nglobalThis.__api = { pickGranarySpot, _lifeGranAdd, _lifeCompleteGranary, G_CAP, G_MAX, G_BUILDD };', ctx);
const API = ctx.__api;

let fail = 0;
const chk = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++; };

console.log('=== T4 곳간 증설 검증 (원문 함수 직접 실행) ===');
console.log(`랩 상수: G_CAP=${API.G_CAP} G_MAX=${API.G_MAX} G_BUILDD=${API.G_BUILDD}`);
chk(API.G_CAP === 2500 && API.G_MAX === 8 && API.G_BUILDD === 6, '랩 상수 verbatim(2500/8/6)');

function newVil(food, houses) {
  return {
    dbId: 1, name: '검증촌', ccx: CCX, ccy: CCY,
    econ: { storage: { food }, npcs: [] },
    _terrSet: terrSet, _potSet: new Set(), _farmSet: new Set(),
    _houseCells: houses || [], _granList: [], _granPend: null,
  };
}

// --- ① 재고 비례 목표 ---
console.log('\n[① 재고 비례 목표 _gn = clamp(ceil(food/2500),1,8)]');
for (const [food, exp] of [[0, 1], [2500, 1], [2501, 2], [7400, 3], [50000, 8]]) {
  const gn = Math.max(1, Math.min(API.G_MAX, Math.ceil(food / API.G_CAP)));
  chk(gn === exp, `식량 ${food} → 목표 ${gn}동 (기대 ${exp})`);
}

// --- ② 하루 1동 + 6일 완공 ---
console.log('\n[② 하루 1동 착공 · G_BUILDD(6)일 후 완공]');
{
  const vil = newVil(20000);   // 목표 8동
  const log = [];
  for (let d = 0; d <= 40; d++) {
    state.world.day = d;
    const before = vil._granList.length;
    API._lifeGranAdd(vil);
    if (vil._granList.length > before) log.push(d);
  }
  chk(log.length > 0, `완공 발생: ${log.length}동 (완공일 ${log.join(',')})`);
  const gaps = log.slice(1).map((d, i) => d - log[i]);
  chk(gaps.every(g => g === API.G_BUILDD + 1) || gaps.length === 0,
      `완공 간격 = 착공1일+공사6일 = ${API.G_BUILDD + 1}일 균일 (실측 ${gaps.join(',') || '-'})`);
  chk(vil._granList.length <= API.G_MAX, `상한 준수 ${vil._granList.length} ≤ ${API.G_MAX}`);
  // DB 영속 + 라이브 방송
  chk(dbRows.filter(r => r.type === 'granary').length === vil._granList.length, 'village_buildings granary 행 = 완공 수(재부팅 재기록 원료)');
  const wallN = liveRows.filter(o => o.type === 'wall').length, floorN = liveRows.filter(o => o.type === 'floor').length;
  chk(wallN === vil._granList.length * 16 && floorN === vil._granList.length * 15,
      `실체화 5×3 밀폐: 벽 ${wallN}(동당 16 — 5+5+3+3, 문 없음) · 바닥 ${floorN}(동당 15)`);
  chk(broadcasts.every(b => b.type === 'buildings_spawn'), '라이브 방송 buildings_spawn');
  chk(liveRows.every(o => o.data && Array.isArray(o.data.gran)), '전 행 data.gran 태그(클라 고상곳간 스프라이트 앵커)');

  // --- ③ 자리 회피 규칙 ---
  console.log('\n[③ 자리 회피 — 곳간끼리 · 링 반경 · 남측]');
  const gs = vil._granList;
  let minSep = 1e9, ringOK = true, southN = 0;
  for (let i = 0; i < gs.length; i++) {
    const r = Math.hypot(gs[i].cx - CCX, gs[i].cy - CCY);
    if (r < 10.5 || r > 15.5) ringOK = false;
    if (gs[i].cy > CCY + 2 && Math.abs(gs[i].cx - CCX) < 8) southN++;
    for (let j = i + 1; j < gs.length; j++) {
      const dx = Math.abs(gs[i].cx - gs[j].cx), dy = Math.abs(gs[i].cy - gs[j].cy);
      if (dx <= 6 && dy <= 4) minSep = Math.min(minSep, 0); else minSep = Math.min(minSep, 1);
    }
  }
  chk(minSep !== 0, `곳간끼리 이격(|dx|>6 또는 |dy|>4) — ${gs.length}동 전 쌍`);
  chk(ringOK, `전 동이 링 r11~15 안 (${gs.map(g => Math.hypot(g.cx - CCX, g.cy - CCY).toFixed(1)).join(', ')})`);
  chk(southN === 0, '남쪽 집결 마당 정면(콘) 회피');
}

// --- ④ 집채·텃밭·큰집 비겹침 ---
console.log('\n[④ 집채([-5..0]×[-5..-2])+1버퍼 · 텃밭([+1..+4]²) · 큰집 8×8 비겹침]');
{
  const houses = [];
  for (let a = 0; a < 360; a += 40) {   // 링을 둘러싼 집 배치
    const th = a * Math.PI / 180;
    houses.push({ cx: Math.round(CCX + Math.cos(th) * 20), cy: Math.round(CCY + Math.sin(th) * 20) });
  }
  const vil = newVil(20000, houses);
  for (let d = 0; d <= 60; d++) { state.world.day = d; API._lifeGranAdd(vil); }
  let ov = 0;
  for (const g of vil._granList) {
    for (const h of houses) {
      if (g.cx + 2 >= h.cx - 6 && g.cx - 2 <= h.cx + 1 && g.cy + 1 >= h.cy - 6 && g.cy - 1 <= h.cy - 1) ov++;
      if (g.cx + 2 >= h.cx + 1 && g.cx - 2 <= h.cx + 4 && g.cy + 1 >= h.cy + 1 && g.cy - 1 <= h.cy + 4) ov++;
    }
    if (g.cx + 2 >= CCX - 5 && g.cx - 2 <= CCX + 4 && g.cy + 1 >= CCY - 5 && g.cy - 1 <= CCY + 4) ov++;
  }
  chk(ov === 0, `집 ${houses.length}채 둘러싼 상태에서 증설 ${vil._granList.length}동 — 겹침 ${ov}건`);
}

// --- ⑤ 물 16 이격 · 농지 회피 · 링 여력 없음 관용 ---
console.log('\n[⑤ 물 체비셰프 16 이격 · 농지 회피 · 자리 없음 관용]');
{
  for (let x = CCX - 40; x <= CCX + 40; x++) for (let y = CCY + 6; y <= CCY + 40; y++) WATER.add(x + ',' + y);  // 남쪽 전체가 강
  const vil = newVil(20000);
  for (let d = 0; d <= 60; d++) { state.world.day = d; API._lifeGranAdd(vil); }
  let wOK = true;
  for (const g of vil._granList) for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++)
    if (WATER.has((g.cx + dx) + ',' + (g.cy + dy))) wOK = false;
  chk(wOK, `물 16셀 이격 준수 (증설 ${vil._granList.length}동)`);

  const vil2 = newVil(20000);
  vil2._farmSet = new Set(terrSet);   // 영토 전체가 농지 → 자리 없음
  for (let d = 0; d <= 20; d++) { state.world.day = d; API._lifeGranAdd(vil2); }
  chk(vil2._granList.length === 0 && !vil2._granPend, '농지로 꽉 찬 마을 = 착공 0(예외 없이 관용 스킵)');
  WATER.clear();
}

// --- ⑥ 목표 도달 후 정지 ---
console.log('\n[⑥ 목표 도달 후 추가 증설 없음]');
{
  const vil = newVil(2500);   // 목표 1동
  vil._granList = [{ cx: CCX + 12, cy: CCY - 5 }];
  for (let d = 0; d <= 30; d++) { state.world.day = d; API._lifeGranAdd(vil); }
  chk(vil._granList.length === 1 && !vil._granPend, '식량 2500(목표 1동)·기존 1동 → 착공 0');
}

console.log('\n' + (fail === 0 ? '결과: PASS (전 항목)' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
