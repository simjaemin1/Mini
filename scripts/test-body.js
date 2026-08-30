#!/usr/bin/env node
// === scripts/test-body.js — 신체 상태(§7) 서버 E2E ==============================
//
// ★[재민 확정 2026-08-26] 헌법 두 줄이 이 하네스의 판정 기준이다:
//   ① **상태는 생존 압박이 아니라 경제·리듬의 접속면** — 그래서 ④(바닥)가 있다. 벽이 아니라 기울기다.
//   ② **속은 연속, 겉은 계단** — 그래서 ③(절벽 없음)이 있다.
//
// ★★제1 규약 (족보 ㊻ 재발 금지): **픽스처가 검사 대상을 오염시키지 않는지 먼저 본다.**
//   특히 ①(오프라인 불변)은 **픽스처가 저장을 건드리면 자명 통과**한다 —
//   직전 배치들에서 `__e2e_give` 가 `savePlayer` 를 불러 미저장 상태를 스스로 저장한 사고가 있었다.
//   ⇒ 여기서는 상태를 **정본 경로**(`Body.tick`/`onDamage`/`onLabor`)로만 움직이고,
//     저장/복원도 정본(`toSave`/`fromSave`)만 쓴다. 그리고 ⑦이 "저장이 실제로 일어났나"를 따로 잰다.
//
// 실행: node scripts/test-body.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);

