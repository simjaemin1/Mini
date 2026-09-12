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
  // 엔진의 STONE_NET 1차 문턱을 **정본에서 읽어** 대조한다(옮겨 적은 수인지 기계가 본다)
  //   ★[T180] 그 수가 `STONE_NET_STOCK` 으로 올라갔다 — 리터럴을 찾지 말고 **수출된 값**을 읽는다.
  const canonNet = econ.STONE_NET_STOCK;
  pre(typeof canonNet === 'number', '엔진 정본이 `STONE_NET_STOCK` 을 내준다', String(canonNet));
  ok(LAB_NET === canonNet, '⑪ ★★★랩 문턱 = 엔진 STONE_NET 1차 문턱(새 수 0)', `${LAB_NET} vs ${canonNet}`);
  ok(/\(v\.storage\.stone \|\| 0\) < STONE_NET_STOCK\b/.test(CODE),
    '⑪ ★엔진의 1차 게이트가 **그 이름**을 쓴다(리터럴이 아니다)');
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

// ════════════════════════════════════════════════════════════════════════════════════════
// ★★[T180 2026-09-12] **셋째 갈래 — 도구 수명** + **㉢ 한 줄**(굶는 마을은 제 돌을 안 판다)
//   T163(②)·T173(①)이 서로 다른 방향에서 같은 곳을 가리켰다: 움직이는 것은 `도구≈0` 일수다.
// ════════════════════════════════════════════════════════════════════════════════════════

