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
    && /return actToGranary\(v, item, units, '_t347InflowToday', '_t347PickN'\);/.test(C),
    '② ★★곳간 입구가 어부·나무꾼과 **같은 몸통**이다(`actToGranary` — 새 회계 0 · 같은 세금)');
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
    && /return _actEntitiesAtCell\(cellX, cellY, _T347_TYPES, raw\);/.test(ZC),
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
  ok(/for \(const k of keep\)/.test(d) && /npc\.inventory\[k\] = 0;/.test(d),
    '④ ★★걷는 목록의 품목만 넣고, 넣은 품목은 **그때 비운다**(이중 0)');
  ok(/const u = npc\.inventory\[k\] \|\| 0;/.test(d) && /forageToGranary\(vil\.econ, k, u\)/.test(d),
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
  ok(/harvestedSet: harvestedSeeds, gameDay: gameDayNow\(\)/.test(ZC),
    '⑥ ★색인에 **수확 장부와 게임일**을 넘긴다 — 청크가 꺼져 있어도 같은 답(T301 규칙 표)');
  ok(/raw \? \{ biome: ZONE\.biome, chunkSize: chunkManager\.chunkSize \}/.test(ZC),
    '⑥ ★★`raw` 는 장부를 **안 넘긴다** — *"교란 전 그 셀에 무엇이 있었나"*(로지스틱 `K`)');
  ok(/const _T347_TYPES = \{ berry_bush: 1, herb: 1 \};/.test(ZC),
    '⑥ 군락 종 집합이 생활층 `JOB_RES.forager` 와 같은 둘이다');
  const VC = codeOf(VSRC);
  ok(/JOB_RES = \{[^}]*forager: \['berry_bush', 'herb'\]/.test(VC),
    '⑥ ★그 둘이 **생활층 정본**이다(존이 표를 지어내지 않았다)');
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
    '⑨ ★★걷기 술어(`_t316WalkAlways`)에 **T347 항을 안 넣었다** — T324·T345 몫이다(회부 그대로 · 항은 T312 하나)');
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
  const bush = (ZC.match(/const l = \{ berry: 2, fiber: 1, twig: 1 \};/) || [])[0];
  ok(!!bush, '⑩ [상황] 덤불 전리품이 존 정본에 있다(`berry 2 · fiber 1 · twig 1`)');
  ok(/if \(t === 'herb'\)\s*return \{ herb: 2 \};/.test(ZC), '⑩ [상황] 풀 전리품도 있다(`herb 2`)');
  const ent = ['berry', 'fiber', 'twig', 'herb'];
  const want = mix.filter((k) => ent.includes(k)).sort();
  ok(want.join('|') === 'herb|twig', '⑩ ★★교집합이 **`twig`·`herb` 둘**이다 — 실체와 수식이 말하는 품목이 거의 다르다', want.join('·'));
  ok(!ent.some((k) => k === 'berry' && mix.includes('berry')),
    '⑩ ★`berry` 는 믹스에 **없다** — econ 은 그것을 `fruit` 이라 부른다(동의어 매핑은 PM 칸 · 보고 §표)');
  const M = V.playerVillageDepositMap();
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

// ── ⑫ 접점 심볼 — 카드가 지목한 이름이 전부 제자리에 ────────────────────────────
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