const TMP = `/tmp/test-body-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37000 + (process.pid % 800));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const B = H.Body;

function mkPlayer(name) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = {
    pid: 'p_' + name, playerId: 'test_' + name, name, persistent: true,
    x: 5000, y: 5000, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {},
    oreLedger: {}, oreCarry: {}, ws, isNpc: false, isDown: false, vx: 0, vy: 0,
  };
  p.__msgs = msgs;
  p.__notices = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  return p;
}
const CALM = { night: false, nearFire: false, indoor: false, warmth: 0, seasonCold: 0, moving: false, sprint: false };

// ★★[2026-08-26 계측기 수리] 소스를 grep 할 땐 **주석을 먼저 걷어낸다.**
//   1차 실행에서 두 판정이 자기 발에 걸렸다: `body.js` 의 주석이 "`lastSeen` 으로 따라잡기를 넣지 마라"라고
//   적어 뒀는데 내 grep 이 그 **금지 문구**를 금지 대상으로 읽었고, 이 파일 머리말의 "`savePlayer` 를 불러
//   … 사고가 있었다"도 마찬가지였다. **설명문이 증거로 오독되면 하네스는 없는 결함을 보고한다.**
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

(async () => {
  say('\n=== 신체 상태 §7 — 판단의 접속면 (서버 정본 E2E) ===');

  // ═══ ⓪ 전제 ════════════════════════════════════════════════════════════════
  say('\n⓪ 전제 — 축과 곡선이 실제로 서 있는가');
  ok(B.AXES.length === 5, '★다섯 축이다(심심함·스트레스는 §7 에서 기각 — 넣지 않았다)', B.AXES.join(','));
  ok(!B.AXES.includes('boredom') && !B.AXES.includes('stress'), '★★기각된 축이 슬쩍 들어와 있지 않다');
  // ★★[3층 재배선 2026-08-30 갱신] 축이 **두 갈래**로 나뉘었다:
  //   이속·작업에 걸리는 축(추위·피로·부상) vs **회복 배율로만** 작용하는 축(허기·갈증).
  ok(JSON.stringify(B.EFFECT_AXES) === JSON.stringify(['cold', 'fatigue', 'injury']),
    '★★⓪ 이속·작업 곡선을 갖는 축은 셋뿐이다', B.EFFECT_AXES.join(','));
  ok(JSON.stringify(B.RECOVER_AXES) === JSON.stringify(['hunger', 'thirst']),
    '★★⓪ 허기·갈증은 **회복 배율 축**이다', B.RECOVER_AXES.join(','));
  ok(!B.CURVES.hunger && !B.CURVES.thirst,
    '★★⓪ 허기·갈증이 이속·작업 곡선을 **안 갖는다**(재민 확정: 직접 페널티 금지)');
  for (const a of B.EFFECT_AXES) {
    const c = B.CURVES[a];
    ok(c && c.move.length >= 4 && c.move.length <= 6, `★${B.KO[a]} 곡선 제어점 4~6개(§8.3)`, c ? c.move.length : 'X');
  }
  for (const a of B.RECOVER_AXES) {
    const c = B.RECOVER[a];
    ok(c && c.length >= 4 && c.length <= 6, `★${B.KO[a]} 회복 곡선 제어점 4~6개`, c ? c.length : 'X');
    ok(c[c.length - 1][1] === 0, `★★⓪ ${B.KO[a]} 극단에서 회복 **정지**(0) — 감소가 아니다`, c[c.length - 1][1]);
  }
  say(`    단계 경계(1단계 = 처음 체감되는 자리, 곡선에서 **유도**한 값):`);
  for (const a of B.AXES) say(`      ${B.KO[a].padEnd(4)} ${B.STAGE_AT[a].map((x) => x.toFixed(3)).join(' / ')}`);

  // ═══ ① 오프라인 불변 ═══════════════════════════════════════════════════════
  say('\n① 오프라인 불변 — 접속 안 한 동안은 안 굶는다(§7 재민 확정 · §6 숙제 금지)');
  const P1 = mkPlayer('offline');
  B.tick(P1, 600, { ...CALM });                       // 10분 접속해 살았다
  B.onLabor(P1, 200); B.onDamage(P1, 40);
  const before = B.snapshot(P1);
  const saved = B.toSave(P1);
  ok(before.hunger < 100, '★전제 — 접속 중엔 실제로 줄었다(0 이면 아래가 자명 통과다)', before.hunger.toFixed(2));
  ok(saved.fatigue > 0 && saved.injury > 0, '★전제 — 피로·부상도 실제로 쌓였다',
    `피로 ${saved.fatigue} · 부상 ${saved.injury}`);
  // ── 로그아웃 ── (이 사이에 아무도 tick 을 안 부른다 = 서버가 하는 그대로)
  const P2 = mkPlayer('offline');                      // 다음 접속의 새 객체
  P2.hunger = before.hunger; P2.thirst = before.thirst; // 전용 컬럼 복원
  B.fromSave(P2, saved);                               // 나머지 축 복원
  const after = B.snapshot(P2);
  const same = ['hunger', 'thirst', 'cold', 'fatigue', 'injury', 'morale']
    .every((k) => Math.abs((after[k] || 0) - (before[k] || 0)) < 1e-3);
  ok(same, '★★① 재접속 상태가 **로그아웃 시점 그대로**다', JSON.stringify(after));
  // ★반례 — 만약 따라잡기 코드가 있었다면 이 검사가 통과하면 안 된다. 그래서 소스도 본다.
  const bsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'body.js'), 'utf8'));
  ok(!/lastSeen|catchUp|catch_up|elapsedSince/.test(bsrc),
    '★★① body.js **코드에** 따라잡기(catch-up)가 아예 없다 — 주석 걷어내고 확인');
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(!/Body\.tick\([^)]*lastSeen/.test(codeOnly(zsrc)), '★① 존이 lastSeen 으로 tick 을 밀지 않는다');

  // ═══ ② 식사 = 인벤 차감 + 회복 ═════════════════════════════════════════════
  say('\n② 식사 — 인벤이 줄고 몸이 찬다(품목별 · 조리식이 낫다)');
  const P3 = mkPlayer('eater');
  P3.hunger = 30; P3.inventory = { berry: 3, meat_cooked: 2, herb: 2 };
  const h0 = P3.hunger;
  H.doEat(P3, 'berry');
  ok(P3.inventory.berry === 2, '★② 먹으면 인벤에서 빠진다', `berry 3 → ${P3.inventory.berry}`);
  const h1 = P3.hunger;
  ok(h1 > h0, '★② 허기가 찬다', `${h0} → ${h1.toFixed(1)}`);
  const mRaw = B.ensure(P3).morale;
  H.doEat(P3, 'meat_cooked');
  const h2 = P3.hunger, mCook = B.ensure(P3).morale;
  ok((h2 - h1) > (h1 - h0), '★★② **조리식이 생식보다 많이 찬다**(요리·화덕 수요의 실체)',
    `생식 +${(h1 - h0).toFixed(1)} vs 조리 +${(h2 - h1).toFixed(1)}`);
  ok(mCook > mRaw, '★★② 조리식이 **사기(당근)**를 준다 — §7 은 심심함 대신 이걸 택했다',
    `${mRaw.toFixed(2)} → ${mCook.toFixed(2)}`);
  const eff2 = B.effects(P3);
  ok(eff2.workMult > 1, '★② 사기는 작업속도를 **올린다**(벌이 아니라 상이다)', `×${eff2.workMult}`);
  // 품목표가 실재하는지 — 하네스가 지어낸 품목으로 통과하지 않게
  ok(H.FOOD_EFFECTS && H.FOOD_EFFECTS.meat_cooked && H.FOOD_EFFECTS.berry,
    '★전제 — 품목별 회복량은 **기존 카탈로그**를 그대로 쓴다(신규 표 만들지 않음)');

  // ═══ ⑤ 부상 — 주사위가 아니라 문턱 ═════════════════════════════════════════
  say('\n⑤ 부상 — 확률이 아니라 **피해량 문턱**(주사위 금지 정합)');
  const P4 = mkPlayer('hurt');
  const small = B.onDamage(P4, B.CFG.INJURY_DMG - 1);
  ok(small === 0 && B.ensure(P4).injury === 0, '★★⑤ 문턱 **미만** 피해는 안 다친다',
    `${B.CFG.INJURY_DMG - 1} 피해 → 부상 ${B.ensure(P4).injury}`);
  const big = B.onDamage(P4, B.CFG.INJURY_DMG + 20);
  ok(big > 0 && B.ensure(P4).injury > 0, '★★⑤ 문턱 **이상** 피해는 다친다',
    `${B.CFG.INJURY_DMG + 20} 피해 → 부상 ${B.ensure(P4).injury.toFixed(3)}`);
  // ★같은 피해면 같은 결과 — 주사위가 아니라는 증거
  const P5 = mkPlayer('hurt2'), P6 = mkPlayer('hurt3');
  B.onDamage(P5, 30); B.onDamage(P6, 30);
  ok(Math.abs(B.ensure(P5).injury - B.ensure(P6).injury) < 1e-9,
    '★★⑤ **같은 피해 → 같은 부상**(주사위가 아니다)', `${B.ensure(P5).injury} = ${B.ensure(P6).injury}`);
  // 약초 가속
  const A = mkPlayer('noherb'), C = mkPlayer('herb');
  B.onDamage(A, 40); B.onDamage(C, 40);
  const inj0 = B.ensure(A).injury;
  B.onHerb(C, Date.now());
  B.tick(A, 300, { ...CALM }); B.tick(C, 300, { ...CALM });
  const dA = inj0 - B.ensure(A).injury, dC = inj0 - B.ensure(C).injury;
  ok(dA > 0, '★전제 — 그냥 둬도 낫긴 낫는다', dA.toFixed(5));
  ok(dC > dA * 3, '★★⑤ **약초가 회복을 재촉한다**(§7 약초 수요의 실배선)',
    `약초없이 ${dA.toFixed(5)} vs 약초 ${dC.toFixed(5)} (×${(dC / Math.max(1e-9, dA)).toFixed(1)})`);

  // ═══ ⑥ 피로 — 노동↑ 휴식↓ · 하루의 마디 ═══════════════════════════════════
  say('\n⑥ 피로 — 24분 하루의 자연 마디(§7)');
  const P7 = mkPlayer('worker');
  for (let i = 0; i < 100; i++) B.onLabor(P7, 1);
  const f100 = B.ensure(P7).fatigue;
  ok(f100 > 0, '★⑥ 일하면 쌓인다', f100.toFixed(4));
  B.tick(P7, 300, { ...CALM });
  ok(B.ensure(P7).fatigue < f100, '★⑥ 쉬면 준다', `${f100.toFixed(4)} → ${B.ensure(P7).fatigue.toFixed(4)}`);
  // ★전제 수리: 1차엔 피로 0.08 에 120초를 쉬어 **둘 다 0 까지** 회복했다 — 차이가 날 수가 없었다.
  //   충분히 지친 몸으로, 다 회복하지 못할 만큼만 쉬게 해야 이 판정이 무언가를 잰다.
  const P8 = mkPlayer('inside'); B.onLabor(P8, 900);
  const P9 = mkPlayer('outside'); B.onLabor(P9, 900);
  const fStart = B.ensure(P8).fatigue;
  ok(fStart > 0.5, '★전제 — 둘 다 실제로 지쳐 있다(안 지치면 휴식 비교가 자명하다)', fStart.toFixed(3));
  B.tick(P8, 120, { ...CALM, indoor: true }); B.tick(P9, 120, { ...CALM });
  ok(B.ensure(P8).fatigue > 0 && B.ensure(P9).fatigue > 0,
    '★전제 — 둘 다 아직 다 못 쉬었다(바닥에 닿으면 차이가 사라진다)',
    `실내 ${B.ensure(P8).fatigue.toFixed(4)} · 밖 ${B.ensure(P9).fatigue.toFixed(4)}`);
  ok(B.ensure(P8).fatigue < B.ensure(P9).fatigue, '★★⑥ **실내에서 더 잘 쉰다**',
    `실내 ${B.ensure(P8).fatigue.toFixed(4)} < 밖 ${B.ensure(P9).fatigue.toFixed(4)}`);
  // 하루 리듬 — 채광 1타/초로 게임 하루(24분) 일하면 저녁에 효율이 떨어져야 한다
  const P10 = mkPlayer('allday');
  const w0 = B.effects(P10).workMult;
  for (let i = 0; i < 24 * 60; i++) { B.onLabor(P10, 1); B.tick(P10, 1, { ...CALM, moving: true }); }
  const wEve = B.effects(P10).workMult, fEve = B.ensure(P10).fatigue;
  say(`    하루(24분) 내내 채광: 피로 ${fEve.toFixed(2)} · 작업속도 ×${w0.toFixed(2)} → ×${wEve.toFixed(2)}`);
  ok(wEve < w0 * 0.95, '★★⑥ 하루 종일 일하면 **저녁엔 손이 느려진다**(막는 벽이 아니라 기울기)');
  ok(wEve > 0.6, '★⑥ 그래도 **벽이 되진 않는다**(바닥 위)', `×${wEve.toFixed(2)}`);

  // ═══ ③ 효과 연속성 — 절벽 없음 ═════════════════════════════════════════════
  say('\n③ 연속성 — 문턱 절벽이 없다(§8.3 "속은 연속")');
  const STEP = 0.002;
  let worstJump = 0, worstAt = null;
  // ★[3층 재배선 2026-08-30 갱신] 이속·작업 곡선은 이제 **세 축만** 갖는다.
  //   허기·갈증은 회복 곡선을 갖고, 그것도 같은 잣대(절벽 없음)로 잰다 — 축이 나뉘었지
  //   "속은 연속" 규약이 느슨해진 게 아니다.
  for (const a of B.EFFECT_AXES) {
    for (let x = 0; x <= 1.0001; x += STEP) {
      const y0 = B.lerpCurve(B.CURVES[a].move, x), y1 = B.lerpCurve(B.CURVES[a].move, x + STEP);
      const w0b = B.lerpCurve(B.CURVES[a].work, x), w1b = B.lerpCurve(B.CURVES[a].work, x + STEP);
      const j = Math.max(Math.abs(y1 - y0), Math.abs(w1b - w0b));
      if (j > worstJump) { worstJump = j; worstAt = `${B.KO[a]} @ ${x.toFixed(3)}`; }
    }
  }
  for (const a of B.RECOVER_AXES) {
    for (let x = 0; x <= 1.0001; x += STEP) {
      const r0 = B.lerpCurve(B.RECOVER[a], x), r1 = B.lerpCurve(B.RECOVER[a], x + STEP);
      const j = Math.abs(r1 - r0);
      if (j > worstJump) { worstJump = j; worstAt = `${B.KO[a]}(회복) @ ${x.toFixed(3)}`; }
    }
  }
  const bound = STEP * 4;   // 0.002 폭에서 이보다 크게 뛰면 그건 절벽이다(회복 곡선이 더 가파르다)
  ok(worstJump < bound, `★★③ 인접 표본 최대 도약 ${worstJump.toFixed(5)} < ${bound.toFixed(5)} = **절벽 없음**`, worstAt);
  // ★자명 통과 금지 — 곡선이 아예 평평하면 위가 공짜다. 실제로 내려가는지 본다.
  const dropAll = B.EFFECT_AXES.map((a) => 1 - B.lerpCurve(B.CURVES[a].move, 1));
  ok(dropAll.every((d) => d > 0.05), '★★자명 통과 금지 — 각 축이 최악에서 실제로 이속을 깎는다',
    dropAll.map((d, i) => `${B.KO[B.EFFECT_AXES[i]]} −${(d * 100).toFixed(0)}%`).join(' · '));
  const recDrop = B.RECOVER_AXES.map((a) => 1 - B.lerpCurve(B.RECOVER[a], 1));
  ok(recDrop.every((d) => d > 0.5), '★★자명 통과 금지 — 회복 축도 최악에서 실제로 깎는다(멈춘다)',
    recDrop.map((d, i) => `${B.KO[B.RECOVER_AXES[i]]} −${(d * 100).toFixed(0)}%`).join(' · '));

  // ═══ ④ 바닥 클램프 — 죽음의 나선 방지 ══════════════════════════════════════
  say('\n④ 바닥 — 죽음의 나선 방지(§7 재민 확정)');
  const P11 = mkPlayer('worst');
  P11.hunger = 0; P11.thirst = 0;
  const bb = B.ensure(P11); bb.cold = 1; bb.fatigue = 1; bb.injury = 1;
  const eW = B.effects(P11);
  say(`    전 축 최악: 곱 원값 이속 ${eW.rawMove} · 작업 ${eW.rawWork} → 바닥 적용 ${eW.moveMult} / ${eW.workMult}`);
  ok(eW.rawMove < B.CFG.MOVE_FLOOR, '★전제 — 바닥이 없었으면 실제로 더 내려갔다(바닥이 일하는 상황이다)');
  ok(eW.moveMult >= B.CFG.MOVE_FLOOR && eW.workMult >= B.CFG.WORK_FLOOR,
    `★★④ 최악 조합에도 이속·작업속도가 바닥(${B.CFG.MOVE_FLOOR}/${B.CFG.WORK_FLOOR}) 아래로 안 간다`);
  ok(eW.floored === true, '★④ 바닥이 걸렸다는 사실을 **상태 패널에 알려 준다**(투명성 §8.6)');
  const md = B.moodles(P11);
  ok(md.length <= B.CFG.SHOW_MAX, `★★④ 동시 표시 상태가 ${B.CFG.SHOW_MAX}개를 안 넘는다(§7)`, `${md.length}개`);

  // ═══ ③b 단계 히스테리시스 — 경계에서 안 깜빡인다 ═══════════════════════════
  say('\n③b 겉은 계단 — 경계에서 깜빡이지 않는다');
  const P12 = mkPlayer('flicker');
  const edge = B.STAGE_AT.fatigue[0];
  const bf = B.ensure(P12);
  let flips = 0, prev = null;
  for (let i = 0; i < 200; i++) {
    bf.fatigue = edge + ((i % 2) ? 0.008 : -0.008);   // 경계를 미세하게 오간다
    const st = B.stageOf(P12, 'fatigue', bf.fatigue);
    if (prev !== null && st !== prev) flips++;
    prev = st;
  }
  ok(flips === 0, `★★③b 경계 진동 200회에 단계 전환 **${flips}회**(히스테리시스 ±${B.CFG.STAGE_HYST})`);
  // ★자명 통과 금지 — 히스테리시스 폭을 넘기면 **전환은 실제로 일어나야** 한다
  bf.fatigue = 0; B.stageOf(P12, 'fatigue', 0);
  bf.fatigue = edge + B.CFG.STAGE_HYST + 0.01;
  ok(B.stageOf(P12, 'fatigue', bf.fatigue) >= 1, '★★자명 통과 금지 — 확실히 넘기면 단계는 실제로 오른다');

  // ═══ ⑦ 주기 저장에 상태 포함 ═══════════════════════════════════════════════
  say('\n⑦ 주기 저장 — 가만히 회복한 사람도 저장된다');
  const P13 = mkPlayer('saver');
  const snap0 = B.snapshot(P13);
  ok(!B.dirtySince(P13, snap0), '★전제 — 아무것도 안 하면 dirty 가 아니다');
  B.tick(P13, 60, { ...CALM });
  ok(B.dirtySince(P13, snap0), '★★⑦ 몸이 바뀌면 dirty 다(Δ>0.01 · §8.3)',
    `허기 ${snap0.hunger} → ${P13.hunger.toFixed(2)}`);
  ok(/_bodyDirty/.test(zsrc) && /Body\.dirtySince/.test(zsrc),
    '★★⑦ **주기 저장이 그 판정을 실제로 본다** — zone.js 에서 확인(안 그러면 앉아서 쉰 진행이 크래시에 날아간다)');
  ok(/body: Body\.toSave\(player\)/.test(zsrc), '★⑦ 저장 payload 에 몸 상태가 실린다');
  ok(/tools\.body/.test(zsrc), '★⑦ 복원 경로도 있다(저장만 하고 안 읽으면 반쪽이다)');

  // ═══ ⑨ 스태미나 — 달리기의 유일한 관문(3층 재배선) ═══════════════════════════
  say('\n⑨ 스태미나 — 달리기가 쓰고, 짐이 무겁게 하고, 서면 찬다');
  {
    const mk = () => ({ hunger: 100, thirst: 100, inventory: {}, toolItems: [], equipment: [] });
    const P = mk();
    ok(B.stamina(P) === 1 && B.canSprint(P) === true, '★⑨ 새 몸은 가득이고 달릴 수 있다', B.stamina(P));
    // 전력질주 — 빈손
    let t = 0; while (B.canSprint(P) && t < 200) { B.tick(P, 1, { sprint: true, moving: true, carryRatio: 0 }); t++; }
    ok(t > 5 && t < 100, `★⑨ 빈손으로 **${t}초** 달리면 바닥난다`, `설정 ${B.CFG.STAM_SPRINT_SEC}초`);
    ok(Math.abs(t - B.CFG.STAM_SPRINT_SEC) <= 3, '★⑨ 손잡이(`BODY_STAM_SPRINT_SEC`)와 실측이 맞는다', `${t} vs ${B.CFG.STAM_SPRINT_SEC}`);
    ok(B.ensure(P).stamLock === true, '★★⑨ 바닥나면 **빗장이 걸린다**(0 근처에서 달렸다 걸었다 깜빡이지 않게)');
    ok(B.canSprint(P) === false, '★⑨ 빗장이 걸린 동안은 못 달린다');
    // 회복 — 서서
    let r = 0; while (!B.canSprint(P) && r < 300) { B.tick(P, 1, { sprint: false, moving: false }); r++; }
    ok(r > 1 && r < 200, `★⑨ 서서 **${r}초** 쉬면 다시 달릴 수 있다`, `재개 문턱 ${B.CFG.STAM_RESUME}`);
    ok(B.ensure(P).stam >= B.CFG.STAM_RESUME, '★⑨ 재개 문턱을 실제로 넘겼다', B.ensure(P).stam.toFixed(3));
    // 짐 가중 — 같은 시간을 달렸을 때 남는 양을 견준다
    const A = mk(), C = mk();
    for (let i = 0; i < 5; i++) { B.tick(A, 1, { sprint: true, moving: true, carryRatio: 0 }); B.tick(C, 1, { sprint: true, moving: true, carryRatio: 1 }); }
    ok(B.stamina(A) > B.stamina(C), '★★⑨ **짐이 무거우면 더 빨리 준다**',
      `빈손 ${B.stamina(A).toFixed(3)} vs 가득 ${B.stamina(C).toFixed(3)}`);
    ok(B.stamina(A) < 1, '(상황) 빈손도 실제로 줄긴 했다 — 안 줄면 위 비교가 자명 통과다', B.stamina(A).toFixed(3));
    // 걸으면서는 덜 찬다
    const D = mk(), E = mk();
    B.ensure(D).stam = 0.2; B.ensure(E).stam = 0.2;
    for (let i = 0; i < 5; i++) { B.tick(D, 1, { moving: false }); B.tick(E, 1, { moving: true }); }
    ok(B.stamina(D) > B.stamina(E), '★⑨ 서면 걸을 때보다 빨리 찬다',
      `서서 ${B.stamina(D).toFixed(3)} vs 걸으며 ${B.stamina(E).toFixed(3)}`);
  }

  // ═══ ⑩ 허기·갈증은 이속을 **안** 깎는다 — 회복 배율로만 ═══════════════════════
  say('\n⑩ 허기·갈증 재배선 — 걸음은 그대로, 숨 고르기와 아묾만 느려진다');
  {
    const P = { hunger: 100, thirst: 100 };
    const full = B.effects(P).moveMult;
    P.hunger = 0; P.thirst = 0;
    const empty = B.effects(P).moveMult;
    ok(full === 1, '(상황) 만복일 때 이속 배율이 1 이다');
    ok(empty === full, '★★⑩ **공복·탈수여도 이속이 안 깎인다**(재민 확정: 직접 페널티 금지)',
      `만복 ×${full} vs 공복 ×${empty}`);
    ok(B.effects(P).workMult === 1, '★⑩ 작업속도도 안 깎인다', `×${B.effects(P).workMult}`);
    // 회복 배율로는 확실히 작용한다(자명 통과 방지 — "아무 일도 안 한다"가 아니어야 한다)
    const P2 = { hunger: 100, thirst: 100 };
    ok(B.recoverMult(P2) === 1, '(상황) 만복 회복 배율 1', B.recoverMult(P2));
    ok(B.recoverMult(P) === 0, '★★⑩ 극단에서 회복 배율이 **0** = 회복 정지', B.recoverMult(P));
    const P3 = { hunger: 50, thirst: 50 };
    const mid = B.recoverMult(P3);
    ok(mid > 0 && mid < 1, '★⑩ 그 사이는 **연속**이다(절벽 없음 · §8.3)', mid);
    // 스태미나 회복이 실제로 그 배율을 탄다
    const Q = { hunger: 100, thirst: 100 }, R = { hunger: 12, thirst: 12 };
    B.ensure(Q).stam = 0.1; B.ensure(R).stam = 0.1;
    for (let i = 0; i < 5; i++) { B.tick(Q, 1, { moving: false }); B.tick(R, 1, { moving: false }); }
    ok(B.stamina(Q) > B.stamina(R), '★★⑩ 배고프면 **숨 고르기가 느리다**(그 배율이 실배선돼 있다)',
      `만복 ${B.stamina(Q).toFixed(3)} vs 배고픔 ${B.stamina(R).toFixed(3)}`);
  }

  // ═══ ⑪ 감쇠 고증치 + 상태 의존 곡선 ═════════════════════════════════════════
  say('\n⑪ 감쇠 — 허기 게임 2일(48분) · 갈증 1일(24분) · 위 절반이 1/3 시간');
  {
    const run = (key, sec) => {
      const P = { hunger: 100, thirst: 100 };
      let t = 0, half = -1;
      while (P[key] > 0 && t < sec * 3) {
        B.tick(P, 1, {});
        t++;
        if (half < 0 && P[key] <= 50) half = t;
      }
      return { total: t, half };
    };
    const H = run('hunger', B.CFG.HUNGER_SEC), T = run('thirst', B.CFG.THIRST_SEC);
    ok(Math.abs(H.total - 2880) / 2880 < 0.10, `★★⑪ 허기 만복→공복 **${(H.total / 60).toFixed(1)}분** (목표 48분 ±10%)`, `${H.total}초`);
    ok(Math.abs(T.total - 1440) / 1440 < 0.10, `★★⑪ 갈증 만복→공복 **${(T.total / 60).toFixed(1)}분** (목표 24분 ±10%)`, `${T.total}초`);
    const hf = H.half / H.total, tf = T.half / T.total;
    ok(Math.abs(hf - 1 / 3) < 0.06, `★★⑪ 허기 **위 절반이 전체의 ${(hf * 100).toFixed(0)}%**(목표 33%)`, `${H.half}/${H.total}초`);
    ok(Math.abs(tf - 1 / 3) < 0.06, `★★⑪ 갈증 위 절반 **${(tf * 100).toFixed(0)}%**(목표 33%)`, `${T.half}/${T.total}초`);
    ok(B.decayRate(100, 2880) > B.decayRate(10, 2880) * 1.8,
      '★★⑪ 배부를 때가 배고플 때보다 **거의 2배 빨리** 준다(배부름은 금방 꺼진다)',
      `${B.decayRate(100, 2880).toFixed(5)} vs ${B.decayRate(10, 2880).toFixed(5)}`);
  }

  // ═══ ⑫ ★아사 폐지 캐논 — 극단에서 HP 는 **절대** 안 깎인다 ═══════════════════
  say('\n⑫ 아사 폐지 — 굶어도 죽지 않는다(재민 재확정: 죽음 설계 배치 전까지 보류)');
  {
    const P = { hunger: 0, thirst: 0, hp: 55, maxHp: 100, inventory: {} };
    const hp0 = P.hp;
    for (let i = 0; i < 600; i++) B.tick(P, 1, { moving: false });
    ok(P.hp === hp0, '★★⑫ 공복·탈수로 10분을 버텨도 **HP 가 한 점도 안 깎인다**', `${hp0} → ${P.hp}`);
    ok(B.recoverMult(P) === 0, '★⑫ 대신 회복이 멈춘다(벌은 여기까지다)', B.recoverMult(P));
    // ★코드에도 아사 경로가 없다 — 주석 걷어내고 확인(다음 사람이 슬쩍 넣는 걸 막는다)
    const bsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'body.js'), 'utf8'));
    ok(!/\bp\.hp\s*(-=|=[^=])/.test(bsrc), '★★⑫ `body.js` 안에 HP 를 깎는 줄이 **아예 없다**');
    ok(/recoverMult/.test(zsrc) && !/hunger[^\n]*hp\s*-=/.test(zsrc),
      '★⑫ zone.js 의 HP 회복이 **배율**을 쓴다(하드 게이트·감소가 아니라)');
  }

  // ═══ ⑬ 추위 — 평형 수렴(밤에 오르고 낮에 내린다) ═════════════════════════════
  say('\n⑬ 추위 — 주변이 목표점을 만들고 몸이 거기로 간다');
  {
    // 목표점부터 — 곡선을 다시 짜지 않고 정본 함수에 물어본다
    const tSummerDay = B.coldTarget({ night: false, seasonCold: 0, warmth: 0 });
    const tSummerNight = B.coldTarget({ night: true, seasonCold: 0, warmth: 0 });
    const tWinterDay = B.coldTarget({ night: false, seasonCold: 1, warmth: 0 });
    const tWinterNight = B.coldTarget({ night: true, seasonCold: 1, warmth: 0 });
    say(`     목표점 — 여름낮 ${tSummerDay} · 여름밤 ${tSummerNight} · 겨울낮 ${tWinterDay} · 겨울밤 ${tWinterNight}`);
    ok(tSummerNight > tSummerDay, '★⑬ 밤이 낮보다 춥다');
    ok(tWinterNight > tSummerNight, '★★⑬ **겨울 평형점이 여름보다 높다**(겨울은 옷·불 없이는 안 내려간다)');
    ok(tWinterDay > tSummerDay, '★⑬ 겨울은 낮에도 춥다');
    ok(B.coldTarget({ night: true, seasonCold: 1, warmth: B.CFG.WARMTH_FULL }) === 0,
      '★★⑬ 방한 가득한 옷이면 겨울밤에도 목표점 0');
    ok(B.coldTarget({ night: true, seasonCold: 1, warmth: 0, nearFire: true }) <= B.CFG.COLD_FIRE_TARGET,
      '★⑬ 모닥불 옆은 목표점이 확 내려간다');
    ok(B.coldTarget({ night: true, seasonCold: 1, warmth: 0, indoor: true }) < tWinterNight, '★⑬ 실내가 밖보다 낫다');

    // ★★밤→낮 사이클 — **해소 행동 없이** 오르고 내리는가(누적식이면 안 내려간다)
    const P = { hunger: 100, thirst: 100 };
    const step = (n, ctx) => { for (let i = 0; i < n; i++) B.tick(P, 1, ctx); };
    step(600, { night: true, seasonCold: 0.35, warmth: 0 });
    const peak = B.ensure(P).cold;
    step(900, { night: false, seasonCold: 0.35, warmth: 0 });
    const dawn = B.ensure(P).cold;
    ok(peak > 0.2, '(상황) 밤에 실제로 추워졌다 — 안 그러면 아래가 자명 통과다', peak.toFixed(3));
    ok(dawn < peak * 0.5, '★★⑬ **낮이 오면 저절로 내려간다**(불·실내 없이) — 누적식이면 안 내려간다',
      `밤 끝 ${peak.toFixed(3)} → 낮 ${dawn.toFixed(3)}`);
    // 겨울 평형은 실제로 높은 데서 멈춘다(1 로 끝없이 오르는 게 아니라)
    const W = { hunger: 100, thirst: 100 };
    for (let i = 0; i < 3000; i++) B.tick(W, 1, { night: false, seasonCold: 1, warmth: 0 });
    ok(Math.abs(B.ensure(W).cold - tWinterDay) < 0.02,
      '★★⑬ 오래 두면 **목표점에 수렴**한다(끝없이 1 로 가지 않는다)', `${B.ensure(W).cold.toFixed(3)} ≈ ${tWinterDay}`);
    // 모닥불 접근 → 수렴점이 내려간다
    for (let i = 0; i < 600; i++) B.tick(W, 1, { night: false, seasonCold: 1, warmth: 0, nearFire: true });
    ok(B.ensure(W).cold < 0.15, '★★⑬ 모닥불로 가면 내려간다', B.ensure(W).cold.toFixed(3));
  }

  // ═══ ⑭ 연중 연속 온도 곡선 — [온도 소배치 2026-08-31 재민 확정] ══════════════
  //   재민: *"12월과 1월과 2월이 같은 강도는 아니지."* · *"매년 7월 1일이 같으면 안 된다"*
  //         *"시간은 절대 바꾸면 안 돼. 차라리 겨울 버티는 난이도를 수정."*
  say('\n⑭ 온도 곡선 — 계절 계단 폐지 · econ 기온 정본 유도');
  {
    const Wx = require(path.join(ROOT, 'server', 'weather.js'));
    const Econ = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
    ok(Wx.available(), '★★⑭ 전제 — econ 기온 정본(`temperatureAt`)을 실제로 물었다(못 물면 아래가 전부 무의미)');
    const A = Wx.anchors();
    const out = (d, n) => B.coldTarget({ day: d, night: n, warmth: 0 });

    // ── ㉠ 곡선이 econ 정본에서 왔는가(사본 금지) ────────────────────────────
    //   ★weather.js 안에 90/180/270/315/365 같은 **날짜 상수가 한 개도 없어야** 한다.
    //     (365 는 계측기 보폭으로만 쓰이고 이 파일엔 없다.)
    const wsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'weather.js'), 'utf8'));
    const dateConst = (wsrc.match(/\b(90|180|270|315|365|182\.5)\b/g) || []);
    ok(dateConst.length === 0, '★★⑭㉠ `weather.js` 에 계절·연 길이 상수가 **한 개도 없다**(전부 econ 에서 유도)',
      dateConst.join(',') || '0개');
    ok(/economy-sim-v2/.test(wsrc) && /temperatureAt/.test(wsrc),
      '★⑭㉠ econ `temperatureAt` 을 **직접** 부른다(자기 코사인을 새로 만들지 않았다)');
    // 앵커가 econ 곡선의 극값과 정말 같은가 — 여기서 다시 계산해 맞대 본다(계측기 사본이 아니라 교차검증)
    let lo = 0, hi = 0;
    for (let d = 0; d < 366; d += 0.25) {
      if (Econ.temperatureAt(d, null, 0) < Econ.temperatureAt(lo, null, 0)) lo = d;
      if (Econ.temperatureAt(d, null, 0) > Econ.temperatureAt(hi, null, 0)) hi = d;
    }
    ok(A.winterMid === lo && A.summerMid === hi,
      '★★⑭㉠ 최한·최난 앵커가 **econ 기온 곡선의 극값 그 자체**다', `겨울 ${A.winterMid} · 여름 ${A.summerMid}`);

    // ── ㉡ 튜닝1 앵커 4점 보존 — 잡음을 끄면 정확히 그 값이 나온다 ────────────
    //   ★잡음은 env 로만 끈다(모듈을 고쳐서 끄면 그건 다른 코드를 재는 것이다).
    {
      const code = [
        `const B=require(${JSON.stringify(path.join(ROOT, 'server', 'body.js'))});`,
        `const W=require(${JSON.stringify(path.join(ROOT, 'server', 'weather.js'))});`,
        'const a=W.anchors();',
        'const v=[B.coldTarget({day:a.summerMid,night:false}),B.coldTarget({day:a.summerMid,night:true}),',
        'B.coldTarget({day:a.winterMid,night:false}),B.coldTarget({day:a.winterMid,night:true})];',
        "process.stdout.write('ANCHORS'+JSON.stringify(v));",
      ].join('');
      const r = require('child_process').spawnSync(process.execPath, ['-e', code],
        { env: Object.assign({}, process.env, { WEATHER_DEV_C: '0', WEATHER_AMP_NOISE: '0' }), encoding: 'utf8' });
      let got = null;
      try { got = JSON.parse((r.stdout || '').split('ANCHORS')[1]); } catch (e) {}
      ok(got && JSON.stringify(got) === JSON.stringify([0, 0.45, 0.7, 1]),
        '★★⑭㉡ 튜닝1 채택 4점(여름낮 0 · 여름밤 0.45 · 겨울낮 0.7 · **겨울밤 1.00 클램프 없이**)이 곡선 위에 그대로 있다',
        JSON.stringify(got));
    }
    // 폴백 계단의 네 점이 앵커와 같은 값인가(사본 표류 방지 — 두 경로가 같은 수를 말해야 한다)
    ok(B.coldTarget({ seasonCold: 0, night: false }) === Wx.CFG.A_SUMMER_DAY
      && B.coldTarget({ seasonCold: 0, night: true }) === Wx.CFG.A_SUMMER_NIGHT
      && B.coldTarget({ seasonCold: 1, night: false }) === Wx.CFG.A_WINTER_DAY
      && B.coldTarget({ seasonCold: 1, night: true }) === Wx.CFG.A_WINTER_NIGHT,
      '★★⑭㉡ **폴백 4단 계단의 네 점 = 곡선의 네 앵커** (두 경로가 같은 값을 말한다)');

    // ── ㉢ 연속성 — 어디에도 계단이 없다(연말 경계 포함) ─────────────────────
    let worst = 0, worstAt = 0;
    for (let d = 0; d < 365 * 3; d += 0.25) {
      for (const n of [false, true]) {
        const j = Math.abs(out(d + 0.25, n) - out(d, n));
        if (j > worst) { worst = j; worstAt = d; }
      }
    }
    ok(worst < 0.02, `★★⑭㉢ 3년 내내 인접 0.25일 최대 도약 ${worst.toFixed(5)} < 0.02 = **계단 없음**`, `day ${worstAt}`);
    // ★자명 통과 금지 — 곡선이 실제로 크게 움직이긴 하는가
    const span = (() => { let mn = 9, mx = -9; for (let d = 0; d < 365; d++) { const v = out(d, true); mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; })();
    ok(span > 0.5, '★★⑭㉢ 자명 통과 금지 — 연중 밤 추위가 실제로 크게 변한다', `진폭 ${span.toFixed(3)}`);

    // ── ㉣ 극값 정렬 · 초겨울 < 한겨울 ───────────────────────────────────────
    //   ★날씨 편차가 하루 표본을 뒤집을 수 있다 ⇒ **여러 해 평균**으로 묻는다(계측기 교훈).
    const mean = (doy, n) => { let s2 = 0; for (let k = 0; k < 24; k++) s2 += out(doy + 365 * k, n); return s2 / 24; };
    const mEarly = mean(275, true), mDeep = mean(Math.round(A.winterMid), true), mSummer = mean(Math.round(A.summerMid), true);
    ok(mDeep > mEarly, '★★⑭㉣ **한겨울 밤이 초겨울 밤보다 춥다**(재민이 지적한 "같은 강도" 폐지)',
      `초겨울 ${mEarly.toFixed(3)} < 한겨울 ${mDeep.toFixed(3)}`);
    ok(mDeep > mSummer + 0.4, '★⑭㉣ 겨울이 여름보다 확실히 춥다', `${mSummer.toFixed(3)} → ${mDeep.toFixed(3)}`);
    ok(mean(Math.round(A.winterMid), false) > mean(275, false),
      '★⑭㉣ 낮에도 한겨울이 초겨울보다 춥다');

    // ── ㉤ 씨앗 결정론 · 해마다 다름 · 비반전 ────────────────────────────────
    const s1 = [], s2 = [];
    for (let d = 300; d < 340; d++) s1.push(Wx.devCOf(d));
    for (let d = 300; d < 340; d++) s2.push(Wx.devCOf(d));
    ok(JSON.stringify(s1) === JSON.stringify(s2), '★⑭㉤ 같은 날은 언제 물어도 같다(결정론 — 존·재시작 무관)');
    const yearDiff = [];
    for (let k = 0; k < 5; k++) yearDiff.push(+out(181 + 365 * k, true).toFixed(4));
    ok(new Set(yearDiff).size >= 4, '★★⑭㉤ **매년 같은 날짜가 서로 다르다**(재민: "매년 7월 1일이 같으면 안 된다")',
      yearDiff.join(' / '));
    ok(Math.max(...s1.map(Math.abs)) <= Wx.CFG.DEV_C + 1e-9,
      '★⑭㉤ 편차가 손잡이 한도(±DEV_C ℃) 안에 있다', `${Math.max(...s1.map(Math.abs)).toFixed(2)}℃ ≤ ${Wx.CFG.DEV_C}℃`);
    ok(mDeep > mEarly && mean(Math.round(A.summerMid), true) < mean(224, true),
      '★★⑭㉤ 잡음이 **계절 순서를 뒤집지 않는다**(여러 해 평균에서 여름 < 가을 < 겨울)');

    // ── ㉥ 일교차 변조 — 여름 밤 몫이 겨울보다 크다(곡선의 비선형이 만든다) ──
    const gapSummer = mean(Math.round(A.summerMid), true) - mean(Math.round(A.summerMid), false);
    const gapWinter = mDeep - mean(Math.round(A.winterMid), false);
    ok(gapSummer > gapWinter, '★★⑭㉥ 밤이 더하는 몫이 **여름 > 겨울**(한겨울 낮은 이미 천장 근처라 밤이 더할 여지가 작다)',
      `여름 ${gapSummer.toFixed(3)} > 겨울 ${gapWinter.toFixed(3)}`);
    const amps = []; for (let d = 0; d < 200; d++) amps.push(Wx.ampMultOf(d));
    ok(Math.min(...amps) >= Wx.CFG.AMP_MIN - 1e-9 && Math.max(...amps) <= Wx.CFG.AMP_MAX + 1e-9,
      '★⑭㉥ 일교차 배율이 한도 안에 있다', `${Math.min(...amps).toFixed(2)}~${Math.max(...amps).toFixed(2)}`);
    ok(new Set(amps.map((x) => x.toFixed(3))).size > 50, '★⑭㉥ 자명 통과 금지 — 일교차가 날마다 실제로 다르다');

    // ── ㉦ 마을 안전망 · 야생 무완충 ─────────────────────────────────────────
    const wd = Math.round(A.winterMid);
    const wild = B.coldTarget({ day: wd, night: true, warmth: 0, villageShelter: 0 });
    const vil = B.coldTarget({ day: wd, night: true, warmth: 0, villageShelter: 1 });
    const edge = B.coldTarget({ day: wd, night: true, warmth: 0, villageShelter: 0.5 });
    ok(vil < wild, '★★⑭㉦ **마을이 야생보다 따뜻하다**(재민: 마을 = 안전망 · 야생 = 위험)', `${wild} → ${vil}`);
    ok(edge > vil && edge < wild, '★⑭㉦ 가장자리는 그 사이다(벽이 아니라 사그라듦)', `${edge}`);
    ok(vil < B.STAGE_AT.cold[0], '★★⑭㉦ 마을 한겨울 밤 평형이 **1단계 아래** — 맨몸으로 무한히 버틴다',
      `${vil} < ${B.STAGE_AT.cold[0].toFixed(3)}`);
    // 실제로 재 본다 — 30분을 마을에서 버텨도 3단계가 안 온다 / 야생은 5~8분에 온다
    const S3 = B.STAGE_AT.cold[2] + B.CFG.STAGE_HYST;
    const clock = (ctx) => { const P = { hunger: 100, thirst: 100 }; B.ensure(P);
      for (let s = 1; s <= 3600; s++) { B.tick(P, 1, ctx); if (B.ensure(P).cold >= S3) return s; } return null; };
    const tVil = clock({ day: wd, night: true, warmth: 0, villageShelter: 1 });
    ok(tVil === null, '★★⑭㉦ 마을에선 한 시간을 버텨도 3단계가 **안 온다**', tVil === null ? '안 옴' : `${tVil}초`);
    // ★야생은 **여러 해**로 묻는다 — 날씨 편차가 있으니 "그 하루"가 아니라 "그 무렵의 밤"이 기준이다.
    //   (초안은 day 315 하루만 찍었다가 그 해가 마침 포근해서 실패했다. 곡선이 아니라 질문이 틀렸던 것.)
    const nights = [];
    for (let k = 0; k < 24; k++) nights.push(clock({ day: wd + 365 * k, night: true, warmth: 0, villageShelter: 0 }));
    const hitW = nights.filter((x) => x !== null).sort((a2, b2) => a2 - b2);
    const medW = hitW.length ? hitW[Math.floor(hitW.length / 2)] : null;
    ok(medW !== null && medW >= 300 && medW <= 480,
      '★★⑭㉦ 야생 맨몸 한겨울 밤은 **5~8분에 3단계**(재민 확정 목표 시작점 · 24년 표본 중앙값)',
      medW === null ? '안 옴' : `${(medW / 60).toFixed(1)}분 · ${hitW.length}/24 밤`);
    ok(hitW.length >= 8, '★⑭㉦ 한겨울 밤 상당수가 실제로 3단계까지 간다(야생 = 위험)', `${hitW.length}/24`);
    // ★★이 배치의 요점 그 자체 — 초겨울 밤은 한겨울 밤보다 **덜 위험하다**
    let earlyHits = 0;
    for (let k = 0; k < 24; k++) if (clock({ day: 275 + 365 * k, night: true, warmth: 0, villageShelter: 0 }) !== null) earlyHits++;
    ok(earlyHits < hitW.length,
      '★★⑭㉦ **초겨울 밤은 한겨울 밤보다 3단계에 덜 간다**(12월과 1월이 같은 강도가 아니다)',
      `초겨울 ${earlyHits}/24 < 한겨울 ${hitW.length}/24`);
    ok(/shelterAt/.test(codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'))),
      '★⑭㉦ 존이 마을 완충을 `SimVillages.shelterAt` 정본에서 받는다(사본 계산 없음)');

    // ── ㉧ HP 불감소 유지 · 시간 구조 불변 캐논 ──────────────────────────────
    {
      const P = { hunger: 100, thirst: 100, hp: 77 };
      for (let s = 0; s < 1800; s++) B.tick(P, 1, { day: wd, night: true, warmth: 0, villageShelter: 0 });
      ok(P.hp === 77 && B.ensure(P).cold > 0.9,
        '★★⑭㉧ 한겨울 야생에서 30분을 얼어도 **HP 는 한 점도 안 깎인다**(죽음 설계 배치 전까지 캐논)',
        `hp ${P.hp} · cold ${B.ensure(P).cold.toFixed(3)}`);
    }
    const cfgSrc = fs.readFileSync(path.join(ROOT, 'server', 'zone-config.js'), 'utf8');
    ok(/dayLengthMs:\s*24\s*\*\s*60\s*\*\s*1000/.test(cfgSrc),
      '★★⑭㉧ **하루 = 24분** 그대로다(시간 구조 불변 캐논 — 겨울 난이도는 시간이 아니라 곡선·완충으로 고친다)');
    const esrc = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
    ok(/const d = day % 365;/.test(esrc) && /CLIMATE = \{ zoneLatBase: 12, annualAmp: 12, diurnalAmp: 5/.test(esrc),
      '★★⑭㉧ **econ 무수정** — `seasonOf` 365일 4분기도, `CLIMATE` 도 정본 그대로다');
  }

  // ═══ ⑧ 픽스처 결백 ═════════════════════════════════════════════════════════
  say('\n⑧ 픽스처 결백(족보 ㊻)');
  // ★①(오프라인 불변)이 자명 통과하지 않으려면, 그 절이 **저장을 건드리지 않아야** 한다.
  //   `doEat` 같은 정본 경로는 안에서 `savePlayer` 를 부르지만 그건 ② 이후라 ①과 무관하다.
  //   그래서 **① 절의 코드만** 본다(주석 제외 — 위 codeOnly 주석 참조).
  const selfSrc = codeOnly(fs.readFileSync(__filename, 'utf8'));
  const sec1 = selfSrc.split('① 오프라인')[1] ? selfSrc.split('① 오프라인')[1].split('② 식사')[0] : '';
  ok(sec1.length > 200 && !/savePlayer|doEat|__e2e/.test(sec1),
    '★★⑧ ① 절은 `savePlayer`·픽스처를 **한 줄도 안 쓴다** — 정본 Body.* 로만 움직인다',
    `${sec1.length}자 검사`);
  ok(B.CFG.HUNGER_SEC > 0 && B.CFG.MOVE_FLOOR > 0, '★⑧ 손잡이가 전부 살아 있다(env 미설정 = 채택값)',
    `HUNGER_SEC ${B.CFG.HUNGER_SEC} · MOVE_FLOOR ${B.CFG.MOVE_FLOOR}`);

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
