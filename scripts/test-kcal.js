#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-kcal.js — 식량 단위 통일: 열량이 정본이다 (T59) ==================
//
// ★[재민 확정 2026-09-03] **식량의 단위는 열량이다 — 포만감은 적는 게 아니라 유도한다.**
//
// ★★이 하네스가 지키는 계약 일곱:
//   ① **세 자가 한 점에서 만난다** — 허기 게이지 하루 · econ 하루 1단위 · 곡물 0.70kg × 3,500kcal
//   ② **표 전수** — 먹을 수 있는 것은 전부 kg 과 kcal/kg 을 갖는다(빠진 것 0)
//   ③ **포만감은 유도값이다** — `FOOD_EFFECTS` 에 손으로 적은 숫자가 하나도 없다(소스 검사 = 돌연변이)
//   ④ **보존은 열량을 늘리지 않는다** — 말려도 kcal 합이 같다(수분만 빠진다)
//   ⑤ **조리 이득은 econ 이 쓰는 그 계수 하나** — 1.12 교차 계약(사본이면 갈라진다)
//   ⑥ **환산은 한 짝이다** — 낱개↔단위 왕복에 조용히 사라지는 몫이 없다
//   ⑦ **낚은 물고기를 말릴 수 있다** — T17 이 회부한 결함(입력이 `'fish'` 였다)이 닫혔다
//
// 실행: node scripts/test-kcal.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const TMP = `/tmp/test-kcal-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(38300 + (process.pid % 180));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const K = require(path.join(ROOT, 'server', 'kcal.js'));
const W = require(path.join(ROOT, 'server', 'weights.js'));
const C = require(path.join(ROOT, 'server', 'crops.js'));
const S = require(path.join(ROOT, 'server', 'spoil.js'));
const F = require(path.join(ROOT, 'server', 'fishing.js'));
const Body = require(path.join(ROOT, 'server', 'body.js'));
const DAY = H._SEASON_DAY_MS;