console.log('\n⑬ 도구 마모 문(T180) — 접점 한 줄 · 배수 1 이면 비트 동일');
{
  const hitLines = CODE.split('\n').filter((l) => l.indexOf('toolWearMul') >= 0).length;
  ok(hitLines === 1, '⑬ ★★엔진에서 `toolWearMul` 을 읽는 **줄이 하나**다(문 하나)', `${hitLines}줄`);
  ok(/\}, 0\) \* _twMul;/.test(CODE), '⑬ ★마모 합에 **배수 하나만** 곱한다(감가율은 그대로)');
  ok(/const DAILY_TOOL_WEAR_PER_FARMER = 0\.02;/.test(CODE) && /const DAILY_TOOL_WEAR_PER_OTHER = 0\.01;/.test(CODE),
    '⑬ ★★**새 수 0** — 감가율 두 수가 그대로다(랩이 주는 것은 A/B 의 눈금)');
  //   ★[T195] 서버에도 자리가 생겼다 — 그러나 **기본 1 이면 안 연다**(`!== 1` 가드 · 아래 ⑰⑱ 이 본다).
  //     T180 때의 "서버는 이 문을 안 연다" 는 이 줄로 바뀐다: **채택값에서** 안 연다.
  ok(/if \(econ\.TOOL_WEAR_MUL !== 1\) world\.toolWearMul = econ\.TOOL_WEAR_MUL;/
       .test(codeOf(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'))),
    '⑬ ★★서버는 **정본이 1 이 아닐 때만** 이 문을 연다(채택값 1 = 라이브 무변)');
  ok(/if \(window\.L_TOOL_WEAR === undefined\) window\.L_TOOL_WEAR = 1;/.test(LCODE),
    '⑬ ★랩 손잡이 기본 **1**(= 지금 값 = 종전 비트)');
  ok(/if\(Number\.isFinite\(m\) && m>0 && m!==1\) ECON_WORLD\.toolWearMul=m;/.test(LCODE),
    '⑬ ★★배수 1 이면 랩이 **문을 아예 안 연다**(비트 동일의 뿌리)');
}

console.log('\n⑭ 도구 마모 — 배수가 실제로 도구 궤적을 바꾸나(자명 통과 금지)');
{
  const mkTool = (mul) => {
    const w = econV2.createWorldV2({ seed: 777, villageCount: 0, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    w.villages = []; w.events = []; w.caravans = [];
    if (mul !== 1) w.toolWearMul = mul;
    for (let i = 0; i < 4; i++) {
      const v = econ.createVillage({ fertility: 1.1, water: 0.8, stone: LV.FLOOR.stone, ore: 0.1, wood: 1.0, game: 0.6,
                                     arable: 1, size: 60, initialPop: 35, name: '마을' + i });
      v._world = w; v.coord = { x: i * 150, y: 0 };
      w.villages.push(v);
    }
    w.day = 0;
    let toolLow = 0;
    for (let d = 0; d < 400; d++) {
      econV2.tickWorldV2(w, d);
      for (const v of w.villages) if (((v.storage.tool) || 0) < 0.05) toolLow++;
    }
    return { toolLow, tool: w.villages.reduce((a, v) => a + (v.storage.tool || 0), 0),
             dig: JSON.stringify(w.villages.map((v) => ({ n: v.npcs.length, t: +(v.storage.tool || 0).toFixed(9) }))) };
  };
  const b1 = mkTool(1), b2 = mkTool(1), h = mkTool(0.5), d2 = mkTool(2);
  ok(b1.dig === b2.dig, '⑭ ★★배수 1 인 두 판이 **비트 동일**(문을 안 연다 · 되돌림의 뿌리)');
  ok(h.dig !== b1.dig, '⑭ ★반으로 줄이면 실제로 **다른 세계**가 된다');
  ok(h.tool > b1.tool, '⑭ ★★★마모를 반으로 하면 도구 재고가 **는다**(자명 통과 금지)', `${b1.tool.toFixed(1)} → ${h.tool.toFixed(1)}`);
  ok(d2.tool < b1.tool, '⑭ ★반대 방향도 산다 — 배수 2 면 도구가 **준다**(돌연변이 대조)', `${b1.tool.toFixed(1)} → ${d2.tool.toFixed(1)}`);
  note(`도구≈0 일수(4마을×400일) 기본 ${b1.toolLow} · 반 ${h.toolLow} · 배수2 ${d2.toolLow}`);
}

console.log('\n⑮ ㉢ 한 줄(T180) — 굶는 마을은 제 돌을 팔지 않나');
{
  ok(/if \(r === 'stone' && T180_STONE_EXPORT && stock < v1\.STONE_NET_STOCK\) continue;/.test(V2CODE),
    '⑮ ★★수출 후보에서 **문턱 아래 돌을 뺀다**(한 줄)');
  ok(/const T180_STONE_EXPORT = !\(typeof process !== 'undefined' && process\.env && process\.env\.T180_STONE_EXPORT === '0'\);/.test(V2CODE),
    '⑮ ★되돌림이 `=== \'0\'` 꼴이다(기본 ON = 채택값 · lab-wiring-check 문법)');
  // ★돌연변이 — 문턱을 손으로 적었는지 기계가 본다(엔진 정본에서 읽어 대조)
  const canon = econ.STONE_NET_STOCK;
  pre(typeof canon === 'number', 'v1 정본이 `STONE_NET_STOCK` 을 내준다', String(canon));
  ok(canon === 0.2, '⑮ 정본 문턱 값이 그대로다(0.2 · 값 무변 hoist)', String(canon));
  const lit = (V2CODE.match(/r === 'stone' && T180_STONE_EXPORT && stock < ([^)]+)\)/) || [])[1];
  ok(lit === 'v1.STONE_NET_STOCK', '⑮ ★★★수를 **옮겨 적지 않았다** — v1 정본을 읽는다(사본 0)', String(lit));
  // 엔진 두 게이트도 같은 이름을 쓰는가(수가 한 곳뿐인가)
  const gates = (CODE.match(/STONE_NET_STOCK/g) || []).length;
  ok(gates >= 3, '⑮ ★엔진의 STONE_NET 게이트들도 **그 이름**을 쓴다(정의 1 + 게이트 2 이상)', `${gates}회`);
  ok(!/\(v\.storage\.stone \|\| 0\) < 0\.2\b/.test(CODE), '⑮ 엔진에 문턱 리터럴 `0.2` 가 남아 있지 않다');
  //   ⚠엔진은 이 손잡이를 **모듈 적재 때** 읽는다 ⇒ 같은 프로세스 안에서는 A/B 를 못 가른다
  //     (족보 ⑨ — 돌연변이는 자식 프로세스 + env). 여기서는 **소스와 사본 0** 을 지키고,
  //     굶는 마을 수출이 실제로 얼마나 줄었는지는 3시드 계측기가 낸다(`보고/T180` §3).
  note('굶는 마을 수출 3시드 A/B 는 자식 프로세스 + env 로 잰다(족보 ⑨) — 표는 `보고/T180` §3');
}

console.log(`\n=== T163·T173·T180·T179 랩 석재: 통과 ${pass} · 실패 ${fail} ===`);
console.log('접점 심볼: _stCost|taper|toolBoost|STONE_NET|STONE_NET_STOCK|thresh|candidates|toolWearMul|L_TOOL_WEAR|L_STONE_TRADE|L_STONEREAL|skillMul|stoneBudgetFn');
console.log('\n⑯ 배율 자리 [T179] — 문이 `skillMul` 을 삼키지 않았는가(회귀 방지)');
{
  // T172 가 사냥·벌목에서 잡은 결함: 문이 `baseAmt` 를 **통째로 덮어** 배율을 지웠다.
  //   석재 문(T163)은 그 꼴이 아니다 — **관 굵기(`_stoneK`)만** 갈아 끼우고 곱은 문 **뒤에** 온다.
  //   뒤 카드가 이 줄을 T154 꼴로 바꾸면 여기가 빨개진다(3사본 둘 다 본다).
  for (const [nm, C] of [['소스', CODE], ['랩 사본', LCODE]]) {
    ok(/const stoneYield = _stoneK \* skillMul \* _forageScale \* 0\.9;/.test(C),
      `⑯ ★★[${nm}] 문 **뒤에** skillMul 이 남는다(숙련 10 채집꾼이 돌을 더 캔다)`);
    ok(/let _stoneK = \(v\.land\.stone \|\| 0\);/.test(C) && !/baseAmt = [^\n]*_sbFn/.test(C),
      `⑯ ★[${nm}] 문이 덮는 것은 **관 굵기 하나**다(baseAmt 무접촉 — 폴백이 곧 종전)`);
  }
  ok(!/toolBoost/.test(CODE.slice(CODE.indexOf('const _sbFn'), CODE.indexOf('const stoneYield'))),
    '⑯ ⓘ `toolBoost`·`inputMult` 는 **문 이전부터** 이 줄에 없었다(문이 죽인 게 아니다 — T179 §0ⓐ)');
}

// ════════════════════════════════════════════════════════════════════════════════════════
// ★★[T195 2026-09-12] **배수의 정본 자리** — 엔진 상수 + env 손잡이 + 서버 한 줄.
//   T180 의 문은 랩·계측기만 열 수 있었다. 서버 세계에 값을 둘 자리를 만들고, **기본 1 이면
//   문을 아예 안 연다**(`!== 1` 가드)는 것을 **자식 프로세스**로 확인한다(족보 ⑨ · T165 ⓒ 문법).
// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n⑰ 정본 자리(T195) — 상수 · 손잡이 · 서버 한 줄');
{
  const VCODE2 = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
  ok(/const TOOL_WEAR_MUL = \(\(\) => \{/.test(CODE), '⑰ 엔진에 상수 자리가 있다(`TOOL_WEAR_MUL`)');
  ok(econ.TOOL_WEAR_MUL === 1, '⑰ ★★**기본 1**(= 현행 채택값 · env 미설정)', String(econ.TOOL_WEAR_MUL));
  ok(/process\.env\.T195_TOOL_WEAR/.test(CODE), '⑰ 손잡이 이름이 `T195_TOOL_WEAR` 다');
  const vLines = VCODE2.split('\n').filter((l) => l.indexOf('toolWearMul') >= 0).length;
  ok(vLines === 1, '⑰ ★서버 접점이 **한 줄**이다', `${vLines}줄`);
  ok(/상한만/.test(SRC) && /하한/.test(SRC),
    '⑰ ★[T191 ㉢] 하향 문장 옆에 "상한만 말했다 · 하한은 T191 표" 가 적혀 있다');
  ok(/DAILY_TOOL_WEAR_PER_FARMER = 0\.02/.test(CODE) && /DAILY_TOOL_WEAR_PER_OTHER = 0\.01/.test(CODE),
    '⑰ ★**새 수 0** — 감가율 두 수가 그대로다');
}

console.log('\n⑱ 정본 자리 — env 없으면 문이 안 열리고, 있으면 랩 주입과 **같은 세계**인가(자식 프로세스)');
{
  //   ★엔진은 손잡이를 **모듈 적재 때** 읽는다 ⇒ 같은 프로세스에서는 못 가른다(족보 ⑨).
  const { execFileSync } = require('child_process');
  const PROG = `
    process.env.ENABLE_VILLAGES='0';
    const econ=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim'))});
    const econV2=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim-v2'))});
    const MODE=process.env.T195_MODE;   // node -e 에서는 argv[1] 부터다 — 헷갈리지 않게 env 로 받는다
    const w=econV2.createWorldV2({seed:515,villageCount:0,picker:'rational',infoRange:5000,raidPer100:0.005});
    w.villages=[];w.events=[];w.caravans=[];
    if(MODE==='canon'){ if(econ.TOOL_WEAR_MUL!==1) w.toolWearMul=econ.TOOL_WEAR_MUL; }
    else if(MODE==='lab'){ const m=0.9; if(Number.isFinite(m)&&m>0&&m!==1) w.toolWearMul=m; }
    for(let i=0;i<4;i++){const v=econ.createVillage({fertility:1.1,water:0.8,stone:0.25,ore:0.1,wood:1.0,game:0.6,arable:1,size:60,initialPop:35,name:'마을'+i});
      v._world=w;v.coord={x:i*150,y:0};w.villages.push(v);}
    w.day=0; for(let d=0;d<300;d++) econV2.tickWorldV2(w,d);
    const dig=JSON.stringify(w.villages.map(v=>({n:v.npcs.length,t:+(v.storage.tool||0).toFixed(9),s:+(v.storage.stone||0).toFixed(9)})));
    process.stdout.write('MUL='+(w.toolWearMul===undefined?'none':w.toolWearMul)+'|'+require('crypto').createHash('sha1').update(dig).digest('hex').slice(0,12));
  `;
  const run = (mode, mul) => {
    const env = Object.assign({}, process.env);
    if (mul == null) delete env.T195_TOOL_WEAR; else env.T195_TOOL_WEAR = String(mul);
    env.T195_MODE = mode;
    //   ⚠엔진 적재가 배너를 찍는다(`[econ-sim-v2] …`) — **마지막 줄**만 읽는다.
    const out = String(execFileSync(process.execPath, ['-e', PROG], { env, stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    const lines = out.split('\n').filter((l) => l.indexOf('MUL=') >= 0);
    return lines.length ? lines[lines.length - 1].trim() : out;
  };
  const a = run('canon', null), b = run('canon', 0.9), c = run('lab', null);
  ok(a.startsWith('MUL=none'), '⑱ ★★env 가 없으면 `world.toolWearMul` 이 **아예 안 붙는다**', a.split('|')[0]);
  ok(b.startsWith('MUL=0.9'), '⑱ `T195_TOOL_WEAR=0.9` 면 정본이 0.9 를 건넨다', b.split('|')[0]);
  ok(a.split('|')[1] !== b.split('|')[1], '⑱ ★두 팔이 **다른 세계**다(손잡이가 죽어 있지 않다)');
  ok(b.split('|')[1] === c.split('|')[1],
    '⑱ ★★★`=0.9` 정본 주입 = **랩 주입과 같은 지문**(문이 하나라는 증거)', `${b.split('|')[1]} vs ${c.split('|')[1]}`);
}

// ★★[T206 2026-09-12] **캐러밴 하나 = 품목 하나** — 남는 용량에 둘째 후보 하나.
//   §0-ⓐ: 적재율 중앙 92%(바닥 82.8%) · 빈자리 있고 둘째도 있던 leg 46.5~50.8%(3시드).
//   지키는 것: 끔 비트 동일 · 켬이면 둘째가 실린다 · **셋째 0** · **용량 초과 0** · **곳간 음수 0**.
// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n㉑ 둘째 화물(T206) — 문 두 자리 · 용량·후보 규칙 무변 · 기본 끔');
{
  const V2C = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8'));
  ok(/const CARGO_PER_TRIP = 100;/.test(V2C), '㉑ ★**새 수 0** — 수레 용량이 그대로다');
  ok(/const N_units = Math\.min\(cand\.surplus, CARGO_PER_TRIP\);/.test(V2C),
    '㉑ ★첫 품목의 적재식은 **한 줄 그대로**다');
  ok(/const _room = CARGO_PER_TRIP - N_units;/.test(V2C), '㉑ 빈자리를 용량 정본에서 뺀다(새 수 0)');
  //   ⚠[T239 정정] 예전엔 이 자리를 `break` **라는 기전**으로 잠갔다. T239 가 후보를 끝까지 훑게
  //     바꾸면서(수익 최대 후보를 같이 들고 나오려고) `break` 가 사라졌지만 **불변식은 그대로다** —
  //     `_res2` 는 `_picked` 로 잠겨 한 번만 쓰이고, 적재 자리도 `_res2` 하나뿐이다.
  //     기전이 아니라 **불변식**을 잠근다(런타임 `third` 검사는 ㉒·㉕ 에 있다).
  {
    const seg = V2C.slice(V2C.indexOf('for (const c2 of candidates)'), V2C.indexOf('for (const c2 of candidates)') + 1400);
    ok(/if \(!_picked\) \{/.test(seg) && (seg.match(/_res2 = c2\.res/g) || []).length === 1,
      '㉑ ★★★**셋째 이상 0** — 둘째 지정이 `_picked` 로 잠긴 **한 자리**뿐이다');
    ok(!/_res3|giveRes3|_n3\b/.test(V2C), '㉑ ★셋째 화물 변수 자체가 **코드에 없다**');
  }
  ok(/if \(cargoTwoOn\(world\)\) \{/.test(V2C), '㉑ 출발 쪽 문이 **한 자리**다(★T299 로 `world.cargoTwo` → `cargoTwoOn(world)`)');
  ok(/if \(c\.giveRes2 && c\.giveAmt2 > 0\) \{/.test(V2C), '㉑ 도착 쪽도 둘째를 **같은 문법**으로 정산한다');
  ok(/_gross2 = _impactSellV2\(c\.to, c\.giveRes2, _delivered2\);/.test(V2C),
    '㉑ ★둘째 매도도 **충격 정산**을 지난다(첫 품목과 같은 함수)');
  ok(/c\._returningRes2 = c\.giveRes2;/.test(V2C),
    '㉑ ★★빈손 귀환에서 둘째도 **집으로 돌아온다**(질량 누수 0)');
  //   ★★[T299 · 재민 09-19] 잠그는 것은 **값이 아니라 자리**다. 서버 기본이 **끔**(T299 정정)이고
  //     랩은 그 손잡이를 **안 심는다** ⇒ 미설정 = 끔 = 서버 기본. 랩이 `0` 을 심으면 사본이고(같은 값이라 안 들킨다)
  //     `1` 을 심으면 랩만 켠 채 뜬다 — **둘 다 빨강**이다. 하루 동안 기본이 켬이었다가 되돌아온 자리라
  //     "0 이어야 한다"·"0 이면 빨강" 어느 쪽으로도 값을 안 적는다.
  for (const k of ['L_CARGO_TWO', 'L_CARGO_TWO_GATE']) {
    const re = new RegExp('window\\.' + k + "\\s*=\\s*['\"]?[0-9]");
    const planted = LCODE.split('\n').filter((l) => re.test(l));
    ok(planted.length === 0, `㉑ ★★랩은 \`${k}\` 에 **아무 값도 안 심는다**(미설정 = 끔 = 서버 기본 · T299 정정)`,
      planted.length ? `${planted.length}줄` : '0줄');
  }
  ok(!/cargoTwoInstallHook\(\)/.test(LCODE) && !/cargoTwoGateInstallHook\(\)/.test(LCODE),
    '㉑ ★랩 주입 훅 둘이 **사라졌다**(엔진이 `window` 를 직접 읽는다 — 자리가 하나다)');
}

console.log('\n㉒ 둘째 화물 — 끔 비트 동일 · 켬 실림 · 용량 초과 0 · 곳간 음수 0');
{
  const mkCargo = (on) => {
    const w = econV2.createWorldV2({ seed: 828, villageCount: 0, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    w.villages = []; w.events = []; w.caravans = [];
    //   ★[T299] 기본이 켬이 됐다 — 이 절은 **T206 의 물음**(둘째만 · 관문 없음)이라 두 문을 **명시**로 잡는다.
    w.cargoTwo = !!on; w.cargoTwoGate = false;
    let legs = 0, twoLegs = 0, over = 0, maxUnits = 0, secondSum = 0, thirdSeen = 0;
    w.onTradeLeg = (o) => {
      legs++;
      const tot = o.units + (o.secondUnits || 0);
      if (tot > o.cap + 1e-9) over++;
      if (tot > maxUnits) maxUnits = tot;
      if (o.second) { twoLegs++; secondSum += o.secondUnits; }
      if (o.third) thirdSeen++;                                     // 있을 수 없는 칸 — 있으면 빨강
    };
    for (let i = 0; i < 6; i++) {
      const v = econ.createVillage({ fertility: 1.2, water: 0.9, stone: (i % 2 ? 2.5 : LV.FLOOR.stone), ore: 0.2,
                                     wood: 1.2, game: 0.7, arable: 1, size: 70, initialPop: 40, name: (i % 2 ? '산촌' : '바닥') + i });
      v._world = w; v.coord = { x: (i % 3) * 120, y: Math.floor(i / 3) * 120 };
      w.villages.push(v);
    }
    w.day = 0;
    let neg = 0;
    for (let d = 0; d < 300; d++) {
      econV2.tickWorldV2(w, d);
      for (const v of w.villages) for (const r in v.storage) if (v.storage[r] < -1e-9) neg++;
    }
    return { legs, twoLegs, over, maxUnits, secondSum, thirdSeen, neg,
             dig: JSON.stringify(w.villages.map((v) => ({ n: v.npcs.length, s: +(v.storage.stone || 0).toFixed(9), f: +(v.storage.food || 0).toFixed(9) }))) };
  };
  const a = mkCargo(false), b = mkCargo(false), c = mkCargo(true);
  ok(a.dig === b.dig, '㉒ ★★끈 두 판이 **비트 동일**(결정론)');
  ok(a.twoLegs === 0 && a.secondSum === 0, '㉒ ★★끄면 둘째가 **한 건도 안 실린다**', `${a.twoLegs}건`);
  ok(a.dig !== c.dig, '㉒ ★켜면 다른 세계다(문이 죽어 있지 않다)');
  pre(a.legs > 0, '이 세계에서 캐러밴이 실제로 출발한다', `${a.legs}건`);
  ok(c.twoLegs > 0, '㉒ ★★★켜면 둘째가 실린다(자명 통과 금지)',
    `${c.twoLegs}건 / ${c.legs}건 · 둘째 합 ${c.secondSum.toFixed(0)} 단위`);
  ok(c.over === 0, '㉒ ★★**용량 초과 0**(첫+둘째 ≤ 100)', `최대 적재 ${c.maxUnits.toFixed(2)}`);
  ok(c.thirdSeen === 0, '㉒ ★셋째 화물 칸이 **아예 없다**');
  ok(a.neg === 0 && c.neg === 0, '㉒ ★★**곳간 음수 0**(두 팔 다)', `끔 ${a.neg} · 켬 ${c.neg}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
// ㉓ [T223] `spareCap` 고정 문 — 계측 손잡이다(세계 무변)
//   T215 자인: 엔진 `spareCap` 은 `N`(인구)의 **곱**이라 leg↔인구 인과가 안 갈린다.
//   문(`world.spareCapFn`)이 닫히면 비트 동일 · 열리면 **주입값이 그대로 상한이 된다** ·
//   표에 없는 칸(`null`)이면 엔진 제 값으로 **되돌아온다**(부분 주입 금지).
{
  const mkSC = (mode) => {
    const w = econV2.createWorldV2({ seed: 606, villageCount: 0, picker: 'rational', infoRange: 5000 });
    w.villages = [];
    const seenCap = [];
    //   ⚠**주입값을 밖에서 지어내지 않는다** — 엔진이 계산한 값(`cur`)을 받아 그 위에서만 정한다.
    if (mode === 'fix1')  w.spareCapFn = (v, day, cur) => { seenCap.push(cur); return 1; };
    if (mode === 'echo')  w.spareCapFn = (v, day, cur) => { seenCap.push(cur); return cur; };
    if (mode === 'null')  w.spareCapFn = (v, day, cur) => { seenCap.push(cur); return null; };
    if (mode === 'junk')  w.spareCapFn = (v, day, cur) => { seenCap.push(cur); return 'NaN아님'; };
    if (mode === 'zero')  w.spareCapFn = (v, day, cur) => { seenCap.push(cur); return 0; };
    let legs = 0;
    w.onTradeLeg = () => { legs++; };
    for (let i = 0; i < 6; i++) {
      const v = econ.createVillage({ fertility: 1.2, water: 0.9, stone: (i % 2 ? 2.5 : LV.FLOOR.stone), ore: 0.2,
                                     wood: 1.2, game: 0.7, arable: 1, size: 70, initialPop: 40, name: (i % 2 ? '산촌' : '바닥') + i });
      v._world = w; v.coord = { x: (i % 3) * 120, y: Math.floor(i / 3) * 120 };
      w.villages.push(v);
    }
    w.day = 0;
    for (let d = 0; d < 300; d++) econV2.tickWorldV2(w, d);
    return { legs, seenCap,
             dig: JSON.stringify(w.villages.map((v) => ({ n: v.npcs.length, s: +(v.storage.stone || 0).toFixed(9), f: +(v.storage.food || 0).toFixed(9) }))) };
  };
  const off = mkSC('off'), off2 = mkSC('off');
  ok(off.dig === off2.dig, '㉓ ★★끈 두 판이 **비트 동일**(결정론)');
  pre(off.legs > 0, '이 세계에서 캐러밴이 실제로 출발한다', `${off.legs}건`);

  const echo = mkSC('echo');
  ok(echo.dig === off.dig, '㉓ ★★★**되돌림** — 엔진 제 값을 그대로 돌려주면 끔과 비트 동일',
    `주입 호출 ${echo.seenCap.length}회`);
  pre(echo.seenCap.length > 0, '문이 실제로 호출된다(자명 통과 금지)', `${echo.seenCap.length}회`);

  const nul = mkSC('null'), junk = mkSC('junk'), zero = mkSC('zero');
  ok(nul.dig === off.dig,  '㉓ ★`null` 이면 엔진 제 값으로 되돌아온다');
  ok(junk.dig === off.dig, '㉓ ★수가 아닌 반환은 **무시**한다(계측기 결함이 세계를 못 흔든다)');
  ok(zero.dig === off.dig, '㉓ ★`<1` 반환도 무시한다(`spareCap` 하한 1 을 문이 못 뚫는다)');

  const fix1 = mkSC('fix1');
  ok(fix1.dig !== off.dig, '㉓ ★켜면 다른 세계다(문이 죽어 있지 않다)');
  ok(fix1.legs < off.legs, '㉓ ★★★주입값이 **그대로 상한**이 된다 — 1 로 묶으면 leg 이 준다',
    `끔 ${off.legs}건 → 고정1 ${fix1.legs}건`);
  ok(off.seenCap.length === 0, '㉓ ★미설치면 문이 **한 번도** 안 불린다');
  ok(Math.max(...echo.seenCap) > 1, '㉓ ★엔진이 실제로 1 보다 큰 `spareCap` 을 내놓는다(고정이 의미 있다)',
    `최대 ${Math.max(...echo.seenCap)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
// ㉔ [T233] 둘째 화물에 첫째와 같은 관문(`world.cargoTwoGate`)
//   T231 §ⓐ: 첫째는 `totalProfit<=0` 관문을 지나고 둘째는 관문이 **아예 없다**(단위의 62~74%가 적자).
//   문이 닫히면 T206/T231 비트 동일 · 열리면 **적자 둘째가 안 실린다** · 흑자 둘째는 그대로.
{
  const mkGate = (two, gate) => {
    const w = econV2.createWorldV2({ seed: 606, villageCount: 0, picker: 'rational', infoRange: 5000 });
    w.villages = [];
    w.cargoTwo = !!two; w.cargoTwoGate = !!gate;   // ★[T299] 명시 주입이 손잡이를 이긴다(기본 켬이라 이 줄이 필요하다)
    let legs = 0, twoLegs = 0, secondSum = 0, negPU = 0, negUnits = 0, blocked = 0, posPU = 0;
    w.onTradeLeg = (o) => {
      legs++;
      blocked += (o.gateBlocked || 0);
      if (o.second && o.secondUnits > 0) {
        twoLegs++; secondSum += o.secondUnits;
        if ((o.p2ProfitPerUnit || 0) <= 0) { negPU++; negUnits += o.secondUnits; } else posPU++;
      }
    };
    for (let i = 0; i < 6; i++) {
      const v = econ.createVillage({ fertility: 1.2, water: 0.9, stone: (i % 2 ? 2.5 : LV.FLOOR.stone), ore: 0.2,
                                     wood: 1.2, game: 0.7, arable: 1, size: 70, initialPop: 40, name: (i % 2 ? '산촌' : '바닥') + i });
      v._world = w; v.coord = { x: (i % 3) * 120, y: Math.floor(i / 3) * 120 };
      w.villages.push(v);
    }
    w.day = 0;
    let neg = 0;
    for (let d = 0; d < 300; d++) {
      econV2.tickWorldV2(w, d);
      for (const v of w.villages) for (const r in v.storage) if (v.storage[r] < -1e-9) neg++;
    }
    return { legs, twoLegs, secondSum, negPU, negUnits, posPU, blocked, neg,
             dig: JSON.stringify(w.villages.map((v) => ({ n: v.npcs.length, s: +(v.storage.stone || 0).toFixed(9), f: +(v.storage.food || 0).toFixed(9) }))) };
  };
  const base = mkGate(false, false), baseG = mkGate(false, true);
  const two = mkGate(true, false), twoG = mkGate(true, true);
  ok(base.dig === baseG.dig, '㉔ ★★둘째가 꺼져 있으면 관문 손잡이는 **아무 일도 안 한다**(비트 동일)');
  ok(two.dig !== twoG.dig, '㉔ ★켜면 다른 세계다(문이 죽어 있지 않다)');
  pre(two.twoLegs > 0, '이 세계에서 둘째가 실제로 실린다', `${two.twoLegs}건`);
  //   ★★자명 통과 금지 — 관문에 **실제로 걸리는** 둘째가 있어야 이 절이 의미가 있다.
  pre(two.negPU > 0, '★관문 없는 팔에 **적자 둘째가 실제로 있다**', `${two.negPU}건 / ${two.twoLegs}건 · ${two.negUnits.toFixed(0)} 단위`);
  ok(twoG.negPU === 0, '㉔ ★★★관문을 켜면 **단위당 적자 둘째가 한 건도 안 실린다**',
    `끔 ${two.negPU}건(${two.negUnits.toFixed(0)} 단위) → 켬 ${twoG.negPU}건`);
  ok(twoG.blocked > 0, '㉔ ★관문이 실제로 후보를 거른다(세어 본다)', `${twoG.blocked}회 · 끔 ${two.blocked}회`);
  ok(two.blocked === 0, '㉔ ★문이 닫혀 있으면 거르지 않는다');
  ok(twoG.posPU > 0, '㉔ ★★흑자 둘째는 **그대로 실린다**(관문이 둘째를 없애 버리는 게 아니다)', `${twoG.posPU}건`);
  ok(twoG.secondSum > 0 && twoG.secondSum < two.secondSum, '㉔ ★적재량은 줄되 0 이 되지는 않는다',
    `${two.secondSum.toFixed(0)} → ${twoG.secondSum.toFixed(0)} 단위`);
  ok(two.neg === 0 && twoG.neg === 0, '㉔ ★★곳간 음수 0(두 팔 다)');
}

// ════════════════════════════════════════════════════════════════════════════════════════
// ㉕ [T239] 둘째 후보를 첫째와 같은 규칙으로(`world.cargoTwoBest` — 수익 최대)
//   T231 §ⓐ 의 마지막 비대칭: 첫째는 `best.profit` 최대로 고르는데 둘째는 `TRADABLE` 선언 순서였다.
//   끔이면 `twogate` 비트 동일 · 켬이면 **수익 최대 후보**가 실린다 · 셋째는 여전히 0.
{
  const mkBest = (gate, bestOn) => {
    const w = econV2.createWorldV2({ seed: 606, villageCount: 0, picker: 'rational', infoRange: 5000 });
    w.villages = []; w.cargoTwo = true;
    w.cargoTwoGate = !!gate; w.cargoTwoBest = !!bestOn;   // ★[T299] 명시 주입(기본 켬이라 `gate` 끔 팔도 손으로 잡는다)
    let twoLegs = 0, diff = 0, worse = 0, third = 0, gain = 0, chosenTot = 0, bestTot = 0;
    w.onTradeLeg = (o) => {
      if (o.third) third++;
      if (!o.second || !(o.secondUnits > 0)) return;
      twoLegs++;
      chosenTot += (o.p2Total || 0); bestTot += (o.p2BestTotal || 0);
      if (o.p2Best && o.p2Best !== o.second) { diff++; gain += (o.p2BestTotal || 0) - (o.p2Total || 0); }
      if ((o.p2Total || 0) > (o.p2BestTotal || 0) + 1e-9) worse++;   // 있을 수 없다 — 최대보다 큰 선택
    };
    for (let i = 0; i < 6; i++) {
      const v = econ.createVillage({ fertility: 1.2, water: 0.9, stone: (i % 2 ? 2.5 : LV.FLOOR.stone), ore: 0.2,
                                     wood: 1.2, game: 0.7, arable: 1, size: 70, initialPop: 40, name: (i % 2 ? '산촌' : '바닥') + i });
      v._world = w; v.coord = { x: (i % 3) * 120, y: Math.floor(i / 3) * 120 };
      w.villages.push(v);
    }
    w.day = 0;
    let neg = 0;
    for (let d = 0; d < 300; d++) {
      econV2.tickWorldV2(w, d);
      for (const v of w.villages) for (const r in v.storage) if (v.storage[r] < -1e-9) neg++;
    }
    return { twoLegs, diff, worse, third, gain, chosenTot, bestTot, neg,
             dig: JSON.stringify(w.villages.map((v) => ({ n: v.npcs.length, s: +(v.storage.stone || 0).toFixed(9), f: +(v.storage.food || 0).toFixed(9) }))) };
  };
  const g = mkBest(true, false), g2 = mkBest(true, false), gb = mkBest(true, true);
  const ng = mkBest(false, false), ngb = mkBest(false, true);
  ok(g.dig === g2.dig, '㉕ ★★끈 두 판이 **비트 동일**(결정론)');
  pre(g.twoLegs > 0, '이 세계에서 둘째가 실린다', `${g.twoLegs}건`);
  //   ★★자명 통과 금지 — 선택이 **실제로 갈리는** leg 이 있어야 이 절이 의미가 있다.
  pre(g.diff > 0, '★끔 팔에서 선언 순서 선택이 수익 최대와 **실제로 갈린다**',
    `${g.diff}건 / ${g.twoLegs}건 · 놓친 이익 ${g.gain.toFixed(0)}`);
  ok(g.worse === 0, '㉕ ★★고른 것이 최대보다 큰 적은 없다(계측 정합)');
  ok(g.dig !== gb.dig, '㉕ ★켜면 다른 세계다(문이 죽어 있지 않다)');
  ok(gb.diff === 0, '㉕ ★★★켜면 **고른 것이 곧 최대**다(갈림 0)', `끔 ${g.diff}건 → 켬 ${gb.diff}건`);
  //   ⚠두 팔은 **다른 세계**라 총액을 가로로 비교하면 안 된다(팔이 갈리면 leg 수부터 달라진다).
  //     같은 팔 안에서 "고른 것 vs 최대였을 것" 을 비교한다 — 그게 놓친 이익이다.
  ok(g.chosenTot < g.bestTot - 1e-6, '㉕ ★★끔 팔은 **돈을 남기고 간다**(고른 것 < 최대였을 것)',
    `${g.chosenTot.toFixed(0)} < ${g.bestTot.toFixed(0)} · 차 ${(g.bestTot - g.chosenTot).toFixed(0)}`);
  ok(Math.abs(gb.chosenTot - gb.bestTot) < 1e-6, '㉕ ★★켬 팔은 **남기지 않는다**(고른 것 = 최대)',
    `${gb.chosenTot.toFixed(0)} = ${gb.bestTot.toFixed(0)}`);
  ok(gb.third === 0 && g.third === 0, '㉕ ★셋째 화물 칸은 **여전히 없다**');
  ok(ng.dig !== ngb.dig, '㉕ ★관문 없이도 선택 문은 동작한다(두 손잡이가 독립)');
  ok(g.neg === 0 && gb.neg === 0, '㉕ ★★곳간 음수 0(두 팔 다)');
}

// ════════════════════════════════════════════════════════════════════════════════════════
// ㉖ [T299 · ★재민 판정 2026-09-19] **기본 끔** — 그리고 켠 판이 끈 판과 어떤 관계인가
//   T299 가 하루 "기본 켬"으로 앉혔고 같은 날 재민이 **끔으로 되돌렸다**(근거: 켠 근거가 넷째 판에서
//   사라졌고 15/15 로 남은 ㉯ 가 밀도 캐논 띠 밖 · 보고/T299 §4·§7). 자리는 남고 값만 뒤집혔다.
//   기본이 두 번 뒤집힌 자리라 이 절은 **값을 잠그지 않고 관계를 잠근다**:
//     ⓐ 아무것도 안 준 판(기본) = 명시로 **끈** 판과 **비트 동일**(= 다섯째 판)
//     ⓑ `L_CARGO_TWO=1 L_CARGO_TWO_GATE=1` = 명시로 켠 `twogate` 와 **비트 동일**
//     ⓒ `L_CARGO_TWO=1` 하나 = 관문 없는 `two` 판(켜는 손잡이가 **독립**이다)
//     ⓓ 명시 주입이 손잡이를 **이긴다**(`true`·`false` 둘 다 · A/B·계측기가 팔을 손으로 잡는다)
//     ⓔ `cargoTwoBest` 는 여전히 **끔**이고, 켠 판에서도 선택이 최대와 갈린다
//   ⚠env 는 자식 프로세스가 아니라 **이 프로세스에서** 넣었다 뺀다 — 손잡이를 **호출 때** 읽기 때문이다.
//     (족보 128 의 거울: 셸에 남은 `L_*` 가 기본을 가린다 ⇒ 각 판 앞뒤로 반드시 지운다.)
console.log('\n㉖ 둘째 화물 기본 끔(T299 정정) — 켠 판 = 끈 판과의 관계');
{
  const KEYS = ['L_CARGO_TWO', 'L_CARGO_TWO_GATE', 'L_CARGO_TWO_BEST'];
  const clean = () => { for (const k of KEYS) delete process.env[k]; };
  const mk = (env, inject) => {
    clean();
    for (const k in (env || {})) process.env[k] = env[k];
    const w = econV2.createWorldV2({ seed: 606, villageCount: 0, picker: 'rational', infoRange: 5000 });
    w.villages = [];
    for (const k in (inject || {})) w[k] = inject[k];
    let twoLegs = 0, blocked = 0, diff = 0, secondSum = 0;
    w.onTradeLeg = (o) => {
      blocked += (o.gateBlocked || 0);
      if (!o.second || !(o.secondUnits > 0)) return;
      twoLegs++; secondSum += o.secondUnits;
      if (o.p2Best && o.p2Best !== o.second) diff++;
    };
    for (let i = 0; i < 6; i++) {
      const v = econ.createVillage({ fertility: 1.2, water: 0.9, stone: (i % 2 ? 2.5 : LV.FLOOR.stone), ore: 0.2,
                                     wood: 1.2, game: 0.7, arable: 1, size: 70, initialPop: 40, name: (i % 2 ? '산촌' : '바닥') + i });
      v._world = w; v.coord = { x: (i % 3) * 120, y: Math.floor(i / 3) * 120 };
      w.villages.push(v);
    }
    w.day = 0;
    let neg = 0;
    for (let d = 0; d < 300; d++) {
      econV2.tickWorldV2(w, d);
      for (const v of w.villages) for (const r in v.storage) if (v.storage[r] < -1e-9) neg++;
    }
    clean();
    return { twoLegs, blocked, diff, secondSum, neg,
             dig: JSON.stringify(w.villages.map((v) => ({ n: v.npcs.length, s: +(v.storage.stone || 0).toFixed(9), f: +(v.storage.food || 0).toFixed(9) }))) };
  };

  clean();
  ok(econV2.cargoTwoOn({}) === false && econV2.cargoTwoGateOn({}) === false,
    '㉖ ★★★엔진 기본이 **끔**이다(★재민 판정 09-19 — T299 가 켰다가 되돌렸다)');
  { process.env.L_CARGO_TWO = '1'; process.env.L_CARGO_TWO_GATE = '1';
    ok(econV2.cargoTwoOn({}) === true && econV2.cargoTwoGateOn({}) === true,
      '㉖ ★★켜는 것은 **명시 `1`** 하나다(손잡이가 죽어 있지 않다)'); clean(); }
  ok(econV2.cargoTwoOn({ cargoTwo: true }) === true && econV2.cargoTwoOn({ cargoTwo: false }) === false,
    '㉖ ★★주입은 `true`·`false` **둘 다** 존중한다(`undefined` 검사지 진리값 검사가 아니다)');
  { process.env.L_CARGO_TWO = '1';
    ok(econV2.cargoTwoOn({ cargoTwo: false }) === false, '㉖ ★★주입이 손잡이보다 **세다**'); clean(); }

  const dflt   = mk(null, null);                                              // 아무것도 안 준 판 = 끔
  const dflt2  = mk(null, null);
  const offInj = mk(null, { cargoTwo: false, cargoTwoGate: false });          // 주입으로 끈 판
  const onEnv  = mk({ L_CARGO_TWO: '1', L_CARGO_TWO_GATE: '1' }, null);       // 손잡이로 켠 twogate
  const onInj  = mk(null, { cargoTwo: true, cargoTwoGate: true });            // 주입으로 켠 twogate
  const twoEnv = mk({ L_CARGO_TWO: '1' }, null);                              // 관문 없이 켠 two
  const twoInj = mk(null, { cargoTwo: true, cargoTwoGate: false });

  ok(dflt.dig === dflt2.dig, '㉖ ★★기본 두 판이 **비트 동일**(결정론)');
  ok(dflt.dig === offInj.dig, '㉖ ★★★**기본 = 끈 판** — 아무것도 안 준 판이 명시로 끈 판과 비트 동일(= 다섯째 판)');
  ok(dflt.twoLegs === 0 && dflt.blocked === 0 && dflt.secondSum === 0,
    '㉖ ★★기본 판은 둘째가 **한 건도** 안 실린다(관문도 0회)');
  pre(onEnv.twoLegs > 0, '켠 판에서 둘째가 실제로 실린다(자명 통과 금지)', `${onEnv.twoLegs}건 · ${onEnv.secondSum.toFixed(0)} 단위`);
  ok(onEnv.dig === onInj.dig, '㉖ ★★**켜는 두 길이 같다** — 손잡이 `1` 과 `true` 주입이 같은 세계');
  ok(onEnv.dig !== dflt.dig, '㉖ ★★끈 판과 켠 판은 **다른 세계**다(문이 죽어 있지 않다 · 자명 통과 금지)');
  ok(twoEnv.dig === twoInj.dig, '㉖ ★★`L_CARGO_TWO=1` 하나면 **관문 없는 `two`** 다(두 손잡이가 독립)');
  ok(twoEnv.dig !== onEnv.dig, '㉖ ★관문이 실제로 세계를 가른다(`two` ≠ `twogate`)');
  ok(onEnv.blocked > 0 && twoEnv.blocked === 0, '㉖ ★켠 판에서 관문이 실제로 후보를 거른다',
    `twogate ${onEnv.blocked}회 · two ${twoEnv.blocked}회`);
  //   ★★[T265 정정] `twobest` 는 `twogate` 와 못 가름이라 **안 켠다** — 켠 판에서도 선택이 갈려야 한다.
  ok(onEnv.diff > 0, '㉖ ★★★`cargoTwoBest` 는 **안 켜졌다** — 켠 판의 선택이 최대와 여전히 갈린다',
    `갈림 ${onEnv.diff}건 / ${onEnv.twoLegs}건`);
  ok(dflt.neg === 0 && onEnv.neg === 0, '㉖ ★★곳간 음수 0(기본·켠 판 둘 다)');
  //   ★자명 통과 금지 — 기본이 **정말** 끈 판인지: 기본에 둘째가 하나라도 있으면 위 비교가 거짓말이다
  pre(onEnv.secondSum > 0 && dflt.secondSum === 0, '★켠 판은 싣고 기본은 안 싣는다',
    `켬 ${onEnv.secondSum.toFixed(0)} 단위 → 기본 ${dflt.secondSum.toFixed(0)} 단위`);
}

console.log(`\n=== T299 둘째 화물 기본 끔(정정) 포함: 통과 ${pass} · 실패 ${fail} ===`);
console.log('접점 심볼: cargoTwoOn|cargoTwoGateOn|L_CARGO_TWO|L_CARGO_TWO_GATE|L_CARGO_TWO_BEST|_legProfitPerUnit|candidates|cand.res|surplus|best.profit|TRADABLE|N_units|CARGO_PER_TRIP|onTradeLeg|_gateBlocked|cargoTwoGate|cargoTwoBest');
process.exit(fail ? 1 : 0);
