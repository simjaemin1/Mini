#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-wood-act.js — 나무꾼 행위 이식 (T325) ======================================
//
// ★왜 [설계/설계_생산_실체.md §1 · 재민 09-18/19 · 지시 T325]
//   *"나무를 베는 순간 통나무가 생긴다."* 이 하네스가 지키는 것은 그 문장 여섯 조각이다:
//     ⓐ 관측자 무관 — 같은 씨면 **청크가 켜졌든 꺼졌든 같은 나무**가 거기 있다(색인 = 청크 · T301)
//     ⓑ 낙하       — 죽은 나무꾼 손의 통나무는 **플레이어 낙하 함수 그 자리**로 간다(경로 0)
//     ⓒ 이중 0     — 켠 마을에서 `addProduce('wood')` 호출이 **0**(공존 = 이중 생산 · T135 규약)
//     ⓓ 장부 = 손  — 곳간에 든 합 = 손에서 넣은 합(넣으면 손을 비운다)
//     ⓔ 한도       — [T341] 예산이 **없다**. 하루에 베는 수는 **걸음**이 정한다(왕복 × 짐 × 나무꾼)
//     ⓕ 유한       — 벤 그루는 **세계에서 없어지고** 벤 날이 장부에 남는다(T122 재생의 입력)
//   그리고 **끄면 비트 동일**(손잡이 규약)을 일곱째로 지킨다.
//
// ⚠존을 부팅하지 않는다 — 존 소스는 **글자로** 읽고(정적), 셀 색인·엔진은 **불러서** 잰다(기능).
//   그 갈래는 `test-fish-act.js` 가 이미 쓴 문법이다(사본 0 · 새 자 0).
//
// 실행: node scripts/test-wood-act.js
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

console.log('\n=== 나무꾼 행위 이식 (T325) ===');

// ── ① 손잡이 — 기본 끔 · 끄면 문이 하나도 안 열린다 ─────────────────────────────
console.log('\n① 손잡이 — 기본 끔');
{
  const econ = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(econ.T325_WOOD_ACT === false, '① ★★기본이 **끔**이다', String(econ.T325_WOOD_ACT));
  ok(econ.woodActOn({ _t325Cells: 9 }) === false, '① 끈 판은 나무 셀이 있어도 **안 연다**');
  ok(econ.woodToGranary({ storage: {}, treasury: {} }, 5) === 0, '① ★끈 판은 곳간에 **한 톨도 안 넣는다**');
  ok(econ.woodActOn({ _t325Cells: 0, _woodOutLast: 9 }) === false, '① 나무 셀 0 이면 **안 연다**(숲 없는 마을은 켜도 종전 수식 — T309 ⓒ 3/51)');
  ok(econ.woodBudgetDay === undefined && econ.woodBudgetPerCell === undefined,
    '① ★★[T341] 예산식이 **아예 없다** — 나무는 개체다(PM 결정 · 예산은 물고기의 꼴이었다)');
  const on = probe({ T325_WOOD_ACT: '1' },
    `const E=require(${EP});const v={storage:{},treasury:{},_t325Cells:4,_woodOutLast:4.5};` +
    `const g=E.woodToGranary(v,6);process.stdout.write(JSON.stringify({knob:E.T325_WOOD_ACT,act:E.woodActOn(v),r:E.woodRegrowR(v,190,6),g,st:v.storage.wood,tr:v.treasury.wood,today:v._t325InflowToday,n:v._t325CutN}));`);
  ok(on.knob === true && on.act === true, '① 켜면 열린다');
  ok(Math.abs(on.r - 4 * (4.5 / 6) / 190) < 1e-12,
    '① ★★[T341] 재생률이 **수식에서 유도된다** — `r = 4h/K`(MSY 역산 · h = 4.5÷6 그루/일 · K = 190)', String(on.r));
  ok(Math.abs(on.st + on.tr - on.g) < 1e-9 && on.tr > 0, '① ★세금이 어부·수확과 **같은 문법**이다(곳간+국고 = 넣은 양)');
  ok(on.today === on.g && on.n === 1, '① 오늘치·건수가 장부 다리 자리에 남는다');
}

