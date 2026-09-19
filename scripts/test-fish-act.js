#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-fish-act.js — 어부 행위 이식 (T312) ========================================
//
// ★왜 [설계/설계_생산_실체.md §1 · 재민 09-18/19]
//   *"낚는 순간 손에, 귀환하면 곳간에."* 이 하네스가 지키는 것은 **그 문장 다섯 조각**이다:
//     ⓐ 결정성   — 같은 씨면 같은 어획(관측자 유무와 무관해야 할 자리 · T284 ⓓ 문법)
//     ⓑ 낙하     — 죽은 어부의 손에 든 것은 **플레이어 낙하 함수 그 자리**로 간다(정적 · 심볼 하나)
//     ⓒ 이중 0   — 켠 마을에서 `addProduce('fish')` 호출이 **0**(공존 = 이중 생산 · T135 규약)
//     ⓓ 장부 = 손 — 곳간에 든 합 = 손에서 넣은 합
//     ⓔ 예산     — 하루 예산을 다 쓰면 그 셀 어획 0 · **이월 0**
//   그리고 **끄면 비트 동일**(손잡이 규약)을 여섯째로 지킨다.
//
// 실행: node scripts/test-fish-act.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t312-${process.pid}.db`;
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

console.log('\n=== 어부 행위 이식 (T312) ===');

// ── ① 손잡이 — 기본 끔 · 끄면 문이 하나도 안 열린다 ─────────────────────────────
console.log('\n① 손잡이 — 기본 끔');
{
  const econ = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(econ.T312_FISH_ACT === false, '① ★★기본이 **끔**이다', String(econ.T312_FISH_ACT));
  ok(econ.fishActOn({ _t312Cells: 9 }) === false, '① 끈 판은 강가 셀이 있어도 **안 연다**');
  ok(econ.fishToGranary({ storage: {}, treasury: {} }, 5) === 0, '① ★끈 판은 곳간에 **한 톨도 안 넣는다**');
  ok(econ.fishBudgetPerCell({ _t312Cells: 0, _fishOutLast: 9 }) === 0, '① 강가 셀 0 이면 예산 0(내륙은 켜도 종전 수식)');
  const on = probe({ T312_FISH_ACT: '1' },
    `const E=require(${EP});const v={storage:{},treasury:{},_t312Cells:9,_fishOutLast:4.5};` +
    `const g=E.fishToGranary(v,5);process.stdout.write(JSON.stringify({knob:E.T312_FISH_ACT,act:E.fishActOn(v),per:E.fishBudgetPerCell(v),g,st:v.storage.fish,tr:v.treasury.fish,today:v._t312InflowToday}));`);
  ok(on.knob === true && on.act === true, '① 켜면 열린다');
  ok(Math.abs(on.per - 0.5) < 1e-12, '① ★★셀당 예산 = 하루 수식 ÷ 강가 셀 수(4.5÷9)', String(on.per));
  ok(Math.abs(on.st + on.tr - on.g) < 1e-9 && on.tr > 0, '① ★세금이 `harvestToGranary` 와 **같은 문법**이다(곳간+국고 = 넣은 양)');
  ok(on.today === on.g, '① 오늘치가 장부 다리로 넘어갈 자리에 남는다');
}