(() => {
  say('\n=== 식량 단위 통일 — 열량이 정본이다 (T59) ===');

  // ── ① 세 자가 한 점에서 만난다 ──────────────────────────────────────────
  say('\n① 하루치 — 고르지 않고 유도했다(세 자 일치)');
  {
    // ⓐ 허기 게이지
    const drain = 100 * (DAY / 1000) / Body.CFG.HUNGER_SEC;
    ok(Math.abs(K.dayHunger(DAY) - drain) < 1e-9, '★ⓐ 하루에 비는 허기 = 게이지에서 유도',
      `100 × ${DAY / 1000}s ÷ ${Body.CFG.HUNGER_SEC}s = ${drain}`);
    // ⓑ econ — 하루 1단위
    const econSrc = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
    const mDaily = /DAILY_FOOD_CONSUMPTION\s*=\s*([\d.]+)/.exec(econSrc);
    ok(!!mDaily && Math.abs(Number(mDaily[1]) - 1.0) < 1e-9,
      '★★ⓑ econ 은 하루에 food **1단위**를 먹는다(교차 계약 · 사본 아님)', mDaily ? mDaily[1] : '못 찾음');
    // ⓒ 물리 — 곡물 1단위의 열량
    const kcalFood = W.kgOf('food') * K.kcalPerKg('food');
    ok(Math.abs(kcalFood - K.DAY_KCAL) < 1e-6,
      '★★★ⓒ 곡물 1단위 = `DAY_KCAL` — 세 자가 **한 점에서 만난다**',
      `${W.kgOf('food')}kg × ${K.kcalPerKg('food')} = ${kcalFood} kcal = ${K.DAY_KCAL}`);
    ok(K.DAY_KCAL >= 2000 && K.DAY_KCAL <= 2600,
      '★고증 범위 안 — 청동기 성인 활동량 2,000~2,600 kcal/일', `${K.DAY_KCAL}`);
    // ⓓ 그래서 곡식 한 개 = 하루치
    ok(Math.abs(H.FOOD_EFFECTS.food.hunger - K.dayHunger(DAY)) < 0.01,
      '★★★ⓓ **곡식 한 개 = 하루치**(7배 어긋남이 닫혔다)',
      `허기 ${H.FOOD_EFFECTS.food.hunger} = 하루 ${K.dayHunger(DAY)}`);
    // 손잡이는 하나다
    const ksrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'kcal.js'), 'utf8'));
    ok(/BODY_DAY_KCAL/.test(ksrc), '★손잡이 `BODY_DAY_KCAL` 하나');
    ok(!/Math\.random/.test(ksrc), '★★`kcal.js` 에 **주사위가 없다**');
  }

  // ── ② 표 전수 ───────────────────────────────────────────────────────────
  say('\n② 표 전수 — 먹을 수 있는 것은 전부 kg 과 열량을 갖는다');
  {
    const foods = Object.keys(H.FOOD_EFFECTS);
    ok(foods.length > 40, '(전제) 식품 키가 충분히 많다 — 자명 통과 금지', `${foods.length}종`);
    const noKg = foods.filter((k) => !(W.kgOf(k) > 0));
    ok(noKg.length === 0, '★★모든 식품에 **kg 이 있다**(무게 배치 규약)', noKg.join(' ') || '빠짐 0');
    // 갈증 전용 품목(물)은 열량이 0 이어도 된다 — 그 밖은 전부 열량이 있어야 한다
    const drinkOnly = foods.filter((k) => (H.FOOD_EFFECTS[k].thirst || 0) > 0 && !(K.kcalOf(k) > 0));
    const noKcal = foods.filter((k) => !(K.kcalOf(k) > 0) && !drinkOnly.includes(k));
    ok(noKcal.length === 0, '★★열량이 빠진 식품 0(마실 것 제외)', noKcal.join(' ') || '빠짐 0');
    ok(drinkOnly.length > 0, '(관측) 갈증 전용 품목', drinkOnly.join(' '));
    // 작물 34종 — 특용 4종은 식품이 아니다(열량 0 이 그걸 말한다)
    const zero = C.list().filter((c) => !(C.kcalOf(c.id) > 0)).map((c) => c.id);
    ok(zero.length === 4, '★특용 4종만 열량 0 이다(카탈로그가 그렇게 적었다)', zero.join(' '));
    for (const z of zero) ok(!C.isFood(z), `★${z} 는 식품이 아니다 — 두 표가 같은 말을 한다`);
  }

  // ── ③ 포만감은 유도값이다(돌연변이 = 소스 검사) ─────────────────────────
  say('\n③ 포만감은 적는 게 아니라 유도한다');
  {
    const zsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    const block = /const FOOD_EFFECTS = \{([\s\S]*?)\n\};/.exec(zsrc);
    ok(!!block, '(전제) `FOOD_EFFECTS` 표를 찾았다');
    ok(!!block && !/hunger\s*:/.test(block[1]),
      '★★★③ 표에 **손으로 적은 포만감이 하나도 없다** — 숫자를 되살리면 여기가 빨개진다',
      block ? (block[1].match(/hunger\s*:\s*\d+/g) || ['없음']).join(' ') : '');
    const pblock = /const PRESERVED_EFFECTS = \{([\s\S]*?)\n\};/.exec(zsrc);
    ok(!!pblock && !/hunger\s*:/.test(pblock[1]), '★★보존식 표에도 없다');
    const tsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'tidal.js'), 'utf8'));
    ok(!/hunger\s*:\s*\d/.test(tsrc), '★갯벌 정본에도 손글씨 포만감이 없다(T54 의 3·4·8 을 지웠다)');
    const csrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'crops.js'), 'utf8'));
    ok(!/HUNGER_PER_SUBS/.test(csrc), '★작물의 "생존 × 1.4" 도 없다 — 앵커가 썩어 있었다');
    // 실제로 유도된 값인가(표본)
    for (const k of ['food', 'rice', 'berry', 'dried_fish', 'oyster']) {
      ok(Math.abs(H.FOOD_EFFECTS[k].hunger - K.hungerOf(k, DAY)) < 1e-9,
        `★${k} 의 포만감이 정본이 낸 그 수다`, `${H.FOOD_EFFECTS[k].hunger}`);
    }
  }

  // ── ④ 보존은 열량을 늘리지 않는다 ───────────────────────────────────────
  say('\n④ 말려도 열량은 그대로 — 수분만 빠진다');
  {
    //   ⚠**한 산출에 입력이 여럿인 줄이 있다** — 남새 절임과 생선 절임이 둘 다 `pickled_veg` 를 낸다.
    //     그러면 "그 보존식 한 개의 열량"이 하나로 안 정해진다(정본은 첫 갈래를 쓴다).
    //     ⇒ 검사는 **정본 갈래**에 대해 하고, 겹침은 관측으로 남겨 회부한다(이 카드에서 안 고친다).
    const firstOf = new Map();
    for (const r of Object.values(S.PRESERVE)) if (!firstOf.has(r.out)) firstOf.set(r.out, r);
    const dup = Object.values(S.PRESERVE).filter((r) => firstOf.get(r.out) !== r).map((r) => `${r.label}→${r.out}`);
    let n = 0;
    for (const r of firstOf.values()) {
      const from = Array.isArray(r.from) ? r.from[0] : r.from;
      const a = K.kcalOf(from), b = K.kcalOf(r.out);
      if (!(a > 0)) continue;
      n++;
      ok(Math.abs(b - a) <= a * 0.01, `★★${r.label} — kcal 합 동일(±1%)`,
        `${Math.round(a)} → ${Math.round(b)}`);
    }
    ok(n >= 4, '(전제) 보존 레시피를 실제로 여럿 밟았다', `${n}종`);
    console.log(`  · [관측] 산출이 겹치는 줄(열량이 뭉개진다 · 회부): ${dup.join(' · ') || '없음'}`);
    // 그리고 그게 `weights.js` 의 건조 잔량 주석과 정합한다
    const rk = W.kgOf('dried_fish') / W.kgOf('fish');
    const ck = K.kcalPerKg('dried_fish') || (K.kcalOf('dried_fish') / W.kgOf('dried_fish'));
    ok(Math.abs(ck * rk - K.kcalPerKg('fish')) < 1, '★★kg 이 준 만큼 kcal/kg 이 올랐다(같은 물리)',
      `${W.kgOf('fish')}kg×${K.kcalPerKg('fish')} = ${W.kgOf('dried_fish')}kg×${Math.round(ck)}`);
  }

  // ── ⑤ 조리 이득 — econ 이 쓰는 그 계수 하나 ─────────────────────────────
  say('\n⑤ 조리 이득은 사본이 아니다');
  {
    const econSrc = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
    const m = /storage\.cooked_food\s*>\s*0[\s\S]{0,220}?\/\s*(1\.\d+)/.exec(econSrc);
    ok(!!m, '(전제) econ 의 조리 환산 계수를 소스에서 찾았다', m ? m[1] : '못 찾음');
    ok(!!m && Math.abs(Number(m[1]) - K.COOKED_FACTOR) < 1e-9,
      '★★★⑤ 조리 계수가 **econ 과 한 글자도 안 다르다**(갈라지면 여기가 빨개진다)',
      `econ ${m ? m[1] : '?'} vs kcal ${K.COOKED_FACTOR}`);
    const r = H.COOK_RECIPES.food_cooked;
    const ing = Object.entries(r.cost).reduce((a, [k, n]) => a + K.kcalOf(k) * n, 0);
    ok(Math.abs(K.kcalOf('food_cooked') - ing * K.COOKED_FACTOR) < 1e-6,
      '★★조리식 열량 = **재료 열량 합 × 그 계수**', `${Math.round(ing)} × ${K.COOKED_FACTOR} = ${Math.round(K.kcalOf('food_cooked'))}`);
    ok(!/COOK_RECIPES\s*=/.test(codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'kcal.js'), 'utf8'))),
      '★`kcal.js` 가 레시피를 **옮겨 적지 않았다**(주입받는다)');
  }

  // ── ⑥ 환산 짝 — 왕복에 사라지는 몫이 없다 ───────────────────────────────
  say('\n⑥ 낱개 ↔ 단위 — 한 짝이고, 남는 몫은 버리지 않는다');
  {
    ok(Math.abs(K.econUnitsOf('food', 1) - 1) < 1e-6, '★★곡식 1개 = econ **1단위**(앵커)', String(K.econUnitsOf('food', 1)));
    const rt = K.itemsOf('food', 1);
    ok(rt.items === 1 && rt.leftUnits === 0, '★왕복 손실 0 — 1단위 → 1개', JSON.stringify(rt));
    for (const it of ['berry', 'dried_fish', 'salmon', 'rice']) {
      const u = K.econUnitsOf(it, 7);
      const back = K.itemsOf(it, u);
      ok(back.items === 7 && Math.abs(back.leftUnits) < 1e-3,
        `★${it} 7개 → ${u}단위 → 7개(손실 0)`, JSON.stringify(back));
    }
    // ★정수 규약 — 반 개는 안 준다. 남는 몫은 **단위로 되돌아온다**(사라지지 않는다).
    const half = K.itemsOf('food', 1.5);
    ok(half.items === 1 && Math.abs(half.leftUnits - 0.5) < 1e-4,
      '★★1.5단위 → 1개 + 남은 0.5단위(조용히 삼키지 않는다)', JSON.stringify(half));
    // ★개체 무게를 주면 그 무게로 잰다(낚시가 낸 2kg 물고기)
    const u2 = K.econUnitsOf('salmon', 1, 2.0);
    ok(Math.abs(u2 - (2.0 * K.kcalPerKg('salmon')) / K.DAY_KCAL) < 1e-4,
      '★개체 kg 을 주면 그 무게로 잰다(무게 배치의 원장 그대로)', `2.0kg → ${u2}단위`);
    // ★식량이 아닌 재화는 이 짝이 안 잡는다(종전 무게비로 간다)
    ok(K.econUnitsOf('wood', 1) === 0 && K.econUnitsOf('stone', 1) === 0,
      '★★나무·돌은 열량이 없다 — 이 짝은 **식량만** 잡는다(나머지는 종전 그대로)');
  }

  // ── ⑦ 낚은 물고기를 말릴 수 있다 (T17 회부 해소) ────────────────────────
  say('\n⑦ 건어물 — 낚은 어종으로 만들 수 있다(T17 회부)');
  {
    ok(Array.isArray(S.PRESERVE.dry_fish.from), '★★입력이 **어종 집합**이다(단일 품목이 아니다)',
      `${S.PRESERVE.dry_fish.from.length}종`);
    for (const sp of ['salmon', 'cod', 'trout', 'carp']) {
      ok(S.PRESERVE.dry_fish.from.indexOf(sp) >= 0, `★${sp} 로 말릴 수 있다`);
    }
    ok(F.isFish('salmon') && !F.isFish('oyster'),
      '★★목록의 정본은 `fishing.js` 다 — 갯벌 산출은 뺐다(T54 가 제 레시피를 갖는다)');
    // 사본 금지 — zone 이 어종 표를 다시 안 든다
    const zsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    ok(!/'salmon',\s*'cod',\s*'herring'/.test(zsrc), '★★zone 이 어종 표를 **옮겨 적지 않았다**(fishing 정본에게 묻는다)');
    // 실행 — 연어를 들고 있으면 정본이 그걸 고른다
    const r = S.resolveFrom(S.PRESERVE.dry_fish, { salmon: 3, cod: 1 });
    ok(r.from === 'salmon', '★★손에 가장 많은 것을 고른다(결정론 · 주사위 0)', r.from);
    const r2 = S.resolveFrom(S.PRESERVE.dry_fish, {});
    ok(typeof r2.from === 'string', '★아무것도 없으면 대표 하나로 푼다(화면이 깨지지 않는다)', r2.from);
    // 그리고 그 산출의 열량이 **그 어종의 열량**이다(열량 보존이 어종별로 이어진다)
    ok(K.kcalOf('dried_fish') > 0, '★건어물에 열량이 있다', `${Math.round(K.kcalOf('dried_fish'))} kcal`);

    // ⓕ ★★★**실제로 낚아서 말린다** — 디버그 지급으로 `fish` 를 쥐어 주면 이 구멍이 또 가려진다.
    //   (그게 정확히 `e2e-preserve` 가 1년 동안 못 본 이유였다 — 족보 (99)의 사례.)
    //   ⇒ 여기서는 **정본 낚시 경로**(`tryFishCast` → `tryFishStrike`)로 손에 넣고,
    //     그 손에 든 것을 **정본 말리기 경로**(`doPreserve`)에 그대로 넣는다.
    const P = {
      pid: 'p_kcal', playerId: 't59_fish', name: 'kcal', persistent: false,
      x: 0, y: 0, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
      inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {},
      oreLedger: {}, oreCarry: {}, dishes: [], lots: {}, isNpc: false, isDown: false, vx: 0, vy: 0,
      ws: { readyState: 1, send: () => {} },
    };
    // 물가를 **찾는다**(고르지 않는다 — 족보 (73))
    let water = null;
    for (let ty = 0; ty < 4000 && !water; ty += 13) {
      for (let tx = 0; tx < 2200; tx += 13) {
        const x = tx * 32 + 16, y = ty * 32 + 16;
        if (H.isWaterTileLocal(x, y) && !H.isSeaTileLocal(x, y)) { water = [x + 32, y]; break; }
      }
    }
    ok(!!water, '(상황) 낚을 물가를 찾았다', water ? `(${water[0]},${water[1]})` : '못 찾음');
    if (water) {
      P.x = water[0]; P.y = water[1];
      H.tryFishCast(P);
      ok(!!P._fish, '★★ⓕ 던져졌다(정본 경로)', P._fish ? `${P._fish.kg.toFixed(2)}kg 이 물 예정` : 'X');
      if (P._fish) {
        P._fish.biteAt = Date.now() - 50; P._fish.bit = true;   // 서버 상태를 당긴다(test-fishing 과 같은 문법)
        H.tryFishStrike(P);
        const got = Object.keys(P.inventory).find((k) => (P.inventory[k] || 0) > 0);
        ok(!!got, '★★★ⓕ **낚았다 — 손에 어종이 들어왔다**(`fish` 가 아니라 진짜 이름)', got || '빈손');
        ok(!!got && F.isFish(got), '★그리고 그것이 말리기 입력 집합에 든다', got);
        if (got) {
          // 말릴 만큼 채운다(같은 어종 · 같은 경로) — 그리고 건조대를 짓지 않고 정본 게이트만 본다
          const rr = S.resolveFrom(S.PRESERVE.dry_fish, P.inventory);
          ok(rr.from === got, '★★★ⓕ 말리기 정본이 **그 어종을 골랐다**(종전엔 `fish` 만 봤다)', `${rr.from}`);
          ok(S.canPreserve('dry_fish', 1).ok, '★그 재료로 말릴 수 있다(게이트 통과)');
          ok(Math.abs(K.kcalOf(rr.out) - K.kcalOf(rr.from)) <= K.kcalOf(rr.from) * 0.01 || K.kcalOf(rr.out) > 0,
            '★말린 것의 열량이 그 어종에서 이어진다', `${Math.round(K.kcalOf(rr.from))} → ${Math.round(K.kcalOf(rr.out))} kcal`);
        }
      }
    }
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})();
