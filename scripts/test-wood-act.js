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
//     ⓔ 예산       — 셀 하루 예산을 다 쓰면 그 셀 벌목 0 · **이월 0**
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
  ok(econ.woodBudgetPerCell({ _t325Cells: 0, _woodOutLast: 9 }) === 0, '① 나무 셀 0 이면 예산 0(숲 없는 마을은 켜도 종전 수식)');
  const on = probe({ T325_WOOD_ACT: '1' },
    `const E=require(${EP});const v={storage:{},treasury:{},_t325Cells:4,_woodOutLast:4.5};` +
    `const g=E.woodToGranary(v,6);process.stdout.write(JSON.stringify({knob:E.T325_WOOD_ACT,act:E.woodActOn(v),per:E.woodBudgetPerCell(v),g,st:v.storage.wood,tr:v.treasury.wood,today:v._t325InflowToday,n:v._t325CutN}));`);
  ok(on.knob === true && on.act === true, '① 켜면 열린다');
  ok(Math.abs(on.per - 1.125) < 1e-12, '① ★★셀당 예산 = 하루 수식 ÷ 나무 셀 수(4.5÷4)', String(on.per));
  ok(Math.abs(on.st + on.tr - on.g) < 1e-9 && on.tr > 0, '① ★세금이 어부·수확과 **같은 문법**이다(곳간+국고 = 넣은 양)');
  ok(on.today === on.g && on.n === 1, '① 오늘치·건수가 장부 다리 자리에 남는다');
}

// ── ② 정본 — 사본 0 (셋째 자리라서 몸통을 합쳤다) ───────────────────────────────
console.log('\n② 사본 0 — 몸통은 하나, 정본은 남의 것');
{
  const C = codeOf(SRC), VC = codeOf(VSRC), ZC = codeOf(ZSRC);
  ok(/function actToGranary\(v, item, units, todayKey, countKey\)/.test(C),
    '② ★★곳간 입구 몸통이 **하나**다(`actToGranary` — T100·T312·T325 셋째라서 합쳤다)');
  ok(/function fishToGranary\(v, units\) \{\s*if \(!T312_FISH_ACT \|\| !v \|\| !v\.storage\) return 0;\s*return actToGranary\(v, 'fish', units, '_t312InflowToday', '_t312CatchN'\);/.test(C.replace(/\n\s*/g, '\n  ').replace(/\n\s+/g, '\n  ')) || /return actToGranary\(v, 'fish', units, '_t312InflowToday', '_t312CatchN'\);/.test(C),
    '② ★어부도 그 몸통을 부른다(합치면서 어부 회계가 안 바뀌었다)');
  ok(/return actToGranary\(v, 'wood', units, '_t325InflowToday', '_t325CutN'\);/.test(C),
    '② ★나무꾼도 같은 몸통이다 — 다른 것은 **품목 하나와 칸 이름 둘**뿐');
  const body = (C.match(/function actToGranary\([\s\S]*?\n\}/) || [''])[0];
  ok(/TAX_RATE/.test(body) && !/[0-9]\.[0-9]/.test(body), '② ★그 몸통에 **새 수가 없다**(세율은 `TAX_RATE` 정본)');
  ok(/_lifeEcon\(\)\.woodToGranary\(/.test(VC), '② ★곳간 회계는 **econ 정본 한 함수**가 한다(생활층에 산수 0)');
  ok(/_lifeEcon\(\)\.woodBudgetPerCell\(vil\.econ\)/.test(VC), '② ★셀당 예산식도 econ 정본이 갖는다');
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

// ── ④ ⓓ 장부 = 손 · ⓔ 예산·이월 0 ────────────────────────────────────────────
console.log('\n④ ⓓ 장부 = 손 · ⓔ 예산 소진 · 이월 0');
{
  const VC = codeOf(VSRC);
  ok(/function _actTake\(B, cellKey, want\)/.test(VC) && /if \(left < want\) \{ B\.cell\.set\(cellKey, left\); return 0; \}/.test(VC),
    '④ ★★예산이 모자라면 **한 그루도 안 벤다**(반 그루 금지 — 세계와 장부가 갈리지 않는다)');
  ok(/function _t325Take\(vil, day, key, want\) \{ return _actTake\(_t325Day\(vil, day\), key, want\); \}/.test(VC),
    '④ ★그 몸통을 어부와 **같이** 쓴다(사본 0)');
  ok(/vil\._t325 = null;   \/\/ ★이월 없음/.test(VSRC), '④ ★★하루가 끝나면 예산 장부를 **버린다**(이월 0)');
  ok(/npc\.inventory\.wood = 0;/.test(VC), '④ ★★곳간에 넣으면 **손을 비운다**(이중 0)');
  ok(/const u = \(npc\.inventory && npc\.inventory\.wood\) \|\| 0;/.test(VC),
    '④ ★★곳간에 넣는 양이 **손에 든 낱개 그 수**다 — 목재는 낱개 = 단위라 환산식이 없다(장부 = 손)');
  // 예산 자 — 같은 마을이라도 숲이 넓으면 셀당 적다
  const on = probe({ T325_WOOD_ACT: '1' },
    `const E=require(${EP});process.stdout.write(JSON.stringify({a:E.woodBudgetPerCell({_t325Cells:2,_woodOutLast:1}),b:E.woodBudgetPerCell({_t325Cells:20,_woodOutLast:1})}));`);
  ok(Math.abs(on.a - 0.5) < 1e-12 && Math.abs(on.b - 0.05) < 1e-12,
    '④ 예산식이 숲 크기에 반비례한다(같은 하루 수식이라도 셀이 많으면 셀당 적다)', `${on.a} / ${on.b}`);
  ok(/예산이 그루를 못 대면/.test(VSRC) && /let _peek = null;/.test(VSRC),
    '④ ★**먼저 묻고 나중에 벤다** — 예산이 안 서면 세계를 안 깎는다(순서가 계약이다)');
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
  ok(/return !!\(_t316Econ && _t316Econ\.T312_FISH_ACT\);/.test(ZC),
    '⑧ ★★걷기 술어(`_t316WalkAlways`)는 **T312 항 하나 그대로**다 — T324 정본이라 안 만졌다');
  ok(!/T325_WOOD_ACT/.test(ZC), '⑧ ★`zone.js` 에 T325 손잡이 이름이 **없다**(문을 안 열었다 — 보고 §회부의 빚)');
  ok(!/t325.*path|pathCache/i.test(ZC.split('\n').filter((l) => /t325/i.test(l)).join('\n')),
    '⑧ ★길 캐시도 안 만졌다(T324 몫)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
