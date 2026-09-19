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
  // ★[T325 2026-09-19] 그 한 줄에 **나무꾼 절이 셋째로 붙었다.** 어부 절을 느슨하게 풀지 않는다 —
  //   절 하나를 그대로 요구하고(`fisher && fishActOn(v)`), 산출 호출이 그 절들 **뒤에** 있음도 같이 문다.
  ok(/&& !\(npc\.currentJob === 'fisher' && fishActOn\(v\)\)/.test(C.replace(/\s+/g, ' '))
     && /woodActOn\(v\)\)\) addProduce\(jdef\.output, baseAmt\)/.test(C.replace(/\s+/g, ' ')),
    '③ ★★★그 한 줄이 **어부를 걷어낸다**(T100 4판이 농부에게 한 그 문법) · ★[T325] 나무꾼 절이 그 뒤에 붙었다');
  ok(!/addProduce\('fish'/.test(C), "③ ★`addProduce('fish')` 를 **직접 부르는 자리가 없다**(산출은 위 한 줄뿐)");
  ok(/byproduct/.test(SRC) && /salmon: 0\.15/.test(SRC), '③ ★부산물(연어·새우·게·굴·미역·소금)은 **손 안 댔다** — 바다 계열 무변');
}

// ── ④ ⓓ 장부 = 손 · ⓔ 예산·이월 ────────────────────────────────────────────────
console.log('\n④ ⓓ 장부 = 손 · ⓔ 예산 소진 · 이월 0');
{
  const VC = codeOf(VSRC);
  // ★[T325 2026-09-19] 예산 장부의 몸통이 **하나로 합쳐졌다**(`_actDay`/`_actTake` — 어부·나무꾼 공용).
  //   규칙은 한 글자도 안 변했고 자리만 하나가 됐다 ⇒ 합친 몸통에서 그 규칙을 묻고,
  //   **두 직업이 그 몸통을 부른다**는 것까지 같이 문다(느슨하게 안 풀었다 · `actToGranary` 와 같은 결).
  ok(/if \(left < want\) \{ B\.cell\.set\(cellKey, left\); return 0; \}/.test(VC),
    '④ ★★예산이 모자라면 **한 마리도 안 잡힌다**(반 마리 금지 — 손과 장부가 갈리지 않는다)');
  ok(/function _t312Take\(vil, day, key, want\) \{ return _actTake\(_t312Day\(vil, day\), key, want\); \}/.test(VC)
     && /function _t325Take\(vil, day, key, want\) \{ return _actTake\(_t325Day\(vil, day\), key, want\); \}/.test(VC),
    '④ ★[T325] 어부와 나무꾼이 **같은 몸통**을 부른다(사본 0 — 규칙이 한쪽만 고쳐질 수 없다)');
  ok(/function _t312Day\(vil, day\) \{ return _actDay\(vil, '_t312', day, _lifeEcon\(\)\.fishBudgetPerCell\(vil\.econ\)\); \}/.test(VC),
    '④ ★그리고 어부의 **분모는 그대로** 강가 셀 예산식이다(합치면서 값이 안 바뀌었다)');
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

// ── ⑦ [T316 ①] 관측자 없는 마을도 걷는다 — 손잡이 하나 안에서 ────────────────────
//   캐논 ⓑ("관측자 없어도 실걸음")의 빚이었다. T312 는 켠 마을이라도 사람이 없으면
//   `_lifeHeadlessDay` 의 수식 칸으로 빠졌다 ⇒ 같은 씨인데 **관측자 유무로 어획이 갈렸다**.
//   고치는 자리는 **존 NPC 루프의 활성 셀 게이트 한 줄**이다(생활층에 어부 전용 분기 0).
console.log('\n⑦ [T316] 관측자 없는 마을도 걷는다');
{
  const Z = codeOf(ZSRC), V = codeOf(VSRC);
  ok(/function _t316WalkAlways\(npc\)/.test(Z), '⑦ 걷기 술어가 존에 **하나** 있다(`_t316WalkAlways`)');
  ok(/return !!\(_t316Econ && _t316Econ\.T312_FISH_ACT\)/.test(Z),
     '⑦ ★★그 술어의 첫 항이자 유일한 항이 **`T312_FISH_ACT`** 다 — 둘째 손잡이를 안 만들었다');
  ok(!/T316_[A-Z_]+/.test(Z + V + SRC), '⑦ ★레포 어디에도 `T316_*` 라는 **새 손잡이가 없다**');
  ok(/if \(!npc\.canadiaVillage && !_t316WalkAlways\(npc\) && !isPositionActive\(npc\.x, npc\.y\)\)/.test(Z),
     '⑦ ★★결정 게이트 **그 한 줄**에 끼워 넣었다(루프 사본 0 · 새 루프 0)');
  // ★★실측이 가르친 것 — 문이 **둘**이다. 결정만 열면 목표와 라벨은 찍히는데 몸이 안 간다
  //   (켠 팔 7 게임일: 걷는 어부 0 · 입고 0 · 틱만 8배). 이동 문까지 같은 술어로 열어야 한다.
  ok(/if \(!p\.canadiaVillage && !_t316WalkAlways\(p\) && !isPositionActive\(p\.x, p\.y\)\) continue; \/\/ dormant NPC skip/.test(ZSRC),
     '⑦ ★★**이동 문**(`movePlayerStep` 앞)도 같은 술어로 연다 — 결정만 열면 한 픽셀도 안 간다');
  ok((Z.match(/_t316WalkAlways\(/g) || []).length === 3,
     '⑦ 그 술어를 부르는 자리가 **둘**이다(정의 1 + 호출 2) — 셋째 문은 안 열었다',
     String((Z.match(/_t316WalkAlways\(/g) || []).length));
  ok(/if \(!npc \|\| !npc\.simVillageId\) return false;/.test(Z),
     '⑦ 마을 소속 NPC 만 해당된다(야생·도적 NPC 는 종전 그대로 — 범위가 마을이다)');
  ok(!/fish/i.test((V.match(/function _lifeHeadlessDay\(vil\)[\s\S]*?\n\}/) || [''])[0]),
     '⑦ ★★`_lifeHeadlessDay` 에 **어부 칸이 없다** — 걷는 몸 하나만 남았다(갈래 0)');
  // 끈 팔에서는 술어가 거짓이다 ⇒ 게이트가 종전과 **글자 그대로** 같은 판정을 한다
  const off = probe({}, `const E=require(${EP});process.stdout.write(JSON.stringify({knob:E.T312_FISH_ACT}));`);
  ok(off.knob === false, '⑦ ★끈 팔은 술어가 거짓 ⇒ 활성 셀 밖 마을은 **안 걷는다**(종전 비트 동일)');
}

// ── ⑧ [T316 ②] `_carry` 흡수 — 손은 하나다 ─────────────────────────────────────
//   `npc._carry` 는 품목 없는 칸 수였다 ⇒ 플레이어 낙하도 무게도 그 짐을 **못 봤다**.
//   같은 수를 `inventory.grain_sheaf` 로 옮기면 어부의 손과 농부의 손이 **한 꼴**이 된다.
//   ★행동 무변의 단위 증명은 `test-granary-haul ⑨`(칸 문턱 3 < kg 문턱 7)가 갖는다.
console.log('\n⑧ [T316] `_carry` 흡수 — 손은 하나다');
{
  const V = codeOf(VSRC), Z = codeOf(ZSRC);
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  const K = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(/const GRAIN_ITEM = 'grain_sheaf';/.test(V), '⑧ 볏단 품목 이름이 정본 한 자리다(`GRAIN_ITEM`)');
  ok(!/npc\._carry\b(?!On)/.test(V) && !/o\._carry\b(?!On)/.test(Z),
     '⑧ ★★생활층·존 어디에도 `_carry` **칸 필드를 읽는 자리가 없다**(흡수 완료 · 잔재 0)');
  ok(/function _handOf\(npc\) \{ return \(npc && npc\.inventory && npc\.inventory\[GRAIN_ITEM\]\) \|\| 0; \}/.test(V),
     '⑧ ★손을 읽는 함수가 하나다(`_handOf` — 수확·곳간·지게가 전부 이걸 부른다)');
  ok(/const cap = \(cc && cc\.CFG && cc\.CFG\.CAP_KG\) \|\| 0;/.test(V),
     '⑧ ★kg 상한을 **`carry.js` 정본**에서 읽는다(25 를 옮겨 적지 않았다 — 어부와 같은 문법)');
  // ★새 수 0 — 볏단 kg 을 **하네스가 다시 곱해** 표와 대조한다(표에 손으로 적은 수면 빨개진다)
  const kg = W.kgOfOrDefault('grain_sheaf');
  const derived = K.T100_K * W.kgOf('food');
  ok(Math.abs(kg - derived) < 1e-15,
     `⑧ ★★볏단 무게가 **유도값**이다 — T100_K × food = ${derived}`, `표 ${kg}`);
  ok(kg * 3 < (require(path.join(ROOT, 'server', 'carry.js')).CFG.CAP_KG),
     '⑧ ★수확 3칸(11.2kg)이 짐 상한 25kg 안이다 ⇒ **문턱이 안 바뀐다**(행동 무변의 근거)');
  // ⓑ 낙하 — 이제 볏단도 플레이어 낙하 정본이 **본다**(그게 흡수의 이유다)
  ok(/for \(const \[item, cnt0\] of Object\.entries\(p\.inventory \|\| \{\}\)\)/.test(Z),
     '⑧ ★★낙하 정본이 `inventory` 를 통째로 돈다 ⇒ 볏단도 **죽으면 그 자리에 떨어진다**(캐논 ⓐ 회수)');
  ok(/e\.carrier = o\.isNpc \? \(o\._carryOn \? 1 : 0\)/.test(Z) && /const on = _handOf\(npc\) > 0;/.test(V),
     '⑧ 지게 한 비트의 출처가 한 자리로 모였다(생활층이 깃발을 찍고 존은 타기만 한다)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
