#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-forage-act.js — 채집 행위 이식 (T347) ====================================
//
// ★왜 [설계/설계_생산_실체.md §1 · 재민 09-22 · 지시 T347]
//   *"따는 순간 열매가 손에 든다."* 이 하네스가 지키는 것은 그 문장 여섯 조각이다:
//     ⓐ 관측자 무관 — 같은 씨면 **청크가 켜졌든 꺼졌든 같은 군락**이 거기 있다(색인 = 청크 · T301)
//     ⓑ 낙하       — 죽은 채집꾼 손의 열매는 **플레이어 낙하 함수 그 자리**로 간다(경로 0)
//     ⓒ 이중 0     — 켠 마을에서 걷는 품목의 `addProduce` 호출이 **0**(공존 = 이중 생산 · T135 규약)
//     ⓓ 장부 = 손  — 곳간에 든 합 = 손에서 넣은 합(넣으면 그 품목 손을 비운다)
//     ⓔ 유한·재생  — 군락 개체 수 = **초기 − 딴 것 + 재생**(T146 로지스틱 · T341 과 같은 몸통)
//     ⓕ 등가       — 30일 창에서 실체가 내는 합이 수식의 그 몫과 만난다(T252 자 · 첫날이 아니다)
//   그리고 **끄면 비트 동일**(손잡이 규약)을 일곱째로 지킨다.
//
// ★★이 카드의 고유한 어려움 — **실체와 수식이 서로 다른 품목을 말한다.**
//   그래서 여기엔 나무 카드에 없던 절이 하나 더 있다: ⓖ **걷는 목록이 유도값인가**
//   (실체가 대는 품목 ∩ 수식 믹스 — 하네스가 목록을 옮겨 적지 않고 정본에서 다시 계산해 대조한다).
//
// ⚠존을 부팅하지 않는다 — 존 소스는 **글자로** 읽고(정적), 셀 색인·엔진은 **불러서** 잰다(기능).
//   그 갈래는 `test-fish-act.js`·`test-wood-act.js` 가 이미 쓴 문법이다(사본 0 · 새 자 0).
//
// 실행: node scripts/test-forage-act.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
const probe = (env, js) => JSON.parse(execFileSync(process.execPath, ['-e', js],
  { env: Object.assign({}, process.env, env), stdio: 'pipe' }).toString());
const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'));

console.log('\n=== 채집 행위 이식 (T347) ===');

// ── ① 손잡이 — 기본 끔 · 끄면 문이 하나도 안 열린다 ─────────────────────────────
console.log('\n① 손잡이 — 기본 끔');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(E.T347_FORAGE_ACT === false, '① ★★`T347_FORAGE_ACT` 가 **기본 끔**이다(켜기는 재민 — 카드가 값을 안 정한다)');
  ok(typeof E.forageActOn === 'function' && typeof E.forageToGranary === 'function'
    && typeof E.forageActItemsOf === 'function' && typeof E.forageRegrowR === 'function',
    '① 문 넷을 정본이 내준다(게이트 · 곳간 입구 · 걷는 목록 · 재생 r)');
  ok(E.forageActOn({ _t347Cells: 9 }) === false, '① ★끄면 군락이 있어도 게이트가 **안 열린다**');
  ok(E.forageToGranary({ storage: {} }, 'fruit', 5) === 0, '① ★끄면 곳간 입구가 **0** 을 낸다(회계가 안 돈다)');
  const on = probe({ T347_FORAGE_ACT: '1' }, `const E=require(${EP});
    console.log(JSON.stringify({ h: E.T347_FORAGE_ACT, g0: E.forageActOn({_t347Cells:0}), g1: E.forageActOn({_t347Cells:7}),
      inj0: E.forageActItemsOf({_t347Cells:7}), inj1: E.forageActItemsOf({_t347Cells:7,_world:{forageActItems:['twig','herb']}}) }))`);
  ok(on.h === true && on.g0 === false && on.g1 === true,
    '① ★켜면 게이트가 **군락 있는 마을에서만** 열린다(손잡이 ∧ 군락 셀 — 둘 다여야 한다)');
  ok(on.inj0 === null && Array.isArray(on.inj1),
    '① ★★켜도 **주입이 없으면 걷는 목록이 없다**(폴백이 곧 종전 = 비트 동일 · `forageRealItems` 선례)');
}