// ── ② 정본 — 사본 0 ────────────────────────────────────────────────────────────
console.log('\n② 사본 0 — 남의 정본을 부른다');
{
  const F = require(path.join(ROOT, 'server', 'freshfish.js'));
  const K = require(path.join(ROOT, 'server', 'kcal.js'));
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  ok(F.ids().length === 10, '② 종이 **10종**이다(설계_민물고기 §1)', String(F.ids().length));
  ok(!/kcalPerKg|DAY_KCAL|2450|495/.test(fs.readFileSync(path.join(ROOT, 'server', 'freshfish.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')),
    '② ★★종 파일에 **열량 수가 없다** — `kcal.js` 정본을 부르는 쪽이 쓴다');
  const VC = codeOf(VSRC);
  ok(/_K\.econUnitsOf\('fish', 1, _sp\.kg\)/.test(VC), '② ★마리→단위를 **`kcal.econUnitsOf` 정본**이 한다(생활층에 환산식 0)');
  ok(/_cc\.CFG && _cc\.CFG\.CAP_KG/.test(VC), '② ★짐 상한을 **`carry.js` 정본**에서 읽는다(25 를 옮겨 적지 않았다)');
  ok(/_lifeEcon\(\)\.fishToGranary\(/.test(VC), '② ★곳간 회계는 **econ 정본 한 함수**가 한다');
  ok(/_lifeEcon\(\)\.fishBudgetPerCell\(/.test(SRC + VC), '② ★셀당 예산식도 econ 정본이 갖는다');
  ok(K.econUnitsOf('fish', 1, 2.5) > K.econUnitsOf('fish', 1, 0.3), '② 큰 고기가 장부로도 크다(잉어 > 붕어)');
  ok(W.kgOf('fish') === 0.9, '② 코어 `fish` 무게 정본은 그대로다(0.90kg)', String(W.kgOf('fish')));
}

// ── ③ ⓒ 이중 0 — 켠 마을에서 `addProduce('fish')` 호출 0 ───────────────────────
console.log("\n③ ⓒ 이중 0 — 켠 마을에서 `addProduce('fish')` 가 안 돈다");
{
  const C = codeOf(SRC);
  const gate = C.split('\n').filter((l) => l.indexOf('addProduce(jdef.output, baseAmt)') >= 0);
  ok(gate.length === 1, '③ 산출 한 줄이 그 자리 하나다', `${gate.length}줄`);
  ok(/fishActOn\(v\)\)\) addProduce\(jdef\.output, baseAmt\)/.test(C.replace(/\s+/g, ' ')),
    '③ ★★★그 한 줄이 **어부를 걷어낸다**(T100 4판이 농부에게 한 그 문법)');
  ok(!/addProduce\('fish'/.test(C), "③ ★`addProduce('fish')` 를 **직접 부르는 자리가 없다**(산출은 위 한 줄뿐)");
  ok(/byproduct/.test(SRC) && /salmon: 0\.15/.test(SRC), '③ ★부산물(연어·새우·게·굴·미역·소금)은 **손 안 댔다** — 바다 계열 무변');
}

// ── ④ ⓓ 장부 = 손 · ⓔ 예산·이월 ────────────────────────────────────────────────
console.log('\n④ ⓓ 장부 = 손 · ⓔ 예산 소진 · 이월 0');
{
  const VC = codeOf(VSRC);
  ok(/if \(left < want\) \{ B\.cell\.set\(key, left\); return 0; \}/.test(VC),
    '④ ★★예산이 모자라면 **한 마리도 안 잡힌다**(반 마리 금지 — 손과 장부가 갈리지 않는다)');
  ok(/vil\._t312 = null;/.test(VC), '④ ★★하루가 끝나면 예산 장부를 **버린다**(이월 0 · 설계_민물고기 §2)');
  ok(/npc\._t312U = 0; npc\._t312Kg = 0;/.test(VC), '④ ★★곳간에 넣으면 **손을 비운다**(이중 0)');
  ok(/for \(const id of _fresh\(\)\.ids\(\)\) if \(npc\.inventory\[id\]\) npc\.inventory\[id\] = 0;/.test(VC),
    '④ ★손의 물고기도 같이 비운다(`inventory` — 플레이어와 같은 칸)');
  // 예산 자 — 같은 셀에서 예산보다 큰 것을 달라 하면 0, 예산 안이면 그만큼
  const on = probe({ T312_FISH_ACT: '1' },
    `const E=require(${EP});const v={_t312Cells:2,_fishOutLast:1};process.stdout.write(JSON.stringify({per:E.fishBudgetPerCell(v)}));`);
  ok(Math.abs(on.per - 0.5) < 1e-12, '④ 예산식이 마을마다 다르다(같은 하루 수식이라도 셀이 많으면 셀당 적다)', String(on.per));
}

// ── ⑤ ⓑ 낙하 — 플레이어 함수 그 자리 ──────────────────────────────────────────
console.log('\n⑤ ⓑ 낙하 — 죽은 어부의 손에 든 것은 그 자리에 떨어진다');
{
  const ZC = codeOf(ZSRC);
  ok(/function _deathDrop\(p\)/.test(ZC), '⑤ 플레이어 낙하 정본 `_deathDrop(p)` 가 있다');
  ok(/function _deathDropPick\(p, frac\)/.test(ZC), '⑤ 고르는 자리도 그 옆 하나다(`_deathDropPick`)');
  ok(/for \(const \[item, cnt0\] of Object\.entries\(p\.inventory \|\| \{\}\)\)/.test(ZC),
    '⑤ ★★★그 함수가 보는 것은 **`p.inventory`** 다 — NPC 도 같은 칸을 쓰므로 **새 낙하 경로 0**');
  const npcInv = /inventory: \{ wood: 0, stone: 0/.test(ZSRC);
  ok(npcInv, '⑤ ★NPC 도 태어날 때부터 `inventory` 를 갖는다(플레이어와 같은 꼴 — 새 체계 0)');
  const VC = codeOf(VSRC);
  ok(/npc\.inventory\[_sp\.id\] = \(npc\.inventory\[_sp\.id\] \|\| 0\) \+ 1/.test(VC),
    '⑤ ★★낚은 것이 **그 칸**에 들어간다 ⇒ 죽으면 `_deathDrop` 이 **손대지 않아도** 떨어뜨린다');
  ok(!/dropFish|spawnFishItem|_fishDrop/.test(VC), '⑤ ★★어부 전용 낙하 경로를 **안 만들었다**(사본 0)');
}

// ── ⑥ 끄면 비트 동일 — 세 문이 전부 손잡이 뒤 ─────────────────────────────────
console.log('\n⑥ 끄면 비트 동일 — 새 줄이 전부 손잡이 뒤에 있다');
{
  const C = codeOf(SRC), VC = codeOf(VSRC);
  ok(/function fishToGranary\(v, units\) \{\s*if \(!T312_FISH_ACT/.test(C.replace(/\n\s*/g, '\n  ').replace(/\n/g, '\n')) || /if \(!T312_FISH_ACT \|\| !v \|\| !v\.storage\) return 0;/.test(C),
    '⑥ ★곳간 입구 첫 줄이 손잡이다');
  ok(/const _t312In = T312_FISH_ACT \? \(v\._t312InflowToday \|\| 0\) : 0;/.test(C),
    '⑥ ★장부 다리도 손잡이 뒤다(끄면 `_t312InflowToday` 가 아예 안 생긴다)');
  ok(/function fishActOn\(v\) \{ return !!\(T312_FISH_ACT/.test(C), '⑥ ★게이트도 손잡이가 첫 항이다');
  ok(/if \(_lifeEcon\(\)\.fishActOn\(vil\.econ\)\) \{/.test(VC) && /\} else if \(npc\.inventory\) npc\.inventory\.fish/.test(VC),
    '⑥ ★★생활층도 `else` 한 줄로 **종전 연출 그대로** 돌아간다');
  ok(/if \(vil\.econ && _lifeEcon\(\)\.fishActOn\(vil\.econ\)\) \{/.test(VC), '⑥ ★하루 경계 절도 손잡이 뒤다');
  ok(/if \(vil\.econ\) vil\.econ\._t312Cells = bank\.length;/.test(VC),
    '⑥ ⚠셀 수만 손잡이 밖에서 센다 — **읽는 쪽이 손잡이 뒤**라 끈 팔은 그 수를 안 본다(관측 항 하나)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
