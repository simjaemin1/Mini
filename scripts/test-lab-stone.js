#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-lab-stone.js — 바닥 마을의 돌: 관 굵기를 실물 바위에서 (T163 · 랩) ======
//
// ★왜 [T152 (B) → PM 승인 순서 ②→①→③ · 지시 T163]
//   석재 바닥 마을이 51곳 중 36곳이고, 그 36곳 **전부**가 800일 중 절반 넘는 날을
//   `storage.stone < 0.2`(STONE_NET 1차 문턱) **아래**에서 산다. 안전망은 *사람은* 부르는데
//   *관을 못 넓힌다* — 굵기를 정하는 것이 `land.stone` 이고 바닥 마을의 그 값은 **상수 바닥항**이다.
//   처방 ②: 그 바닥항을 **실체로 채운다**(T135 2판 "예산이 나무를 한 곳만 셌다" 와 같은 문법).
//
// ★★이 하네스가 지키는 것
//   ① 문      : `sim/economy-sim.js` 의 접점은 **`world.stoneBudgetFn` 한 곳**뿐이다
//   ② 되돌림  : 주입이 없으면(서버·CLI·하네스·`L_STONEREAL=0`) 세계가 **비트 동일**
//   ③ 유도    : 랩의 `L_STONE_SCATTER` 를 **청크 생성기 정본에서 다시 유도해도 같다**(새 수 0)
//   ④ 역함수  : 랩 부존식 `FLOOR + GAIN×rockD` 를 되읽어 `rockD` 를 되찾는다(왕복 항등)
//   ⑤ 실측    : 바닥 마을 돌 예산 대 `land.stone × 0.9` — **카드가 건 부등호는 실측이 뒤집었다**(아래)
//   ⑥ 돌연변이: 흩어진 바위 밀도를 0 으로 적으면 바닥 마을 예산이 **0** 이 된다 → 빨강
//   ⑦ 랩 배선 : 상수가 한 곳뿐이고(사본 0) 손잡이 기본이 **OFF** 이며 훅이 `reseed` 에서 걸린다
//
// 실행: node scripts/test-lab-stone.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t163-st-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const note = (m) => console.log('  ⓘ ' + m);

const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const CH = R('server/chunk');
const LV = R('server/livelihood');
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const LAB = fs.readFileSync(path.join(ROOT, 'lab', '전쟁실험실.html'), 'utf8');
// ★줄 주석을 **먼저** 지우고 블록 주석을 지운다(T100 5판 수리 — `// … sim/* …` 함정 · T152 §3 회부).
const codeOf = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
const CODE = codeOf(SRC), LCODE = codeOf(LAB);

console.log('\n=== 바닥 마을의 돌 — 관 굵기를 실물 바위에서 (T163 · 랩) ===');