// ── ② 정본 — 사본 0 ────────────────────────────────────────────────────────────
console.log('\n② 사본 0 — 몸통은 하나, 표는 남의 것');
{
  const C = codeOf(SRC), VC = codeOf(VSRC), ZC = codeOf(ZSRC);
  ok(/function actToGranary\(v, item, units, todayKey, countKey\)/.test(C)
    && /const got = actToGranary\(v, item, actDemandCap\([\s\S]*?'_t347InflowToday', '_t347PickN'\);/.test(C),
    '② ★★곳간 입구가 어부·나무꾼과 **같은 몸통**이다(`actToGranary` — 새 회계 0 · 같은 세금)');
  ok(/return actToGranary\(v, 'fish', actDemandCap\(/.test(C) && /return actToGranary\(v, 'wood', actDemandCap\(/.test(C),
    '② ★★[T374] 셋 다 곳간 입구에서 **같은 수요 문**을 지난다(`actDemandCap` — 사본 0)');
  ok(/const _t347In = T347_FORAGE_ACT \? \(v\._t347InflowToday \|\| 0\) : 0;/.test(C)
    && /v\._t347InflowToday = 0;/.test(C),
    '② ★★[T374 · T347 의 빚] 채집 오늘치가 **장부에 오르고 리셋된다**(어부·나무꾼과 같은 자리·같은 꼴)');
  ok(/function _actRegrowR\(day, K, meanUnitsPerEntity\)/.test(C)
    && /return _actRegrowR\(day, K, meanUnitsPerTree\);/.test(C)
    && /return _actRegrowR\(day, K, meanUnitsPerGrove\);/.test(C),
    '② ★★재생 `r` 유도가 **한 몸통**이다 — 나무·채집이 분자만 갈린다(`_woodOutLast` / `_forageOutLast`)');
  ok(/function actRegrowPerDay\(N, K, r\)/.test(C)
    && /function woodRegrowPerDay\(N, K, r\) \{ return actRegrowPerDay\(N, K, r\); \}/.test(C)
    && /function forageRegrowPerDay\(N, K, r\) \{ return actRegrowPerDay\(N, K, r\); \}/.test(C),
    '② ★로지스틱도 한 몸통이고 이름만 갈렸다(래퍼 · 식은 한 벌)');
  ok(/function _actEntitiesAtCell\(cellX, cellY, types, raw\)/.test(ZC)
    && /return _actEntitiesAtCell\(cellX, cellY, _T325_TYPES, raw\);/.test(ZC)
    && /return _actEntitiesAtCell\(cellX, cellY, _t347Types\(\), raw\);/.test(ZC),   // ★[T462] 종 집합 = 정본 `forageKinds` 의 조회 표
    '② ★★색인 규칙(T301 활성 청크 우선 · 없으면 수확 장부·게임일)이 **한 벌**이다 — 종 집합만 갈린다');
  ok(/function _actTakeAtCell\(cellX, cellY, find, ctx\)/.test(ZC),
    '② ★빼는 규칙도 한 벌이다(활성 개체면 개체를, 꺼져 있으면 장부만)');
  ok(!/const FORAGE_ITEMS\s*=|const T347_ITEMS\s*=/.test(C) && !/const T347_ITEMS\s*=\s*\[/.test(VC),
    '② ★★품목 표를 **어디에도 새로 안 적었다**(걷는 목록은 유도값이다 — ⓖ 가 잰다)');
  // ★반경은 **유도값**이다 — 정본 셋(걸음 속도 · 도보 15초 · 셀)에서 다시 계산해 대조한다
  const F = require(path.join(ROOT, 'server', 'forage.js'));
  const rBody = VC.match(/function _t347R\(\)[\s\S]*?\n\}/)[0];
  ok(/Math\.ceil\(sp \* sec \/ cell\)/.test(rBody) && !/\b(30|960|512|16)\b/.test(rBody),
    '② ★★군락 반경이 **유도값**이다(`⌈걸음속도 × 도보초 ÷ 셀⌉`) — 30 도 960 도 안 적었다');
  ok(F.CFG.WALK_SEC === 15 && Math.ceil(64 * F.CFG.WALK_SEC / F.CFG.CELL_PX) === 30,
    '② ★그 유도가 채집 감사 기준 그 수다(`forage.js CFG.WALK_SEC` · 64×15÷32 = 30셀 = 960px)',
    `${64 * F.CFG.WALK_SEC}px`);
  ok(/String\(F\.CFG\.WALK_SEC\)/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'audit-village-forage.js'), 'utf8')),
    '② ★★감사 스크립트도 **같은 정본**을 읽는다(15 가 두 벌이면 "감사는 통과인데 채집꾼은 못 간다"가 된다)');
}

// ── ③ ⓒ 이중 0 — 켠 마을에서 걷는 품목의 `addProduce` 호출 0 ────────────────────
console.log('\n③ ⓒ 이중 0 — 걷는 품목은 `addProduce` 를 안 탄다');
{
  const C = codeOf(SRC);
  ok(/if \(_actSet && _actSet\.indexOf\(r\) >= 0\) continue;/.test(C),
    '③ ★★믹스 루프에 게이트 한 줄이 있다 — 걷는 품목은 거기서 끝난다');
  const blk = C.slice(C.indexOf('const _actSet = forageActItemsOf(v);'));
  const after = blk.slice(0, blk.indexOf('workNPC(npc);'));
  ok(!/_actSet[\s\S]*?addProduce\(/.test(after.split('continue;')[1] || ''),
    '③ ★★그 `continue` 뒤에 **대체 호출이 없다** — 대체는 생활층(걷기 → 손 → 곳간)이 한다(있으면 그게 이중 생산이다)');
  // 기능 — 켠 판에서 믹스 게이트가 실제로 그 품목을 뺀다
  const r = probe({ T347_FORAGE_ACT: '1' }, `const E=require(${EP});
    const v={ _t347Cells:5, _world:{ forageActItems:['twig','herb'] }, land:{fertility:1,wood:1,stone:1} };
    console.log(JSON.stringify({ set: E.forageActItemsOf(v), mix: Object.keys(E.foragerYieldsFor(v)) }))`);
  ok(Array.isArray(r.set) && r.set.length === 2 && r.set.every((k) => r.mix.includes(k)),
    '③ ★걷는 목록은 **믹스 안의 품목**이다(믹스 밖 품목을 걷는 일이 없다)', r.set.join('·'));
}

// ── ④ ⓓ 장부 = 손 ────────────────────────────────────────────────────────────
console.log('\n④ ⓓ 장부 = 손 — 넣으면 그 품목 손을 비운다');
{
  const VC = codeOf(VSRC);
  const d = VC.match(/function _t347Deliver\(vil, npc\)[\s\S]*?\n\}/)[0];
  //   ★[T458] 손의 이름(`h` — 덤불 `berry`)과 곳간의 이름(`k` — econ `fruit`)이 갈린다(같은 물건 · `_t347HandsOf`). 뜻은 그대로다.
  ok(/for \(const k of keep\) for \(const h of _t347HandsOf\(k\)\)/.test(d) && /npc\.inventory\[h\] = 0;/.test(d),
    '④ ★★걷는 목록의 품목만 넣고, 넣은 품목은 **그때 비운다**(이중 0)');
  ok(/const u = npc\.inventory\[h\] \|\| 0;/.test(d) && /forageToGranary\(vil\.econ, k, u\)/.test(d),
    '④ ★★넣는 양이 **손에 든 그 수**다 — 군락 전리품의 낱개가 그대로 econ 단위다(환산식 0)');
  ok(!/npc\.inventory\.fiber|npc\.inventory\.seed_/.test(d),
    '④ ★`fiber`·씨앗은 **안 건드린다** — econ 재화가 아니다(손에 남는다 · 보고 §회부)');
  // 짐당 개체 — 정본에서 다시 계산해 대조(하네스에 수 0)
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const CC = require(path.join(ROOT, 'server', 'carry.js'));
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  ok(typeof V._t347PerLoad === 'function' && typeof V._t347ActItems === 'function',
    '④ 걷는 목록·짐당 개체를 정본이 내준다(하네스가 유도를 옮겨 적지 않는다)');
  ok(V._t347PerLoad(0) === 1, '④ ★낱개가 0 이면 짐당 **1**(0 개가 되지 않는다 — 나무와 같은 규약)');
  ok(typeof W.kgOfOrDefault === 'function' && W.kgOfOrDefault('walnut') === W.DEFAULT_KG,
    '④ ⚠`walnut` 은 `weights.js` 에 무게가 **없다** — `kgOfOrDefault` 그물로 받는다(값은 안 짓는다 · 회부)',
    `${W.kgOf('walnut')} → ${W.DEFAULT_KG}`);
  ok(CC.CFG.CAP_KG > 0, '④ 짐 상한은 `carry.js` 정본이다', String(CC.CFG.CAP_KG));
}

// ── ⑤ ⓑ 낙하 — 플레이어 함수 그 자리 ──────────────────────────────────────────
console.log('\n⑤ ⓑ 낙하 — 죽은 채집꾼 손의 열매는 그 자리에 떨어진다');
{
  const ZC = codeOf(ZSRC);
  ok(/function _deathDrop\(p\)/.test(ZC), '⑤ 낙하 정본이 존에 있다(플레이어와 같은 함수)');
  ok(!/_t347Drop|forageDrop/.test(ZC),
    '⑤ ★★채집 전용 낙하 함수를 **안 만들었다** — 손이 `inventory` 니 플레이어 낙하가 그대로 집는다(경로 0)');
  const VC = codeOf(VSRC);
  ok(!/inventory\[k\] = 0[\s\S]{0,80}_deathDrop/.test(VC),
    '⑤ 생활층이 낙하를 흉내내지 않는다(죽음은 존의 일)');
}

// ── ⑥ ⓐ 관측자 무관 · ⓔ 유한 — 색인이 청크와 같은 답을 낸다 ──────────────────────
console.log('\n⑥ ⓐ 관측자 무관 · ⓔ 딴 개체는 없어지고 딴 날이 남는다');
{
  const ZC = codeOf(ZSRC);
  //   ★[T440] 색인은 청크 한 판(`_idxAtCell` → `_ringBuild`)으로 묻는다 — 판을 낳는 인자에 장부·날이 들고, 원시 판엔 안 든다
  ok(/_idxAtCell\(cellX \| 0, cellY \| 0, !!raw, raw \? undefined : gameDayNow\(\)\)/.test(ZC) && /_ringBuild\(qx, qy, harvestedSeeds, day\)/.test(ZC),
    '⑥ ★색인에 **수확 장부와 게임일**을 넘긴다 — 청크가 꺼져 있어도 같은 답(T301 규칙 표 · ★[T440] 청크 판이 그 둘로 낳는다)');
  ok(/_ringBuild\(qx, qy, undefined, undefined\)/.test(ZC),
    '⑥ ★★`raw` 는 장부를 **안 넘긴다** — *"교란 전 그 셀에 무엇이 있었나"*(로지스틱 `K` · ★[T440] 원시 판은 장부·날 없이 낳는다)');
  //   ★[T462] 종 집합은 **정본 하나**(`chunk.js forageKinds`)다 — 종전엔 존·생활층 두 글자를 여기서 맞대 봤다(사본 둘).
  //     이제 두 자리 다 그 함수를 읽고 글자는 정본 한 곳(`FORAGE_RING`)에만 있다. 끔이면 그 둘 그대로(비트 동일).
  const CC6 = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8'));
  ok(/const FORAGE_RING = Object\.freeze\(\['berry_bush', 'herb'\]\);/.test(CC6) && /function forageKinds\(\) \{\s*if \(!WILD\.ON\(\)\) return FORAGE_RING;/.test(CC6),
    '⑥ ★★[T462] 군락 종 집합의 정본이 **하나**다 — `chunk.js forageKinds`(끔 = 덤불·풀 그 둘 · 켬이면 야생 군락 종이 든다)');
  const VC = codeOf(VSRC);
  ok(!/berry_bush: 1, herb: 1/.test(ZC) && /const \{ forageKinds: _forageKinds \} = require\('\.\/chunk'\);/.test(ZC) && /const a = _forageKinds\(\);/.test(ZC)
    && !/forager: \['berry_bush', 'herb'\]/.test(VC) && /get forager\(\) \{[^}]*C\.forageKinds\(\)/.test(VC),
    '⑥ ★★존 `_T347_TYPES` 와 생활층 `JOB_RES.forager` 가 **그 함수를 읽는다** — 글자 사본 0(종전 두 벌)');
  const CH6 = require(path.join(ROOT, 'server', 'chunk.js'));
  const _w6 = process.env.T450_WILD_GROVES; delete process.env.T450_WILD_GROVES;
  const off6 = CH6.forageKinds();
  if (_w6 != null) process.env.T450_WILD_GROVES = _w6;
  ok(off6 === CH6.FORAGE_RING && off6.join('|') === 'berry_bush|herb',
    '⑥ ★끔 — 그 집합이 **종전 두 글자 그대로**다(덤불·풀 · 같은 차례)', off6.join('·'));
  // 기능 — 색인이 실제로 군락을 찾고, 딴 뒤 하나 줄고, 장부에 남는다
  const chunk = require(path.join(ROOT, 'server', 'chunk.js'));
  const terr = require(path.join(ROOT, 'server', 'terrain.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
  if (terr.setZonesMeta) terr.setZonesMeta(ZONES);
  const ZID = 'hanbando';
  const gv = ((terr.ZONE_TERRAIN && terr.ZONE_TERRAIN[ZID] && terr.ZONE_TERRAIN[ZID].groves) || []);
  ok(gv.length > 0, '⑥ [상황] 지형이 군락 데이터를 갖고 있다(`groves`)', `${gv.length}개`);
  let hit = null;
  for (const g of gv.slice(0, 40)) {
    if (!g || !g.center) continue;
    const cx = Math.floor(g.center[0] / 32), cy = Math.floor(g.center[1] / 32);
    for (let dy = -4; dy <= 4 && !hit; dy++) for (let dx = -4; dx <= 4 && !hit; dx++) {
      let a = [];
      try { a = chunk.resourcesAtCell(ZID, cx + dx, cy + dy, { biome: ZONES[ZID].biome, chunkSize: 512 }) || []; } catch (e) { a = []; }
      const e0 = a.find((r) => r.type === 'berry_bush' || r.type === 'herb');
      if (e0) hit = { cx: cx + dx, cy: cy + dy, e: e0, n: a.filter((r) => r.type === 'berry_bush' || r.type === 'herb').length };
    }
    if (hit) break;
  }
  ok(!!hit, '⑥ [상황] 색인이 군락 개체 하나를 찾았다', hit ? `${hit.cx},${hit.cy} · ${hit.e.seedKey} · ${hit.e.type}` : '못 찾았다');
  if (hit) {
    const opt = { biome: ZONES[ZID].biome, chunkSize: 512 };
    const hs = new Set([hit.e.seedKey]);
    const after = (chunk.resourcesAtCell(ZID, hit.cx, hit.cy, Object.assign({ harvestedSet: hs, gameDay: 10 }, opt)) || [])
      .filter((r) => r.type === 'berry_bush' || r.type === 'herb').length;
    ok(after === hit.n - 1, '⑥ ★★ⓔ 딴 개체는 **세계에서 없어진다**(장부를 넘기면 색인이 하나 덜 낸다)', `${hit.n} → ${after}`);
    const back = (chunk.resourcesAtCell(ZID, hit.cx, hit.cy, opt) || [])
      .filter((r) => r.type === 'berry_bush' || r.type === 'herb').length;
    ok(back === hit.n, '⑥ ★★ⓔ 장부에서 지우면 **같은 자리에 다시 선다**(T341 `t341Unharvest` 가 그 문)', `${back}개`);
    const a1 = JSON.stringify((chunk.resourcesAtCell(ZID, hit.cx, hit.cy, opt) || []).map((r) => r.seedKey));
    const a2 = JSON.stringify((chunk.resourcesAtCell(ZID, hit.cx, hit.cy, opt) || []).map((r) => r.seedKey));
    ok(a1 === a2, '⑥ ★★ⓐ 같은 씨면 **같은 답**이다(관측자와 무관 · 결정론 · 주사위 0)');
  }
}

// ── ⑦ 주사위 0 — 야생 채종이 자리로 정해진다 ────────────────────────────────────
console.log('\n⑦ 주사위 0 — 덤불 씨앗이 뽑기가 아니다 (T347 결함 수정)');
{
  const ZC = codeOf(ZSRC);
  const loot = ZC.match(/function lootOfResource\(r, ctx\)[\s\S]*?\n\}/)[0];
  //   ★잰 범위는 **채집꾼이 닿는 갈래**다(`JOB_RES.forager` = 덤불·풀). 표 전체가 아니다 —
  //     `meteorite` 에 아직 `Math.random` 이 하나 남아 있고(운철 낱개), 그건 **광부 카드(#43·#47)의 것**이다.
  //     여기서 고치면 플레이어 채광 산출이 같이 바뀐다 ⇒ 보고 §회부로 올린다(범위 밖을 몰래 건드리지 않는다).
  const bushBlk = loot.slice(loot.indexOf("t === 'berry_bush'"), loot.indexOf("t === 'ore'"));
  ok(!/Math\.random\(\)/.test(bushBlk),
    '⑦ ★★★채집꾼이 닿는 갈래(덤불·풀)에 **`Math.random` 이 하나도 없다**(캐논 "같은 씨로 같은 결과" · 설계 §3)');
  ok(!/Math\.random/.test(loot),
    '⑦ 표에 남은 주사위 0 — 운철 낱개도 T350 이 씨 흐름으로 바꿨다(PM 착지 09-22 · 종전 "운철 하나 남음" 단정을 뒤집음)');
  ok(/_gidHash\(`seedberry:\$\{Math\.round\(r\.x\)\}:\$\{Math\.round\(r\.y\)\}`\)/.test(ZC),
    '⑦ ★그 자리를 **자리 해시**가 정한다(`_gidHash` — T124 도토리가 쓴 정본 · 사본 0)');
  ok(/< 0\.3\) l\.seed_berry = 1;/.test(ZC),
    '⑦ ★비율 `0.3` 은 **종전 그 수 그대로**다(새 수 0) · 품목도 `seed_berry` 그대로(NPC 밭 게이트 보존)');
  ok(/{ day: zoneGameDay\(\) }/.test(ZC),
    '⑦ ★행위 갈래는 `{ day }` 를 넘긴다 — 계절 채종이 `Crops.wildSeedAt` 정본을 지난다');
  // 자명 통과 금지 — 표에 랜덤을 되살린 판을 만들면 문다
  const mut = bushBlk.replace('l.seed_berry = 1;', 'if (Math.random() < 1) l.seed_berry = 1;');
  ok(/Math\.random\(\)/.test(mut), '⑦ [자명 통과 금지] 덤불 갈래에 랜덤을 되살린 판을 만들면 이 검사가 **문다**');
}

// ── ⑧ 끄면 비트 동일 — 새 줄이 전부 손잡이 뒤 ─────────────────────────────────
console.log('\n⑧ 끄면 비트 동일 — 새 줄이 전부 손잡이 뒤에 있다');
{
  const C = codeOf(SRC), VC = codeOf(VSRC);
  ok(/function forageToGranary\(v, item, units\) \{\n\s*if \(!T347_FORAGE_ACT/.test(C),
    '⑧ ★곳간 입구 첫 줄이 손잡이다');
  ok(/function forageActOn\(v\) \{ return !!\(T347_FORAGE_ACT &&/.test(C),
    '⑧ ★게이트 첫 항이 손잡이다');
  ok(/if \(vil\.econ && _lifeEcon\(\)\.T347_FORAGE_ACT\) \{/.test(VC),
    '⑧ ★생활층 하루 경계 절이 **손잡이 뒤**에 있다');
  ok(/if \(!forageActOn\(v\)\) return null;\n|if \(!forageActOn\(v\)\) return null;/.test(C) || /if \(!forageActOn\(v\)\) return null;/.test(C),
    '⑧ ★걷는 목록도 게이트 뒤다(끈 판에서 `null`)');
  ok(/const _needK = \(vil\._t347K == null\) && _lifeEcon\(\)\.T347_FORAGE_ACT/.test(VC),
    '⑧ ★군락 스캔의 `K` 도 손잡이 뒤다 — 끈 판은 셀 스캔을 **한 번도 안 한다**');
  ok(/function foragePerf\(\) \{\n\s*if \(!_lifeEcon\(\)\.T347_FORAGE_ACT\) return null;/.test(VC),
    '⑧ ★`/perf` 채집 절도 끈 판에서 `null`');
}

// ── ⑨ 안 만진 것 — T345(이동 루프)·T346·T329 · 어부·나무꾼 값 ─────────────────────
console.log('\n⑨ 안 만진 것 — T345 이동 루프 · 어부·나무꾼');
{
  const VC = codeOf(VSRC), ZC = codeOf(ZSRC);
  //   ★걷기 술어는 **`server/zone.js`** 에 산다(생활층이 아니다) — 거기 T347 항이 없어야 한다.
  const walk = (ZC.match(/function _t316WalkAlways\(npc\)[\s\S]*?\n\}/) || [''])[0];
  ok(walk.length > 0 && /T312_FISH_ACT/.test(walk) && !/T347_FORAGE_ACT|T325_WOOD_ACT/.test(walk),
    '⑨ ★★걷기 술어(`_t316WalkAlways`)에 **T347 항을 안 넣었다** — T324·T345 몫이다(회부 그대로 · 항은 T312 · ★T368 농부 둘)');
  ok(/function _t312Take\(vil, day, key, want\)/.test(VC) && /fishBudgetPerCell/.test(VC),
    '⑨ 어부 예산 몸통이 그대로 있다(T312 무변)');
  ok(/function _t341TripsPerDay\(vil, distPx, unitsPerTree\)/.test(VC),
    '⑨ ★나무꾼의 걸음 유도를 **그대로 쓴다**(사본 0 · 채집이 같은 함수를 부른다)');
  ok(/const _trips = _t341TripsPerDay\(vil, Math\.sqrt\(_bd\), _w\);/.test(VC.match(/T347_FORAGE_ACT\) \{[\s\S]*?\n  \}/)[0]),
    '⑨ ★★채집 하루 한도가 **그 함수**에서 나온다(걸음·낮 길이·짐 — 새 수 0)');
  ok(!/_t329|T346_/.test(VC.match(/T347_FORAGE_ACT\) \{[\s\S]*?\n  \}/)[0]),
    '⑨ 그 절이 T329·T346 을 안 건드린다');
}

// ── ⑩ ⓖ 걷는 목록이 유도값인가 — 하네스가 목록을 다시 계산해 대조한다 ─────────────
console.log('\n⑩ ⓖ 걷는 목록 — 실체가 대는 품목 ∩ 수식 믹스 (하네스에 표 0)');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const mix = Object.keys(E.foragerYieldsFor({ land: { fertility: 1, wood: 1, stone: 1 } }));
  ok(mix.length === 10, '⑩ [상황] 채집 믹스 품목 수', `${mix.length}종 · ${mix.join('·')}`);
  // 실체가 대는 품목 — 존 전리품 표에서 **읽어서** 센다(옮겨 적지 않는다)
  const ZC = codeOf(ZSRC);
  // ★[T372] 덤불 `berry` 의 양이 **이름을 갖게 됐다**(`BUSH_BERRY_N`) — 군락 종 넷의 전리품 양이
  //   그 한 칸을 읽기 때문이다(두 자리가 갈릴 수 없게). 그래서 이 자는 **이름을 지나 수를 읽는다**:
  //   수를 여기 옮겨 적지 않는다는 이 절의 뜻은 그대로다.
  const bushN = (ZC.match(/const BUSH_BERRY_N = (\d+);/) || [])[1];
  const bush = (ZC.match(/const l = \{ berry: BUSH_BERRY_N, fiber: 1, twig: 1 \};/) || [])[0];
  ok(!!bush && bushN === '2', '⑩ [상황] 덤불 전리품이 존 정본에 있다(`berry 2 · fiber 1 · twig 1`)',
     `BUSH_BERRY_N=${bushN}`);
  ok(/const gk = GROVE_KINDS\[t\];[\s\S]{0,120}\[gk\.item\]: BUSH_BERRY_N/.test(ZC),
     '⑩ ★[T372] 군락 종 넷은 그 **같은 칸**을 읽는다(양을 옮겨 적지 않았다)');
  ok(/if \(t === 'herb'\)\s*return \{ herb: 2 \};/.test(ZC), '⑩ [상황] 풀 전리품도 있다(`herb 2`)');
  const ent = ['berry', 'fiber', 'twig', 'herb'];
  //   ★[T458 · ★PM "실물이 정본"] 교집합은 **이름이 아니라 물건**이다 — 손 이름을 대응 정본(`PV_DEPOSIT_MAP`)으로 옮기되
  //     열량 정본(`kcal.js` kg당)이 같을 때만(같은 물건). 이름 교집합(T347)은 `twig`·`herb` 둘이었다.
  const M = V.playerVillageDepositMap();
  const KC = require(path.join(ROOT, 'server', 'kcal.js'));
  const same = (n) => { const m = M[n]; if (!m || m === n) return n; const a = KC.kcalPerKg(n), b = KC.kcalPerKg(m); return (a > 0 && a === b) ? m : n; };
  const byName = mix.filter((k) => ent.includes(k)).sort();
  const want = mix.filter((k) => ent.some((n) => same(n) === k)).sort();
  ok(want.join('|') === 'fruit|herb|twig' && byName.join('|') === 'herb|twig', '⑩ ★★교집합(물건)이 **`fruit`·`twig`·`herb` 셋**이다 — 이름으로만 잡으면 `twig`·`herb` 둘(T347 · T458 전)', `물건 ${want.join('·')} · 이름 ${byName.join('·')}`);
  ok(!ent.some((k) => k === 'berry' && mix.includes('berry')),
    '⑩ ★`berry` 는 믹스에 **없다** — econ 은 그것을 `fruit` 이라 부른다(★T458: 같은 물건 한 줄로 걷는다 · 새 이름 0)');
  ok(M.berry === 'fruit', '⑩ ★그 동의어가 **이미 정본에 있다**(`PV_DEPOSIT_MAP` 첫 줄 — T302/T328 문법)', `berry → ${M.berry}`);
  ok(M.fiber === undefined, '⑩ ★`fiber` 는 econ 재화가 **아니다**(그 표에도 없다 — 걷을 것이 없다)');
  // 정본이 내는 목록과 위 유도가 같은가
  const got = V._t347ActItems();
  ok(got === null || JSON.stringify(got.slice().sort()) === JSON.stringify(want),
    '⑩ ★★정본이 내는 목록 = 위에서 다시 계산한 교집합(끈 판·deps 없으면 `null`)', got === null ? 'null(끈 판)' : got.join('·'));
}

// ── ⑪ ⓔ 재생 — 로지스틱이 채집에도 그대로 선다 ──────────────────────────────────
console.log('\n⑪ ⓔ 재생 — `r = 4h/K` 가 채집에도 선다');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const K = 190, w = 2, F = 16.0136, h = F / w;
  const r = E.forageRegrowR({ _forageOutLast: F }, K, w);
  ok(Math.abs(E.forageRegrowPerDay(K / 2, K, r) - h) < 1e-9,
    '⑪ ★★★N=K/2 에서 재생 = **수식 하루 합 그 자체**(MSY 역산이 선다)',
    `${E.forageRegrowPerDay(K / 2, K, r).toFixed(6)} = ${h.toFixed(6)}`);
  ok(E.forageRegrowPerDay(K, K, r) === 0, '⑪ ★군락이 가득이면 재생 **0**(로지스틱)');
  ok(E.forageRegrowPerDay(K - 1, K, r) + (K - 1) <= K + 1e-9, '⑪ ★교란 전 수(`K`)를 **안 넘는다**');
  ok(E.forageRegrowR({ _forageOutLast: F }, 0, w) === 0 && E.forageRegrowR({ _forageOutLast: 0 }, K, w) === 0,
    '⑪ 군락이 없거나 수식이 0 이면 재생도 0(0 으로 안 나눈다)');
  ok(E.forageRegrowPerDay(95, 190, r) === E.woodRegrowPerDay(95, 190, r),
    '⑪ ★★나무와 **같은 값**을 낸다(같은 함수라서 — 사본 0 의 실측)');
  // ⓕ 30일 창 모형 — 한도가 MSY 를 넘으면 군락이 줄고, 근처면 수렴한다(수는 전부 정본에서)
  const msy = F / w;
  for (const cap of [1, 2, 3, 6]) {
    let N = K, took = 0;
    for (let d = 0; d < 30; d++) { const c = Math.min(cap, N); N -= c; took += c; N += E.forageRegrowPerDay(N, K, r); }
    ok(took > 0, `⑪ ⓕ 하루 한도 ${cap}개 → 30일 합 ${(took * w).toFixed(0)}단 / 수식 ${(30 * F).toFixed(0)}단 = ${(100 * took * w / (30 * F)).toFixed(0)}% · 남은 군락 ${N.toFixed(1)}/${K}`);
  }
  let Nb = K, tb = 0;
  for (let d = 0; d < 30; d++) { const c = Math.min(Math.ceil(msy), Nb); Nb -= c; tb += c; Nb += E.forageRegrowPerDay(Nb, K, r); }
  ok(tb * w >= 30 * F * 0.5, '⑪ ★한도를 MSY 근처로 두면 30일 합이 수식의 절반을 넘는다(수렴 쪽)', `${(100 * tb * w / (30 * F)).toFixed(0)}%`);
  let Nc = K, tc = 0;
  for (let d = 0; d < 30; d++) { const c = Math.min(12, Nc); Nc -= c; tc += c; Nc += E.forageRegrowPerDay(Nc, K, r); }
  ok(Nc < K * 0.5, '⑪ ★★한도가 MSY 를 크게 넘으면 **군락이 준다**(30일 뒤 교란 전의 절반 아래)', `${Nc.toFixed(1)}/${K}`);
}

// ── ⑪b 관측 함수가 서로 섞이지 않았나 — 두 `return` 이 같은 꼬리를 쓴다(내가 한 번 틀렸다)
console.log('\n⑪b 관측 함수 — 나무와 채집이 안 섞였다');
{
  const VC = codeOf(VSRC);
  const wp = (VC.match(/function woodPerf\(\)[\s\S]*?\n\}/) || [''])[0];
  const fp = (VC.match(/function foragePerf\(\)[\s\S]*?\n\}/) || [''])[0];
  ok(wp.length > 0 && fp.length > 0, '⑪b [상황] 두 관측 함수가 다 있다');
  //   ★자기신고: `formulaActPerDay` 를 처음엔 **`woodPerf` 에** 넣었다(두 함수의 `return` 꼬리가 같아서
  //     치환이 앞엣것을 물었다). 켠 팔에서 `ReferenceError` 가 났을 자리다 — 손잡이가 꺼져 있어 안 보였다.
  ok(!/formulaAct/.test(wp), '⑪b ★★`woodPerf` 에 채집 칸(`formulaAct`)이 **없다**(그 함수의 스코프에 없는 이름이다)');
  ok(/formulaActPerDay: \+formulaAct\.toFixed\(4\)/.test(fp) && /let [^;]*formulaAct = 0;/.test(fp),
    '⑪b ★★`foragePerf` 는 선언과 사용이 **같은 스코프**에 있다(등가의 분모 = 걷은 몫)');
  for (const [n, body] of [['woodPerf', wp], ['foragePerf', fp]]) {
    const used = new Set((body.match(/\b(formula|formulaAll|formulaAct|deliv|cells|popAll)\b/g) || []));
    const declared = new Set((body.match(/let ([^;]+);/g) || []).join(' ').match(/\b\w+\b/g) || []);
    const bad = [...used].filter((v) => !declared.has(v));
    ok(bad.length === 0, `⑪b ★\`${n}\` 이 쓰는 누적 변수는 전부 **그 함수가 선언한 것**이다`, bad.join(',') || '0개');
  }
}

// ── ⑬ [T359] 군락은 지형의 것 — ⓐ 간격이 유도값 ⓑ 켬/끔 ⓒ 링과 겹침 0 ────────────────
console.log('\n⑬ [T359] 군락 지형 생성 (#58 ⓐ′ · 손잡이 기본 끔)');
{
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const F2 = require(path.join(ROOT, 'server', 'forage.js'));
  const ZC = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8'));
  ok(typeof CH.GROVE === 'object' && CH.GROVE.ON() === false,
    '⑬ ★★손잡이 `T359_GROVE_TERRAIN` 이 **기본 끔**이다(켜기는 재민)');
  ok(/if \(GROVE\.ON\(\)\) \{/.test(ZC),
    '⑬ ★군락 갈래 전체가 **손잡이 뒤**에 있다 — 끄면 한 번도 안 돈다(청크 산출 비트 동일)');
  // ⓐ 간격이 **유도값**인가 — T357 앵커에서 다시 계산해 상수와 맞댄다(하네스에 새 수 0)
  const CELL = F2.CFG.CELL_PX, R = Math.ceil(64 * F2.CFG.WALK_SEC / CELL);
  ok(R === 30 && CELL === 32,
    'ⓐ 생활권 자 = 채집 반경(걸음 64 × 도보 초 ÷ 셀)', `${R}셀 · ${R * CELL}px`);
  //   ★앵커는 **셀당 밀도의 중앙값** 둘이다(카드 ①의 그 방법: 마을마다 `K ÷ 셀` 을 내고 중앙값 하나).
  //     실측(보고/T359 §1 · 계측기 `t359-grove-density.js`): 숲 10곳 **0.309525** · 초지·물가 35곳 **0.088724**.
  //     간격 = 셀 ÷ √밀도 ⇒ 정수 반올림이 `GROVE.SP_*` 와 **정확히** 같아야 한다(하네스에 간격 수 0).
  const spOf = (dens) => CELL / Math.sqrt(dens);
  const bush = spOf(0.309525), herb = spOf(0.088724);
  ok(Math.round(bush) === CH.GROVE.SP_BUSH,
    'ⓐ ★★덤불 간격이 **유도값**이다(숲 마을 밀도 중앙값에서 다시 계산)', `${bush.toFixed(1)} → ${Math.round(bush)} = ${CH.GROVE.SP_BUSH}`);
  ok(Math.round(herb) === CH.GROVE.SP_HERB,
    'ⓐ ★★풀 간격도 유도값이다(초지·물가 밀도 중앙값)', `${herb.toFixed(1)} → ${Math.round(herb)} = ${CH.GROVE.SP_HERB}`);
  ok(CH.GROVE.SP_BUSH < 60 && CH.GROVE.SP_HERB > 96,
    'ⓐ ★그 둘이 나무 간격 띠(60~96px)의 **아래·위**다 — 덤불은 숲만큼 촘촘, 풀은 더 듬성',
    `${CH.GROVE.SP_BUSH} / ${CH.GROVE.SP_HERB}`);
  ok(/if \(G\.forest \? !\(fm > FOREST_MIN_COV\) : \(fm > FOREST_MIN_COV\)\) continue;/.test(ZC),
    'ⓐ ★★지형을 가르는 문턱이 **숲 그리드의 그 문턱 하나**다(새 문턱 0 · `FOREST_MIN_COV`)');
  ok(/GAP: FOREST_GAP,/.test(ZC), 'ⓐ 빈자리 비율도 숲 그리드의 그 수다(사본 0)');
  ok(!/SP_BUSH: \d+[\s\S]{0,40}Math\.|forestSpacing\(fCov\)[\s\S]{0,20}GROVE/.test(ZC),
    'ⓐ 군락 간격이 나무 간격식을 덮어쓰지 않는다(둘은 따로 산다)');
  // ⓑ 켬 판 군락 > 0 · 끔 판 = 0 (청크 갈래만)
  const vs = require(path.join(ROOT, 'server', 'terrain.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
  if (vs.setZonesMeta) vs.setZonesMeta(ZONES);
  const one = (vs.getZoneVillages('hanbando') || [])[0];
  ok(!!one, 'ⓑ [상황] 마을 하나를 잡았다', one ? one.name : '못 잡았다');
  if (one) {
    const cx = Math.floor(one.x / 512), cy = Math.floor(one.y / 512);
    const cnt = (env) => {
      const js = `const {ZONES}=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config.js'))});`
        + `const T=require(${JSON.stringify(path.join(ROOT, 'server', 'terrain.js'))});if(T.setZonesMeta)T.setZonesMeta(ZONES);`
        + `const CH=require(${JSON.stringify(path.join(ROOT, 'server', 'chunk.js'))});`
        + `const a=CH.generateChunkResources('hanbando',ZONES['hanbando'].biome,${cx},${cy},512)||[];`
        + `console.log(JSON.stringify({g:a.filter(r=>/_g[bh]\\d/.test(r.seedKey||'')).length,n:a.length}))`;
      return probe(env, js);
    };
    const off = cnt({}), on = cnt({ T359_GROVE_TERRAIN: '1' });
    ok(off.g === 0, 'ⓑ ★★끔 판 청크에 지형 군락이 **0** 이다', String(off.g));
    ok(on.g > 0, 'ⓑ ★★켬 판엔 **난다**', String(on.g));
    ok(on.n === off.n + on.g, 'ⓑ ★늘어난 개체가 **정확히 군락 수만큼**이다(다른 종이 안 움직였다)',
      `${off.n} + ${on.g} = ${on.n}`);
  }
  // ⓒ 링 군락과 겹침 0 — 정본 무접촉 + 자리 회피
  ok(/const _inRing = \(x, y\) =>/.test(ZC) && /if \(_inRing\(x, y\)\) continue;/.test(ZC),
    'ⓒ ★★링 군락 자리를 **비켜 준다**(링이 먼저 심은 자리가 정본 · `groves` 무접촉)');
  ok(!/t\.groves\s*=|\.groves\.push/.test(ZC),
    'ⓒ ★이 갈래가 링 군락 데이터를 **쓰지 않는다**(읽기만)');
  ok(/`\$\{cx\}_\$\{cy\}_\$\{G\.tag\}\$\{gx\}_\$\{gy\}`/.test(ZC),
    'ⓒ 씨 키가 숲(`ft`)·링(`gv`)과 안 겹친다(`gb`·`gh`)');
  ok(/const st2 = _stage\(seedKey, G\.type, null\);/.test(ZC),
    'ⓒ ★재생 회계가 **같은 함수**다(`_stage` — T122 덤불 1년 · 풀 반년 · 사본 0)');
}

// ── ⑭ [T374] 채취는 수요가 멈춘다 — ⓐ D 에 닿으면 그날 0 ⓑ D=0 마을 0 ⓒ 나무·물고기 같은 규칙 ──
console.log('\n⑭ [T374] 수요 멈춤 (손잡이 기본 끔)');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const C = codeOf(SRC), VC = codeOf(VSRC);
  ok(E.T374_DEMAND_STOP === false, '⑭ ★★손잡이 `T374_DEMAND_STOP` 이 **기본 끔**이다');
  ok(E.actDemandLeft({}, 10, '_x') === Infinity && E.actDemandCap({}, 99, 10, '_x') === 99,
    '⑭ ★끄면 자르는 문이 **아예 없다**(`Infinity` · 끈 팔 비트 동일)');
  ok(/if \(!T374_DEMAND_STOP\) return Infinity;/.test(C),
    '⑭ ★그 폴백이 함수 **첫 줄**이다(손잡이 뒤에 전부)');
  //   ★상한이 **정본 관측 칸**인가 — 지어낸 수가 없어야 한다
  const dbody = (C.match(/function actDemandLeft\(v, D, todayKey, held\)[\s\S]*?\n\}/) || [''])[0];
  ok(dbody.length > 0, '⑭ 수요 몸통이 **하나**다(`actDemandLeft(v, D, todayKey, held)`)');
  const lits = (dbody.match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0');
  ok(lits.length === 0, '⑭ ★★그 식에 **지어낸 수가 없다** — 상한은 수식이 그날 내겠다고 한 몫이다', lits.join(',') || '0개');
  ok(/_forageOutLast\) \|\| 0\) \* share, '_t347InflowToday'/.test(C)
    && /\(v && v\._woodOutLast\) \|\| 0, '_t325InflowToday'/.test(C)
    && /\(v && v\._fishOutLast\) \|\| 0, '_t312InflowToday'/.test(C),
    '⑭ ★★`D` 를 셋 다 **정본 칸**에서 읽는다(채집은 걷는 몫을 곱한다 · 새 수 0)');
  // ⓐ 기능 — D 에 닿으면 남은 수요가 0 이고, 곳간 입구가 더 안 받는다
  const on = probe({ T374_DEMAND_STOP: '1' }, `const E=require(${EP});
    const v={ storage:{}, treasury:{}, _forageOutLast:10, _t347MixShare:0.5, _t347InflowToday:0 };
    const a=E.actDemandLeft(v,5,'_t347InflowToday');
    v._t347InflowToday=3; const b=E.actDemandLeft(v,5,'_t347InflowToday');
    v._t347InflowToday=5; const c=E.actDemandLeft(v,5,'_t347InflowToday');
    const cap=E.actDemandCap({_t347InflowToday:3},99,5,'_t347InflowToday');
    const z=E.actDemandLeft({_t347InflowToday:0},0,'_t347InflowToday');
    console.log(JSON.stringify({a,b,c,cap,z,fd:E.forageDemandLeft(v)}))`);
  ok(on.a === 5 && on.b === 2 && on.c === 0,
    'ⓐ ★★오늘 넣은 만큼 남은 수요가 준다(5 → 2 → **0**)', `${on.a} → ${on.b} → ${on.c}`);
  ok(on.cap === 2, 'ⓐ ★★곳간 입구가 **남은 만큼만** 받는다(99 를 넣어도 2)', String(on.cap));
  ok(on.z === 0, 'ⓑ ★★`D` 가 0 인 마을은 남은 수요가 **0** 이다 ⇒ 안 딴다', String(on.z));
  ok(on.fd === 0, 'ⓑ ★채집 `D` 도 그 규칙이다(오늘치가 목표를 넘었다)', String(on.fd));
  // ⓐ' 손에 든 것 — 카드 ① "손에 든 것 + 오늘 곳간에 넣은 것이 D 에 닿으면"
  //   관측 갈래는 낮 내내 손에 쥐고 `_lifeDaily` 에 곳간에 넣는다 ⇒ 곳간만 보면 낮 동안 멈춤이 한 번도 안 선다.
  const hd = probe({ T374_DEMAND_STOP: '1' }, `const E=require(${EP});
    const v={ storage:{}, treasury:{}, _forageOutLast:10, _t347MixShare:0.5, _t347InflowToday:0, _woodOutLast:4, _t325InflowToday:1 };
    const a=E.actDemandLeft(v,5,'_t347InflowToday',2);
    v._t347InflowToday=3; const b=E.actDemandLeft(v,5,'_t347InflowToday',2);
    const c=E.actDemandLeft(v,5,'_t347InflowToday',99);
    const cap=E.actDemandCap({_t347InflowToday:3},99,5,'_t347InflowToday');
    v._t347InflowToday=0; const f=E.forageDemandLeft(v,1), f0=E.forageDemandLeft(v);
    const w=E.woodDemandLeft(v,3), w0=E.woodDemandLeft(v);
    console.log(JSON.stringify({a,b,c,cap,f,f0,w,w0}))`);
  ok(hd.a === 3 && hd.b === 0 && hd.c === 0,
    'ⓐ\' ★★손에 든 것도 **뺀다**(D 5 · 손 2 → 3 · 오늘 3 + 손 2 → **0** · 손이 넘치면 0)', `${hd.a} · ${hd.b} · ${hd.c}`);
  ok(hd.cap === 2, 'ⓐ\' ★곳간 입구는 손을 **안 뺀다** — 넣는 그것이 바로 그 손이다(두 번 빼면 손이 스스로를 막는다)', String(hd.cap));
  ok(hd.f === 4 && hd.f0 === 5 && hd.w === 0 && hd.w0 === 3,
    'ⓐ\' ★품목별 자리도 손을 넘긴다(채집 5 − 1 = 4 · 나무 4 − 1 − 3 = 0 · 안 넘기면 종전 값)', `${hd.f}/${hd.f0} · ${hd.w}/${hd.w0}`);
  ok(/function woodDemandLeft\(v, held\)/.test(C) && /function forageDemandLeft\(v, held\)/.test(C) && /function fishDemandLeft\(v, held\)/.test(C),
    'ⓐ\' ★세 자리가 **같은 인자**를 받는다(몸통 하나 · 사본 0)');
  // ⓐ 생활층 — 헤드리스 루프와 관측 갈래 둘 다 그 문을 본다
  ok(/if \(!\(_lifeEcon\(\)\.forageDemandLeft\(vil\.econ\) > 0\)\) \{ vil\._t347Dbg\.stop = 1; break; \}/.test(VC),
    'ⓐ ★★헤드리스 채집 루프가 수요에서 **멈춘다**(그날 끝 · 손은 이미 비웠다 — 그래서 손을 안 넘긴다)');
  //   관측 갈래 — **퇴근**이다(농부의 "창 밖 = 오늘 휴무" 와 같은 한 줄). `return false` 가 아니다:
  //   레거시 폴스루는 `zone.js` ④ "가까운 자원 채집"이라 멈춤이 아니라 **아무 자원이나** 따는 것이다.
  const stopLine = "if (_t374Done(vil, job)) { _lifeGoHome(npc, '휴식'); return true; }";
  const iStop = VC.indexOf(stopLine), iJob = VC.indexOf('const job = npc.simJob;'),
        iT325 = VC.indexOf("if (job === 'lumberjack' && vil.econ && _lifeEcon().woodActOn(vil.econ)) {"),
        iLegacy = VC.indexOf("if (job === 'lumberjack' || job === 'miner' || job === 'forager') {");
  ok(iStop > 0 && iJob > 0 && iJob < iStop && iStop < iT325 && iT325 < iLegacy,
    'ⓐ ★★관측 갈래는 **퇴근**한다 — 직업 실작업 머리(배정 뒤 · 나무꾼·채집꾼 두 갈래 앞)에 한 줄', `${iJob} < ${iStop} < ${iT325} < ${iLegacy}`);
  ok(VC.split(stopLine).length === 2, 'ⓐ ★그 줄은 **한 자리**다(두 직업이 같은 줄 · 사본 0)');
  ok(!/DemandLeft\(vil\.econ[^)]*\) > 0\)\) return false;/.test(VC),
    'ⓐ ★★`return false`(레거시 폴스루 = `zone.js` ④ 가까운 자원 채집)로 **멈추지 않는다**');
  const doneBody = (VC.match(/function _t374Done\(vil, job\) \{[\s\S]*?\n\}/) || [''])[0];
  ok(/^function _t374Done\(vil, job\) \{\s*const E = _lifeEcon\(\);\s*if \(!E\.T374_DEMAND_STOP \|\| !vil \|\| !vil\.econ\) return false;/.test(doneBody),
    'ⓐ ★★손잡이가 **첫 줄**이다 — 끄면 손 합도 안 센다(비트 동일 · 비용 0)');
  ok(/job === 'forager' && E\.forageActOn\(vil\.econ\)\) return !\(E\.forageDemandLeft\(vil\.econ, _t374Held\(vil, _t347KeepOf\(vil\)\)\) > 0\);/.test(doneBody)   // ★[T475] 그 마을이 걷는 목록(없으면 세계 목록)
    && /job === 'lumberjack' && E\.woodActOn\(vil\.econ\)\) return !\(E\.woodDemandLeft\(vil\.econ, _t374Held\(vil, _T374_WOOD\)\) > 0\);/.test(doneBody),
    'ⓐ ★★행위 층이 켜진 마을·그 직업만 — 안 켜진 마을은 수식이 낸다(무접촉) · 손을 넘긴다');
  const heldBody = (VC.match(/function _t374Held\(vil, items\) \{[\s\S]*?\n\}/) || [''])[0];
  ok(/for \(const pid of \(vil\.npcPids \|\| \[\]\)\)/.test(heldBody) && /state\.deps\.players/.test(heldBody) && !/inventory\[[^\]]*\] *=[^=]/.test(heldBody),
    'ⓐ ★손은 **곳간 다리가 비울 그 손**이다(같은 사람 목록 `vil.npcPids` · 세기만 — 쓰기 0)');
  //   [자명 통과 금지] 문자열이 아니라 **정본 함수 그대로**를 돌린다(`__labProbe._t374Probe` · 최소 주입구 하나).
  //   ⚠`94db6dd8` 의 `return false` 는 문자열 핀을 통과했다 — 그래서 여기서는 판정을 **실제로** 부른다.
  const VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
  const obs = probe({ T374_DEMAND_STOP: '1', T347_FORAGE_ACT: '1', T325_WOOD_ACT: '1' }, `const V=require(${VP}); const P=V.__labProbe._t374Probe;
    const pl=new Map([[1,{inventory:{wood:3,herb:1}}],[2,{inventory:{wood:2,twig:2}}],[3,{inventory:{}}]]);
    P.setDeps({ players: pl, t347LootOf: () => ({ herb: 2, twig: 1, fiber: 1 }) });
    const vil={ npcPids:[1,2,3], econ:{ storage:{}, _t325Cells:3, _woodOutLast:10, _t325InflowToday:4, _t347Cells:2, _forageOutLast:20, _t347MixShare:0.5, _t347InflowToday:4 } };
    const hw=P.held(vil,['wood']); const d1=P.done(vil,'lumberjack'); pl.get(3).inventory.wood=1; const d2=P.done(vil,'lumberjack');
    const items=V._t347ActItems(); const hf=P.held(vil, items); const f1=P.done(vil,'forager'); vil.econ._t347InflowToday=7; const f2=P.done(vil,'forager');
    const nonAct={ npcPids:[1,2,3], econ:{ storage:{}, _t325Cells:0, _woodOutLast:0, _t347Cells:0, _forageOutLast:20 } };
    console.log(JSON.stringify({hw,d1,d2,items,hf,f1,f2,n1:P.done(nonAct,'lumberjack'),n2:P.done(nonAct,'forager'),m:P.done(vil,'miner')}))`);
  ok(obs.hw === 5 && obs.d1 === false && obs.d2 === true,
    'ⓐ ★★[실행] 나무꾼 — D 10 · 오늘 4 · 손 5 ⇒ 1 남아 **일한다** · 손 6 ⇒ 0 ⇒ **퇴근**', `손 ${obs.hw} · ${obs.d1} → ${obs.d2}`);
  ok(obs.hf === 3 && obs.f1 === false && obs.f2 === true,
    'ⓐ ★★[실행] 채집꾼 — D 20×0.5 · 손은 **걷는 품목만**(herb 1 + twig 2 = 3 · 나무·fiber 안 셈) ⇒ 오늘 4 → 일한다 · 오늘 7 → **퇴근**',
    `손 ${obs.hf}(${(obs.items || []).join('·')}) · ${obs.f1} → ${obs.f2}`);
  ok(obs.n1 === false && obs.n2 === false && obs.m === false,
    'ⓐ ★★[실행] 행위 층이 **안 켜진 마을**(셀 0 · D 0)은 안 막는다 · 광부도 무관 — `94db6dd8` 의 자리 결함이 없다');
  const obsOff = probe({ T347_FORAGE_ACT: '1', T325_WOOD_ACT: '1' }, `const V=require(${VP}); const P=V.__labProbe._t374Probe;
    let calls=0; P.setDeps({ players: { get: () => { calls++; return { inventory: { wood: 99 } }; } } });
    const vil={ npcPids:[1,2,3], econ:{ storage:{}, _t325Cells:3, _woodOutLast:1, _t325InflowToday:4 } };
    console.log(JSON.stringify({ d: P.done(vil,'lumberjack'), calls }))`);
  ok(obsOff.d === false && obsOff.calls === 0,
    'ⓐ ★★[실행] 손잡이 끔 — 넘쳐도 **안 막고**, 손을 **한 명도 안 센다**(비트 동일 · 비용 0)', `${obsOff.d} · 센 사람 ${obsOff.calls}`);
  //   [실행 · 정본 `npcLifeTick` 그대로] 그 판정이 **제자리에서** 퇴근으로 이어지는가 — 낮(위상 0.4) · 반일 아님 · 과업 없음.
  //   ⚠나무 셀 스캔(`_t325Cells`)은 deps 에 나무가 없으면 0 으로 다시 센다(그게 정본 — 갈 자리가 없는 마을은 행위 마을이 아니다).
  //     그래서 둘째 판 앞에 셀 수를 되돌린다(스캔 규약을 시험하는 것이 아니다).
  const lifeJs = `const V=require(${VP}); const P=V.__labProbe; const pl=new Map(); const H={x:1000,y:1000};
    const mk=(pid,job,inv)=>({pid,simJob:job,simVillageId:1,x:3000,y:3000,hp:100,maxHp:100,npcHomeX:H.x,npcHomeY:H.y,inventory:inv||{},simLonOff:0});
    const f=mk(11,'forager',{herb:1}), l=mk(12,'lumberjack',{wood:2}), m=mk(13,'miner',{}); for (const n of [f,l,m]) pl.set(n.pid,n);
    const vil={dbId:1,ccx:10,ccy:10,npcPids:[11,12,13],_terrSet:new Set(['10,10']),_farmSet:new Set(),_claim:new Set(),_cropClaim:new Set(),_clearCrew:0,_buildCrew:0,
      econ:{storage:{},_t347Cells:2,_forageOutLast:20,_t347MixShare:0.5,_t347InflowToday:0,_t325Cells:3,_woodOutLast:10,_t325InflowToday:0,_idleFrac:0}};
    P._memberProbe.setup({},[vil]); P._t374Probe.setDeps({players:pl,worldPhase:()=>0.4,dayPhaseRatio:0.7,t347LootOf:()=>({herb:2,twig:1})});
    const run=(n)=>{ n.targetX=null; n.targetY=null; n._lifeAct=null; const r=V.npcLifeTick(n,1e6); return (r===true && n.targetX===H.x && n.targetY===H.y) ? (n._lifeAct||'?') : ''; };
    const A=[run(f),run(l),run(m)];
    vil.econ._t347InflowToday=9; vil.econ._t325InflowToday=8; vil.econ._t325Cells=3;
    const B=[run(f),run(l),run(m)];
    f.inventory.herb=0; const C=run(f);
    console.log(JSON.stringify({A,B,C}))`;
  const lifeOn = probe({ T374_DEMAND_STOP: '1', T347_FORAGE_ACT: '1', T325_WOOD_ACT: '1' }, lifeJs);
  const lifeOff = probe({ T347_FORAGE_ACT: '1', T325_WOOD_ACT: '1' }, lifeJs);
  ok(lifeOn.A.join('|') === '||' && lifeOn.B[0] === '귀가' && lifeOn.B[1] === '귀가' && lifeOn.B[2] === '',
    'ⓐ ★★★[실행 · 정본 `npcLifeTick`] 수요가 남으면 일터 · **차면 채집꾼·나무꾼이 집으로 간다**(목표 = 집 · 라벨 `귀가`) · 광부 무관',
    `남음 [${lifeOn.A.map((x) => x || '일터').join(' · ')}] → 참 [${lifeOn.B.map((x) => x || '일터').join(' · ')}]`);
  ok(lifeOn.C === '', 'ⓐ ★[실행] 손을 곳간에 넣으면(손 0) 1 이 남아 **다시 일터**다(하루 안에서도 규칙이 산다)');
  ok(lifeOff.A.join('|') === '||' && lifeOff.B.join('|') === '||' && lifeOff.C === '',
    'ⓐ ★★[실행 · 끔] 같은 상태에서 **아무도 퇴근 안 한다**(끈 팔 무접촉)', JSON.stringify(lifeOff));
  // ⓒ 나무·물고기도 같은 규칙 — 같은 함수 · 같은 자리
  ok(/if \(!\(_lifeEcon\(\)\.woodDemandLeft\(vil\.econ\) > 0\)\) \{ vil\._t325Dbg\.stop = 1; break; \}/.test(VC),
    'ⓒ ★★나무 헤드리스 루프도 **같은 규칙**이다(사본 0)');
  ok(/function fishToGranary\(v, units\)[\s\S]{0,200}actDemandCap/.test(C),
    'ⓒ ★어부는 곳간 입구에서 같은 문을 지난다(걷는 갈래는 T312·T340 몫이라 안 만졌다)');
  //   [자명 통과 금지] 손잡이를 켠 판에서 상한이 실제로 무는가
  const bite = probe({ T374_DEMAND_STOP: '1' }, `const E=require(${EP});
    const v={ storage:{}, treasury:{}, _woodOutLast:4, _t325InflowToday:0 };
    const g1=E.woodDemandLeft(v); v._t325InflowToday=4; const g2=E.woodDemandLeft(v);
    console.log(JSON.stringify({g1,g2}))`);
  ok(bite.g1 === 4 && bite.g2 === 0, '⑭ [자명 통과 금지] 켠 판에서 상한이 실제로 **문다**', `${bite.g1} → ${bite.g2}`);
}