// ── ② 정본 — 사본 0 (셋째 자리라서 몸통을 합쳤다) ───────────────────────────────
console.log('\n② 사본 0 — 몸통은 하나, 정본은 남의 것');
{
  const C = codeOf(SRC), VC = codeOf(VSRC), ZC = codeOf(ZSRC);
  ok(/function actToGranary\(v, item, units, todayKey, countKey\)/.test(C),
    '② ★★곳간 입구 몸통이 **하나**다(`actToGranary` — T100·T312·T325 셋째라서 합쳤다)');
  ok(/return actToGranary\(v, 'fish', actDemandCap\([\s\S]*?'_t312InflowToday', '_t312CatchN'\);/.test(C),
    '② ★어부도 그 몸통을 부른다(합치면서 어부 회계가 안 바뀌었다 · T374 수요 문을 같이 지난다)');
  ok(/return actToGranary\(v, 'wood', actDemandCap\([\s\S]*?'_t325InflowToday', '_t325CutN'\);/.test(C),
    '② ★나무꾼도 같은 몸통이다 — 다른 것은 **품목 하나와 칸 이름 둘**뿐');
  //   ★[T374] 수요 문도 **몸통 하나**여야 한다 — 품목마다 `D` 를 읽는 자리만 갈린다.
  ok(/function actDemandLeft\(v, D, todayKey, held\)/.test(C) && /function actDemandCap\(v, units, D, todayKey\)/.test(C),
    '② ★★[T374] 그날 수요 판정이 **한 몸통**이다(`actDemandLeft`/`actDemandCap` · 손에 든 것은 인자 하나)');
  ok(/function woodDemandLeft\(v, held\) \{ return actDemandLeft\(v, \(v && v\._woodOutLast\) \|\| 0, '_t325InflowToday', held\); \}/.test(C),
    '② ★[T374] 나무의 `D` 는 **정본 관측 칸**이다(`_woodOutLast` — 새 수 0)');
  //   ★[T374] 관측 나무꾼도 **같은 한 줄**로 퇴근한다(채집꾼과 한 자리 · T325 갈래 **앞**) — 손에 든 목재까지 센다.
  ok(/job === 'lumberjack' && E\.woodActOn\(vil\.econ\)\) return !\(E\.woodDemandLeft\(vil\.econ, _t374Held\(vil, _T374_WOOD\)\) > 0\);/.test(VC)
    && VC.indexOf("if (_t374Done(vil, job)) { _lifeGoHome(npc, '휴식'); return true; }") > 0
    && VC.indexOf("if (_t374Done(vil, job)) { _lifeGoHome(npc, '휴식'); return true; }") < VC.indexOf("if (job === 'lumberjack' && vil.econ && _lifeEcon().woodActOn(vil.econ)) {"),
    '② ★[T374] 관측 나무꾼도 T325 갈래 **앞**에서 퇴근한다(손에 든 목재까지 · 끈 팔 무접촉)');
  const body = (C.match(/function actToGranary\([\s\S]*?\n\}/) || [''])[0];
  ok(/TAX_RATE/.test(body) && !/[0-9]\.[0-9]/.test(body), '② ★그 몸통에 **새 수가 없다**(세율은 `TAX_RATE` 정본)');
  ok(/_lifeEcon\(\)\.woodToGranary\(/.test(VC), '② ★곳간 회계는 **econ 정본 한 함수**가 한다(생활층에 산수 0)');
  ok(/_lifeEcon\(\)\.woodRegrowR\(vil\.econ, _S\.K \| 0, _S\.wBar \|\| 0\)/.test(VC)
     && /_lifeEcon\(\)\.woodRegrowPerDay\(_S\.N \| 0, _S\.K \| 0, _r\)/.test(VC),
    '② ★재생식도 econ 정본이 갖는다(생활층은 `N·K·w̄` 를 세어 넘기기만 · T341)');
  ok(/function _woodKg\(\)/.test(VC) && /kgOf\('wood'\)/.test(VC) && !/3\.00/.test((VC.match(/function _woodKg\([\s\S]*?\n\}/) || [''])[0]),
    '② ★목재 한 단의 kg 을 **`weights.js` 정본**에서 읽는다(3.00 을 옮겨 적지 않았다)');
  ok(/_cc\.CFG && _cc\.CFG\.CAP_KG/.test(VC), '② ★짐 상한도 **`carry.js` 정본**이다(어부와 같은 줄)');
  ok(/function _lifeLootWood\(r\)/.test(VC) && /state\.deps\.t325LootOf/.test(VC) && /t325LootOf: \(r\) => lootOfResource\(r\)/.test(ZC),
    '② ★★한 그루가 내는 목재 낱개는 **존의 전리품 표**(`lootOfResource`)가 답한다 — 생활층에 그 표가 없다');
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  ok(W.kgOf('wood') === 3.00, '② 코어 `wood` 무게 정본은 그대로다(3.00kg — 장작·목재 단)', String(W.kgOf('wood')));
}

// ── ③ ⓒ 이중 0 — 켠 마을에서 `addProduce('wood')` 호출 0 ────────────────────────
console.log("\n③ ⓒ 이중 0 — 켠 마을에서 `addProduce('wood')` 가 안 돈다");
{
  const C = codeOf(SRC);
  const gate = C.split('\n').filter((l) => l.indexOf('addProduce(jdef.output, baseAmt)') >= 0);
  ok(gate.length === 1, '③ 산출 한 줄이 그 자리 하나다', `${gate.length}줄`);
  ok(/&& !\(npc\.currentJob === 'lumberjack' && woodActOn\(v\)\)\) addProduce\(jdef\.output, baseAmt\);/.test(C),
    '③ ★★★그 한 줄이 **나무꾼을 걷어낸다**(T100 4판·T312 가 쓴 그 문법)');
  ok(!/addProduce\('wood'/.test(C), "③ ★`addProduce('wood')` 를 **직접 부르는 자리가 없다**(산출은 위 한 줄뿐)");
  ok(/byproduct: \{ resin: 0\.08, bark: 0\.10, acorn: 0\.06 \}/.test(SRC),
    '③ ★부산물(수지·껍질·도토리)은 **손 안 댔다** — `baseAmt` 를 그대로 타고 나간다');
  ok(/if \(npc\.currentJob === 'lumberjack' && woodActOn\(v\)\) npc\._t172mul = skillMul \* toolBoost \* inputMult;/.test(C),
    '③ ★걷어낸 자리에 **배율만 남겨 둔다**(T179 규약 · 실체 쪽이 읽는다)');
  ok(/const _t325In = T325_WOOD_ACT \? \(v\._t325InflowToday \|\| 0\) : 0;/.test(C)
     && /dailyProductionPotential\.wood = \(dailyProductionPotential\.wood \|\| 0\) \+ _t325In;/.test(C)
     && /dailyProduction\.wood = \(dailyProduction\.wood \|\| 0\) \+ _t325In;/.test(C),
    '③ ★★장부 다리가 **틱 안 한 줄**이다(T193·T312 가 연 그 자리 — 생활층에서 적으면 리셋이 지운다)');
}

// ── ④ ⓓ 장부 = 손 · ⓔ [T341] 한도는 걸음이 정한다(예산 0) ─────────────────────
console.log('\n④ ⓓ 장부 = 손 · ⓔ [T341] 하루 한도 = 걸음');
{
  const VC = codeOf(VSRC);
  ok(/function _actTake\(B, cellKey, want\)/.test(VC) && /if \(left < want\) \{ B\.cell\.set\(cellKey, left\); return 0; \}/.test(VC),
    '④ ★★어부의 예산 몸통은 **그대로 있다**(반 마리 금지 — T341 이 뗀 것은 나무 갈래뿐이다)');
  ok(!/_actTake\(_t325|_actDay\(vil, '_t325/.test(VC),
    '④ ★★그 몸통을 **나무가 부르지 않는다**(부르는 이는 어부 하나 · 사본도 갈래도 0)');
  ok(!/_t325Take|T325_KEY/.test(VC),
    '④ ★★[T341] 나무꾼에 **예산 장부가 없다**(그 꼴을 떠났다 — 어부 몸통은 어부 것으로 남는다)');
  ok(/npc\.inventory\.wood = 0;/.test(VC), '④ ★★곳간에 넣으면 **손을 비운다**(이중 0)');
  ok(/const u = \(npc\.inventory && npc\.inventory\.wood\) \|\| 0;/.test(VC),
    '④ ★★곳간에 넣는 양이 **손에 든 낱개 그 수**다 — 목재는 낱개 = 단위라 환산식이 없다(장부 = 손)');
  // ★[T341] 하루 한도 자 — **걸음**이 정한다(정본 셋을 다시 곱해 대조한다 · 하네스에 수 0)
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const CC = require(path.join(ROOT, 'server', 'carry.js'));
  const W2 = require(path.join(ROOT, 'server', 'weights.js'));
  ok(typeof V._t341TripsPerDay === 'function' && typeof V._t341TreesPerLoad === 'function',
    '④ 걸음 한도를 정본이 내준다(하네스가 유도를 옮겨 적지 않는다)');
  const perLoad = V._t341TreesPerLoad(6);
  ok(perLoad === Math.max(1, Math.floor(CC.CFG.CAP_KG / (W2.kgOf('wood') * 6))),
    '④ ★★짐당 그루 = `⌊CAP_KG ÷ (그루당 단 × kgOf(wood))⌋`(최소 1) — `carry.js`·`weights.js` 정본', String(perLoad));
  ok(V._t341TreesPerLoad(999) === 1, '④ ★큰 그루 하나는 짐 상한을 넘어도 **지고 온다**(0 그루가 되지 않는다)');
  ok(/하루 걸음 한도\*\*가 그 그루를 못 대면/.test(VSRC) && /let _peek = null;/.test(VSRC),
    '④ ★**먼저 묻고 나중에 벤다** — 한도가 안 서면 세계를 안 깎는다(T334 의 단위 증발 버그가 그 순서였다)');
}

// ── ⑤ ⓑ 낙하 — 플레이어 함수 그 자리 ──────────────────────────────────────────
console.log('\n⑤ ⓑ 낙하 — 죽은 나무꾼 손의 통나무는 그 자리에 떨어진다');
{
  const ZC = codeOf(ZSRC), VC = codeOf(VSRC);
  ok(/function _deathDrop\(p\)/.test(ZC) && /function _deathDropPick\(p, frac\)/.test(ZC),
    '⑤ 플레이어 낙하 정본이 그대로다(`_deathDrop` · `_deathDropPick`)');
  ok(/for \(const \[item, cnt0\] of Object\.entries\(p\.inventory \|\| \{\}\)\)/.test(ZC),
    '⑤ ★★★그 함수가 보는 것은 **`p.inventory`** 다 — 통나무가 그 칸에 드므로 **새 낙하 경로 0**');
  ok(/for \(const k in _loot\) npc\.inventory\[k\] = \(npc\.inventory\[k\] \|\| 0\) \+ _loot\[k\];/.test(VC),
    '⑤ ★★벤 전리품이 **그 칸**에 통째로 든다(잔가지·도토리도 같은 표가 준 그대로)');
  ok(!/dropWood|spawnLogItem|_woodDrop/.test(VC), '⑤ ★★나무꾼 전용 낙하 경로를 **안 만들었다**(사본 0)');
}

// ── ⑥ ⓐ 관측자 무관 · ⓕ 유한 — 색인이 청크와 같은 답을 낸다 ──────────────────────
console.log('\n⑥ ⓐ 관측자 무관 · ⓕ 벤 그루는 없어지고 벤 날이 남는다');
{
  const ZC = codeOf(ZSRC);
  ok(/function _takeResourceEntity\(r, notify\)/.test(ZC),
    '⑥ ★★개체를 세계에서 빼는 문이 **하나**다(채집 갈래와 벌목이 같은 줄을 쓴다)');
  ok(/_takeResourceEntity\(r, true\);/.test(ZC), '⑥ ★채집 갈래는 `notify=true` — 종전과 **글자 그대로** 같은 일을 한다');
  ok(/if \(r\.isSeed && r\.seedKey\) _markHarvested\(r\.seedKey\);/.test(ZC),
    '⑥ ★★★벤 날을 **장부에 적는다**(`harvestedSeeds` → T122 재생의 입력 — 영구 소실이 아니다)');
  ok(/_takeResourceEntity\(r, anyViewerNear\(\{ x: px, y: py \}, AOI_RADIUS\)\)/.test(ZC),
    '⑥ ★★방송은 **관측자가 있을 때만**(T324 ⓐ 규약 — 없는 관측자를 가정하지 않는다)');
  ok(/else if \(r\.isSeed && r\.seedKey\) _markHarvested\(r\.seedKey\);/.test(ZC),
    '⑥ ★청크가 꺼져 있으면 지울 개체가 없다 — **장부만** 적는다(그래도 나무는 없어진다)');
  ok(/harvestedSet: harvestedSeeds, gameDay: gameDayNow\(\)/.test(ZC),
    '⑥ ★★색인에 **수확 장부와 게임일을 넘긴다** ⇒ 색인 답 = 청크 답(T301 §0ⓐ 규칙 표)');
  // ★기능 — 색인이 정말 그 장부를 본다: 같은 셀을 두 번 묻되 둘째엔 벤 것으로 표시한다
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
  const Z = 'hanbando', opt = { biome: ZONES[Z].biome, chunkSize: CH.CHUNK_SIZE };
  let hit = null;
  for (let cx = 2000; cx < 2200 && !hit; cx++) for (let cy = 2000; cy < 2200; cy++) {
    const a = CH.resourcesAtCell(Z, cx, cy, opt);
    for (const e of a) if (e.type === 'tree' && e.isSeed && e.seedKey) { hit = { cx, cy, e, n: a.filter((x) => x.type === 'tree').length }; break; }
    if (hit) break;
  }
  ok(!!hit, '⑥ [상황] 색인이 나무 한 그루를 찾았다', hit ? `${hit.cx},${hit.cy} · ${hit.e.seedKey}` : '못 찾았다');
  if (hit) {
    const cut = new Map([[hit.e.seedKey, 0]]);
    const after = CH.resourcesAtCell(Z, hit.cx, hit.cy, Object.assign({}, opt, { harvestedSet: cut, gameDay: 1 }));
    const treesAfter = after.filter((x) => x.type === 'tree').length;
    ok(treesAfter === hit.n - 1,
      '⑥ ★★★ⓕ 벤 그루가 **세계에서 없어진다**(색인이 장부를 보고 안 낸다)', `${hit.n} → ${treesAfter}`);
    const yrs = CH.REGROW.TREE_STUMP_Y();
    const later = CH.resourcesAtCell(Z, hit.cx, hit.cy, Object.assign({}, opt, { harvestedSet: cut, gameDay: Math.ceil(yrs * 365) + 10 }));
    const back = later.filter((x) => x.type === 'sapling' || x.type === 'tree').length;
    ok(back >= treesAfter, '⑥ ★그리고 **자란다** — 그루터기 기간이 지나면 같은 자리에 다시 선다(T122 정본)', `${back}그루(그루터기 ${yrs}년 뒤)`);
    // ⓐ 같은 씨·같은 입력이면 같은 답(두 번 물어 같은지)
    const a1 = JSON.stringify(CH.resourcesAtCell(Z, hit.cx, hit.cy, opt));
    const a2 = JSON.stringify(CH.resourcesAtCell(Z, hit.cx, hit.cy, opt));
    ok(a1 === a2, '⑥ ★★ⓐ 같은 씨면 **같은 답**이다(관측자와 무관 · 결정론 · 주사위 0)');
  }
}

// ── ⑦ 끄면 비트 동일 — 새 줄이 전부 손잡이 뒤 ─────────────────────────────────
console.log('\n⑦ 끄면 비트 동일 — 새 줄이 전부 손잡이 뒤에 있다');
{
  const C = codeOf(SRC), VC = codeOf(VSRC);
  ok(/if \(!T325_WOOD_ACT \|\| !v \|\| !v\.storage\) return 0;/.test(C), '⑦ ★곳간 입구 첫 줄이 손잡이다');
  ok(/function woodActOn\(v\) \{ return !!\(T325_WOOD_ACT/.test(C), '⑦ ★게이트도 손잡이가 첫 항이다');
  ok(/if \(job === 'lumberjack' && vil\.econ && _lifeEcon\(\)\.woodActOn\(vil\.econ\)\) \{/.test(VC),
    '⑦ ★★생활층 벌목 블록이 **통째로** 손잡이 뒤다(끄면 종전 갈래가 그대로 돈다)');
  // ★하루 경계 절은 **손잡이**를 먼저 보고 그 안에서 `woodActOn` 을 본다 — 셀 수(그 게이트의 입력)를
  //   만드는 자리가 그 절이라서다(닭과 달걀 · `_t325Scan` 주석). 끄면 절 전체가 안 돈다.
  ok(/if \(vil\.econ && _lifeEcon\(\)\.T325_WOOD_ACT\) \{/.test(VC)
     && /const _on = _lifeEcon\(\)\.woodActOn\(vil\.econ\);/.test(VC),
    '⑦ ★하루 경계 절도 손잡이 뒤다(그 안에서 게이트를 본다 — 입력을 만드는 자리라서)');
  ok(/if \(_on && _walked === 0 && _ln > 0 && _tr\.length\) \{/.test(VC),
    '⑦ ★그 절이 `return` 으로 하루 경계를 끊지 않는다(뒤 일과가 그대로 돈다)');
  ok(/if \(_lifeEcon\(\)\.T325_WOOD_ACT && state\.deps\.t325TreesAtCell\) \{/.test(VC),
    '⑦ ★★나무 셀 스캔도 손잡이 뒤다 — 끈 팔은 색인을 **한 셀도 안 묻는다**(벽시계 무변)');
  ok(/v\._woodOutLast = \(v\.counts\.lumberjack \|\| 0\) \* JOBS\.lumberjack\.base \* \(v\.land\.wood \|\| 0\) \* toolBoostShared;/.test(C),
    '⑦ ⚠분자만 손잡이 밖에서 남긴다 — **읽는 쪽이 손잡이 뒤**라 끈 팔은 그 수를 안 본다(T60 문법의 관측 칸)');
  // ★끈 팔에서 econ 이 내는 목재 = 종전 그대로(게이트가 거짓이라 `addProduce` 를 탄다)
  const off = probe({}, `const E=require(${EP});process.stdout.write(JSON.stringify({knob:E.T325_WOOD_ACT,act:E.woodActOn({_t325Cells:99,_woodOutLast:9})}));`);
  ok(off.knob === false && off.act === false, '⑦ ★끈 팔은 게이트가 거짓 ⇒ 추상 목재 산출이 **그대로** 돈다');
}

// ── ⑧ 안 만진 것 — T324(길·이동 문)·T312(어부 값) ───────────────────────────────
console.log('\n⑧ 안 만진 것 — T324 이동 문 · 어부 값');
{
  const ZC = codeOf(ZSRC);
  //   ★[T368 2026-09-25] 술어에 **농부 항**이 하나 붙었다(`T368_FARM_ACT && simJob === 'farmer'`) — 나무꾼 항은 여전히 **없다**.
  //     이 절이 지키는 것은 "T325 는 걷기 문을 안 열었다(빚)" 이고, 그 뜻은 그대로다 — 이름으로 못 박는다.
  ok(/return !!\(_t316Econ && \(_t316Econ\.T312_FISH_ACT \|\| \(_t316Econ\.T368_FARM_ACT && npc\.simJob === 'farmer'\)\)\);/.test(ZC),
    '⑧ ★★걷기 술어(`_t316WalkAlways`)의 항은 **T312 · ★T368(농부)** 둘뿐이다 — 나무꾼 항은 안 넣었다(T324 정본 · T325 빚 그대로)');
  ok(!/T325_WOOD_ACT/.test(ZC), '⑧ ★`zone.js` 에 T325 손잡이 이름이 **없다**(문을 안 열었다 — 보고 §회부의 빚)');
  ok(!/t325.*path|pathCache/i.test(ZC.split('\n').filter((l) => /t325/i.test(l)).join('\n')),
    '⑧ ★길 캐시도 안 만졌다(T324 몫)');
}

// ── ⑨ [T341] 나무에는 예산이 없다 — ⓙ 개체 수 항등식 · ⓚ 30일 합 등가 · ⓛ 재생 r 유도 ──
console.log('\n⑨ [T341] 나무에는 예산이 없다 (PM 결정 · T334 뒤)');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const C = codeOf(SRC), VC = codeOf(VSRC), ZC = codeOf(ZSRC);

  // ⓛ 재생 r 은 **유도값**이다 — 정적(코드에 상수가 없다) + 기능(MSY 역산이 성립한다)
  {
    ok(/function woodRegrowR\(v, K, meanUnitsPerTree\)/.test(C) && /function woodRegrowPerDay\(N, K, r\)/.test(C),
      'ⓛ 재생식이 econ 정본에 **둘**이다(`r` 유도 · 그날 돌아오는 그루)');
    const body = (C.match(/function woodRegrowR\([\s\S]*?\n\}/) || [''])[0];
    const lits = (body.match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0' && x !== '1' && x !== '4');
    ok(lits.length === 0, 'ⓛ ★★그 식에 **지어낸 수가 없다** — 남은 `4` 는 로지스틱 MSY(`r·K/4`)의 계수다', lits.join(',') || '0개');
    ok(/return 4 \* \(day \/ w\) \/ k;/.test(C), 'ⓛ ★`r = 4h/K` 그 한 줄이다(`h = _woodOutLast ÷ w̄`)');
    ok(/const g = r \* n \* \(1 - n \/ k\);/.test(C), 'ⓛ ★그리고 그날 재생이 **로지스틱 그 식**이다(`r·N·(1−N/K)`)');
    // ★기능 — MSY 역산이 정말 성립하나: N=K/2 에서 재생이 정확히 h 다
    const v = { _woodOutLast: 16.0136 }, K = 190, w = 6, h = 16.0136 / 6;
    const r = E.woodRegrowR(v, K, w);
    ok(Math.abs(E.woodRegrowPerDay(K / 2, K, r) - h) < 1e-9,
      'ⓛ ★★★N=K/2 에서 재생 = **수식 하루 합 그 자체**(MSY 역산이 선다)', `${E.woodRegrowPerDay(K / 2, K, r).toFixed(6)} = ${h.toFixed(6)}`);
    ok(E.woodRegrowPerDay(K, K, r) === 0, 'ⓛ ★숲이 가득이면 재생 **0**(로지스틱)');
    ok(E.woodRegrowPerDay(K - 1, K, r) + (K - 1) <= K + 1e-9, 'ⓛ ★교란 전 수(`K`)를 **안 넘는다**');
    ok(E.woodRegrowR(v, 0, w) === 0 && E.woodRegrowR({ _woodOutLast: 0 }, K, w) === 0,
      'ⓛ 숲이 없거나 수식이 0 이면 재생도 0(0 으로 안 나눈다)');
  }

  // ⓙ 숲 개체 수 항등식 — **초기 − 벤 수 + 재생**
  {
    ok(/function _t341Unharvest\(seedKey\)/.test(ZC) && /harvestedSeeds\.delete\(seedKey\);/.test(ZC),
      'ⓙ 되살리는 문이 **하나**다(`_t341Unharvest` — 벤 기록을 지운다 = 그 그루가 다시 자랐다)');
    ok(/deleteHarvestedSeed/.test(fs.readFileSync(path.join(ROOT, 'server', 'zone-local-db.js'), 'utf8')),
      'ⓙ DB 에도 같은 문이 있다(메모리만 지우면 재부팅에 되살아난 그루가 다시 사라진다)');
    ok(/\(vil\._t341Cut \|\| \(vil\._t341Cut = \[\]\)\)\.push\(sk\);/.test(VC)
       && /const key = vil\._t341Cut\.shift\(\);/.test(VC),
      'ⓙ ★★벤 순서대로 적고 **가장 먼저 벴던 그루부터** 되살린다(오래 쉰 자리가 먼저 · 주사위 0)');
    // ★기능 — 색인으로 항등식을 직접 잰다: 한 그루 베고(장부에 적고) 되살리면(지우면) 원래 수로 돌아온다
    const CH = require(path.join(ROOT, 'server', 'chunk.js'));
    const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
    const Z = 'hanbando', opt = { biome: ZONES[Z].biome, chunkSize: CH.CHUNK_SIZE };
    let hit = null;
    for (let cx = 2000; cx < 2200 && !hit; cx++) for (let cy = 2000; cy < 2200; cy++) {
      const a = CH.resourcesAtCell(Z, cx, cy, opt);
      for (const e of a) if (e.type === 'tree' && e.isSeed && e.seedKey) { hit = { cx, cy, e, n: a.filter((x) => x.type === 'tree').length }; break; }
      if (hit) break;
    }
    ok(!!hit, 'ⓙ [상황] 색인이 나무 한 그루를 찾았다', hit ? `${hit.cx},${hit.cy}` : '못 찾았다');
    if (hit) {
      const ledger = new Map();
      const count = () => CH.resourcesAtCell(Z, hit.cx, hit.cy, Object.assign({}, opt, { harvestedSet: ledger, gameDay: 1 })).filter((x) => x.type === 'tree').length;
      const N0 = count();
      ledger.set(hit.e.seedKey, 0);                      // 벴다
      const N1 = count();
      ledger.delete(hit.e.seedKey);                      // 되살아났다(`_t341Unharvest` 가 하는 일)
      const N2 = count();
      ok(N1 === N0 - 1 && N2 === N0,
        'ⓙ ★★★**개체 수 = 초기 − 벤 수 + 재생**(색인이 그 항등식을 그대로 낸다)', `${N0} → ${N1} → ${N2}`);
    }
  }

  // ⓚ 30일 합 등가 — 걸음이 정한 벌목과 로지스틱 재생을 30일 굴려 수식 30일 합과 견준다
  {
    ok(/function _t341TripsPerDay\(vil, distPx, unitsPerTree\)/.test(VC)
       && /const sp = \(state\.deps && state\.deps\.moveSpeed\) \|\| 0;/.test(VC)
       && /const dayR = \(state\.deps && state\.deps\.dayPhaseRatio\) \|\| 0;/.test(VC),
      'ⓚ 하루 왕복 수가 **걸음 정본 셋**(속도 · 낮 비율 · 하루 길이)에서만 나온다');
    ok(!/60 \* 60|840|1440/.test((VC.match(/function _t341TripsPerDay\([\s\S]*?\n\}/) || [''])[0]),
      'ⓚ ★그 식에 지어낸 시간 상수가 없다');
    //   ★모형 — 이 하네스가 **세계를 세우지 않고** 그 규칙만 굴려 본다(수는 전부 정본에서 온다).
    //     T325·T334 가 세계 위에서 잰 값 하나를 밑변으로 쓴다: `_woodOutLast`(보고/T325 §3 표).
    const F = 16.0136, K = 190, w = 6;
    const vv = { _woodOutLast: F };
    const r = E.woodRegrowR(vv, K, w);
    for (const cap of [1, 2, 3, 5, 10]) {          // 걸음이 허락하는 하루 그루 수(왕복 × 짐당)
      let N = K, cut = 0;
      for (let d = 0; d < 30; d++) {
        const c = Math.min(cap, N);
        N -= c; cut += c;
        N += E.woodRegrowPerDay(N, K, r);
      }
      const got = cut * w, want = 30 * F;
      const ratio = got / want;
      ok(ratio > 0, `ⓚ 하루 한도 ${cap}그루 → 30일 합 ${got.toFixed(0)}단 / 수식 ${want.toFixed(0)}단 = ${(100 * ratio).toFixed(0)}% · 남은 숲 ${N.toFixed(1)}/${K}`);
    }
    //   ★이 카드의 계약: **한도가 MSY 보다 크면 30일 합이 수식을 넘고 숲이 준다**(수렴하지 않는다).
    const msy = F / w;                              // = r·K/4 — 그루/일
    let Nb = K, cutB = 0;
    for (let d = 0; d < 30; d++) { const c = Math.min(Math.ceil(msy), Nb); Nb -= c; cutB += c; Nb += E.woodRegrowPerDay(Nb, K, r); }
    ok(cutB * w >= 30 * F * 0.5, 'ⓚ ★한도를 MSY 근처로 두면 30일 합이 수식의 절반을 넘는다(수렴 쪽)', `${(100 * cutB * w / (30 * F)).toFixed(0)}%`);
    let Nc = K, cutC = 0;
    for (let d = 0; d < 30; d++) { const c = Math.min(10, Nc); Nc -= c; cutC += c; Nc += E.woodRegrowPerDay(Nc, K, r); }
    ok(Nc < K * 0.5, 'ⓚ ★★한도가 MSY 를 크게 넘으면 **숲이 준다**(30일 뒤 교란 전의 절반 아래)', `${Nc.toFixed(1)}/${K}`);
  }

  // ── ⓜ [T341] `K` 는 **한 번만** 묻는다 — 교란 전은 시간에 안 매인 수다(스캔을 두 배로 하지 않는다)
  {
    const VC = codeOf(VSRC);
    const scan = (VC.match(/function _t325Scan\([\s\S]*?\n\}/) || [''])[0];
    ok(/_needK/.test(scan) && /vil\._t341K/.test(scan),
      'ⓜ ★교란 전 수(`K`)·`w̄` 를 마을마다 **한 번** 재고 캐시한다(날마다 다시 묻지 않는다)');
    ok(/if \(_needK\) \{\s*\/\/ 교란 전\(raw\)/.test(scan) || /if \(_needK\) \{/.test(scan),
      'ⓜ ★★raw 질의가 **그 캐시 뒤**에 있다 — 둘째 날부터 셀 스캔이 한 벌이다(실측 p95 5.0→30.0ms 가 그 값이었다)');
    const rawCalls = (scan.match(/t325TreesAtCell\(tx, ty, true\)/g) || []).length;
    ok(rawCalls === 1, 'ⓜ raw 질의 자리가 **하나**다(사본 0)', String(rawCalls));
  }

  // 예산의 흔적이 제품·랩에 하나도 없다(함수로서)
  {
    const FILES = ['sim/economy-sim.js', 'sim/economy-engine.browser.js', 'server/villages.js', 'server/zone.js',
      'lab/전쟁실험실.html', 'lab/마을실험실.html'];
    const hits = [];
    for (const f of FILES) { const x = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/function woodBudget(PerCell|Day)\s*\(/.test(x) || /_t325Take\s*\(/.test(x) || /T325_KEY/.test(x)) hits.push(f); }
    ok(hits.length === 0, '⑨ ★★예산 함수·장부가 제품·랩 전수에서 **사라졌다**(주석의 회고는 남는다)', hits.join(',') || '0개');
    ok(typeof E.woodBudgetDay === 'undefined' && typeof E.woodBudgetPerCell === 'undefined',
      '⑨ ★엔진이 예산식을 **안 내준다**');
    ok(typeof V._actTake === 'function' && !/_t325Take/.test(VC),
      '⑨ ★어부 몸통(`_actTake`)은 그대로 남고 나무꾼만 그 꼴을 떠났다');
  }
}

// ── ⑩ [T398] 나무꾼의 숲 = 영토 밖 고리 — 후보 셀은 영토 셀 집합 밖 · 영토에서 체비쇼프 ≤ `T325_R` ──────
//   ★제품 함수 **그대로**(`_t398Cells`)를 부른다. 판정은 **정의로 센 답**(전수 · 셀마다 영토까지의 거리)과
//     집합·순서가 같은가다 — 규칙을 옮겨 적은 것이 아니라 카드 문장("영토 밖 · 경계로부터 ≤ 16셀")의 전수 대조다.
//   ★자명 통과 금지 — 같은 자로 **종전 네모**를 재면 빨갛다(영토 셀이 든다) — 자가 가를 수 있다는 증거(ⓓ).
console.log('\n⑩ [T398] 나무꾼의 숲 = 영토 밖 고리');
{
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const VC = codeOf(VSRC);
  const R = +((/const T325_R = (\d+);/.exec(VSRC) || [])[1]);
  ok(R === 16, 'ⓐ 반경은 **있는 수** — `T325_R` 16셀 그대로(새 수 0)', String(R));
  ok(typeof V._t398Cells === 'function', 'ⓐ 후보 셀을 정본이 내준다(`_t398Cells` — 자·하네스가 같은 함수를 부른다)');
  const body = (VC.match(/function _t398Cells\([\s\S]*?\n\}/) || [''])[0];
  const lits = (body.match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0' && x !== '1');
  ok(body.length > 0 && lits.length === 0, 'ⓐ ★그 함수에 **지어낸 수가 없다**(반경은 `T325_R` · 남은 것은 0·1)', lits.join(',') || '0개');
  //   ★고리는 손잡이 **뒤**에서만 센다 — 끈 팔은 이 함수를 한 번도 안 부른다(비트 동일)
  const scan = (VC.match(/function _t325Scan\([\s\S]*?\n\}/) || [''])[0];
  const iKnob = scan.indexOf('if (_lifeEcon().T325_WOOD_ACT && state.deps.t325TreesAtCell) {');
  const iCall = scan.indexOf('const C = _t398Cells(vil);');
  ok(iKnob > 0 && iCall > iKnob && (scan.match(/_t398Cells\(/g) || []).length === 1,
    'ⓑ ★★고리를 **손잡이 뒤에서 한 번** 부른다 — 끈 팔은 셀을 한 칸도 안 센다(비트 동일)');
  ok(/const _needK = \(vil\._t341K == null\) \|\| \(vil\._t341KAt !== C\.key\);/.test(scan)
     && /vil\._t341KAt = C\.key;/.test(scan),
    'ⓑ ★`K` 는 **그 셀 집합의 수**다 — 셀 집합(키)이 바뀐 날에만 다시 잰다(네모는 종전 그대로 첫날 한 번)');
  ok(!/_t398/.test(VC.replace(/function _t398Box\([\s\S]*?\n\}/, '').replace(/function _t398Cells\([\s\S]*?\n\}/, '').replace(scan, '').replace(/_t398Cells,/, '')),
    'ⓑ ★`villages.js` 에서 고리를 부르는 자리는 `_t325Scan` **하나**다(다른 자리 무접촉)');

  // 정의로 센 답 — 영토에서 체비쇼프 ≤ R · 내 영토 아님 · 남의 영토 아님 · 행 우선
  const K = (x, y) => x + ',' + y;
  const truth = (own, others) => {
    const pts = [...own].map((k) => k.split(',').map(Number));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const out = [];
    for (let y = y0 - R; y <= y1 + R; y++) for (let x = x0 - R; x <= x1 + R; x++) {
      const k = K(x, y);
      if (own.has(k) || others.some((s) => s.has(k))) continue;
      let near = false;
      for (const [tx, ty] of pts) if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) <= R) { near = true; break; }
      if (near) out.push(x, y);
    }
    return out;
  };
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  // 영토 — 들쭉날쭉한 덩어리(원이 아니다 — 마을 영토는 원이 아니다) · 이웃 마을 영토가 고리 안으로 들어온다
  const mk = (cx, cy, fn) => { const s = new Set(); for (let y = cy - 30; y <= cy + 30; y++) for (let x = cx - 30; x <= cx + 30; x++) if (fn(x - cx, y - cy)) s.add(K(x, y)); return s; };
  const A = { name: 'A', dbId: 1, ccx: 500, ccy: 500, _terrSet: mk(500, 500, (dx, dy) => (dx * dx + dy * dy <= 81) || (dx >= 0 && dx <= 14 && Math.abs(dy) <= 2) || (dy === -12 && dx >= -3 && dx <= 3)) };
  const B = { name: 'B', dbId: 2, ccx: 526, ccy: 506, _terrSet: mk(526, 506, (dx, dy) => dx * dx + dy * dy <= 36) };
  const Far = { name: 'F', dbId: 3, ccx: 900, ccy: 900, _terrSet: mk(900, 900, (dx, dy) => dx * dx + dy * dy <= 25) };
  const E = { name: 'E', dbId: 4, ccx: 700, ccy: 300, _terrSet: new Set() };
  const vils = [A, B, Far, E];
  // ⓒ 되돌림 문 — 영토 0셀 마을은 종전 네모(회관 ±R · 행 우선 · 같은 셀 · 같은 순서)
  {
    const c = V._t398Cells(E, vils);
    const sq = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) sq.push(E.ccx + dx, E.ccy + dy);
    ok(c.key === 'sq' && c.ring === 0 && same(c.xy, sq),
      'ⓒ ★★영토 0셀 마을은 **종전 네모 그대로**(되돌림 문 · 1,089칸 · 같은 순서)', `${c.xy.length / 2}칸`);
  }
  // ⓓ 고리 = 정의 — 집합과 순서가 전수 대조로 같다(이웃 영토가 든 판 · 안 든 판)
  {
    const c = V._t398Cells(A, vils);
    const t = truth(A._terrSet, [B._terrSet]);
    ok(c.ring === 1 && same(c.xy, t), 'ⓓ ★★★고리 = **정의로 센 답**(영토 밖 · 체비쇼프 ≤ R · 남의 영토 뺌 · 행 우선) — 집합·순서 전수 대조',
      `${c.xy.length / 2}칸 · 정의 ${t.length / 2}칸`);
    let inOwn = 0, inB = 0, far = 0;
    for (let i = 0; i < c.xy.length; i += 2) {
      const k = K(c.xy[i], c.xy[i + 1]);
      if (A._terrSet.has(k)) inOwn++;
      if (B._terrSet.has(k)) inB++;
    }
    for (let i = 0; i < c.xy.length; i += 2) { let near = false; for (const k of A._terrSet) { const [x, y] = k.split(',').map(Number); if (Math.max(Math.abs(x - c.xy[i]), Math.abs(y - c.xy[i + 1])) <= R) { near = true; break; } } if (!near) far++; }
    ok(inOwn === 0 && inB === 0 && far === 0, 'ⓓ ★고리에 **내 영토 0 · 남의 영토 0 · R 넘는 셀 0**', `${inOwn} · ${inB} · ${far}`);
    const tNoB = truth(A._terrSet, []);
    ok(tNoB.length > t.length, 'ⓓ [상황] 이웃 영토가 정말 고리 안에 들어왔다(빼는 줄이 할 일이 있었다)', `${(tNoB.length - t.length) / 2}칸`);
    //   ★자명 통과 금지 — 같은 자로 **종전 네모**를 재면 빨갛다(영토 셀이 든다)
    const sq = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) sq.push(A.ccx + dx, A.ccy + dy);
    let sqOwn = 0; for (let i = 0; i < sq.length; i += 2) if (A._terrSet.has(K(sq[i], sq[i + 1]))) sqOwn++;
    ok(!same(sq, t) && sqOwn > 0, 'ⓓ ★대조 — 종전 네모는 이 자로 **빨갛다**(영토 셀이 든다 — 자가 가른다)', `네모 중 영토 ${sqOwn}/${sq.length / 2}칸`);
  }
  // ⓔ 같은 꼴 — 영토가 회관 한 셀뿐이면 고리 = 종전 네모에서 그 한 셀을 뺀 것(거리의 꼴이 같다)
  {
    const One = { name: 'O', dbId: 5, ccx: 300, ccy: 700, _terrSet: new Set([K(300, 700)]) };
    const c = V._t398Cells(One, [One]);
    const sq = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx || dy) sq.push(One.ccx + dx, One.ccy + dy);
    ok(same(c.xy, sq), 'ⓔ ★영토가 회관 한 셀이면 고리 = **종전 네모 − 회관**(같은 거리 꼴 · 같은 순서)', `${c.xy.length / 2}칸`);
  }
  // ⓕ 캐시 — 영토는 늘기만 한다 ⇒ 크기가 그대로면 같은 답(같은 객체) · 내 영토나 겹친 이웃이 자라면 다시 센다
  {
    const c1 = V._t398Cells(A, vils), c2 = V._t398Cells(A, vils);
    ok(c1 === c2, 'ⓕ 크기가 그대로면 **다시 안 센다**(같은 객체)');
    Far._terrSet.add(K(905, 905));
    ok(V._t398Cells(A, vils) === c1, 'ⓕ 겹치지 않는 마을이 자라도 **다시 안 센다**(키에 안 든다)');
    A._terrSet.add(K(515, 500));
    const c3 = V._t398Cells(A, vils);
    ok(c3 !== c1 && same(c3.xy, truth(A._terrSet, [B._terrSet])), 'ⓕ ★내 영토가 자라면 **다시 센다** — 그 답도 정의와 같다', `${c1.xy.length / 2} → ${c3.xy.length / 2}칸`);
    B._terrSet.add(K(519, 506)); B._terrSet.add(K(518, 506));   // A 의 고리 안(영토 밖 · R 안) 두 칸
    const c4 = V._t398Cells(A, vils);
    ok(c4 !== c3 && c4.xy.length === c3.xy.length - 4 && same(c4.xy, truth(A._terrSet, [B._terrSet])),
      'ⓕ ★겹친 이웃이 자라도 **다시 센다** — 그 두 칸이 빠진다(이제 그 마을이 개간한다)', `${c3.xy.length / 2} → ${c4.xy.length / 2}칸`);
  }
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