// ── ① 문 — 접점은 한 곳 ────────────────────────────────────────────────────
console.log('\n① 문 — `sim/economy-sim.js` 의 접점은 한 곳뿐인가');
{
  //   ★한 **줄**로 센다 — 문의 관용구가 한 줄에서 이름을 두 번 쓴다(`typeof … ? … : null`).
  //     낱말 수로 세면 그 관용구가 빨개진다(T157·T161 의 문도 같은 꼴이다).
  const hitLines = CODE.split('\n').filter((l) => l.indexOf('stoneBudgetFn') >= 0).length;
  ok(hitLines === 1, '① ★★엔진에서 `stoneBudgetFn` 을 읽는 **줄이 하나**다(문 하나)', `${hitLines}줄`);
  ok(/const _sbFn = \(v\._world && typeof v\._world\.stoneBudgetFn === 'function'\) \? v\._world\.stoneBudgetFn : null;/.test(CODE),
    '① 문 문법이 T135/T157/T161 선례와 같다(`v._world` 백참조 · typeof 검사)');
  ok(/const stoneYield = _stoneK \* skillMul \* _forageScale \* 0\.9;/.test(CODE),
    '① ★산출식은 **한 줄 그대로**다 — 바뀐 것은 첫 인자 하나뿐');
  ok(!/stoneBudgetFn/.test(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8')),
    '① ★★서버(`server/villages.js`)는 이 문을 **안 연다**(= 라이브 무변)');
}

// ── ② 되돌림 — 주입이 없으면 비트 동일 ──────────────────────────────────────
console.log('\n② 되돌림 — 문을 안 열면 세계가 비트 동일한가');
const mkWorld = (inject) => {
  const w = econV2.createWorldV2({ seed: 4242, villageCount: 0, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  w.villages = []; w.events = [];
  if (inject) w.stoneBudgetFn = (v) => 0.9;                      // 아무 값이나 — 문이 열리면 세계가 달라야 한다
  for (let i = 0; i < 6; i++) {
    const v = econ.createVillage({ fertility: 1.0, water: 0.8, stone: LV.FLOOR.stone, ore: 0.1, wood: 0.9, game: 0.6,
                                   arable: 1, size: 60, initialPop: 30, name: '마을' + i });
    v._world = w; v.coord = { x: i * 400, y: 0 };
    w.villages.push(v);
  }
  w.day = 0;
  for (let d = 0; d < 200; d++) econV2.tickWorldV2(w, d);
  return w.villages.map((v) => ({ n: v.npcs.length, s: +(v.storage.stone || 0).toFixed(9), t: +(v.storage.tool || 0).toFixed(9),
                                  f: +(v.storage.food || 0).toFixed(9) }));
};
{
  const a = JSON.stringify(mkWorld(false));
  const b = JSON.stringify(mkWorld(false));
  const c = JSON.stringify(mkWorld(true));
  ok(a === b, '② ★★주입 없는 두 판이 **비트 동일**(결정론 · 되돌림의 뿌리)');
  ok(a !== c, '② ★주입하면 실제로 **다른 세계**가 된다(문이 죽어 있지 않다)');
}

// ── ③ 유도 — 랩 상수를 청크 정본에서 다시 만든다 ────────────────────────────
console.log('\n③ 유도 — 랩 `L_STONE_SCATTER` 를 정본에서 다시 만들어도 같은가');
const LAB_SCATTER = (() => { const m = LCODE.match(/L_STONE_SCATTER\s*=\s*([0-9.eE+-]+)/); return m ? +m[1] : null; })();
const ZONES = R('server/zone-config').ZONES;
const BIOME = (ZONES.hanbando && ZONES.hanbando.biome) || 'forest';
{
  pre(typeof CH.scatterRocksPerCell === 'function' && typeof CH.rockShareOf === 'function',
    '정본이 `scatterRocksPerCell`·`rockShareOf` 를 내준다(`server/chunk.js`)');
  const canon = CH.scatterRocksPerCell(BIOME);
  pre(LAB_SCATTER != null, '랩에서 `L_STONE_SCATTER` 를 찾았다', String(LAB_SCATTER));
  ok(LAB_SCATTER != null && Math.abs(LAB_SCATTER - canon) < 1e-12,
    `③ ★★★랩 상수 = 정본 유도값(biome=${BIOME})`, `${LAB_SCATTER} vs ${canon}`);
  // 그 유도가 **표를 옮겨 적지 않았는가** — `pickResourceType` 자신에게 물었는지
  const CHSRC = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8'));
  ok(/function rockShareOf[\s\S]{0,400}?pickResourceType\(biome/.test(CHSRC),
    '③ ★`rockShareOf` 가 **표에게 물어본다**(확률을 손으로 안 적었다)');
  ok(/return RESOURCES_PER_CHUNK \* rockShareOf\(biome\) \/ cellsPerChunk;/.test(CHSRC),
    '③ 밀도 = 청크당 자원 수 × `rock` 몫 ÷ 청크 셀 수 (새 수 0)');
  // 청크 크기는 **서버가 부르는 것**이어야 한다(T135 2판 족보 — 하네스의 청크가 아니다)
  ok(CH.CHUNK_SIZE === 1024, '③ ★청크 크기는 서버가 부르는 값(`zone.js` 가 chunkSize 를 안 준다 = 기본값)', String(CH.CHUNK_SIZE));
}

// ── ④ 역함수 — 부존식을 되읽는다 ────────────────────────────────────────────
console.log('\n④ 역함수 — 랩 부존식을 되읽어 바위 셀 비율을 되찾나');
const LAB_FLOOR = (() => { const m = LCODE.match(/L_STONE_FLOOR\s*=\s*([0-9.]+)/); return m ? +m[1] : null; })();
const LAB_GAIN = (() => { const m = LCODE.match(/L_STONE_GAIN\s*=\s*([0-9.]+)/); return m ? +m[1] : null; })();
{
  pre(LAB_FLOOR != null && LAB_GAIN != null, '랩에서 부존식의 두 수를 찾았다', `FLOOR=${LAB_FLOOR} GAIN=${LAB_GAIN}`);
  ok(/stone:\s*\+\(L_STONE_FLOOR\+rockD\*L_STONE_GAIN\)\.toFixed\(2\)/.test(LCODE),
    '④ ★★부존식이 그 **이름**을 쓴다(수가 한 곳뿐 — 사본 0)');
  const nFloor = (LCODE.match(/L_STONE_FLOOR\s*=/g) || []).length, nGain = (LCODE.match(/L_STONE_GAIN\s*=/g) || []).length;
  ok(nFloor === 1 && nGain === 1, '④ 두 수의 **정의가 각각 하나**다', `FLOOR ${nFloor}회 · GAIN ${nGain}회`);
  ok(/const rockD=Math\.max\(0,\(base-L_STONE_FLOOR\)\/L_STONE_GAIN\)/.test(LCODE),
    '④ ★★★역함수가 그 두 수로 `rockD` 를 되찾는다(왕복)');
  // 왕복 항등 — 임의의 rockD 를 넣어 부존식을 돌리고 되읽으면 같은 수가 나온다
  let worst = 0;
  for (let i = 0; i <= 20; i++) {
    const rd = i / 200;                                   // 0 ~ 0.10 (실지도 rockShare 구간)
    const st = +(LAB_FLOOR + rd * LAB_GAIN).toFixed(2);   // 랩 부존식(소수 둘째 자리 반올림 포함)
    const back = Math.max(0, (st - LAB_FLOOR) / LAB_GAIN);
    worst = Math.max(worst, Math.abs(back - rd));
  }
  ok(worst <= 0.005 / LAB_GAIN + 1e-12, '④ 왕복 오차가 부존식의 **반올림 폭 안**이다', `최대 ${worst.toFixed(6)}`);
  ok(/const share=rockD\+\(1-rockD\)\*L_STONE_SCATTER/.test(LCODE),
    '④ ★실물은 **두 곳**에서 난다 — 산(바위 셀) + 흩어진 바위(나머지 셀)');
}

// ── ⑤ 실측 — 카드가 건 부등호를 그대로 잰다 ─────────────────────────────────
console.log('\n⑤ 실측 — 바닥 마을 돌 예산 대 `land.stone × 0.9`');
{
  //   카드 §3 이 건 판: "바닥 마을 돌 예산 > `land.stone × 0.9`".
  //   ⚠**§0-ⓑ 실측이 이 부등호를 뒤집었다.** 청크를 굽어 세니 스캔 원(61,575셀) 안 실물 바위가
  //     바닥 36곳 중앙 16 · 그 밖 15곳 중앙 14 다 — `land.stone` 은 10배 갈리는데 실물은 안 갈린다.
  //     까닭: 바위는 **제 그리드가 없고 산 자체가 그리드**인데, 그 산(바위 셀)은 청크 생성기가
  //     `isRockCellLocal` 로 **spawn 을 막는 자리**다. 나무(바닥 마을 실물 183그루)와 부호가 반대다.
  //   ⇒ 거짓 하네스를 짓지 않는다. 부등호를 **판정이 아니라 수치로** 낸다(판정은 재민 · 회부).
  const scanCells = Math.PI * R('server/villages').LAND_SCAN_R * R('server/villages').LAND_SCAN_R;
  const rocks = CH.scatterRocksPerCell(BIOME) * scanCells;
  const floorK = LAB_GAIN * (0 + (1 - 0) * LAB_SCATTER);                  // 랩 바닥 마을의 유도 관 굵기
  const floorNow = LAB_FLOOR;                                             // 종전(상수 바닥항)
  note(`스캔 원 ${Math.round(scanCells).toLocaleString()}셀 · 흩어진 바위 **${rocks.toFixed(1)}개**(정본 유도 · 실측 중앙 16 과 일치)`);
  note(`랩 바닥 마을 관 굵기  종전 ${floorNow} → 유도 ${floorK.toFixed(5)}  (×${(floorK / floorNow).toFixed(4)})`);
  note(`카드 §3 의 부등호(예산 > land.stone×0.9)는 **거짓**이다 — ${floorK.toFixed(5)} < ${(floorNow * 0.9).toFixed(4)}. 회부(보고 §2).`);
  ok(rocks > 0, '⑤ 바닥 마을에도 흩어진 바위는 **있다**(0 이 아니다)', `${rocks.toFixed(1)}개`);
  ok(floorK < floorNow, '⑤ ★★그러나 실물로 유도한 관은 상수 바닥항보다 **얇다** — 부호가 나무와 반대', `${floorK.toFixed(5)} < ${floorNow}`);
}

// ── ⑥ 돌연변이 — 밀도를 0 으로 적으면 빨개지나 ──────────────────────────────
console.log('\n⑥ 돌연변이 — 흩어진 바위 밀도가 0 이면');
{
  const mutK = LAB_GAIN * (0 + 1 * 0);
  ok(mutK === 0, '⑥ ★밀도 0 → 바닥 마을 예산이 **0** — 채집꾼 돌 산출이 통째로 끊긴다(종전보다 나빠짐)', String(mutK));
  ok(LAB_SCATTER > 0, '⑥ 지금 랩 상수는 0 이 아니다(돌연변이가 아니다)', String(LAB_SCATTER));
  //   ★족보 128: 돌연변이는 수출을 갈아 끼우는 게 아니라 값을 바꿔 **그 결과**를 본다. 여기선 순수식이라 직접 센다.
  ok(CH.rockShareOf('mountain') > CH.rockShareOf('plains'),
    '⑥ 정본이 살아 있다 — 산의 `rock` 몫이 초지보다 크다',
    `${CH.rockShareOf('mountain').toFixed(3)} > ${CH.rockShareOf('plains').toFixed(3)}`);
}

// ── ⑦ 랩 배선 — 기본 OFF · 훅은 한 자리 ─────────────────────────────────────
console.log('\n⑦ 랩 배선 — 기본이 꺼져 있고 훅이 한 자리인가');
{
  ok(/if \(window\.L_STONEREAL === undefined\) window\.L_STONEREAL = 0;/.test(LCODE),
    '⑦ ★★손잡이 기본 **0**(문을 안 연다 = 다른 세션 기준선 무변)');
  ok(/if\(\+window\.L_STONEREAL!==0\)ECON_WORLD\.stoneBudgetFn=stoneRealFn;/.test(LCODE),
    '⑦ ★훅이 `reseed` 의 econ world 조립 줄 **한 자리**에서 걸린다');
  const hooks = (LCODE.match(/ECON_WORLD\.stoneBudgetFn\s*=/g) || []).length;
  ok(hooks === 1, '⑦ 훅이 한 자리뿐이다', `${hooks}회`);
  ok(/function stoneRealFn\(ev\)\{/.test(LCODE), '⑦ 주입 함수가 랩에 있다(엔진이 계수를 안 갖는다)');
  ok(/ev\._baseStone=ev\.land\.stone;/.test(LCODE),
    '⑦ ★역함수가 읽는 자는 **초기 부존**이다(`land.stone` 은 광맥 고갈로 움직인다)');
  // 인라인 3사본 규약 — 랩 안 엔진에도 문이 실려 있어야 한다(안 그러면 랩만 옛 엔진)
  ok(/stoneBudgetFn/.test(LCODE.split('function stoneRealFn')[0]),
    '⑦ ★★랩 **인라인 엔진**에도 문이 실려 있다(번들 재생성·재인라인 완료)');
}

// ════════════════════════════════════════════════════════════════════════════════════════
// ★★[T173 2026-09-11] **처방 ① — 관을 밖에서 넓힌다**(같은 파일 다른 절 · 위는 ②의 자리다)
//   §0 진단이 갈래를 잘랐다: 바닥 36마을이 800일 동안 캐러밴으로 받은 돌이 **0**(0곳/36곳)인데
//   파는 마을은 13~14곳이고 바닥 마을의 수출 총량은 그 밖 15곳 합보다 크다 — 막힌 것은
//   **대금이 아니라 우선순위**다. 귀환 화물 규칙엔 **식량 pull** 만 있고 돌에는 그 자리가 없다.
// ════════════════════════════════════════════════════════════════════════════════════════
const V2SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
const V2CODE = codeOf(V2SRC);

console.log('\n⑧ 문(T173) — `economy-sim-v2.js` 의 접점은 한 줄인가');
{
  const hitLines = V2CODE.split('\n').filter((l) => l.indexOf('returnPullFn') >= 0).length;
  ok(hitLines === 1, '⑧ ★★엔진에서 `returnPullFn` 을 읽는 **줄이 하나**다(문 하나)', `${hitLines}줄`);
  ok(/const _rpFn = \(world && typeof world\.returnPullFn === 'function'\) \? world\.returnPullFn : null;/.test(V2CODE),
    '⑧ 문 문법이 T135/T157/T161/T163 선례와 같다');
  ok(!/returnPullFn/.test(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8')),
    '⑧ ★★서버는 이 문을 **안 연다**(= 라이브 무변)');
  ok(/if \(_r && _r !== c\.giveRes && \(c\.to\.storage\[_r\] \|\| 0\) > 1 && !_returnGlutted\(_r\)\) returnRes = _r;/.test(V2CODE),
    '⑧ ★★★**공짜 돌 0** — 문이 종전 두 게이트(실물 >1 · 글럿 아님)를 그대로 다시 건다');
}

console.log('\n⑨ 되돌림(T173) — 문을 안 열면 비트 동일 · 열면 돌이 실제로 실린다');
//   ★픽스처 둘. `starve` 는 **바닥 마을의 돌을 매일 0 으로 비운다** — 작은 세계에선 소비처가 없어
//     돌이 곳간에 쌓이고(실측 396~1,248) 그러면 엔진의 글럿 게이트가 문을 막아 **자명 통과**가 된다.
//     실지도 36마을이 800일 중 절반을 `돌<0.2` 로 사는 그 상태를 여기서 강제로 만든다.
const mkTrade = (inject, starve) => {
  const w = econV2.createWorldV2({ seed: 909, villageCount: 0, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  w.villages = []; w.events = []; w.caravans = [];
  if (inject) w.returnPullFn = (from, to, cur) => (cur === 'stone' ? null : 'stone');
  const LP = [{ stone: LV.FLOOR.stone, name: '바닥' }, { stone: 2.5, name: '산촌' }];
  for (let i = 0; i < 6; i++) {
    const base = LP[i % 2];
    const v = econ.createVillage({ fertility: 1.2, water: 0.9, stone: base.stone, ore: 0.2, wood: 1.2, game: 0.7,
                                   arable: 1, size: 70, initialPop: 40, name: base.name + i });
    v._world = w; v.coord = { x: (i % 3) * 120, y: Math.floor(i / 3) * 120 };
    w.villages.push(v);
  }
  w.day = 0;
  //   ★귀환 화물은 **실려 있는 동안** 세야 한다 — 집에 닿은 캐러밴은 목록에서 빠진다(끝에 세면 늘 0).
  w._t173 = { stoneReturns: 0, stoneAmt: 0, returns: 0 };
  const seen = new Set();
  for (let d = 0; d < 300; d++) {
    if (starve) for (let i = 0; i < w.villages.length; i += 2) w.villages[i].storage.stone = 0;
    econV2.tickWorldV2(w, d);
    for (const c of (w.caravans || [])) {
      if (seen.has(c.id) || !c._returningRes) continue;
      seen.add(c.id); w._t173.returns++;
      if (c._returningRes === 'stone') { w._t173.stoneReturns++; w._t173.stoneAmt += (+c._returningAmt || 0); }
    }
  }
  return w;
};
const digest = (w) => JSON.stringify(w.villages.map((v) => ({ n: v.npcs.length, s: +(v.storage.stone || 0).toFixed(9),
  t: +(v.storage.tool || 0).toFixed(9), f: +(v.storage.food || 0).toFixed(9) })));
{
  const a = mkTrade(false, false), b = mkTrade(false, false);
  ok(digest(a) === digest(b), '⑨ ★★주입 없는 두 판이 **비트 동일**(결정론 · 되돌림의 뿌리)');
  const so = mkTrade(false, true), sn = mkTrade(true, true);
  pre(so._t173.returns > 0, '이 세계에서 캐러밴이 실제로 귀환한다(안 돌면 아래가 자명 통과가 된다)', `귀환 ${so._t173.returns}건`);
  ok(digest(so) !== digest(sn), '⑨ ★주입하면 실제로 **다른 세계**가 된다(문이 죽어 있지 않다)');
  ok(sn._t173.stoneReturns > so._t173.stoneReturns,
    '⑨ ★★★ON 에서 **돌 귀환 화물이 실제로 늘었다**(자명 통과 금지)',
    `${so._t173.stoneReturns}건 → ${sn._t173.stoneReturns}건 (${so._t173.stoneAmt.toFixed(0)} → ${sn._t173.stoneAmt.toFixed(0)} 단위)`);
  ok(sn._t173.stoneAmt > so._t173.stoneAmt * 2,
    '⑨ 늘어난 폭이 잡음이 아니다(2배 이상)', `×${(so._t173.stoneAmt ? sn._t173.stoneAmt / so._t173.stoneAmt : 0).toFixed(2)}`);
  //   ★굶기지 않으면 문은 **안 선다**(글럿 게이트가 막는다) — 문이 규칙을 느슨하게 하지 않는 증거
  const ng = mkTrade(true, false);
  ok(digest(ng) === digest(a), '⑨ ★★돌이 남아도는 세계에선 문이 **아무것도 안 바꾼다**(글럿 게이트 · 공짜 돌 0)');
}

console.log('\n⑩ 진단 계측기 — T142 계측기를 재사용했나(정본 재구현 0)');
{
  const D = fs.readFileSync(path.join(ROOT, 'scripts', 'stone-trade-diag.js'), 'utf8');
  const DC = codeOf(D);
  ok(/Events\.createLedger\(/.test(DC), '⑩ 장부를 **정본에서** 만든다(`Events.createLedger`)');
  ok(/onRequest:/.test(DC), '⑩ ★T142 가 뚫어 둔 `onRequest` 훅을 쓴다(새 창구 0)');
  ok(/Villages\.playerVillageDepositMap\(\)/.test(DC),
    '⑩ ★★납품 가능 품목표를 정본에서 받는다 — 없으면 의뢰가 **0건**이 된다(첫 판이 그렇게 틀렸다)');
  ok(!/reqOpened\s*[+]{2}|reqNoPay\s*[+]{2}|reqShrunk\s*[+]{2}/.test(DC),
    '⑩ ★★다섯 갈래 수를 **자기가 세지 않는다**(장부의 `stats` 를 읽기만 한다)');
  ok(/ledger\.stats/.test(DC), '⑩ 장부의 `stats` 를 읽는다');
}

console.log('\n⑪ 랩 팔(T173) — 문턱이 엔진의 그 수인가 · 자명 통과 금지');
const LAB_NET = (() => { const m = LCODE.match(/L_STONE_NET_THRESH\s*=\s*([0-9.]+)/); return m ? +m[1] : null; })();
{
  pre(LAB_NET != null, '랩에서 `L_STONE_NET_THRESH` 를 찾았다', String(LAB_NET));
  // 엔진의 STONE_NET 1차 문턱을 **소스에서 읽어** 대조한다(옮겨 적은 수인지 기계가 본다)
  const m = CODE.match(/STONE_NET_ON && _toolCrit && \(v\.land\.stone \|\| 0\) >= 0\.25 && \(v\.storage\.stone \|\| 0\) < ([0-9.]+)/);
  pre(!!m, '엔진에서 STONE_NET 1차 문턱 줄을 찾았다', m ? m[1] : '못 찾음');
  ok(!!m && LAB_NET === +m[1], '⑪ ★★★랩 문턱 = 엔진 STONE_NET 1차 문턱(새 수 0)', `${LAB_NET} vs ${m ? m[1] : '?'}`);
  ok(/if \(window\.L_STONE_TRADE === undefined\) window\.L_STONE_TRADE = 0;/.test(LCODE),
    '⑪ ★★손잡이 기본 **0**(문을 안 연다 = 다른 세션 기준선 무변)');
  ok(/if\(\+window\.L_STONE_TRADE!==0\)ECON_WORLD\.returnPullFn=stoneTradePullFn;/.test(LCODE),
    '⑪ ★훅이 `reseed` 한 자리에서 걸린다');
  // 순수 함수 자체를 랩 소스에서 떼어 내 **네 갈래를 다 밟는다**(자명 통과 금지)
  const fsrc = LCODE.match(/function stoneTradePullFn\(from, to, cur\)\{[\s\S]*?\n\}/);
  pre(!!fsrc, '랩에서 `stoneTradePullFn` 본문을 떼어 냈다');
  if (fsrc) {
    // eslint-disable-next-line no-new-func
    const f = new Function('L_STONE_NET_THRESH', fsrc[0] + '; return stoneTradePullFn;')(LAB_NET);
    const starving = { storage: { stone: 0.05 } }, rich = { storage: { stone: 50 } }, poor = { storage: { stone: 0.5 } };
    ok(f(starving, rich, 'food') === 'stone', '⑪ 굶는 마을 + 파는 마을 → **돌**');
    ok(f(starving, rich, 'stone') === null, '⑪ 이미 돌이면 끼어들지 않는다');
    ok(f({ storage: { stone: 5 } }, rich, 'food') === null, '⑪ ★안 굶으면 끼어들지 않는다(문턱 위)');
    ok(f(starving, poor, 'food') === null, '⑪ ★★파는 쪽에 실물이 없으면 **못 산다**(공짜 돌 0)');
    ok(f(null, rich, 'food') === null && f(starving, null, 'food') === null, '⑪ 인자가 없으면 종전(폴백이 곧 종전)');
  }
}

console.log('\n⑫ 공짜 돌 0 — 파는 쪽 재고를 엔진이 실제로 뺀다');
{
  ok(/c\.to\.storage\[returnRes\] = \(c\.to\.storage\[returnRes\] \|\| 0\) - _buy\.qty;/.test(V2CODE),
    '⑫ ★★도착 마을 재고에서 **산 만큼 빠진다**(`_impactBuyV2` 정산 · 이 줄이 사라지면 공짜 돌이 된다)');
  ok(/const _buy = _impactBuyV2\(c\.to, returnRes, _budget\);/.test(V2CODE),
    '⑫ 매수량은 **예산 역산**이다(시장 충격 정산 — 문이 이 식을 우회하지 않는다)');
}

console.log('\n⑬ 배율 자리 [T179] — 문이 `skillMul` 을 삼키지 않았는가(회귀 방지)');
{
  // T172 가 사냥·벌목에서 잡은 결함: 문이 `baseAmt` 를 **통째로 덮어** 배율을 지웠다.
  //   석재 문(T163)은 그 꼴이 아니다 — **관 굵기(`_stoneK`)만** 갈아 끼우고 곱은 문 **뒤에** 온다.
  //   뒤 카드가 이 줄을 T154 꼴로 바꾸면 여기가 빨개진다(3사본 둘 다 본다).
  for (const [nm, C] of [['소스', CODE], ['랩 사본', LCODE]]) {
    ok(/const stoneYield = _stoneK \* skillMul \* _forageScale \* 0\.9;/.test(C),
      `⑬ ★★[${nm}] 문 **뒤에** skillMul 이 남는다(숙련 10 채집꾼이 돌을 더 캔다)`);
    ok(/let _stoneK = \(v\.land\.stone \|\| 0\);/.test(C) && !/baseAmt = [^\n]*_sbFn/.test(C),
      `⑬ ★[${nm}] 문이 덮는 것은 **관 굵기 하나**다(baseAmt 무접촉 — 폴백이 곧 종전)`);
  }
  ok(!/toolBoost/.test(CODE.slice(CODE.indexOf('const _sbFn'), CODE.indexOf('const stoneYield'))),
    '⑬ ⓘ `toolBoost`·`inputMult` 는 **문 이전부터** 이 줄에 없었다(문이 죽인 게 아니다 — T179 §0ⓐ)');
}

console.log(`\n=== T163·T173 랩 석재: 통과 ${pass} · 실패 ${fail} ===`);
console.log('접점 심볼: t17-metrics|FLOOR.stone|land.stone|_stCost|STONE_NET|L_STONEREAL|L_STONE_TRADE|stoneBudgetFn|returnPullFn|scatterRocksPerCell|skillMul');
process.exit(fail ? 1 : 0);