// ── ⑫ 접점 심볼 — 카드가 지목한 이름이 전부 제자리에 ────────────────────────────
// ── ⑮ [T450] 야생 군락 — 서식이 낳는다(T415 표 · 수동 군락 53 의 지형별 밀도 · 손잡이 기본 끔) ──────────
//   ⓐ 유도 — 밀도·모양·서식 술어가 **정본에서 다시 계산한 값**과 같다(하네스에 수 0 · 계산은 `_wildClass` 가 아니라 지형 함수로 다시)
//   ⓑ 켬/끔 — 끄면 0 · 켜면 **더해지기만** 한다(다른 개체 비트 동일)
//   ⓒ ★미끼 — 서식을 `_wildClass` 가 아니라 **지형 함수로 직접** 다시 본다(술어를 늘 참으로 하면 들에 군락이 서서 빨갛다)
//   ⓓ 색인 = 청크(T301) · 청크 경계 넘는 군락은 한 점도 두 번 안 난다
//   ⓔ 링 군락 무접촉 · 재생은 그 종의 주기(`GROVE_KINDS` · T122 `_stage`)
//   ⓕ 채집꾼·원정군의 종 집합 — ★[T462] 정본 `forageKinds`: 끔이면 야생 종 0(마을 채집이 보는 개체 비트 동일) · 켬이면 든다
console.log('\n⑮ [T450] 야생 군락 — 서식이 낳는다 (T415 표 · 손잡이 기본 끔)');
{
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const F2 = require(path.join(ROOT, 'server', 'forage.js'));
  const TT = require(path.join(ROOT, 'server', 'terrain.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
  if (TT.setZonesMeta) TT.setZonesMeta(ZONES);
  const CSRC = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
  const CC = codeOf(CSRC);
  const Z = 'hanbando', ZN = ZONES[Z], cs = CH.CHUNK_SIZE;
  const W = CH.WILD, HAB = CH.WILD_HAB;
  delete process.env.T450_WILD_GROVES;
  ok(!!W && W.ON() === false, '⑮ ★★손잡이 `T450_WILD_GROVES` 가 **기본 끔**이다');
  ok(/if \(WILD\.ON\(\) && WILD_PMAX > 0\) \{/.test(CC), '⑮ ★야생 군락 갈래 전체가 **손잡이 뒤**다 — 끄면 한 번도 안 돈다(청크 산출 비트 동일)');
  // ⓐ 서식 술어는 **있는 둘**(`decideVillageType` 의 물가 거리·깊은 숲 문턱) + 숲 그리드 문턱 — 글자로 맞댄다
  const dv = /function decideVillageType\(x, y\) \{[\s\S]*?\n  \}/.exec(CSRC);
  const dvD = dv && +((/const D = (\d+);/.exec(dv[0]) || [])[1]), dvF = dv && +((/getForestMultiplier\(zone\.id, x, y\) > ([\d.]+)\)/.exec(dv[0]) || [])[1]);
  ok(dv && dvD === W.RIV_D && dvF === W.FOREST, 'ⓐ ★서식 술어의 두 수가 `decideVillageType` 의 그 줄 그대로다(물가 거리 · 깊은 숲)', `${dvD} · ${dvF}`);
  // ⓐ 종 = T415 표 — 표에 없는 종(링 군락 종 · 채집꾼 종)은 안 깐다 · 종은 전부 T372 정의에 있다
  const DOC = fs.readFileSync(path.join(ROOT, '설계', '고증_군락.md'), 'utf8');
  const kinds = Object.values(HAB).flat();
  ok(kinds.every((k) => !!CH.GROVE_KINDS[k]) && !kinds.some((k) => ['berry_bush', 'herb', 'rock', 'water_pool'].includes(k)),
    'ⓐ ★종은 T372 네 종 안에서만(표에 없는 덤불·풀·돌·둠벙은 안 깐다)', JSON.stringify(HAB));
  ok(/반음지/.test(DOC) && /산림 유형 혼합/.test(DOC) && /\*\*물가\*\*/.test(DOC) && HAB.edge[0] === 'greens_patch' && HAB.riverside[0] === 'wild_vine' && HAB.forest.includes('beehive'),
    'ⓐ 서식이 T415 표 그대로다 — 나물=반음지(가장자리) · 벌집=산림 · 머루=물가');
  // ⓐ 밀도 — 수동 군락 53 의 중심을 **지형 함수로** 가르고 51마을 채집 원판 셀로 나눈다(`WILD.D` 와 맞댄다)
  const riv = (x, y) => { const D = dvD; return TT.isWaterCellLocal(Z, x - D, y) || TT.isWaterCellLocal(Z, x + D, y) || TT.isWaterCellLocal(Z, x, y - D) || TT.isWaterCellLocal(Z, x, y + D); };
  const cls = (x, y) => {   // ★`_wildClass` 를 부르지 않는다 — 지형 함수를 직접(미끼가 술어를 바꿔도 이쪽은 안 바뀐다)
    if (TT.isWaterCellLocal(Z, x, y) || (TT.isRockCellLocal && TT.isRockCellLocal(Z, x, y))) return null;
    if (riv(x, y)) return 'riverside';
    const fm = TT.getForestMultiplier(Z, x, y);
    return fm > dvF ? 'forest' : (fm > CH.FOREST_MIN_COV ? 'edge' : 'plain');
  };
  const R30 = Math.round(64 * F2.CFG.WALK_SEC / F2.CFG.CELL_PX);
  const G53 = (TT.ZONE_TERRAIN[Z] && TT.ZONE_TERRAIN[Z].groves) || [];
  const gByC = {}; for (const g of G53) { const c = cls(g.center[0], g.center[1]) || 'x'; gByC[c] = (gByC[c] || 0) + 1; }
  const seen = new Set(), cByC = {};
  for (const v of (TT.getZoneVillages(Z) || [])) { const vx = Math.floor(v.x / 32), vy = Math.floor(v.y / 32);
    for (let dy = -R30; dy <= R30; dy++) for (let dx = -R30; dx <= R30; dx++) { if (dx * dx + dy * dy > R30 * R30) continue;
      const k = (vx + dx) * 65536 + (vy + dy); if (seen.has(k)) continue; seen.add(k); const c = cls((vx + dx) * 32 + 16, (vy + dy) * 32 + 16) || 'x'; cByC[c] = (cByC[c] || 0) + 1; } }
  const same = Object.keys(W.D).every((c) => W.D[c][0] === (gByC[c] || 0) && W.D[c][1] === (cByC[c] || 0));
  ok(G53.length === 53 && same, 'ⓐ ★★밀도가 **유도값**이다 — 수동 군락 53 × 51마을 채집 원판(반경 = 걸음 × 도보 초 ÷ 셀)을 지형 함수로 다시 세면 `WILD.D` 그대로',
    `${JSON.stringify(W.D)} · 다시 센 것 ${JSON.stringify(Object.fromEntries(Object.keys(W.D).map((c) => [c, [gByC[c] || 0, cByC[c] || 0]])))} · 반경 ${R30}셀`);
  const nr = G53.filter((g) => g.kind !== 'water_pool'); const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  ok(W.N === med(nr.map((g) => g.n)) && W.R === med(nr.map((g) => g.r)), 'ⓐ 군락 모양 = 수동 군락(돌·덤불)의 점 수·반경 그대로', `${W.N} · ${W.R}px`);
  // ⓑ 켬/끔 — 한반도 청크 셋 중 하나씩(989청크)
  const scan = (on) => { if (on) process.env.T450_WILD_GROVES = '1'; else delete process.env.T450_WILD_GROVES;
    const m = new Map(); for (let cy = 0; cy < Math.ceil(ZN.zoneHeight / cs); cy += 3) for (let cx = 0; cx < Math.ceil(ZN.zoneWidth / cs); cx += 3) m.set(cx * 1000 + cy, CH.generateChunkResources(Z, ZN.biome, cx, cy, cs, null, 0));
    delete process.env.T450_WILD_GROVES; return m; };
  const isW = (e) => /_wg\d+_\d+_\d+$/.test(e.seedKey || '');
  const OFF = scan(false), ON = scan(true);
  let wOff = 0, wOn = 0, restSame = true; const wild = [];
  for (const [k, a] of OFF) { wOff += a.filter(isW).length; const b = ON.get(k); const bw = b.filter(isW); wOn += bw.length; for (const e of bw) wild.push(e);
    if (JSON.stringify(b.filter((e) => !isW(e))) !== JSON.stringify(a)) restSame = false; }
  ok(wOff === 0, 'ⓑ ★★끔 판 청크에 야생 군락이 **0** 이다', `${OFF.size}청크`);
  ok(wOn > 0 && restSame, 'ⓑ ★★켬 판엔 **난다** — 그리고 다른 개체는 끔 판과 비트 동일(더해지기만 한다)', `야생 ${wOn}개체 · 나머지 같다 ${restSame}`);
  // ⓒ ★미끼 — 서식을 지형 함수로 직접(중심 = 씨 키의 셀) · 종이 그 서식의 종인가 · 들·물·바위엔 0
  const ctr = new Map(); for (const e of wild) { const m = /_wg(\d+)_(\d+)_\d+$/.exec(e.seedKey); const ck = m[1] + ',' + m[2]; if (!ctr.has(ck)) ctr.set(ck, { gx: +m[1], gy: +m[2], kind: e.type }); }
  let habBad = 0, plain = 0; const byC = {};
  for (const g of ctr.values()) { const c = cls(g.gx * 32 + 16, g.gy * 32 + 16); byC[c] = (byC[c] || 0) + 1; if (c === 'plain' || c === null) plain++; if (!c || !(HAB[c] || []).includes(g.kind)) habBad++; }
  ok(ctr.size > 0 && habBad === 0 && plain === 0,
    'ⓒ ★★미끼 — 군락 중심의 서식을 **지형 함수로 직접** 보면 전부 그 종의 서식이다(술어를 늘 참으로 하면 들에 서서 빨갛다)', `군락 ${ctr.size} · 서식 ${JSON.stringify(byC)} · 어긋남 ${habBad} · 들·물·바위 ${plain}`);
  let pBad = 0; for (const e of wild) if (TT.isWaterCellLocal(Z, e.x, e.y) || (TT.isRockCellLocal && TT.isRockCellLocal(Z, e.x, e.y))) pBad++;
  ok(pBad === 0, 'ⓒ 점은 물·바위에 안 선다', `${pBad}`);
  // ⓓ 색인 = 청크(T301) — 야생 개체가 든 셀을 색인으로 물으면 그 개체들이 같은 차례로 나온다 · 한 점은 한 번만
  process.env.T450_WILD_GROVES = '1';
  let idxBad = 0, dup = 0; const keys = new Set();
  for (const e of wild) { if (keys.has(e.seedKey)) dup++; keys.add(e.seedKey); }
  const byCell = new Map(); for (const e of wild) { const k = Math.floor(e.x / 32) + ',' + Math.floor(e.y / 32); (byCell.get(k) || byCell.set(k, []).get(k)).push(e); }
  for (const [k, a] of byCell) { const [x, y] = k.split(',').map(Number);
    const got = CH.resourcesAtCell(Z, x, y, { biome: ZN.biome, chunkSize: cs }).filter(isW);
    if (JSON.stringify(got) !== JSON.stringify(a)) idxBad++; }
  //   청크 경계를 넘는 군락 — 이웃 넷을 다 낳아 그 군락의 점을 모으면 한 점도 두 번 안 난다
  let crossN = 0, crossBad = 0;
  for (const g of ctr.values()) {
    const pcx = Math.floor((g.gx * 32 + 16) / cs), pcy = Math.floor((g.gy * 32 + 16) / cs);
    const got = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (pcx + dx < 0 || pcy + dy < 0) continue;
      for (const e of CH.generateChunkResources(Z, ZN.biome, pcx + dx, pcy + dy, cs, null, 0)) { const m = /_wg(\d+)_(\d+)_(\d+)$/.exec(e.seedKey || ''); if (m && +m[1] === g.gx && +m[2] === g.gy) got.push(+m[3]); } }
    if (new Set(got).size !== got.length) crossBad++;
    if (got.length > W.N) crossBad++;
    crossN++;
  }
  delete process.env.T450_WILD_GROVES;
  ok(idxBad === 0 && dup === 0, 'ⓓ ★★색인(`resourcesAtCell`) = 청크 — 야생 개체가 든 셀 전부 · 같은 차례(T301)', `셀 ${byCell.size} · 어긋남 ${idxBad} · 겹친 씨 ${dup}`);
  ok(crossBad === 0, 'ⓓ 군락 하나의 점은 이웃 청크를 다 합쳐도 한 번씩만 난다(그 점이 든 청크만 낳는다)', `군락 ${crossN} · 어긋남 ${crossBad}`);
  // ⓔ 링 군락 무접촉 — 야생 중심은 링 원판과 안 겹친다 · 재생은 그 종의 주기
  let ringHit = 0; for (const g of ctr.values()) for (const r of G53) { const dx = g.gx * 32 + 16 - r.center[0], dy = g.gy * 32 + 16 - r.center[1]; if (dx * dx + dy * dy < ((r.r || 140) + W.R) ** 2) ringHit++; }
  ok(ringHit === 0 && !/t\.groves\s*=|\.groves\.push/.test(CC), 'ⓔ ★링 군락(수동 53) 원판과 겹치는 야생 군락 0 · 링 데이터는 읽기만', `${ringHit}`);
  const YD = require(path.join(ROOT, 'server', 'events.js')).yearDaysOf();
  const e0 = wild[0];
  if (e0) {
    process.env.T450_WILD_GROVES = '1';
    const ecx = Math.floor(e0.x / 32), ecy = Math.floor(e0.y / 32);
    const per = CH.REGROW[CH.GROVE_KINDS[e0.type].regrow]() * YD, d0 = 1000;
    const at = (day) => CH.resourcesAtCell(Z, ecx, ecy, { biome: ZN.biome, chunkSize: cs, harvestedSet: new Map([[e0.seedKey, d0]]), gameDay: day }).some((q) => q.seedKey === e0.seedKey);
    const r1 = at(d0 + 1), r2 = at(d0 + Math.ceil(per) - 1), r3 = at(d0 + Math.ceil(per));
    delete process.env.T450_WILD_GROVES;
    ok(!r1 && !r2 && r3, 'ⓔ ★딴 자리는 **그 종의 주기**가 지나야 다시 난다(`GROVE_KINDS[kind].regrow` · T122 `_stage` 그 함수)', `${e0.type} · 주기 ${Math.ceil(per)}일 · 다음날 ${r1} · 하루 전 ${r2} · 그날 ${r3}`);
  } else ok(false, 'ⓔ [상황] 야생 개체가 없다');
  // ⓕ ★[T462] 채집꾼·원정군의 종 집합 = 정본 `forageKinds`(존 `_T347_TYPES` · 생활층 `JOB_RES.forager` 가 읽는 그 함수)
  //   끔 — 야생 군락 종이 **없다**(덤불·풀 그 둘) ⇒ 마을 채집이 보는 개체가 T450 전과 비트 동일.
  //   켬 — 세계에 서고 품목을 kcal.js 가 아는 야생 종이 **든다** ⇒ 덤불·풀 개체는 그대로이고 야생 개체가 **더해진다**.
  const pickOf = (on) => { if (on) process.env.T450_WILD_GROVES = '1'; else delete process.env.T450_WILD_GROVES; const P = new Set(CH.forageKinds()); delete process.env.T450_WILD_GROVES; return P; };
  const PICK0 = pickOf(false), PICK1 = pickOf(true);
  ok(PICK0.size > 0 && !kinds.some((k) => PICK0.has(k)), 'ⓕ ★끔 — 채집꾼·원정군이 따는 종(정본 `forageKinds`)엔 야생 군락 종이 **없다** — 끔 판 마을 채집 비트 동일의 근거', `{${[...PICK0].join(', ')}}`);
  ok([...PICK0].every((k) => PICK1.has(k)) && kinds.some((k) => PICK1.has(k)), 'ⓕ ★★[T462] 켬 — 야생 군락 종이 **든다**(덤불·풀은 그대로)', `{${[...PICK1].join(', ')}}`);
  const vv = (TT.getZoneVillages(Z) || []).find((v) => { const c = cls(v.x, v.y); return c === 'forest' || c === 'edge'; }) || (TT.getZoneVillages(Z) || [])[0];
  const viewOf = (on) => { const P = on ? PICK1 : PICK0; if (on) process.env.T450_WILD_GROVES = '1'; else delete process.env.T450_WILD_GROVES; let s = '', n = 0, w = 0, other = 0;
    const vx = Math.floor(vv.x / 32), vy = Math.floor(vv.y / 32);
    for (let dy = -R30; dy <= R30; dy++) for (let dx = -R30; dx <= R30; dx++) { if (dx * dx + dy * dy > R30 * R30) continue;
      for (const e of CH.resourcesAtCell(Z, vx + dx, vy + dy, { biome: ZN.biome, chunkSize: cs })) {
        if (P.has(e.type) && !isW(e)) { s += `${e.id}|${e.x}|${e.y};`; n++; } else if (P.has(e.type)) w++; else if (isW(e)) other++; } }
    delete process.env.T450_WILD_GROVES; return { s, n, w, other }; };
  const v0 = viewOf(false), v1 = viewOf(true);
  ok(v0.s === v1.s && v0.w === 0, 'ⓕ ★마을 채집 원판(반경 30셀)에서 덤불·풀 개체는 켬/끔 **비트 동일** · 끔 판 야생 0', `${vv.name} · 덤불·풀 ${v0.n} = ${v1.n}`);
  ok(v1.w > 0, 'ⓕ ★★[T462] 켬 판엔 채집꾼이 야생 개체를 **본다**(종 집합 안 · 종 집합 밖 야생은 따로 센다)', `${vv.name} · 딸 야생 ${v1.w} · 종 집합 밖 야생 ${v1.other}`);
}

// ── ⑯ [T462] 야생 군락을 딴다 — 종 집합 하나 · 품목 = T458 등가 문법 · 끔 비트 동일 ─────────────────
//   ⓐ 정본 하나 — `forageKinds` 가 끔/켬마다 같은 배열 객체 · 켬 집합 = 링 ∪ {서식 밀도 > 0 ∧ kcal.js 가 품목을 아는 야생 종}
//      (하네스가 정본 값 — `WILD.D`·`WILD_HAB`·`GROVE_KINDS`·`kcal.js`·econ 믹스 — 으로 **다시 센다**)
//   ⓑ 품목 표 — 야생 넷의 품목: econ 믹스에 있나 · kcal.js kg당 열량 · 같은 물건이면 econ(걷는다) · 아니면 서버 품목뿐
//   ⓒ 걷는 목록 — 끔 = fruit·twig·herb(T458 그대로) · 켬 = + vegetable·mushroom · 정본(`_t347ActItems`) = 다시 센 교집합
//   ⓓ 세는 것 = 따는 것 — 켬 집합의 **모든 종**이 걷는 단위를 낸다(채집꾼이 건너뛰는 종이 집합에 없다 · K·게이트가 안 부푼다)
//   ⓔ ★미끼 — 정본 함수 몸통에서 kcal 문 한 줄을 빼면 벌집이 들고(ⓐ 가 빨갛다), 밀도 문을 빼면 kcal 이 포도를 알게 된 날 머루가 든다
console.log('\n⑯ [T462] 야생 군락을 딴다 — 종 집합 하나 · 품목 = T458 등가 문법');
{
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const KC = require(path.join(ROOT, 'server', 'kcal.js'));
  const M = V.playerVillageDepositMap();
  const env0 = process.env.T450_WILD_GROVES;
  const withWild = (on, f) => { if (on) process.env.T450_WILD_GROVES = '1'; else delete process.env.T450_WILD_GROVES;
    try { return f(); } finally { if (env0 == null) delete process.env.T450_WILD_GROVES; else process.env.T450_WILD_GROVES = env0; } };
  // ⓐ 정본 하나
  const off = withWild(false, () => CH.forageKinds()), off2 = withWild(false, () => CH.forageKinds());
  const on = withWild(true, () => CH.forageKinds()), on2 = withWild(true, () => CH.forageKinds());
  ok(off === off2 && on === on2 && off !== on && Object.isFrozen(on) && Object.isFrozen(off),
    'ⓐ ★정본이 끔/켬마다 **같은 배열 객체**를 준다(받는 쪽 — 존 조회 표·걷는 목록 — 은 배열이 바뀔 때만 다시 짓는다)');
  const mixKeys = Object.keys(E.foragerYieldsFor({ land: { fertility: 1, wood: 1, stone: 1 } }));
  const P = {}; for (const c of Object.keys(CH.WILD.D)) { const [n, cells] = CH.WILD.D[c]; P[c] = cells > 0 ? n / cells : 0; }
  const want = CH.FORAGE_RING.slice(), table = [];
  for (const c of Object.keys(CH.WILD_HAB)) for (const k of CH.WILD_HAB[c]) {
    const it = CH.GROVE_KINDS[k].item, kc = KC.kcalPerKg(it), mix = mixKeys.includes(it);
    const stands = P[c] > 0, same = kc > 0;   // T458 — 이름이 같으니 kg당 열량이 서면(양쪽이 kcal.js 의 같은 줄) 같은 물건
    table.push({ k, hab: c, it, mix, pv: M[it] || null, kc, food: E.FORAGE_FOOD_FACTOR[it] || 0, stands, econ: mix && same });
    if (stands && mix && same && !want.includes(k)) want.push(k);
  }
  ok(on.join('|') === want.join('|'),
    'ⓐ ★★켬 집합 = 링(덤불·풀) ∪ {서식 밀도 > 0 ∧ 품목이 econ 믹스에 있고 kcal.js 가 아는 야생 종} — 정본 값으로 다시 센 것과 같다', on.join('·'));
  // ⓑ 품목 표
  ok(table.length === 4 && table.every((r) => r.mix),
    'ⓑ 야생 넷의 품목은 전부 econ 채집 믹스에 **있다**(econ 품목이 있나 — 넷 다 ○ · 새 품목 0)', table.map((r) => `${r.k}→${r.it}`).join(' · '));
  const econ = table.filter((r) => r.econ).map((r) => r.it).sort();
  ok(econ.join('|') === 'mushroom|vegetable',
    'ⓑ ★★kcal.js 가 같은 물건이라 하는 것 = **버섯·채소 둘**(250·250) · 꿀·포도는 kcal.js 에 줄이 없다 → 서버 품목뿐(플레이어는 딴다)',
    table.map((r) => `${r.it} ${r.kc}kcal/kg ${r.econ ? 'econ' : '서버'}${r.stands ? '' : '(밀도 0)'}`).join(' · '));
  // ⓒ 걷는 목록 — 정본(`_t347ActItems`)과 다시 센 교집합(⑩ 의 T458 규칙 그대로)
  const ZC16 = codeOf(ZSRC);
  const BN = +((ZC16.match(/const BUSH_BERRY_N = (\d+);/) || [])[1]);
  const loot = (r) => { const t = r && r.type; if (t === 'berry_bush') return { berry: BN, fiber: 1, twig: 1 }; if (t === 'herb') return { herb: 2 };
    const g = CH.GROVE_KINDS[t]; return g ? { [g.item]: BN } : {}; };   // 존 `lootOfResource` 그 줄들(⑩ 이 글자로 대조한다)
  const S0 = V.__p3Bind({}).state, deps0 = S0.deps;
  V.__p3Bind({ deps: Object.assign({}, deps0 || {}, { t347LootOf: loot }) });
  try {
    const sameOf = (n) => { const m = M[n]; if (!m || m === n) return n; const a = KC.kcalPerKg(n), b = KC.kcalPerKg(m); return (a > 0 && a === b) ? m : n; };
    const walkOf = (kinds) => { const ent = new Set(); for (const t of kinds) for (const n in loot({ type: t })) ent.add(n); return mixKeys.filter((k) => [...ent].some((n) => sameOf(n) === k)); };
    const wOff = withWild(false, () => V._t347ActItems()) || [], wOn = withWild(true, () => V._t347ActItems()) || [];
    ok(wOff.join('|') === walkOf(off).join('|') && wOff.join('|') === 'fruit|twig|herb',
      'ⓒ ★끔 — 걷는 목록이 **T458 그대로**(fruit·twig·herb) · 끔 판 비트 동일', wOff.join('·'));
    ok(wOn.join('|') === walkOf(on).join('|') && wOn.includes('mushroom') && wOn.includes('vegetable') && !wOn.includes('honey') && !wOn.includes('grape'),
      'ⓒ ★★켬 — + 채소·버섯(econ · 발이 곳간에 넣는다) · 꿀·포도는 안 걷는다(서버 품목뿐 — 수식이 종전대로 낸다)', wOn.join('·'));
    // ⓓ 세는 것 = 따는 것
    const u = withWild(true, () => on.map((k) => [k, V._lifeLootForage({ type: k, x: 0, y: 0 })]));
    ok(u.every(([, x]) => x > 0),
      'ⓓ ★★켬 집합의 **모든 종**이 걷는 단위를 낸다 — 채집꾼이 건너뛰는 종(벌집·머루)이 집합에 없다(K·군락 셀·게이트가 안 부푼다)', u.map(([k, x]) => `${k} ${x}`).join(' · '));
    //   재생 — 딴 야생 개체의 씨 키가 되돌림 문(`_t341Unharvest` → `_ringBump` → `seedGenChunkOf`)에서 **낳은 청크**로 풀린다
    const sg = CH.seedGenChunkOf('12_34_wg400_1100_2', 0, 0, CH.CHUNK_SIZE);
    ok(sg.cx === 12 && sg.cy === 34, 'ⓓ 되돌림 — 야생 씨 키(`<cx>_<cy>_wg…`)가 낳은 청크로 풀린다(T347 로지스틱이 되살리면 그 청크 판만 버린다 · T440)', JSON.stringify(sg));
    // ⓔ 미끼 — 정본 함수 몸통을 그대로 떠서(한 줄씩 빼서) 같은 입력에 돌린다
    const CS16 = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
    const at = CS16.indexOf('function forageKinds() {'), fb = CS16.slice(at, CS16.indexOf('\n}\n', at) + 2);
    const gateK = fb.split('\n').find((l) => /kcalPerKg\(g\.item\) > 0/.test(l)), gateP = fb.split('\n').find((l) => /WILD_P\[c\] > 0/.test(l));
    const mk = (src, kc) => new Function('WILD', 'WILD_HAB', 'WILD_P', 'GROVE_KINDS', 'FORAGE_RING', '_kcalMod', `let _FK_ON = null;\n${src}\nreturn forageKinds;`)(
      { ON: () => true }, CH.WILD_HAB, P, CH.GROVE_KINDS, CH.FORAGE_RING, () => kc)();
    const real = mk(fb, KC), noK = mk(fb.replace(gateK, ''), KC);
    ok(!!gateK && real.join('|') === want.join('|') && noK.includes('beehive') && noK.join('|') !== want.join('|'),
      'ⓔ ★미끼 — kcal 문 한 줄을 뺀 몸통은 **벌집을 넣는다**(ⓐ 가 빨갛다 · 자명 통과 아님)', `정본 ${real.join('·')} · 미끼 ${noK.join('·')}`);
    const KG = { kcalPerKg: (it) => (it === 'grape' ? 500 : KC.kcalPerKg(it)) };   // 가정 — kcal.js 가 포도를 알게 된 날
    const realG = mk(fb, KG), noP = mk(fb.replace(gateP, ''), KG);
    ok(!!gateP && !realG.includes('wild_vine') && noP.includes('wild_vine'),
      'ⓔ ★미끼 — kcal.js 가 포도를 알게 돼도 정본은 **머루를 안 넣는다**(물가 밀도 0 — 세계에 없다) · 밀도 문을 빼면 든다(공급원 없이 수식에서 걷어낸다)', `정본 ${realG.join('·')} · 미끼 ${noP.join('·')}`);
  } finally { V.__p3Bind({ deps: deps0 }); }
}

// ── ⑰ [T475] 걷는 목록은 마을마다 · 두 시계 한 줄 ─────────────────────────────────────────────
//   ⓐ 목록 유도 — 마을 목록 = 세계 목록 ∩ (그 마을 원판 종의 전리품 → T458 같은 물건) · 하네스가 정본 값으로 **다시 센다**
//   ⓑ 스캔 — 종은 `_t347Scan` 이 N 을 셀 때 **오늘 서 있는** 개체에서 센다(하루 한 번 · 다 딴 종은 빠진다 — 그 품목은 수식이 낸다) · 정본 차례(`forageKinds`) 그대로
//   ⓒ econ 문 — 마을 목록이 먼저 · 없으면 세계 목록(종전) · 빈 목록 = 안 걷는다(수식 그대로) · 게이트가 닫히면 목록도 없다
//   ⓓ ★미끼 — 야생 없는 마을이 버섯을 걷으면 빨갛다: 스캔 → 심기 → **정본 econ 틱**(`tickVillage`) 한 줄기에서 그 마을 수식이
//      버섯·채소를 **낸다** · 마을 목록을 빼면(세계 목록 = T462 판) 버섯·채소가 0 이 된다 — 이 검사가 그 판을 문다
//   ⓔ 두 시계 한 줄 — econ 일 조각 안에서 손을 **틱 앞에** 곳간에 넣는다 · 기능: 손 → 곳간·오늘치(목록 밖 `fiber` 는 손에 남는다) ·
//      헤드리스(손 0)는 아무것도 안 쓴다 · 끄면 한 명도 안 센다 · ★정본 틱으로 8일: 틱 뒤에 넣으면 **하루걸러**, 앞에 넣으면 **매일**
//   ⓕ 끔 비트 동일 — 새 줄이 손잡이 뒤 · 직렬화 안 한다(`SERIALIZE_SKIP`) · 랩은 이 문을 안 연다
console.log('\n⑰ [T475] 걷는 목록은 마을마다 — 그 마을 원판에 선 종만 · 두 시계 한 줄');
{
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const KC = require(path.join(ROOT, 'server', 'kcal.js'));
  const M = V.playerVillageDepositMap();
  const VC = codeOf(VSRC), C = codeOf(SRC);
  const VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
  const env0 = process.env.T450_WILD_GROVES;
  const withWild = (on, f) => { if (on) process.env.T450_WILD_GROVES = '1'; else delete process.env.T450_WILD_GROVES;
    try { return f(); } finally { if (env0 == null) delete process.env.T450_WILD_GROVES; else process.env.T450_WILD_GROVES = env0; } };
  const ZC17 = codeOf(ZSRC);
  const BN = +((ZC17.match(/const BUSH_BERRY_N = (\d+);/) || [])[1]);
  const loot = (r) => { const t = r && r.type; if (t === 'berry_bush') return { berry: BN, fiber: 1, twig: 1 }; if (t === 'herb') return { herb: 2 };
    const g = CH.GROVE_KINDS[t]; return g ? { [g.item]: BN } : {}; };   // 존 `lootOfResource` 그 줄들(⑩ 이 글자로 대조한다)
  const sameOf = (n) => { const m = M[n]; if (!m || m === n) return n; const a = KC.kcalPerKg(n), b = KC.kcalPerKg(m); return (a > 0 && a === b) ? m : n; };
  // ⓐ 목록 유도 — 정본(`_t475Probe.itemsFor`)과 하네스가 다시 센 것
  const P = V.__labProbe._t475Probe;
  const S0 = V.__p3Bind({}).state, deps0 = S0.deps;
  V.__p3Bind({ deps: Object.assign({}, deps0 || {}, { t347LootOf: loot }) });
  try {
    const on = withWild(true, () => CH.forageKinds());
    const wild = on.filter((k) => !CH.FORAGE_RING.includes(k));
    const cases = [['berry_bush', 'herb'], ['berry_bush'], ['herb'], ['berry_bush', 'herb', wild[0]], on.slice(), []];
    const want = (world, kinds) => { const ent = new Set(); for (const t of kinds) for (const n in loot({ type: t })) if (loot({ type: t })[n] > 0) ent.add(sameOf(n));
      return world.filter((k) => ent.has(k)); };
    const got = withWild(true, () => { const w = V._t347ActItems(); return { w, l: cases.map((k) => P.itemsFor(k)), again: P.itemsFor(cases[0]) }; });
    ok(got.l.every((l, i) => Array.isArray(l) && l.join('|') === want(got.w, cases[i]).join('|')),
      'ⓐ ★★마을 목록 = 세계 목록 ∩ 그 마을 종의 전리품(T458 같은 물건) — 정본 값으로 다시 센 것과 **여섯 판 다** 같다',
      cases.map((k, i) => `[${k.join('+') || '없음'}]→${got.l[i].join('·') || '∅'}`).join(' · '));
    ok(got.l[0].join('|') === 'fruit|twig|herb' && !got.l[0].includes('mushroom') && !got.l[0].includes('vegetable'),
      'ⓐ ★★야생 없는 마을(덤불·풀) = fruit·twig·herb — 켬 판에서도 **버섯·채소를 안 걷는다**', got.l[0].join('·'));
    ok(got.l[1].join('|') === 'fruit|twig' && got.l[2].join('|') === 'herb',
      'ⓐ ★풀이 없는 마을은 약초를 안 걷고, 덤불이 없는 마을은 열매·잔가지를 안 걷는다(종마다 제 품목만)');
    ok(got.l[4].join('|') === got.w.join('|') && got.l[5].length === 0,
      'ⓐ 종이 다 서면 세계 목록 그대로 · 종이 없으면 빈 목록(목록이 **세계 목록의 부분집합**이다 · 새 품목 0)');
    ok(got.again === got.l[0], 'ⓐ 같은 종 집합이면 **같은 배열**(한 번만 센다 · 하루 한 번 심어도 새로 안 짓는다)');
    const offW = withWild(false, () => ({ w: V._t347ActItems(), l: P.itemsFor(cases[3]) }));
    ok(offW.l.join('|') === want(offW.w, cases[3]).join('|') && !offW.l.includes('mushroom'),
      'ⓐ ★끔 판(세계 목록 fruit·twig·herb)이면 야생 종이 있어도 세계 목록 밖이라 안 걷는다(열쇠가 세계 목록을 품는다)', offW.l.join('·'));
  } finally { V.__p3Bind({ deps: deps0 }); }
  // ⓑ 스캔 + ⓓ 미끼 — 한 줄기(스캔 → 심기 → econ 틱). 자식 프로세스: 손잡이는 모듈을 읽을 때 선다.
  const chain = probe({ T347_FORAGE_ACT: '1', T450_WILD_GROVES: '1' }, `const V=require(${VP}); const E=require(${EP}); const CH=require(${JSON.stringify(path.join(ROOT, 'server', 'chunk.js'))});
    const P=V.__labProbe._t475Probe; const BN=${BN};
    const loot=(r)=>{const t=r&&r.type; if(t==='berry_bush')return{berry:BN,fiber:1,twig:1}; if(t==='herb')return{herb:2}; const g=CH.GROVE_KINDS[t]; return g?{[g.item]:BN}:{};};
    const order=CH.forageKinds(), wild=order.filter((k)=>!CH.FORAGE_RING.includes(k)), wi=CH.GROVE_KINDS[wild[0]].item;
    //   원판: A(10,10) 덤불·풀 · B(80,80) 덤불·풀 + 야생 하나 · C(150,150) 덤불 + **다 딴** 풀(교란 전 원판 raw 에만 선다)
    const raw={'12,10':[{type:'berry_bush'}],'13,10':[{type:'herb'}],'80,80':[{type:'berry_bush'}],'82,80':[{type:'herb'}],'81,80':[{type:wild[0]}],
      '152,150':[{type:'berry_bush'}],'153,150':[{type:'herb'}]};
    const now={'12,10':[{type:'berry_bush'}],'13,10':[{type:'herb'}],'80,80':[{type:'berry_bush'}],'82,80':[{type:'herb'}],'81,80':[{type:wild[0]}],
      '152,150':[{type:'berry_bush'}]};
    P.setDeps({moveSpeed:64,t347LootOf:loot,t347GrovesAtCell:(x,y,r)=>(r?raw:now)[x+','+y]||null});
    const mkE=()=>{ const v=E.createVillage({initialPop:10,name:'픽스처',fertility:1.0}); for (const n of v.npcs) n.currentJob='forager'; v.counts.forager=10; return v; };
    const A={ccx:10,ccy:10,econ:mkE()}, B={ccx:80,ccy:80,econ:mkE()}, Cv={ccx:150,ccy:150,econ:mkE()};
    P.scan(A,1); P.scan(B,1); P.scan(Cv,1);
    const kA=A._t347Kinds, kB=B._t347Kinds, kC=Cv._t347Kinds, KC=Cv._t347K;
    const lA=P.plant(A), lB=P.plant(B), lC=P.plant(Cv); const W=V._t347ActItems();
    //   둘째 날 — A 네모에 야생이 **선다**(재생 · 가정) · 덤불은 다 땄다 ⇒ 종을 **다시 센다**(하루 한 번 · N 과 같은 훑기)
    now['14,10']=[{type:wild[0]}]; delete now['12,10']; P.scan(A,2); const kA2=A._t347Kinds.slice(), lA2=P.plant(A).slice(); A._t347Kinds=kA; A.econ._forageActItems=lA;
    const tick=(v,own)=>{ v._world={forageActItems:W}; if (own) v._forageActItems=own; E.tickVillage(v,1);
      const d=v.dailyProductionBuf; const o={}; for (const k of ['fruit','twig','herb','mushroom','vegetable']) o[k]=+(d[k]||0).toFixed(4); return { p:o, act:E.forageActItemsOf(v), share:v._t347MixShare }; };
    const bv=mkE(); bv._t347Cells=A.econ._t347Cells;   // 미끼 — A 와 같은 게이트 · 마을 목록만 없다(= T462 판: 세계 목록을 걷는다)
    const real=tick(A.econ,lA), bait=tick(bv,null), bW=tick(B.econ,lB), cT=tick(Cv.econ,lC);
    const gate={ own:E.forageActItemsOf({_t347Cells:3,_forageActItems:['herb'],_world:{forageActItems:W}}),
      world:E.forageActItemsOf({_t347Cells:3,_world:{forageActItems:W}}), empty:E.forageActItemsOf({_t347Cells:3,_forageActItems:[],_world:{forageActItems:W}}),
      shut:E.forageActItemsOf({_t347Cells:0,_forageActItems:['herb'],_world:{forageActItems:W}}) };
    console.log(JSON.stringify({order,wild,wi,kA,kB,kC,KC,kA2,lA,lB,lC,lA2,W,real,bait,bW,cT,gate,cellsA:A.econ._t347Cells}))`);
  const ORD = (ks) => ks.every((k, i) => chain.order.indexOf(k) >= 0 && (i === 0 || chain.order.indexOf(ks[i - 1]) < chain.order.indexOf(k)));
  ok(Array.isArray(chain.kA) && chain.kA.join('|') === 'berry_bush|herb' && chain.kB.join('|') === `berry_bush|herb|${chain.wild[0]}`,
    'ⓑ ★★종은 **오늘 서 있는** 개체에서 센다 — A 는 덤불·풀 · B 는 덤불·풀 + 야생', `A ${chain.kA.join('·')} · B ${chain.kB.join('·')}`);
  ok(chain.kC.join('|') === 'berry_bush' && chain.KC === 2 && chain.lC.join('|') === 'fruit|twig' && chain.cT.p.herb > 0 && chain.cT.p.fruit === 0,
    'ⓑ ★★★**다 딴 종은 빠진다** — C 의 풀은 교란 전 원판(K 2)에만 선다 ⇒ 목록 fruit·twig · 약초는 **수식이 낸다**(게이트 문법의 종 판 — 걷어내기만 하고 못 채우는 품목 0)',
    `C 종 ${chain.kC.join('·')} · K ${chain.KC} · 목록 ${chain.lC.join('·')} · 수식 약초 ${chain.cT.p.herb}`);
  ok(ORD(chain.kA) && ORD(chain.kB), 'ⓑ 종 차례 = 정본 `forageKinds` 차례(목록 열쇠가 흔들리지 않는다)', chain.order.join('·'));
  ok(chain.kA2.join('|') === `herb|${chain.wild[0]}` && chain.lA2.join('|') === chain.W.filter((k) => ['herb', chain.wi].includes(k)).join('|'),
    'ⓑ ★종은 **하루 한 번** 다시 센다(N 을 세는 그 훑기 · 새 조회 0) — 둘째 날 A: 덤불을 다 땄고 야생이 섰다 ⇒ 약초 + 그 야생 품목', `${chain.kA2.join('·')} → ${chain.lA2.join('·')}`);
  ok(chain.lA.join('|') === 'fruit|twig|herb' && chain.lB.join('|') === chain.W.filter((k) => ['fruit', 'twig', 'herb', chain.wi].includes(k)).join('|'),
    'ⓑ 심은 목록 — A 는 덤불·풀 품목 · B 는 + 그 야생 품목(세계 목록 차례)', `A ${chain.lA.join('·')} · B ${chain.lB.join('·')}`);
  ok(Array.isArray(chain.gate.own) && chain.gate.own.join('|') === 'herb' && chain.gate.world.join('|') === chain.W.join('|')
    && chain.gate.empty === null && chain.gate.shut === null,
    'ⓒ ★★econ 문 — 마을 목록이 **먼저** · 없으면 세계 목록(종전 · 랩·픽스처 무변) · 빈 목록 = 안 걷는다 · 게이트 닫히면 없다');
  const walksWild = (r) => !(r.p.mushroom > 0) || !(r.p.vegetable > 0);   // 야생 없는 마을의 수식이 버섯·채소를 **못 내면** = 걷어냈다
  ok(!walksWild(chain.real) && chain.real.p.fruit === 0 && chain.real.p.herb === 0 && chain.real.p.twig === 0,
    'ⓓ ★★★[정본 econ 틱] 야생 없는 마을 — 수식이 버섯·채소를 **그대로 낸다** · 딸 수 있는 fruit·twig·herb 만 걷는다(발이 곳간에 넣는다)',
    `버섯 ${chain.real.p.mushroom} · 채소 ${chain.real.p.vegetable} · 걷는 몫 ${chain.real.share}`);
  ok(walksWild(chain.bait) && chain.bait.p.mushroom === 0 && chain.bait.p.vegetable === 0,
    'ⓓ ★★★미끼 — 마을 목록을 빼면(세계 목록 = T462 판) 같은 마을이 버섯·채소를 **걷어낸다**(0 · 아무도 못 채운다) — 이 검사가 그 판을 **문다**',
    `버섯 ${chain.bait.p.mushroom} · 채소 ${chain.bait.p.vegetable} · 걷는 몫 ${chain.bait.share}`);
  ok(chain.real.share < chain.bait.share && chain.bW.share > chain.real.share,
    'ⓓ ★걷는 몫(= 수요 `D·share`)도 마을마다 — 야생 없는 마을은 작고 야생 있는 마을은 그 품목만큼 크다', `A ${chain.real.share} · B ${chain.bW.share} · 세계 ${chain.bait.share}`);
  // ⓔ 두 시계 한 줄 — 자리(정적)
  const econJob = (VC.match(/add\('econ', \(\) => \{[\s\S]*?\n  \}\);/) || [''])[0];
  const iH = econJob.indexOf('for (const vil of C.vils) _lifeHandsIn(vil);'), iT = econJob.indexOf('state.econV2.tickWorldV2(state.world);');
  ok(iH > 0 && iT > iH, 'ⓔ ★★econ 일 조각 안에서 손이 **틱 앞에** 곳간에 든다(`_lifeHandsIn` → `tickWorldV2`) — 새 단계 0(조각 순서 캐논 무변)', `${iH} < ${iT}`);
  ok((VC.match(/_lifeHandsIn\(vil\);/g) || []).length === 1, 'ⓔ 부르는 자리는 **한 곳**(econ 일 조각의 한 줄 · 하네스 문은 정본을 그대로 부른다)');
  const hiBody = (VC.match(/function _lifeHandsIn\(vil\) \{[\s\S]*?\n\}/) || [''])[0];
  ok(/_t347Deliver\(vil, p\)/.test(hiBody) && /_t325Deliver\(vil, p\)/.test(hiBody) && !/ToGranary\(/.test(hiBody),
    'ⓔ ★같은 두 다리(`_t347Deliver`·`_t325Deliver`)를 부른다 — 회계를 새로 안 적었다(사본 0)');
  // ⓔ 기능 — 손이 곳간으로 · 목록 밖은 손에 · 헤드리스/끔은 아무것도 안 한다
  const hi = probe({ T347_FORAGE_ACT: '1', T325_WOOD_ACT: '1', T374_DEMAND_STOP: '1' }, `const V=require(${VP}); const P=V.__labProbe._t475Probe;
    const pl=new Map([[1,{inventory:{berry:3,herb:1,fiber:1}}],[2,{inventory:{wood:2}}],[3,{inventory:{}}]]);
    P.setDeps({players:pl,t347LootOf:()=>({berry:3,fiber:1,twig:1,herb:2})});
    const vil={npcPids:[1,2,3],econ:{storage:{},treasury:{},_t347Cells:2,_forageOutLast:20,_t347MixShare:0.5,_t347InflowToday:0,_t325Cells:3,_woodOutLast:10,_t325InflowToday:0,_forageActItems:['fruit','twig','herb']}};
    P.handsIn(vil);
    const r={ inv1:pl.get(1).inventory, inv2:pl.get(2).inventory, fin:vil.econ._t347InflowToday, win:vil.econ._t325InflowToday, pw:vil._t347PreWalked, pw2:vil._t325PreWalked, g:vil._t347Gran };
    const hl={npcPids:[3],econ:{storage:{},_t347Cells:2,_forageOutLast:20,_t347MixShare:0.5,_t347InflowToday:0,_t325Cells:3,_woodOutLast:10,_t325InflowToday:0}};
    P.handsIn(hl); r.hlKeys=Object.keys(hl).join(','); r.hlIn=hl.econ._t347InflowToday+hl.econ._t325InflowToday;
    console.log(JSON.stringify(r))`);
  ok(hi.inv1.berry === 0 && hi.inv1.herb === 0 && hi.inv1.fiber === 1 && hi.inv2.wood === 0,
    'ⓔ ★★[실행] 손 → 곳간(덤불 berry → fruit · 약초 · 목재) · 목록 밖 `fiber` 는 **손에 남는다**', JSON.stringify(hi.inv1));
  ok(hi.fin === 4 && hi.win === 2 && hi.g === 4 && hi.pw === 1 && hi.pw2 === 1,
    'ⓔ ★★[실행] 오늘치가 **이 틱 몫**으로 적힌다(채집 4 · 목재 2) · 곳간 계측 4 · 사람 수를 `_lifeDaily` 로 넘긴다(1 · 1)', `${hi.fin} · ${hi.win} · ${hi.g} · ${hi.pw}/${hi.pw2}`);
  ok(hi.hlKeys === 'npcPids,econ' && hi.hlIn === 0, 'ⓔ ★[실행] 헤드리스(손 0) — **아무것도 안 쓴다**(칸 하나도 안 생긴다 · 비트 동일)', hi.hlKeys);
  const hiOff = probe({ T347_FORAGE_ACT: '0', T325_WOOD_ACT: '0' }, `const V=require(${VP}); const P=V.__labProbe._t475Probe; let calls=0;
    P.setDeps({ players: { get: () => { calls++; return { inventory: { wood: 9, berry: 9 } }; } } });
    const vil={npcPids:[1,2],econ:{storage:{},_t347Cells:2,_t325Cells:3}}; P.handsIn(vil);
    console.log(JSON.stringify({ calls, keys:Object.keys(vil).join(',') }))`);
  ok(hiOff.calls === 0 && hiOff.keys === 'npcPids,econ', 'ⓔ ★★[실행 · 끔] 손잡이가 꺼지면 **한 명도 안 센다**(첫 줄에서 돌아간다 · 비트 동일)', `센 사람 ${hiOff.calls}`);
  // ⓔ ★정본 틱 8일 — 틱 **뒤**에 넣으면(종전 `_lifeDaily` 자리) 하루걸러 · **앞**에 넣으면 매일 (몸의 한 수는 "한 번 따면 손에 덤불 한 개체")
  const clk = probe({ T347_FORAGE_ACT: '1', T374_DEMAND_STOP: '1' }, `const V=require(${VP}); const E=require(${EP}); const P=V.__labProbe._t475Probe, P74=V.__labProbe._t374Probe;
    const run=(before)=>{ const v=E.createVillage({initialPop:10,name:'픽스처',fertility:1.0}); for (const n of v.npcs) n.currentJob='forager'; v.counts.forager=10;
      v._t347Cells=5; v._world={forageActItems:['fruit','twig','herb']}; const pl=new Map([[1,{inventory:{}}]]);
      P.setDeps({players:pl,t347LootOf:()=>({berry:${BN},fiber:1,twig:1})}); const vil={npcPids:[1],econ:v}; const picks=[], booked=[];
      for (let d=1; d<=8; d++) { if (before) P.handsIn(vil); E.tickVillage(v,d); if (!before) P.handsIn(vil);
        booked.push(+(v.dailyProductionBuf.fruit||0).toFixed(4)); let k=0; while(!P74.done(vil,'forager') && k<99){ pl.get(1).inventory.berry=(pl.get(1).inventory.berry||0)+${BN}; k++; } picks.push(k); }
      return { picks, booked, D:+((v._forageOutLast||0)*(v._t347MixShare||0)).toFixed(4) }; };
    console.log(JSON.stringify({ old: run(false), now: run(true) }))`);
  const zeroDays = (a) => a.filter((x) => x === 0).length;
  ok(clk.old.picks.length === 8 && zeroDays(clk.old.picks) >= 3 && clk.old.picks.every((x, i) => i === 0 || (x === 0) !== (clk.old.picks[i - 1] === 0)),
    'ⓔ ★★★[정본 틱 · 종전 자리] 틱 **뒤**에 손을 넣으면 어제 딴 것이 오늘 수요를 먹는다 ⇒ **하루걸러** 딴다', `딴 수 ${clk.old.picks.join(',')} · 장부 ${clk.old.booked.join(',')}`);
  ok(zeroDays(clk.now.picks) === 0 && clk.now.booked.slice(1).every((x) => x > 0 && Math.abs(x - clk.now.D) < 1e-6),
    'ⓔ ★★★[정본 틱 · 이 카드] 틱 **앞**에 넣으면 **매일** 따고 매일 장부에 `D·share` 가 오른다(두 시계가 한 시계)', `딴 수 ${clk.now.picks.join(',')} · 장부 ${clk.now.booked.join(',')} · D ${clk.now.D}`);
  // ⓕ 끔 비트 동일 · 직렬화 · 랩
  ok(/'_forageActItems',/.test(VC.slice(VC.indexOf('const SERIALIZE_SKIP'), VC.indexOf('const _serializeWarned'))),
    'ⓕ 마을 목록은 **저장 안 한다**(`SERIALIZE_SKIP` — 세는 값 · 하루 경계에서 다시 심는다 · 사본 0)');
  ok(/if \(!\(E\.T347_FORAGE_ACT \|\| E\.T325_WOOD_ACT\) \|\| !vil \|\| !vil\.econ\) return;/.test(hiBody),
    'ⓕ ★두 시계 한 줄은 손잡이 **첫 줄** 뒤다(끄면 곧장 돌아간다)');
  const labs = ['lab/마을실험실.html', 'lab/전쟁실험실.html'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'));
  ok(labs.every((s) => !/_forageActItems\s*=[^=]/.test(s)), 'ⓕ 랩은 마을 목록 문을 **안 연다**(브라우저엔 군락이 없다 — T226·T347 과 같은 이유)');
  ok(/const own = Array\.isArray\(v\._forageActItems\) \? v\._forageActItems : null;\s*if \(own\) return own\.length \? own : null;/.test(C),
    'ⓕ ★econ 문은 **목록을 고르기만** 한다(표 0 · 수 0 — 마을 목록이 없으면 종전 한 글자도 안 바뀐다)');
}

console.log('\n⑫ 접점 심볼');
{
  const all = SRC + VSRC + ZSRC;
  for (const sym of ['forageTakeFn', 'groves', 'resourcesAtCell', 'T146', 'actToGranary', 'weights', 'T347_FORAGE_ACT']) {
    ok(all.indexOf(sym) >= 0, `⑫ \`${sym}\` 가 제자리에 있다`);
  }
  ok(/world\.forageActItems/.test(VSRC), '⑫ 걷는 목록 주입이 생활층 한 곳이다(`world.forageActItems`)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
