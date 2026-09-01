#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-preserve.js — 부패 곡선 · 보존 가공 · 상함의 결과 (서버 직접) ====
//
// ★[재민 확정 2026-08-31] ① 로트 부패 곡선(취득일에서 유도) ② 보존 가공 3종 ③ 상한 음식의 결과.
//
// ★★**검사 상황 선행 assert**(레포 규약 — `test-valuechain ⑥` 이 자명한 상황을 골라 조용히
//   통과한 그 족보). 이 하네스는 매 항목마다 **"이 검사가 실제로 그 코드를 밟는가"** 를 먼저 못 박는다:
//     · 신선도를 재기 전에 **그 로트가 실제로 늙었는지**(ageDays > 0) 확인한다.
//     · 상함을 재기 전에 **정말 f=0 인지** 확인한다(시듦으로 상함을 검사하면 통과가 가짜다).
//     · 수율 차이를 재기 전에 **두 입력의 신선도가 실제로 다른지** 확인한다.
//
// ★★**픽스처 족보** — 이 하네스는 신선도를 **한 번도 직접 쓰지 않는다.**
//   `Lots.note(p, item, n, day)`(장부의 공개 API)로 **취득일만** 적고, 신선도는 전부 제품이 유도한다.
//   시간도 우회로 만지지 않는다: 게임일을 **길게**(VILLAGE_DAY_MS) 잡아 검사 중 날이 안 바뀌게 하고,
//   나이는 취득일을 과거로 적어서 만든다. ⇒ 검사값이 픽스처에서 새어 나올 길이 없다.
//   시간 손잡이는 **줄이기만** 한다(가공 소요일). 신선도·수율·가격에는 손대지 않는다.
//
// 실행: node scripts/test-preserve.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(36700 + (process.pid % 150));
process.env.DB_PATH = `/tmp/test-preserve-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
// ★게임일을 **길게** 잡는다 — 검사 도중 날이 바뀌면 결정론 검사가 자기 시계 때문에 흔들린다.
process.env.VILLAGE_DAY_MS = process.env.VILLAGE_DAY_MS || String(3600 * 1000);
// ★가공 소요는 **시간 손잡이만** 줄인다(test-craft 의 CRAFT_*_MS 선례와 같은 결).
//   0.0002일 × 3600초 = 720ms. 소요일→ms 환산 자체는 ①-e 에서 **기본값 그대로** 따로 검사한다.
process.env.PRESERVE_DAYS_DRY = process.env.PRESERVE_DAYS_DRY || '0.0002';
process.env.PRESERVE_DAYS_SMOKE = process.env.PRESERVE_DAYS_SMOKE || '0.0002';
process.env.PRESERVE_DAYS_PICKLE = process.env.PRESERVE_DAYS_PICKLE || '0.0002';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
const Lots = require(path.join(ROOT, 'server', 'lots.js'));
const Facility = require(path.join(ROOT, 'server', 'facility.js'));
const Weights = require(path.join(ROOT, 'server', 'weights.js'));
const Body = require(path.join(ROOT, 'server', 'body.js'));

function mkPlayer(name, inv) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'tp_' + name, name, persistent: false, ws,
    x: 5000, y: 5000, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100,
    hunger: 0, thirst: 100, inventory: Object.assign({}, inv),
    equipment: [], equipSlots: {}, craftSkill: {}, dishes: [], lots: {} };
  p._msgs = msgs;
  Body.ensure(p);
  return p;
}
const notes = (p) => p._msgs.filter((m) => m.type === 'notice').map((m) => m.text);
const lastNote = (p) => notes(p).slice(-1)[0] || '';
function fac(id, type, owner, x, y) {
  const b = { id, dbId: null, type, ownerId: owner, ownerName: owner, x: x || 5020, y: y || 5000, data: {} };
  H.buildings.set(id, b); return b;
}
// ★나이 있는 로트를 만든다 — **취득일만** 적는다(신선도는 제품이 유도한다).
function giveAged(p, item, n, ageDays) {
  const today = H.zoneGameDay();
  Lots.note(p, item, n, today - (ageDays | 0));
  p.inventory[item] = Math.floor(Lots.sum(p, item) + 1e-6);
}

(async () => {
  console.log('\n=== 부패 곡선 · 보존 가공 · 상함의 결과 ===');
  const DAY_MS = parseInt(process.env.VILLAGE_DAY_MS, 10);
  console.log(`  손잡이: 하루 ${DAY_MS}ms · 신선 문턱 ${Spoil.FRESH_AT} · 상함 부상 ${Spoil.SPOIL_INJURY} · 수율 바닥 ${Spoil.YIELD_FLOOR}`);
  console.log(`  보관일: 생선 ${Spoil.shelfOf('fish')} · 조리식 ${Spoil.shelfOf('fish_cooked')} · 채소 ${Spoil.shelfOf('vegetable')} · 건어물 ${Spoil.shelfOf('dried_fish')} · 곡물 ${Spoil.shelfOf('food')}`);

  // ═══ ① 부패 곡선 ════════════════════════════════════════════════════════
  console.log('\n① 곡선 — 결정론 · 연속 · 순서');

  // ⓐ 결정론: 같은 나이 = 같은 값. 주사위가 있으면 여기서 갈린다.
  {
    const vals = new Set();
    for (let i = 0; i < 200; i++) vals.add(Spoil.freshnessOf('fish', 1.3));
    pre(Spoil.freshnessOf('fish', 1.3) > 0 && Spoil.freshnessOf('fish', 1.3) < 1,
      '검사점이 곡선 **중간**이다(0도 1도 아님 — 클램프 평지에서 재면 가짜 통과)', Spoil.freshnessOf('fish', 1.3));
    ok(vals.size === 1, '★★①ⓐ 결정론 — 같은 나이·같은 품목이면 200회 전부 같은 값(주사위 없음)', `서로 다른 값 ${vals.size}개`);
  }
  // ⓑ 연속성: 절벽 없음. 인접 표본의 차이가 이론 기울기를 넘지 않는다.
  {
    const L = Spoil.shelfOf('fish'), step = L / 400;
    let worst = 0, at = 0;
    for (let a = 0; a <= L * 1.5; a += step) {
      const d = Math.abs(Spoil.freshnessOf('fish', a + step) - Spoil.freshnessOf('fish', a));
      if (d > worst) { worst = d; at = a; }
    }
    const bound = step / L * 1.0001;
    pre(worst > 0, '표본 구간에서 값이 **실제로 움직인다**(안 움직이면 연속성 검사가 무의미)', worst.toFixed(6));
    ok(worst <= bound, '★★①ⓑ 연속 — 인접 표본 최대 낙차가 이론 기울기 이내(절벽 0)',
      `최대 Δ ${worst.toExponential(3)} @나이 ${at.toFixed(3)} ≤ ${bound.toExponential(3)}`);
  }
  // ⓒ 단조 감소 + 유계
  {
    let mono = true, bounded = true, prev = 1;
    for (let a = 0; a <= 400; a += 0.25) {
      const f = Spoil.freshnessOf('food', a);
      if (f > prev + 1e-9) mono = false;
      if (f < 0 || f > 1) bounded = false;
      prev = f;
    }
    ok(mono && bounded, '★①ⓒ 단조 감소 · [0,1] 유계 — 되돌아오지 않는다', `단조 ${mono} · 유계 ${bounded}`);
  }
  // ⓓ 품목별 순서 — 지시서가 못 박은 것. 기준은 `spoil.orderCheck` 정본이 낸다(여기서 다시 안 적는다).
  {
    const rows = Spoil.orderCheck();
    const allOk = rows.every((r) => r.ok);
    ok(allOk, '★★①ⓓ 곡선 순서 — 생선 < 조리식 < 채소 < 보존식 < 곡물',
      rows.map((r) => `${r.pair}(${r.a}<${r.b})`).join(' · '));
  }
  // ⓔ 소요일 → ms 환산은 **기본값 그대로** 확인한다(위에서 env 로 줄인 건 dry/smoke/pickle 값뿐).
  {
    const got = Spoil.preserveMs('dry_fish', DAY_MS);
    const want = Spoil.PRESERVE.dry_fish.days * DAY_MS;
    ok(Math.abs(got - want) < 1, '★①ⓔ 가공 시간 = 소요일 × 하루 길이(새 시계 없음 — 하루는 주입받는다)', `${got}ms`);
    ok(Spoil.preserveMs('dry_fish', 24 * 60 * 1000) === Math.round(Spoil.PRESERVE.dry_fish.days * 24 * 60 * 1000),
      '★①ⓔ 하루 길이가 바뀌면 가공 시간도 따라 바뀐다(상수 박제 아님)');
  }
  // ⓕ 3단계 — 겉은 계단, 속은 연속
  {
    const L = Spoil.shelfOf('fish');
    const a1 = L * (1 - Spoil.FRESH_AT) * 0.5, a2 = L * (1 - Spoil.FRESH_AT) + L * 0.1, a3 = L + 0.5;
    pre(Spoil.freshnessOf('fish', a1) > Spoil.FRESH_AT && Spoil.freshnessOf('fish', a3) === 0,
      '세 표본이 세 단계에 실제로 떨어진다', `${Spoil.freshnessOf('fish', a1)} / ${Spoil.freshnessOf('fish', a2)} / ${Spoil.freshnessOf('fish', a3)}`);
    ok(Spoil.stageOfAge('fish', a1) === 'fresh' && Spoil.stageOfAge('fish', a2) === 'wilt' && Spoil.stageOfAge('fish', a3) === 'spoiled',
      '★①ⓕ 표시 3단계 — 신선 / 시듦 / 상함');
    ok(Spoil.stageOfAge('fish', Spoil.shelfOf('fish')) === 'spoiled',
      '★①ⓕ **보관일에 닿는 날이 곧 상하는 날**(문턱이 두 개가 아니다)');
  }

  // ═══ ② 먹기 — 회복 비례 · 상함 = 확정 탈 ═════════════════════════════════
  console.log('\n② 먹기 — 회복은 신선도에 비례 · 상함은 확정 탈');
  {
    const fresh = mkPlayer('fresh', {}); giveAged(fresh, 'fish_cooked', 4, 0);
    const wilt  = mkPlayer('wilt',  {}); giveAged(wilt,  'fish_cooked', 4, Math.ceil(Spoil.shelfOf('fish_cooked') * 0.8));
    const fF = Spoil.freshnessOf('fish_cooked', 0);
    const fW = Spoil.freshnessOf('fish_cooked', Math.ceil(Spoil.shelfOf('fish_cooked') * 0.8));
    pre(fF === 1 && fW > 0 && fW < 1, '한쪽은 갓 얻은 것, 한쪽은 **시든**(상하지 않은) 것', `${fF} vs ${fW}`);
    fresh.hunger = 0; wilt.hunger = 0;
    H.doEat(fresh, 'fish_cooked', 1); H.doEat(wilt, 'fish_cooked', 1);
    const eff = H.FOOD_EFFECTS.fish_cooked.hunger;
    ok(Math.abs(fresh.hunger - eff) < 1e-6, '★②ⓐ 신선한 것은 표값을 그대로 준다', `${fresh.hunger} = ${eff}`);
    ok(Math.abs(wilt.hunger - eff * fW) < 1e-6, '★★②ⓐ 시든 것은 **신선도에 정확히 비례**해 준다', `${wilt.hunger.toFixed(4)} = ${eff}×${fW}`);
    ok(wilt.hunger < fresh.hunger, '★②ⓐ 그래서 시든 게 덜 찬다', `${wilt.hunger.toFixed(2)} < ${fresh.hunger}`);
  }
  // 부분 섭취 — 0.25단위는 0.25배(무게 배치의 규약이 신선도와 곱해져도 살아 있나)
  {
    const p = mkPlayer('part', {}); giveAged(p, 'fish_cooked', 4, 0);
    p.hunger = 0; H.doEat(p, 'fish_cooked', 0.25);
    ok(Math.abs(p.hunger - H.FOOD_EFFECTS.fish_cooked.hunger * 0.25) < 1e-6,
      '★②ⓑ 부분 섭취 × 신선도 — 두 배율이 같이 곱해진다', p.hunger.toFixed(4));
  }
  // ★★상함 = 회복 0 + 확정 탈. 확률 모델이면 20회 중 흔들린다.
  //   ⚠1차 실행이 여기서 **가짜로 실패**했다: 검사 품목으로 생선(`fish`)을 골랐는데
  //     **날생선은 먹을 수 있는 물건이 아니다**(FOOD_EFFECTS 에 없다 — 구운 생선만 있다).
  //     `doEat` 이 첫 줄에서 되돌아가니 허기도 부상도 0 이었고, 그건 "탈이 안 난다"가 아니라
  //     **아무 일도 안 일어났다**였다. ⇒ 아래 선행 assert 가 그 자리를 막는다.
  const SPOIL_ITEM = 'berry';   // 먹을 수 있고, 로트고, hpDelta 가 없는 품목
  {
    pre(!!H.FOOD_EFFECTS[SPOIL_ITEM] && Lots.isLot(SPOIL_ITEM),
      '검사 품목이 **실제로 먹을 수 있고** 로트다(못 먹는 걸 고르면 doEat 이 첫 줄에서 되돌아간다)',
      `${SPOIL_ITEM} · 효과 ${JSON.stringify(H.FOOD_EFFECTS[SPOIL_ITEM])}`);
    pre(!H.FOOD_EFFECTS[SPOIL_ITEM].hpDelta, '그리고 hpDelta 가 없다(HP 불감소 검사가 오염되지 않게)');
    const age = Math.ceil(Spoil.shelfOf(SPOIL_ITEM)) + 2;
    pre(Spoil.freshnessOf(SPOIL_ITEM, age) === 0, '검사 표본이 **정말 상함**이다(시듦으로 상함을 재면 가짜)', `f=${Spoil.freshnessOf(SPOIL_ITEM, age)}`);
    const inj = [], hun = [];
    for (let i = 0; i < 20; i++) {
      const p = mkPlayer('bad' + i, {});
      giveAged(p, SPOIL_ITEM, 3, age);
      p.hunger = 0; Body.ensure(p).injury = 0;
      H.doEat(p, SPOIL_ITEM, 1);
      if (i === 0) pre(/섭취/.test(lastNote(p)), '★그리고 **실제로 먹었다**(행동의 성사를 독립적으로 센다)', lastNote(p).slice(0, 40));
      hun.push(+p.hunger.toFixed(6)); inj.push(+Body.ensure(p).injury.toFixed(6));
    }
    ok(hun.every((h) => h === 0), '★★②ⓒ 상한 걸 먹으면 **회복 0**', `허기 ${hun[0]}`);
    ok(new Set(inj).size === 1 && inj[0] > 0,
      '★★②ⓒ 그리고 **확정적으로** 탈이 난다 — 20회 전부 같은 값(확률 0/100 아님)', `부상 +${inj[0]} ×20회`);
    ok(Math.abs(inj[0] - Spoil.SPOIL_INJURY) < 1e-6, '★②ⓒ 탈의 크기 = SPOIL_INJURY(한 단위 기준)', `${inj[0]}`);
  }
  // 탈은 **부상 축**이다 — 새 축도, HP 감소도 없다(아사 폐지 캐논과 같은 결).
  {
    const p = mkPlayer('axis', {}); giveAged(p, SPOIL_ITEM, 2, Math.ceil(Spoil.shelfOf(SPOIL_ITEM)) + 3);
    const hp0 = p.hp; const before = Body.ensure(p).injury;
    H.doEat(p, SPOIL_ITEM, 1);
    const b = Body.ensure(p);
    ok(p.hp === hp0, '★★②ⓓ **HP 는 안 깎인다** — 탈은 부상 축으로만 온다', `HP ${hp0}→${p.hp}`);
    ok(b.injury > before, '★②ⓓ 부상 축이 오른다(새 축 없음)', `${before}→${b.injury.toFixed(4)}`);
    ok(Body.effects(p).moveMult < 1, '★②ⓓ 그래서 **걸음이 느려진다**(기존 부상 곡선 그대로)', String(Body.effects(p).moveMult));
    ok(/탈이 났다/.test(lastNote(p)), '★②ⓓ 그리고 화면이 그렇게 말한다', lastNote(p).slice(0, 50));
  }
  // 반쯤 상한 묶음 — 신선한 몫에서만 회복, 상한 몫에서만 탈(평균으로 뭉개지 않는다)
  {
    const p = mkPlayer('mix', {});
    giveAged(p, 'fish_cooked', 1, Math.ceil(Spoil.shelfOf('fish_cooked')) + 1);   // 상함(먼저 나간다 — FIFO)
    giveAged(p, 'fish_cooked', 1, 0);                                              // 신선
    pre(Lots.of(p, 'fish_cooked').length === 2, '로트가 **둘로 갈려** 있다(병합 금지가 지켜졌나)', Lots.of(p, 'fish_cooked').length);
    p.hunger = 0; Body.ensure(p).injury = 0;
    H.doEat(p, 'fish_cooked', 2);
    const b = Body.ensure(p);
    ok(p.hunger > 0 && p.hunger < H.FOOD_EFFECTS.fish_cooked.hunger * 2,
      '★★②ⓔ 섞어 먹으면 **신선한 몫만큼만** 찬다', p.hunger.toFixed(3));
    ok(b.injury > 0 && Math.abs(b.injury - Spoil.illnessFor(1)) < 1e-6,
      '★★②ⓔ 그리고 탈은 **상한 몫만큼만** 난다(평균으로 뭉개지 않는다)', b.injury.toFixed(4));
  }

  // ═══ ③ 보존 가공 ════════════════════════════════════════════════════════
  console.log('\n③ 가공 — 입력 차감 → 대기열 → 산출 새 로트(시계 리셋)');
  {
    const p = mkPlayer('dry', {}); giveAged(p, 'fish', 6, 0);
    // 시설 게이트 — 건조대 없이는 안 된다
    p._msgs.length = 0; H.doPreserve(p, 'dry_fish', 3);
    ok(Math.floor(Lots.sum(p, 'fish')) === 6 && /건조대/.test(lastNote(p)),
      '★★③ⓐ 시설 게이트 — 건조대가 없으면 **재료도 안 준다**', `생선 ${Lots.sum(p, 'fish')} · ${lastNote(p).slice(0, 30)}`);
    const rack = fac('dr1', 'drying_rack', p.playerId);
    p._msgs.length = 0; H.doPreserve(p, 'dry_fish', 3);
    ok(Math.floor(Lots.sum(p, 'fish')) === 3, '★③ⓑ 건조대 앞에서는 입력이 나간다', `생선 ${Lots.sum(p, 'fish')}`);
    ok(!p.inventory.dried_fish, '★★③ⓑ 그리고 **즉석이 아니다** — 아직 손에 없다', String(p.inventory.dried_fish));
    const q = Facility.view(rack, Date.now());
    ok(q.length === 1 && q[0].leftMs > 0, '★③ⓑ 대기열에 걸렸다(오프라인에도 진행된다)', `${q[0].label} · ${q[0].leftMs}ms`);
    await sleep(Spoil.preserveMs('dry_fish', DAY_MS) + 250);
    p._msgs.length = 0; H.doCraftCollect(p, 'dr1');
    ok((p.inventory.dried_fish || 0) === 3, '★★③ⓒ 다 마르면 받는다 — 건어물 3', String(p.inventory.dried_fish));
    const dl = Lots.of(p, 'dried_fish');
    ok(dl.length === 1, '★③ⓒ 산출이 **로트로** 적혔다(보존식도 로트다)', `로트 ${dl.length}개`);
    ok(Spoil.freshnessOf('dried_fish', H.zoneGameDay() - dl[0].d) === 1,
      '★★③ⓒ **부패 시계가 리셋됐다** — 갓 만든 건어물의 신선도 1', String(Spoil.freshnessOf('dried_fish', H.zoneGameDay() - dl[0].d)));
    ok(Spoil.shelfOf('dried_fish') > Spoil.shelfOf('fish') * 10,
      '★★③ⓒ 그리고 **훨씬 오래 간다** — 그게 보존이다', `${Spoil.shelfOf('dried_fish')}일 vs ${Spoil.shelfOf('fish')}일`);
  }
  // 취득일 = **완성일**(수령일이 아니다) — 건조대가 정지 상자가 되지 않는다
  {
    const today = H.zoneGameDay();
    ok(H._gameDayAt(Date.now() - 3 * DAY_MS) === today - 3,
      '★★③ⓓ 완성일 환산 — 사흘 전에 끝난 것은 **사흘 된 것**으로 적힌다(정지 상자 금지)',
      `${H._gameDayAt(Date.now() - 3 * DAY_MS)} = ${today - 3}`);
  }
  // ★입력 신선도 → 산출 수율. 재료 선택이 판단이 된다.
  {
    const rack2 = fac('dr2', 'drying_rack', 'tp_y1', 5020, 5000);
    const a = mkPlayer('y1', {}); giveAged(a, 'fish', 8, 0);
    const b = mkPlayer('y2', {}); giveAged(b, 'fish', 8, Math.max(1, Math.floor(Spoil.shelfOf('fish') * 0.9)));
    rack2.ownerId = a.playerId; rack2.ownerName = a.playerId;
    const fA = Spoil.freshnessOf('fish', 0), fB = Spoil.freshnessOf('fish', Math.max(1, Math.floor(Spoil.shelfOf('fish') * 0.9)));
    pre(fA > fB && fB > 0, '두 입력의 신선도가 **실제로 다르다**(둘 다 같으면 수율 검사가 무의미)', `${fA} vs ${fB}`);
    H.doPreserve(a, 'dry_fish', 8);
    const jA = Facility.view(rack2, Date.now()).slice(-1)[0];
    rack2.ownerId = b.playerId; rack2.ownerName = b.playerId;
    H.doPreserve(b, 'dry_fish', 8);
    const jB = Facility.view(rack2, Date.now()).slice(-1)[0];
    const qA = Spoil.outputQty(8, fA), qB = Spoil.outputQty(8, fB);
    ok(qA > qB, '★★③ⓔ 시든 재료는 **덜 나온다** — 재료 선택이 판단이다', `신선 ${qA}개 vs 시듦 ${qB}개`);
    ok(/×/.test(jA.label) && /×/.test(jB.label), '★③ⓔ 그리고 걸 때 **몇 개 나올지 미리 말해 준다**', `${jA.label} / ${jB.label}`);
    ok(Spoil.yieldMult(1) === 1 && Spoil.yieldMult(0) === Spoil.YIELD_FLOOR,
      '★③ⓔ 수율은 신선도의 연속 함수(1 → 1 · 0 → 바닥)', `${Spoil.yieldMult(1)} / ${Spoil.yieldMult(0)}`);
  }
  // 상한 재료는 아예 못 넣는다 — 그리고 **삼키지 않는다**(되돌린다)
  {
    const rack3 = fac('dr3', 'drying_rack', 'tp_rot', 5020, 5000);
    const p = mkPlayer('rot', {}); rack3.ownerId = p.playerId; rack3.ownerName = p.playerId;
    giveAged(p, 'fish', 4, Math.ceil(Spoil.shelfOf('fish')) + 2);
    pre(Spoil.bestOf('fish', Lots.of(p, 'fish'), H.zoneGameDay()) === 0, '가진 생선이 **전부 상함**이다');
    p._msgs.length = 0; H.doPreserve(p, 'dry_fish', 4);
    ok(Math.floor(Lots.sum(p, 'fish')) === 4, '★★③ⓕ 상한 재료는 거절 — 그리고 **재료를 삼키지 않는다**', `생선 ${Lots.sum(p, 'fish')}`);
    ok(/상한/.test(lastNote(p)), '★③ⓕ 이유를 말한다', lastNote(p).slice(0, 40));
  }
  // ★되돌릴 때 **나이 분포까지 그대로** 돌아오나 — 한 날짜로 뭉개면 장부가 거짓말을 한다.
  {
    const rack4 = fac('dr4', 'drying_rack', 'tp_undo', 5020, 5000);
    const p = mkPlayer('undo', {}); rack4.ownerId = p.playerId; rack4.ownerName = p.playerId;
    const A1 = Math.ceil(Spoil.shelfOf('fish')) + 3, A2 = Math.ceil(Spoil.shelfOf('fish')) + 1;
    giveAged(p, 'fish', 2, A1); giveAged(p, 'fish', 2, A2);
    const before = JSON.stringify(Lots.of(p, 'fish'));
    pre(Lots.of(p, 'fish').length === 2, '로트가 **날짜 둘로 갈려** 있다(하나면 뭉개짐을 못 잰다)', Lots.of(p, 'fish').length);
    pre(Spoil.bestOf('fish', Lots.of(p, 'fish'), H.zoneGameDay()) === 0, '그리고 전부 상함이라 거절될 것이다');
    H.doPreserve(p, 'dry_fish', 4);
    ok(JSON.stringify(Lots.of(p, 'fish')) === before,
      '★★③ⓖ 되돌림이 **나이 분포까지 정확히** 복원한다(로트 병합 금지 규약 유지)', Lots.of(p, 'fish').map((l) => `${l.d}:${l.n}`).join(' '));
  }
  // 대기열이 차 있으면 **재료를 빼기 전에** 거절한다(뺐다 되돌리는 길을 안 만든다)
  {
    const rack5 = fac('dr5', 'drying_rack', 'tp_full', 5020, 5000);
    const p = mkPlayer('full', {}); rack5.ownerId = p.playerId; rack5.ownerName = p.playerId;
    for (let i = 0; i < Facility.MAX_QUEUE; i++) Facility.enqueue(rack5, { id: 'x' + i, kind: 'preserve', label: 'x', owner: p.playerId, ms: 999999 }, Date.now());
    pre(Facility.view(rack5, Date.now()).length === Facility.MAX_QUEUE, '대기열이 **실제로 찼다**', Facility.view(rack5, Date.now()).length);
    giveAged(p, 'fish', 3, 0);
    p._msgs.length = 0; H.doPreserve(p, 'dry_fish', 3);
    ok(Math.floor(Lots.sum(p, 'fish')) === 3 && /대기열/.test(lastNote(p)),
      '★③ⓗ 대기열이 찼으면 **재료를 빼기 전에** 거절한다', `생선 ${Lots.sum(p, 'fish')} · ${lastNote(p).slice(0, 30)}`);
  }

  // ═══ ④ 부재료 — 소금 없이 절임 없다 · 훈제는 땔감을 먹는다 ═══════════════
  console.log('\n④ 부재료 — 절임엔 소금 · 훈제엔 땔감');
  {
    const wb = fac('wb1', 'workbench', 'tp_pk', 5020, 5000);
    const p = mkPlayer('pk', {}); wb.ownerId = p.playerId; wb.ownerName = p.playerId;
    giveAged(p, 'vegetable', 3, 0);
    pre(!p.inventory.salt, '소금을 **안 갖고** 있다', String(p.inventory.salt));
    p._msgs.length = 0; H.doPreserve(p, 'pickle_veg', 2);
    ok(Math.floor(Lots.sum(p, 'vegetable')) === 3 && /소금/.test(lastNote(p)),
      '★★④ⓐ 소금 없이는 절임이 안 된다 — 재료도 안 나간다', `남새 ${Lots.sum(p, 'vegetable')} · ${lastNote(p).slice(0, 40)}`);
    p.inventory.salt = 5;
    p._msgs.length = 0; H.doPreserve(p, 'pickle_veg', 2);
    ok(p.inventory.salt === 3, '★★④ⓐ 소금이 있으면 된다 — 그리고 **소금이 준다**(단위당 1)', `소금 ${p.inventory.salt}`);
    ok(Math.floor(Lots.sum(p, 'vegetable')) === 1, '★④ⓐ 남새도 나갔다', `남새 ${Lots.sum(p, 'vegetable')}`);
  }
  {
    const cf = fac('cf1', 'campfire', 'tp_sm', 5020, 5000);
    const p = mkPlayer('sm', { wood: 4 }); cf.ownerId = p.playerId; cf.ownerName = p.playerId;
    giveAged(p, 'meat_raw', 3, 0);
    p._msgs.length = 0; H.doPreserve(p, 'smoke_meat', 2);
    ok(p.inventory.wood === 2, '★★④ⓑ 훈제는 **땔감을 먹는다**(단위당 통나무 1)', `나무 ${p.inventory.wood}`);
    const noWood = mkPlayer('sm0', { wood: 0 });
    const cf2 = fac('cf2', 'campfire', noWood.playerId, 5020, 5000);
    giveAged(noWood, 'meat_raw', 2, 0);
    noWood._msgs.length = 0; H.doPreserve(noWood, 'smoke_meat', 2);
    ok(Math.floor(Lots.sum(noWood, 'meat_raw')) === 2 && /땔감|wood/.test(lastNote(noWood)),
      '★④ⓑ 땔감이 없으면 훈제가 안 된다', lastNote(noWood).slice(0, 40));
    void cf2;
  }
  // 시설이 갈린다 — 말리기를 모닥불에서 할 수는 없다("제작창 = 시설의 창")
  //   ⚠1차 실행이 여기서 **가짜로 통과**했다: 앞선 항목들이 세운 건조대가 같은 좌표(5020,5000)에
  //     남아 있어, 거절 사유가 "창이 갈린다"가 아니라 **"건조대가 내 것이 아니다"** 였다.
  //     통과는 했는데 **밟은 코드가 달랐다** — 레포가 못 박은 "자명한 상황을 골라 조용히 통과"의 실물.
  //   ⇒ 앞선 시설이 **사거리 안에 하나도 없는** 자리로 옮기고, 그 사실을 선행 assert 로 못 박는다.
  {
    const FX = 9000, FY = 9000;
    const p = mkPlayer('mix2', {}); p.x = FX; p.y = FY;
    const cf = fac('cf3', 'campfire', 'tp_mix2', FX + 20, FY);
    cf.ownerId = p.playerId; cf.ownerName = p.playerId;
    const R = Facility.FACILITIES.drying_rack.range + 8;
    let racksNear = 0;
    for (const b of H.buildings.values()) if (b.type === 'drying_rack' && Math.hypot(b.x - FX, b.y - FY) <= R) racksNear++;
    pre(racksNear === 0, '이 자리 사거리 안에 **건조대가 하나도 없다**(있으면 소유권 거절로 새어 가짜 통과)', `건조대 ${racksNear}개`);
    giveAged(p, 'fish', 3, 0);
    p._msgs.length = 0; H.doPreserve(p, 'dry_fish', 3);
    ok(Math.floor(Lots.sum(p, 'fish')) === 3, '★★④ⓒ 모닥불에서는 **말릴 수 없다** — 창이 갈린다', `생선 ${Lots.sum(p, 'fish')}`);
    ok(/건조대 앞에서만/.test(lastNote(p)),
      '★★④ⓒ 그리고 거절 사유가 **시설 부재**다(소유권 거절로 새지 않았다)', lastNote(p).slice(0, 40));
    // 반대 방향도 — 건조대 앞에서 훈제를 할 수는 없다
    const p2 = mkPlayer('mix3', { wood: 4 }); p2.x = FX + 400; p2.y = FY;
    const rk = fac('dr9', 'drying_rack', p2.playerId, FX + 420, FY);
    void rk;
    giveAged(p2, 'meat_raw', 2, 0);
    p2._msgs.length = 0; H.doPreserve(p2, 'smoke_meat', 2);
    ok(Math.floor(Lots.sum(p2, 'meat_raw')) === 2 && p2.inventory.wood === 4 && /모닥불|화덕/.test(lastNote(p2)),
      '★★④ⓒ 건조대 앞에서는 **훈제할 수 없다**(반대 방향도 막힌다)', lastNote(p2).slice(0, 40));
  }

  // ═══ ⑤ 거래 — 상함 거절 · 시듦 배율(가격 사본 없음) ══════════════════════
  console.log('\n⑤ 거래 — 상함은 거절 · 시듦은 배율(정본 가격 경로)');
  {
    const p = mkPlayer('tr', {}); giveAged(p, 'fish', 4, 0);
    const u = H._unitsOfFor(p);
    const fresh1 = u('fish', 1);
    const q = mkPlayer('tr2', {}); const ageW = Math.max(1, Math.floor(Spoil.shelfOf('fish') * 0.8));
    giveAged(q, 'fish', 4, ageW);
    const fW = Spoil.freshnessOf('fish', ageW);
    pre(fresh1 > 0 && fW > 0 && fW < 1, '한쪽은 신선, 한쪽은 시듦(상하지 않음)', `${fresh1} · f=${fW}`);
    const wilt1 = H._unitsOfFor(q)('fish', 1);
    ok(Math.abs(wilt1 - fresh1 * fW) < 1e-3,
      '★★⑤ⓐ 시든 것은 **재화 단위가 신선도만큼 줄어든다**(가격이 아니라 단위에 곱한다)',
      `${wilt1} = ${fresh1}×${fW}`);
    ok(wilt1 < fresh1, '★⑤ⓐ 그래서 값이 덜 나간다', `${wilt1} < ${fresh1}`);
  }
  // ★★가격 사본이 없다는 것을 **구조로** 검사한다 — trade.js 는 부패를 모른다.
  {
    const src = require('fs').readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8');
    ok(!/require\(['"]\.\/spoil['"]\)/.test(src) && !/freshness|SHELF_DAYS|Spoil\./.test(src),
      '★★⑤ⓑ **거래소는 부패를 모른다** — `trade.js` 에 신선도 코드가 0줄(가격 사본 금지 규약 유지)');
    const zsrc = require('fs').readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    ok(/_unitsOfFor[\s\S]{0,900}?Spoil\.nutritionMult/.test(zsrc),
      '★★⑤ⓑ 신선도는 **거래소·게시판이 같이 쓰는 환산 하나**(`_unitsOfFor`)에만 얹혔다');
  }
  // 상함 = 거절(배율 0 아님). 그리고 두 입구가 같은 함수를 쓴다.
  {
    const p = mkPlayer('rot2', {}); giveAged(p, 'fish', 3, Math.ceil(Spoil.shelfOf('fish')) + 1);
    pre(Spoil.bestOf('fish', Lots.of(p, 'fish'), H.zoneGameDay()) === 0, '가진 생선이 전부 상함이다');
    const g1 = H._spoiledGuardItems(p, ['fish']);
    const g2 = H._spoiledGuardRes(p, 'fish');
    ok(!!g1 && /상했다/.test(g1), '★★⑤ⓒ 게시판 납품 — 상한 것은 **거절**한다(조용히 0 아님)', String(g1).slice(0, 46));
    ok(!!g2, '★★⑤ⓒ 거래소도 **같은 판정**을 쓴다(판정 두 벌 금지)', String(g2).slice(0, 46));
    const clean = mkPlayer('ok2', {}); giveAged(clean, 'fish', 3, 0);
    ok(H._spoiledGuardItems(clean, ['fish']) === null, '★⑤ⓒ 성한 것은 안 막는다(위양성 0)');
  }

  // ═══ ⑥ 배선 — 두 표 일치 · 무게 · 목록 정본 ══════════════════════════════
  console.log('\n⑥ 배선 — 표가 두 벌이 아닌가');
  {
    const a = H.BUILDING_COST.drying_rack, b = H.BUILDING_RECIPES.item_drying_rack;
    const same = a && b && Object.keys(a).every((k) => b[k] === a[k]);
    ok(same, '★⑥ⓐ 건조대 비용이 두 표에서 같다(작업대 선례)', JSON.stringify(a));
    ok(Facility.FACILITIES.drying_rack && Facility.FACILITIES.drying_rack.kind === 'dry',
      '★⑥ⓐ 시설 표에 건조대가 있고 창이 `dry` 다');
  }
  {
    let missing = [];
    for (const k of Object.keys(Spoil.PRESERVED_ITEMS)) {
      if (!(Weights.kgOf(k) > 0)) missing.push(k);
      if (!H.FOOD_EFFECTS[k]) missing.push(k + '(효과)');
      if (!Lots.isLot(k)) missing.push(k + '(로트)');
      if (!H.ITEM_LABEL_SERVER[k]) missing.push(k + '(이름)');
    }
    ok(missing.length === 0, '★★⑥ⓑ 보존식 4종이 **무게·효과·로트·이름 전부** 갖췄다(빠진 품목 0)', missing.join(', ') || '0건');
    ok(Object.keys(Spoil.PRESERVED_ITEMS).every((k) => Weights.kgOf(k) < Weights.kgOfOrDefault({ dried_fish: 'fish', dried_fruit: 'berry', smoked_meat: 'meat_raw', pickled_veg: 'vegetable' }[k])
        || k === 'pickled_veg'),
      '★⑥ⓑ 말린 것은 원물보다 가볍다(절임만 무겁다 — 물을 머금는다)',
      Object.keys(Spoil.PRESERVED_ITEMS).map((k) => `${k} ${Weights.kgOf(k)}`).join(' · '));
  }
  {
    const menu = H.preserveMenuPayload();
    ok(menu.length === Object.keys(Spoil.PRESERVE).length && menu.every((m) => m.outKo && m.shelfDays > 0),
      '★⑥ⓒ 제작창 목록은 **서버가 정본을 그대로** 내보낸다(클라가 표를 안 든다)', `${menu.length}종`);
  }
  // 로트 펼침에 신선도 칸이 찼다 — 새 컴포넌트 없이
  {
    const p = mkPlayer('view', {}); giveAged(p, 'fish', 2, 1);
    const v = Lots.view(p, 'fish', p.inventory, H.zoneGameDay());
    ok(v && v.lots[0] && typeof v.lots[0].fresh === 'number' && v.lots[0].stage,
      '★⑥ⓓ 로트 펼침에 신선도·단계가 실린다(칸만 채웠다)', JSON.stringify(v.lots[0]));
  }
  // 로트 레코드가 안 변했다 — 저장 형식 호환
  {
    const p = mkPlayer('save', {}); giveAged(p, 'fish', 2, 1);
    const saved = Lots.toSave(p);
    const keys = new Set(); for (const arr of Object.values(saved)) for (const l of arr) for (const k of Object.keys(l)) keys.add(k);
    ok([...keys].every((k) => k === 'd' || k === 'n' || k === 'coalesced'),
      '★★⑥ⓔ 저장 레코드는 여전히 `{d, n}`(+coalesced) 뿐 — 신선도는 **저장하지 않는다**(유도값)', [...keys].join(','));
  }

  // ═══ ⑦ 하네스 결함 수리 — 날을 얼리면 **플레이어 시계도** 언다 ═══════════
  //   ★부패 곡선이 드러낸 결함이다: `__e2e_day_freeze` 가 마을 시뮬의 날만 얼리고
  //     `zoneGameDay`(벽시계 파생)는 계속 돌았다. 하루 0.5초로 데우는 하네스에선
  //     그게 "생선이 1.25초 만에 상한다"는 뜻이라 `e2e-trade` 의 생선이 거래 전에 썩었다.
  console.log('\n⑦ 하네스 결함 수리 — 날을 얼리면 플레이어 시계도 언다');
  {
    const d0 = H.zoneGameDay();
    H.__e2eFreezeZoneDay(true);
    const f0 = H.zoneGameDay();
    await sleep(120);
    const f1 = H.zoneGameDay();
    ok(f0 === f1 && f0 === d0, '★★⑦ 얼면 `zoneGameDay` 가 **멈춘다**', `${d0} → ${f0} → ${f1}`);
    H.__e2eFreezeZoneDay(false);
    const d1 = H.zoneGameDay();
    ok(d1 === d0, '★★⑦ 녹으면 **멈춰 있던 만큼 빼고** 이어 센다(시간이 건너뛰지 않는다)', `${d0} → ${d1}`);
    // 그리고 그 사이 로트가 늙지 않았다 — 이게 하네스가 원했던 것이다
    const p = mkPlayer('frz', {}); giveAged(p, 'fish', 2, 0);
    H.__e2eFreezeZoneDay(true);
    const before = Lots.view(p, 'fish', p.inventory, H.zoneGameDay()).lots[0].fresh;
    await sleep(150);
    const after = Lots.view(p, 'fish', p.inventory, H.zoneGameDay()).lots[0].fresh;
    H.__e2eFreezeZoneDay(false);
    ok(before === after && after === 1, '★★⑦ 얼어 있는 동안 **로트가 안 늙는다**', `${before} → ${after}`);
  }
  // ★★⑦-b **게임일 int32 오버플로** — `e2e-trade` 5건을 죽인 진짜 원인.
  //   하루가 짧은 하네스(`VILLAGE_DAY_MS=500`)에선 게임일이 35.8억이 되고, `day | 0` 이
  //   **−7.2억으로 감긴다**. 그러면 갓 잡은 생선의 나이가 42.9억 일이 되어 즉시 "상함"이 된다.
  {
    const BIG = 3576000000;   // = floor(1.788e12 / 500) — 실제 e2e-trade 조건
    pre((BIG | 0) < 0, '검사 표본이 **실제로 int32 를 넘는다**(안 넘으면 이 검사가 무의미)', `${BIG} | 0 = ${BIG | 0}`);
    const p = mkPlayer('big', {});
    Lots.note(p, 'fish', 3, BIG);
    p.inventory.fish = 3;
    const rec = Lots.of(p, 'fish')[0];
    ok(rec && rec.d === BIG, '★★⑦-b 큰 게임일이 **감기지 않고 그대로** 적힌다', `d=${rec && rec.d}`);
    const v = Lots.view(p, 'fish', p.inventory, BIG);
    ok(v.lots[0].ageDays === 0 && v.lots[0].stage === 'fresh',
      '★★⑦-b 그래서 갓 잡은 생선이 **신선**이다(감기면 즉시 상함이 된다)', JSON.stringify(v.lots[0]));
    const off = Spoil.peekOffer('fish', Lots.of(p, 'fish'), 3, BIG);
    ok(off.spoiled === 0 && off.fresh === 1, '★★⑦-b 거래 판정도 성하다고 본다(거래소가 안 막는다)', JSON.stringify(off));
    ok(H._spoiledGuardItems(p, ['fish']) === null, '★★⑦-b 게시판 납품도 안 막힌다');
  }

  // ═══ 대리 지표 ═══════════════════════════════════════════════════════════
  console.log('\n[대리 지표] 품목별 상함까지 · 겨울 한 주 산수');
  const REAL_DAY = 24 * 60 * 1000;
  console.log('  품목            보관일   시듦시작   실시간(24분/일)');
  for (const r of Spoil.shelfTable(REAL_DAY)) {
    const nm = (H.ITEM_LABEL_SERVER[r.item] || r.item).padEnd(12, ' ');
    console.log(`  ${nm} ${String(r.days).padStart(6)}일 ${String(r.wiltAtDay).padStart(8)}일 ${String(r.realMin).padStart(9)}분${r.preserved ? '  ← 보존식' : ''}`);
  }
  {
    const eff = H.FOOD_EFFECTS.dried_fish.hunger;
    const w = Spoil.winterMath(Body.CFG.HUNGER_SEC || 1800, REAL_DAY, eff);
    console.log(`  겨울 한 주(게임 7일) — 건어물 ${w.unitsPerWeek}단위 (하루 허기 ${w.drainPerDay} · 건어물 1단위 ${eff})`);
    console.log(`  건어물 보관 ${Spoil.shelfOf('dried_fish')}일 ⇒ 한 번 말리면 겨울 ${(Spoil.shelfOf('dried_fish') / 7).toFixed(1)}주를 버틴다`);
    ok(w.unitsPerWeek > 0 && Spoil.shelfOf('dried_fish') >= 7,
      '★대리 지표 — 보존식 하나가 **겨울 한 주보다 오래 간다**(겨울나기가 성립한다)',
      `${w.unitsPerWeek}단위 · ${Spoil.shelfOf('dried_fish')}일`);
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  try { require('fs').unlinkSync(process.env.DB_PATH); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
