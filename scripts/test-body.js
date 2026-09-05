#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
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
// ★★[T105 2026-09-05] **⑭·⑮·⑯ 은 비가 없던 세계에서 서명된 기준선이다.**
//   그 절들은 "옷 티어가 겨울밤을 막는가"를 24년 표본으로 잰다. T105 가 하늘의 비를 몸에 물리자
//   그 24밤 중 일부가 **젖은 밤**이 됐고, 그러면 그 절은 옷이 아니라 "옷 + 그날 비가 왔나"를 재게 된다.
//   ⇒ 재는 대상을 지키려고 그 절들에 **마른 세계**를 명시로 준다. 하네스가 화면을 재기 전에
//     바람을 끄는 것과 **같은 자리**다(T98 족보: 새 층이 서면 옛 판정의 가정이 먼저 깨진다).
//   ⚠감추는 게 아니라 자리를 나눈 것이다 — 젖은 밤이 실제로 더 위험하다는 것은 **⑲가 숫자로** 잰다.
const DRY = (c) => Object.assign({ wet: 0 }, c);
// ★★[T44] **긴 틱 픽스처는 스스로 굶는다.** 갈증은 게임 1일(=실시간 24분)에 바닥나므로
//   30분을 도는 추위 픽스처는 도중에 **갈증이 극단**이 되어 추위와 무관한 HP 감소를 만든다.
//   (초안이 실제로 그렇게 틀렸다 — 마을 대조군이 "추위로 깎였다"고 보고했는데 원인은 갈증이었다.)
//   ⇒ 다른 축을 재는 픽스처는 허기·갈증을 **매 틱 되돌려** 그 축만 남긴다.
const holdFed = (P) => { P.hunger = 100; P.thirst = 100; };

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
  // ★[T47 2026-09-01] 이 두 줄은 **자리를 옮겼다.** 종전엔 `savePlayer` 안에 손으로 쓴 직렬화
  //   리터럴(`body: Body.toSave(player)`)과 도착 쪽 `tools.body` 를 각각 찾았는데, T47 이
  //   직렬화를 `serializeBody`/`parseBody` **한 쌍**으로 모았다(존을 넘으면 몸이 새던 결함의 구조적 수리).
  //   ⇒ 검사의 뜻은 그대로다("저장되고, 복원된다"). 보는 자리만 그 한 쌍으로 옮긴다.
  ok(/function serializeBody\(p\)[\s\S]{0,900}body: Body\.toSave\(p\)/.test(zsrc),
    '★⑦ 저장 payload 에 몸 상태가 실린다(`serializeBody`)');
  ok(/function parseBody\([\s\S]{0,1400}out\.body = o\.body/.test(zsrc) && /_loadBody = B\.body/.test(zsrc),
    '★⑦ 복원 경로도 있다(저장만 하고 안 읽으면 반쪽이다 — `parseBody` → `_loadBody`)');
  ok(/tools_json: JSON\.stringify\(serializeBody\(player\)\)/.test(zsrc),
    '★⑦ 그리고 저장은 **그 한 함수만** 쓴다(손으로 쓴 두 번째 직렬화가 없다 — T47)');

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

  // ═══ ⑫ ★★캐논 변경 — 극단에서 HP 가 **천천히 깎인다** [T44 2026-09-01] ═════════
  //   ⚠이 절은 **뒤집힌 절**이다. 종전 제목은 *"아사 폐지 — 굶어도 죽지 않는다"* 였고
  //     "HP 가 한 점도 안 깎인다"를 못 박고 있었다. 재민 §12 가 그 캐논을 **폐기**했다:
  //     *"극단에 닿기 전엔 디버프만, 극단에 닿으면 HP 가 아주 천천히 깎인다.
  //       고증 최우선 — 물 안 마셔도 사는 세계는 없다."*
  say('\n⑫ 캐논 변경 — 극단 이전엔 디버프만 · 극단에선 천천히 깎인다(T44)');
  {
    // ── 극단 **이전**은 무변경이다(이 카드는 극단 이후만 더한다) ─────────────
    //   ★갈증은 매 틱 되돌린다 — 안 그러면 픽스처가 스스로 굶어 검사 대상이 바뀐다(위 `holdFed` 주석).
    const mid = { hunger: 30, thirst: 100, hp: 55, maxHp: 100 };   // 허기 심각도 0.70 — 3단계 문턱(0.89) 아래
    B.ensure(mid);
    for (let i = 0; i < 600; i++) { mid.thirst = 100; B.tick(mid, 1, { moving: false }); }
    ok(B.extremeHpRate(mid).rate === 0 && B.ensure(mid).hpDebt === 0,
      '★★⑫ **극단 이전엔 한 점도 안 깎인다** — 디버프 표는 그대로다(카드가 더한 건 극단 이후뿐)',
      `심각도 허기 ${(1 - mid.hunger / 100).toFixed(2)} · 문턱 ${B.extremeAt('hunger').toFixed(3)}`);
    ok(B.recoverMult(mid) > 0 && B.recoverMult(mid) < 1, '★⑫ (상황) 그 자리는 이미 회복이 느려진 자리다 — 자명 통과 금지',
      `회복 ×${B.recoverMult(mid)}`);

    // ── 극단이면 실제로 깎인다 ────────────────────────────────────────────
    const P = { hunger: 0, thirst: 0, hp: 55, maxHp: 100, inventory: {} };
    const hp0 = P.hp;
    let applied = 0;
    for (let i = 0; i < 600; i++) { B.tick(P, 1, { moving: false }); applied += B.takeHpDamage(P); }
    P.hp -= applied;
    ok(applied > 0 && P.hp < hp0, '★★⑫ 공복·탈수로 10분을 버티면 **HP 가 실제로 준다**(캐논 변경)',
      `${hp0} → ${P.hp} (10분에 ${applied}HP)`);
    ok(B.recoverMult(P) === 0, '★⑫ 회복도 여전히 멈춘다 — 감소와 회복 정지는 **다른 두 가지**다', B.recoverMult(P));
    // ★배선 계약은 그대로다 — `body.js` 는 여전히 `p.hp` 를 직접 안 만진다.
    //   (감소는 **비율만** 내고, 적용은 zone.js 의 정본 피해 경로가 한다 ⇒ 쓰러짐 사슬이 공짜로 붙는다.)
    const bsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'body.js'), 'utf8'));
    ok(!/\bp\.hp\s*(-=|=[^=])/.test(bsrc),
      '★★⑫ `body.js` 는 여전히 `p.hp` 를 **직접 안 만진다** — 비율만 내고 적용은 정본 경로가 한다');
    ok(/Body\.takeHpDamage/.test(zsrc) && /damagePlayer\(p, _hpDmg/.test(zsrc),
      '★★⑫ zone.js 가 그 비율을 **`damagePlayer` 정본 경로**로 낸다(HP 0 → 쓰러짐이 따라온다)');
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
      for (let s = 1; s <= 3600; s++) { B.tick(P, 1, DRY(ctx)); if (B.ensure(P).cold >= S3) return s; } return null; };
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

    // ── ㉧ ★★[뒤집힘 · T44] 한겨울 야생은 이제 **얼려 죽인다** · 시간 구조 불변 캐논 ──
    {
      //   ★허기·갈증을 매 틱 되돌린다 — 30분은 갈증 시계(24분)보다 길어서 안 그러면 **갈증이 범인**이 된다.
      //   ★★그리고 **한 밤으로 재지 마라**(족보 ㊻ · T4 에서 같은 자리에 두 번 걸렸다):
      //     추위 극단 문턱은 0.93 인데 **평범한 한겨울 밤의 평형은 0.9278** 이다 — 아슬아슬하게 못 넘는다.
      //     날씨 편차가 얹히는 **추운 해**에만 넘는다. 그러니 판정은 24년 표본의 **분포**여야 한다.
      const freeze = (shelter, doy) => { const P = { hunger: 100, thirst: 100, hp: 77 }; let a = 0;
        for (let s = 0; s < 1800; s++) { holdFed(P); B.tick(P, 1, DRY({ day: doy, night: true, warmth: 0, villageShelter: shelter })); a += B.takeHpDamage(P); }
        return { a, cold: B.ensure(P).cold }; };
      let wildYears = 0, wildHp = 0, vilYears = 0;
      for (let k = 0; k < 24; k++) {
        const w = freeze(0, wd + 365 * k); if (w.a > 0) { wildYears++; wildHp += w.a; }
        if (freeze(1, wd + 365 * k).a > 0) vilYears++;
      }
      ok(wildYears > 0,
        '★★⑭㉧ **한겨울 야생 밤에 얼면 HP 가 깎인다**(종전 "한 점도 안 깎인다"의 뒤집힘 · T44)',
        `24년 중 ${wildYears}년 · 그 해들 합계 ${wildHp}HP/30분`);
      ok(wildYears < 24,
        '★★⑭㉧ 그런데 **모든 해가 그런 건 아니다** — 평범한 밤의 평형(0.9278)은 극단 문턱(0.93)을 못 넘는다',
        `${wildYears}/24년만 넘는다 = 가장 추운 밤이 진짜 위험하다`);
      ok(vilYears === 0, '★★⑭㉧ **마을 안에선 한 해도 안 깎인다** — 새 예외가 아니라 기존 완충이 그 일을 한다',
        `마을 ${vilYears}/24년`);
    }
    const cfgSrc = fs.readFileSync(path.join(ROOT, 'server', 'zone-config.js'), 'utf8');
    ok(/dayLengthMs:\s*24\s*\*\s*60\s*\*\s*1000/.test(cfgSrc),
      '★★⑭㉧ **하루 = 24분** 그대로다(시간 구조 불변 캐논 — 겨울 난이도는 시간이 아니라 곡선·완충으로 고친다)');
    const esrc = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
    ok(/const d = day % 365;/.test(esrc) && /CLIMATE = \{ zoneLatBase: 12, annualAmp: 12, diurnalAmp: 5/.test(esrc),
      '★★⑭㉧ **econ 무수정** — `seasonOf` 365일 4분기도, `CLIMATE` 도 정본 그대로다');
  }

  // ═══ ⑮ 추위 2차 — 천장 해제 · 옷 티어 [재민 확정 2026-08-31] ═════════════════
  //   재민: *"가장 추운 밤은 '더 춥게'가 아니라 '더 빨리'"* ·
  //         *"조잡한 베옷은 한겨울 야생 밤을 못 막는다 — 겨울 = 가죽·모피 수요"*
  say('\n⑮ 추위 2차 — 목표점 천장 해제 · 옷 티어 분화');
  {
    const Wx = require(path.join(ROOT, 'server', 'weather.js'));
    const PI = require(path.join(ROOT, 'server', 'player-items.js'));
    const A = Wx.anchors();
    const wd = Math.round(A.winterMid);
    const S3 = B.STAGE_AT.cold[2] + B.CFG.STAGE_HYST;
    const clock = (ctx) => { const P = { hunger: 100, thirst: 100 }; B.ensure(P);
      for (let s2 = 1; s2 <= 3600; s2++) { B.tick(P, 1, DRY(ctx)); if (B.ensure(P).cold >= S3) return s2; } return null; };
    const years = (ctx, doy) => { let h = 0; const ts = [];
      for (let k = 0; k < 24; k++) { const t = clock(Object.assign({ day: (doy == null ? wd : doy) + 365 * k }, ctx)); if (t !== null) { h++; ts.push(t); } }
      ts.sort((a2, b2) => a2 - b2); return { hit: h, med: ts.length ? ts[ts.length >> 1] : null }; };

    // ── ㉠ 천장 해제 — 목표점은 1 을 넘고, 상태는 **절대** 안 넘는다 ─────────
    const tHigh = B.coldTarget({ day: wd, night: true, warmth: 0, elevKm: 1 });
    ok(tHigh > 1, '★★⑮㉠ 목표점이 **1 을 넘는다**(천장 해제) — 종전엔 여기서 잘렸다', tHigh);
    ok(Wx.coldOfC(-15) > Wx.coldOfC(-5), '★⑮㉠ ℃ 곡선이 추운 끝에서 **평평하지 않다**',
      `−15℃ ${Wx.coldOfC(-15).toFixed(3)} > −5℃ ${Wx.coldOfC(-5).toFixed(3)}`);
    // ★상태값 불변 — 1 초과 목표점을 오래 먹여도 저장·페이로드가 1 을 넘지 않는다
    {
      const P = { hunger: 100, thirst: 100 };
      for (let s2 = 0; s2 < 1800; s2++) B.tick(P, 1, DRY({ day: wd, night: true, warmth: 0, elevKm: 2 }));
      const bd = B.ensure(P);
      ok(bd.cold <= 1 && bd.cold > 0.99, '★★⑮㉠ **상태는 0~1** — 목표점 1.32 를 30분 먹여도 1 에서 멈춘다', bd.cold);
      ok(B.toSave(P).cold <= 1 && B.selfPayload(P).cold <= 1, '★★⑮㉠ 저장·페이로드에도 1 초과가 안 샌다',
        `save ${B.toSave(P).cold} · self ${B.selfPayload(P).cold}`);
      ok(B.severity(P).cold <= 1 && B.moodles(P).every((m) => m.sev <= 1), '★⑮㉠ 심각도·무들 단계도 0~1 규약 그대로');
    }
    // 소스 계약 — `tick` 만이 상태를 자른다(coldTarget 에 상한 클램프가 되살아나면 여기서 걸린다)
    const bsrc2 = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'body.js'), 'utf8'));
    const ctSrc = bsrc2.split('function coldTarget')[1].split('\nfunction ')[0];
    //   ★목표점 `t` 를 1 로 자르는 줄만 본다(마을 완충 비율의 0~1 클램프는 다른 것이다).
    //     폴백 계단은 종전 계약대로 1 에서 자르므로 그 한 줄은 허용한다 — 곡선 경로엔 없어야 한다.
    const ctClamps = (ctSrc.match(/Math\.min\(1,\s*t\b|Math\.min\(1,\s*Math\.max\(0,\s*t\b/g) || []);
    ok(ctClamps.length === 0, '★★⑮㉠ `coldTarget` 이 **목표점을 1 로 자르지 않는다**(천장이 되살아나지 않았다)',
      ctClamps.join(' | ') || '0개');
    ok(/Math\.min\(1, b\.cold/.test(bsrc2), '★⑮㉠ 대신 `tick` 이 상태를 자른다(0~1 규약의 유일한 자리)');

    // ── ㉡ 가장 추운 밤이 **더 빨리** 3단계 ───────────────────────────────────
    const nights = [];
    for (let k = 0; k < 24; k++) { const d = wd + 365 * k; nights.push({ tgt: B.coldTarget({ day: d, night: true, warmth: 0 }), t3: clock({ day: d, night: true, warmth: 0 }) }); }
    nights.sort((a2, b2) => b2.tgt - a2.tgt);
    const reached = nights.filter((n) => n.t3 !== null);
    ok(reached.length >= 8, '(상황) 24년 중 3단계에 닿는 밤이 실제로 여럿이다 — 아니면 아래가 자명하다', `${reached.length}/24`);
    ok(nights[0].t3 !== null && nights[0].t3 < reached[Math.floor(reached.length / 2)].t3,
      '★★⑮㉡ **가장 추운 밤이 평범한 한겨울 밤보다 빨리** 3단계에 닿는다(강도가 아니라 속도)',
      `최한 ${(nights[0].t3 / 60).toFixed(1)}분 < 중앙 ${(reached[Math.floor(reached.length / 2)].t3 / 60).toFixed(1)}분`);
    ok(new Set(reached.map((n) => n.t3)).size >= 5,
      '★★⑮㉡ 도달 시간이 **여러 값으로 갈린다** — 종전엔 클램프 때문에 전부 같은 한 값이었다',
      `${new Set(reached.map((n) => n.t3)).size}가지`);
    // 초겨울은 여전히 훨씬 덜 위험하다(1차 배치의 약속이 안 깨졌다)
    const early = years({ night: true, warmth: 0 }, 275);
    ok(early.hit < reached.length, '★⑮㉡ 초겨울 밤은 여전히 한겨울보다 덜 간다',
      `초겨울 ${early.hit}/24 < 한겨울 ${reached.length}/24`);

    // ── ㉢ 고도 감률 부활 — elevKm 스윕이 **단조** ────────────────────────────
    const sweep = [0, 0.25, 0.5, 1, 2].map((el) => ({ el, tgt: B.coldTarget({ day: wd, night: true, warmth: 0, elevKm: el }), t3: clock({ day: wd, night: true, warmth: 0, elevKm: el }) }));
    let mono = true;
    for (let i = 1; i < sweep.length; i++) if (!(sweep[i].tgt > sweep[i - 1].tgt)) mono = false;
    ok(mono, '★★⑮㉢ **높을수록 목표점이 높다**(econ 감률 −6.5℃/km 가 살아 있다)',
      sweep.map((x) => `${x.el}km ${x.tgt}`).join(' · '));
    const hi = sweep.filter((x) => x.t3 !== null);
    let monoT = true;
    for (let i = 1; i < hi.length; i++) if (!(hi[i].t3 < hi[i - 1].t3)) monoT = false;
    ok(hi.length >= 3 && monoT, '★★⑮㉢ **높을수록 빨리** 3단계에 닿는다',
      hi.map((x) => `${x.el}km ${(x.t3 / 60).toFixed(1)}분`).join(' · '));
    // ★정직 보고 — 이 세계의 산은 35m 다. 모델은 살았지만 세계가 낮다.
    const at35 = B.coldTarget({ day: wd, night: true, warmth: 0, elevKm: 0.035 });
    say(`     ⚠산 높이 캐논 35m 에서의 실제 기여: ${(at35 - sweep[0].tgt).toFixed(4)} (사실상 0) — 게다가 바위 셀은 통행 불가다. 회부.`);

    // ── ㉣ 옷 티어 — 실제로 **계단**이 서는가 ────────────────────────────────
    //   ★옷은 게임이 만드는 그대로 쓴다(하네스가 warmth 를 지어내지 않는다).
    const tier = (mat, lv) => PI.craftItem('clothes', lv, { [mat]: 3 }).attrs.warmth;
    const W_BARE = 0, W_HEMP = tier('hemp', 0), W_LEATHER = tier('leather', 5), W_FUR = tier('fur', 8);
    ok(W_HEMP < W_LEATHER && W_LEATHER < W_FUR, '(상황) 재료가 실제로 다른 방한값을 낸다',
      `삼베 ${W_HEMP} < 가죽 ${W_LEATHER} < 모피 ${W_FUR}`);
    const rBare = years({ night: true, warmth: W_BARE });
    const rHemp = years({ night: true, warmth: W_HEMP });
    const rLeat = years({ night: true, warmth: W_LEATHER });
    const rFur = years({ night: true, warmth: W_FUR });
    say(`     한겨울 자정 야생 24년 도달 — 맨몸 ${rBare.hit} · 삼베옷 ${rHemp.hit} · 가죽옷 ${rLeat.hit} · 갖옷 ${rFur.hit}`);
    ok(rHemp.hit >= 12, '★★⑮㉣ **삼베옷은 한겨울 야생 밤을 못 막는다**(≥50%)', `${rHemp.hit}/24`);
    ok(rLeat.hit <= 2, '★★⑮㉣ **가죽옷이면 버틸 만하다**(≤10%)', `${rLeat.hit}/24`);
    ok(rFur.hit === 0, '★★⑮㉣ **갖옷이면 한겨울 밤이 안전하다**(≈0%)', `${rFur.hit}/24`);
    ok(rBare.hit >= rHemp.hit && rHemp.hit > rLeat.hit && rLeat.hit >= rFur.hit,
      '★★⑮㉣ 티어가 **단조 계단**이다(뒤집힘 없음)');
    // ★자명 통과 금지 — 옷이 초겨울·마을에서는 실제로 쓸모가 있다(전부 무용지물이 아니다)
    ok(B.coldTarget({ day: wd, night: true, warmth: W_HEMP }) < B.coldTarget({ day: wd, night: true, warmth: 0 }),
      '★⑮㉣ 삼베옷도 목표점을 낮추긴 한다(쓸모 0 이 아니다)');

    // ── ㉤ 단열 모델 — ℃ 로 작용하고, 문턱 아래는 0 ──────────────────────────
    ok(B.warmthInsC(B.CFG.WARMTH_MIN) === 0 && B.warmthInsC(B.CFG.WARMTH_MIN - 1) === 0,
      '★★⑮㉤ 방한이 문턱 아래면 단열 **0** — 헐거운 옷은 바람이 지나간다', `문턱 ${B.CFG.WARMTH_MIN}`);
    ok(B.warmthInsC(W_FUR) > B.warmthInsC(W_LEATHER) && B.warmthInsC(W_LEATHER) > 0,
      '★⑮㉤ 문턱 위에서는 방한에 비례해 단열이 는다',
      `가죽 +${B.warmthInsC(W_LEATHER).toFixed(2)}℃ · 갖옷 +${B.warmthInsC(W_FUR).toFixed(2)}℃`);
    // ★옷과 고도가 **같은 단위**라 상쇄된다 — 이게 ℃ 모델을 택한 이유다
    const insFur = B.warmthInsC(W_FUR);
    const elevSame = insFur / 6.5;   // econ 감률 −6.5℃/km 의 역
    const a = B.coldTarget({ day: wd, night: true, warmth: 0, elevKm: 0 });
    const c2 = B.coldTarget({ day: wd, night: true, warmth: W_FUR, elevKm: elevSame });
    ok(Math.abs(a - c2) < 0.01, '★★⑮㉤ **갖옷 +4.7℃ 와 고도 −4.7℃ 가 정확히 상쇄된다**(같은 단위)',
      `평지 맨몸 ${a} ≈ ${elevSame.toFixed(3)}km 갖옷 ${c2}`);
    // 이중 계산 금지 — 곡선 경로에선 곱셈 노출을 안 쓴다
    const ctSrc2 = ctSrc;
    ok(/if \(outdoor === null\) t \*= exposure/.test(ctSrc2),
      '★★⑮㉤ 곡선 경로에서 **곱셈 노출을 안 곱한다**(옷은 ℃ 로 이미 들어갔다 — 이중 계산 금지)');

    // ── ㉥ 폴백(4단 계단) 경로는 **종전 그대로** ─────────────────────────────
    const fb = B.coldTarget({ seasonCold: 1, night: true, warmth: 25 });
    const fbExpect = +(1.0 * Math.max(0, 1 - 25 / B.CFG.WARMTH_FULL)).toFixed(4);
    ok(fb === fbExpect, '★⑮㉥ `day` 없는 폴백은 종전 **곱셈 노출** 계약 그대로다', `${fb} = ${fbExpect}`);

    // ── ㉦ ★★[뒤집힘 · T44] 목표점이 높을수록 **더 빨리** 깎인다 · econ 무수정 ────
    {
      const drain = (el) => { const P = { hunger: 100, thirst: 100, hp: 63 }; let a = 0;
        for (let s2 = 0; s2 < 1800; s2++) { holdFed(P); B.tick(P, 1, DRY({ day: wd, night: true, warmth: 0, elevKm: el })); a += B.takeHpDamage(P); }
        return { a, cold: B.ensure(P).cold }; };
      const hi = drain(2), lo = drain(0);
      ok(hi.a > 0, '★★⑮㉦ 목표점 1.3 짜리 밤에 30분을 얼면 **HP 가 깎인다**(종전 "안 깎인다"의 뒤집힘 · T44)',
        `${hi.a}HP · cold ${hi.cold}`);
      ok(hi.a >= lo.a, '★⑮㉦ 더 추운 자리가 **더 많이** 깎는다(연속 — 계단이 아니다)',
        `2km ${hi.a}HP ≥ 평지 ${lo.a}HP`);
    }
    const esrc2 = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
    ok(/CLIMATE = \{ zoneLatBase: 12, annualAmp: 12, diurnalAmp: 5/.test(esrc2) && /const d = day % 365;/.test(esrc2),
      '★★⑮㉦ **econ 무수정** — 기온 모델도 계절도 정본 그대로');

    // ── ㉧ 옷 이름 = 재료(고증) · 장인 구매도 재료를 따른다 ──────────────────
    ok(/갖옷/.test(PI.displayItem(PI.craftItem('clothes', 8, { fur: 3 })))
      && /삼베옷/.test(PI.displayItem(PI.craftItem('clothes', 0, { hemp: 3 }))),
      '★⑮㉧ 옷이 **재료 이름**으로 불린다(갖옷·삼베옷 — 고증)',
      PI.displayItem(PI.craftItem('clothes', 8, { fur: 3 })));
    const buyHemp = PI.materializeFromVillage('clothes', 0.8, () => 0.5, { hemp: 3 });
    const buyFur = PI.materializeFromVillage('clothes', 0.8, () => 0.5, { fur: 3 });
    ok(buyFur.attrs.warmth > buyHemp.attrs.warmth,
      '★★⑮㉧ **장인 구매도 가져간 재료를 따른다** — 이름이 성능을 말한다(종전엔 재료 무관 동일값)',
      `삼베 ${buyHemp.attrs.warmth} < 모피 ${buyFur.attrs.warmth}`);
  }

  // ═══ ⑯ 바람 노출 · 삼베옷 하향 · 바닷물 — [T4 2026-09-01 재민 확정 ④⑤] ══════
  //   재민 확정 ④ *"산 추위 = 바람 노출(고도 감률 위에 노출도 항)"* · ⑤ *"장인 삼베옷 하향"*
  //   + T3 동봉 *"바닷물을 마시면 갈증이 회복되는 결함"*.
  say('\n⑯ 바람 노출 · 옷 하향 · 바닷물');
  {
    const Wind = require(path.join(ROOT, 'server', 'wind.js'));
    const Wx2 = require(path.join(ROOT, 'server', 'weather.js'));
    const PI2 = require(path.join(ROOT, 'server', 'player-items.js'));
    const A2 = Wx2.anchors();
    const WD = Math.round(A2.winterMid), SD = Math.round(A2.summerMid);
    const S3b = B.STAGE_AT.cold[2] + B.CFG.STAGE_HYST;
    const clock2 = (ctx) => { const P = { hunger: 100, thirst: 100 }; B.ensure(P);
      for (let s2 = 1; s2 <= 3600; s2++) { B.tick(P, 1, DRY(ctx)); if (B.ensure(P).cold >= S3b) return s2; } return null; };
    const years2 = (ctx, doy) => { let h = 0; const ts = [];
      for (let k = 0; k < 24; k++) { const t = clock2(Object.assign({ day: doy + 365 * k }, ctx)); if (t !== null) { h++; ts.push(t); } }
      ts.sort((a2, b2) => a2 - b2); return { hit: h, med: ts.length ? ts[ts.length >> 1] : null }; };

    // ── ㉠ 사본 금지 · 주사위 금지 (소스 계약) ───────────────────────────────
    const wnsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'wind.js'), 'utf8'));
    const dc2 = (wnsrc.match(/\b(90|180|270|315|365|182\.5)\b/g) || []);
    ok(dc2.length === 0, '★★⑯㉠ `wind.js` 에 계절·연 길이 상수가 **한 개도 없다**(전부 econ 에서 유도)', dc2.join(',') || '0개');
    ok(!/Math\.random|Math\.imul|_h\(|hash/i.test(wnsrc),
      '★★⑯㉠ **주사위 금지** — 바람은 지형과 계절의 결정론 함수다(난수·해시 0줄)');
    ok(!/ridges|valleys|hanbando-terrain|isPointInRiver/.test(wnsrc),
      '★★⑯㉠ **지형 사본 금지** — 산맥 좌표를 스스로 읽지 않고 정본 술어를 주입받는다');

    // ── ㉡ 전제 — 지형이 실제로 물렸고, 노출이 살아 있는 자리가 있는가 ───────
    ok(Wind.available(), '★★⑯㉡ 전제 — zone.js 가 정본 지형 술어를 주입했다(아니면 아래가 전부 0 이다)');
    //   ★앵커는 **반올림하지 않은 극값**으로 묻는다 — 최난일은 doy 132.5 라 133 으로 반올림하면
    //     −0.99996 이 나온다. 그건 모델이 아니라 내 질문의 어긋남이다(족보 ㊻: 하네스가 먼저 틀린다).
    ok(Math.abs(Wind.seasonWind(A2.winterMid) - 1) < 1e-9 && Math.abs(Wind.seasonWind(A2.summerMid) + 1) < 1e-9,
      '★★⑯㉡ 탁월풍 세기가 최한일 +1(북서) · 최난일 −1(남동)',
      `${Wind.seasonWind(A2.winterMid)} / ${Wind.seasonWind(A2.summerMid)}`);

    // ★★픽스처는 **찾는다, 고르지 않는다**(족보 73) — 산맥 폴리라인 둘레의 걸을 수 있는 셀을
    //   훑어 노출 최대/최소 자리를 게임 자신에게 묻는다. 좌표를 손으로 적으면 그건 소원이다.
    const hard = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
    const walkable = (x, y) => !H.isRockTileLocal(x, y) && !H.isWaterTileLocal(x, y);
    let ridgeAt = null, ridgeX = -1, valleyAt = null, valleyX = 9;
    for (const r of hard.ridges) {
      for (let i = 0; i < r.path.length; i += 3) {
        const [cx, cy] = r.path[i].pos;
        for (let a = 0; a < 16; a++) {
          for (const d of [700, 1100, 1600]) {
            const ang = 2 * Math.PI * a / 16;
            const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
            if (x < 200 || y < 200 || !walkable(x, y)) continue;
            const e = Wind.explain(x, y, WD, 0);
            if (e.X > ridgeX) { ridgeX = e.X; ridgeAt = [Math.round(x), Math.round(y), e]; }
            // ★골 후보는 **양쪽 다 산이 선 자리**여야 한다(평지를 '골'이라 부르면 자명 통과다)
            if (e.bNW > 0.3 && e.bSE > 0.3 && e.X < valleyX) { valleyX = e.X; valleyAt = [Math.round(x), Math.round(y), e]; }
          }
        }
      }
    }
    ok(!!ridgeAt && !!valleyAt, '★⑯㉡ 산맥 둘레에서 노출 최대·최소 자리를 **찾았다**',
      ridgeAt && valleyAt ? `능선 ${ridgeAt[0]},${ridgeAt[1]} X${ridgeX} · 골 ${valleyAt[0]},${valleyAt[1]} X${valleyX}` : 'X');
    // ★★검사 상황 선행 assert — 두 픽스처가 **정말 산속**이고, 다른 것은 바람 기하뿐인가
    if (ridgeAt && valleyAt) {
      const re = ridgeAt[2], ve = valleyAt[2];
      ok(re.blockDn > 0.5 && re.openUp > 0.5,
        '★★⑯㉡ (상황) 능선 픽스처는 **풍상이 트이고 풍하가 막힌** 자리다 — 그게 풍상 사면의 정의',
        `openUp ${re.openUp} · blockDn ${re.blockDn}`);
      ok(ve.bNW > 0.3 && ve.bSE > 0.3,
        '★★⑯㉡ (상황) 골 픽스처는 **양쪽 다 산이 선** 자리다(평지가 아니다 — 자명 통과 금지)',
        `bNW ${ve.bNW} · bSE ${ve.bSE}`);
      // ★★"같은 고도" 라는 전제 자체를 잰다 — 이 세계엔 걸을 수 있는 고지가 없어 **둘 다 0** 이다.
      //   (정직 보고: 그래서 ㉣의 차이는 고도가 아니라 **오직 바람 기하** 때문이다.)
      const elR = H.elevKmAt({ x: ridgeAt[0], y: ridgeAt[1] }), elV = H.elevKmAt({ x: valleyAt[0], y: valleyAt[1] });
      ok(elR === elV && elR === 0,
        '★★⑯㉡ (상황) 두 픽스처는 **정말 같은 고도**다(둘 다 0 — 이 세계엔 걸을 수 있는 고지가 없다)',
        `능선 ${elR}km · 골 ${elV}km`);
    }

    // ── ㉢ 결정론 · [0,1] · 계절 연속 ────────────────────────────────────────
    if (ridgeAt) {
      const [rx, ry] = ridgeAt;
      const a1 = Wind.exposureAt(rx, ry, WD, 0), a2 = Wind.exposureAt(rx, ry, WD, 0);
      Wind._reset();
      const a3 = Wind.exposureAt(rx, ry, WD, 0);
      ok(a1 === a2 && a2 === a3, '★★⑯㉢ **같은 셀·같은 날이면 언제나 같은 값**(캐시를 비워도 같다 — 결정론)', `${a1} / ${a3}`);
      let mn = 9, mx = -9, worst2 = 0, worstDay = 0;
      for (let d = 0; d < 365 * 3; d += 0.5) {
        const v = Wind.exposureAt(rx, ry, d, 0);
        if (v < mn) mn = v; if (v > mx) mx = v;
        const j = Math.abs(Wind.exposureAt(rx, ry, d + 0.5, 0) - v);
        if (j > worst2) { worst2 = j; worstDay = d; }
      }
      ok(mn >= 0 && mx <= 1, '★★⑯㉢ 노출도가 **[0,1] 안에** 있다(3년 전수)', `${mn} … ${mx}`);
      ok(worst2 < 0.02, `★★⑯㉢ 계절 방향이 **연속**이다 — 인접 0.5일 최대 도약 ${worst2.toFixed(5)} < 0.02(계단 금지)`, `day ${worstDay}`);
      ok(mx > 0.3, '★⑯㉢ 자명 통과 금지 — 그 자리의 노출이 실제로 크게 변한다', `최대 ${mx}`);
      // ★계절이 뒤집히면 같은 자리가 **풍하**가 된다 — 북서풍/남동풍이 진짜로 갈린다
      ok(Wind.exposureAt(rx, ry, SD, 0) < Wind.exposureAt(rx, ry, WD, 0) * 0.5,
        '★★⑯㉢ 여름(남동풍)엔 같은 자리가 **풍하**가 되어 노출이 무너진다',
        `겨울 ${Wind.exposureAt(rx, ry, WD, 0)} → 여름 ${Wind.exposureAt(rx, ry, SD, 0)}`);
    }

    // ── ㉣ 능선 vs 골 — 3단계 도달 시간 ≥ 1.5배 ─────────────────────────────
    //   ★★**한 밤으로 재지 마라**(족보 ㊻ · cold-matrix 초안이 딱 이렇게 틀렸다):
    //     날씨 편차 때문에 어떤 해의 한겨울 밤은 안 닿는다. 초안은 day 315 **한 해**만 재다가
    //     골이 `null`(그 해엔 안 닿음)이 나와 "0.00배"라는 없는 결함을 보고했다.
    //     ⇒ 24년 표본의 **중앙 도달 시간**과 **도달률** 두 가지로 잰다.
    if (ridgeAt && valleyAt) {
      const rR = years2({ night: true, warmth: 0, windExposure: ridgeX }, WD);
      const rV = years2({ night: true, warmth: 0, windExposure: valleyX }, WD);
      ok(rR.hit >= 12 && rV.hit >= 6, '(상황) 두 자리 다 여러 해의 한겨울 밤에 3단계에 닿는다 — 아니면 비교가 안 된다',
        `능선 ${rR.hit}/24 · 골 ${rV.hit}/24`);
      ok(rR.med !== null && rV.med !== null && rV.med >= rR.med * 1.5,
        '★★⑯㉣ **같은 고도라도 능선이 골보다 훨씬 빨리 언다**(골 중앙 도달시간 ≥ 능선의 1.5배)',
        `능선 ${(rR.med / 60).toFixed(1)}분 · 골 ${(rV.med / 60).toFixed(1)}분 = ${(rV.med / rR.med).toFixed(2)}배`);
      ok(rR.hit > rV.hit, '★★⑯㉣ 능선은 **더 많은 밤에** 3단계까지 간다(강도가 아니라 빈도로도 갈린다)',
        `능선 ${rR.hit}/24 > 골 ${rV.hit}/24`);
    }

    // ── ㉤ 숲·마을이 노출을 죽인다 — ★노출이 있는 자리에서 잰다(자명 통과 금지) ─
    if (ridgeAt) {
      const [rx, ry] = ridgeAt;
      const bare = Wind.exposureAt(rx, ry, WD, 0);
      ok(Wind.exposureAt(rx, ry, WD, 0.5) < bare && Wind.exposureAt(rx, ry, WD, 1) === 0,
        '★★⑯㉤ **마을 완충이 노출을 사그라뜨린다**(한복판이면 정확히 0 = 노출 항 무효)',
        `야생 ${bare} · 절반 ${Wind.exposureAt(rx, ry, WD, 0.5)} · 한복판 ${Wind.exposureAt(rx, ry, WD, 1)}`);
      // 마을이 **두 번** 깎지 않는다 — 감액은 여전히 COLD_VILLAGE_SHELTER 한 곳 몫이다
      const tv1 = B.coldTarget({ day: WD, night: true, warmth: 0, villageShelter: 1, windExposure: Wind.exposureAt(rx, ry, WD, 1) });
      const tv0 = B.coldTarget({ day: WD, night: true, warmth: 0, villageShelter: 1, windExposure: 0 });
      ok(tv1 === tv0, '★★⑯㉤ **마을 이중 적용 금지** — 마을 안에선 노출 항이 정확히 ×1 이다', `${tv1} = ${tv0}`);
      // 숲 — 노출된 자리에 숲을 씌운 대조군(정본 지형을 다시 주입해 되돌린다)
      const realCtx = { isRock: (x, y) => H.isRockTileLocal(x, y), forestMult: (x, y) => { try { return H.terrain.getForestMultiplier('hanbando', x, y); } catch (e) { return 1; } } };
      Wind.bindTerrain({ isRock: realCtx.isRock, forestMult: () => Wind.CFG.FOREST_FULL });
      const inForest = Wind.exposureAt(rx, ry, WD, 0);
      Wind.bindTerrain(realCtx);
      const openAgain = Wind.exposureAt(rx, ry, WD, 0);
      ok(inForest < openAgain && openAgain === bare,
        '★★⑯㉤ **숲이 바람을 막는다**(같은 자리·같은 날 · 숲만 바꾼 A/B · 되돌리면 원값)',
        `민둥 ${openAgain} → 숲속 ${inForest}`);
    }

    // ── ㉥ 고도 감률과 **독립** — 노출을 켜도 고도 스윕이 여전히 단조 ────────
    {
      const XR = ridgeX > 0 ? ridgeX : 1;
      const sweep2 = [0, 0.25, 0.5, 1, 2].map((el) => B.coldTarget({ day: WD, night: true, warmth: 0, elevKm: el, windExposure: XR }));
      let mono2 = true;
      for (let i = 1; i < sweep2.length; i++) if (!(sweep2[i] > sweep2[i - 1])) mono2 = false;
      ok(mono2, '★★⑯㉥ 노출을 켜도 **고도 스윕이 여전히 단조**다(두 항은 독립)', sweep2.join(' · '));
      // 곱셈 배율이 정확히 (1 + K·X) 인가 — 항이 하나임을 산수로 못 박는다
      const t0w = B.coldTarget({ day: WD, night: true, warmth: 0, windExposure: 0 });
      const t1w = B.coldTarget({ day: WD, night: true, warmth: 0, windExposure: XR });
      ok(Math.abs(t1w - t0w * (1 + B.CFG.COLD_WIND_K * XR)) < 0.002,
        '★★⑯㉥ 노출은 **항 하나**다 — 목표점 × (1 + K·X) 그대로(새 식 없음)',
        `${t0w} × (1+${B.CFG.COLD_WIND_K}×${XR}) = ${(t0w * (1 + B.CFG.COLD_WIND_K * XR)).toFixed(4)} vs ${t1w}`);
      // ★평지는 안 움직인다 — 추위 2차 기준선 보존의 근거
      ok(B.coldTarget({ day: WD, night: true, warmth: 0, windExposure: 0 })
        === B.coldTarget({ day: WD, night: true, warmth: 0 }),
        '★★⑯㉥ **평지(X=0)의 목표점은 한 자리도 안 움직인다** — 기존 기준선이 여기서 보존된다');
    }

    // ── ㉦ 옷 티어 — 삼베 < 가죽 < 모피 **단조** + 계단 매트릭스 [재민 확정 ⑤] ──
    const wOf = (m, l) => PI2.craftItem('clothes', l, { [m]: 3 }).attrs.warmth;
    const hempMax = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => wOf('hemp', l)));
    const ramieMax = Math.max(...[0, 5, 10].map((l) => wOf('ramie', l)));
    ok(hempMax < wOf('leather', 5),
      '★★⑯㉦ **아무리 잘 짜도 삼베옷은 가죽옷을 못 이긴다**(장인 베옷 하향 — 재민 확정 ⑤)',
      `삼베 최대 ${hempMax} < 가죽옷 ${wOf('leather', 5)}`);
    ok(ramieMax <= hempMax,
      '★★⑯㉦ 모시로 갈아타도 소용없다 — **식물 섬유는 같은 천장**을 받는다(구멍 막기)',
      `모시 최대 ${ramieMax}`);
    ok(wOf('hemp', 0) === 15 && B.warmthInsC(wOf('hemp', 0)) > 0,
      '★⑯㉦ 아랫칸은 그대로다 — 조잡 베옷 15 는 안 건드렸다(배율이 아니라 상한을 쓴 이유)',
      `${wOf('hemp', 0)} → +${B.warmthInsC(wOf('hemp', 0)).toFixed(2)}℃`);
    {
      let mono3 = true;
      for (const l of [0, 3, 5, 8, 10]) if (!(wOf('hemp', l) <= wOf('leather', l) && wOf('leather', l) < wOf('fur', l))) mono3 = false;
      ok(mono3, '★★⑯㉦ 숙련 전 구간에서 **삼베 ≤ 가죽 < 모피** 단조',
        [0, 5, 10].map((l) => `Lv${l} ${wOf('hemp', l)}/${wOf('leather', l)}/${wOf('fur', l)}`).join(' · '));
      // 계단 매트릭스 — 추위 2차의 약속(베옷 ≥50% · 가죽 ≤10% · 모피 ≈0%)이 평지에서 그대로 선다
      const rh = years2({ night: true, warmth: wOf('hemp', 0), windExposure: 0 }, WD);
      const rl = years2({ night: true, warmth: wOf('leather', 5), windExposure: 0 }, WD);
      const rf = years2({ night: true, warmth: wOf('fur', 8), windExposure: 0 }, WD);
      const rhm = years2({ night: true, warmth: hempMax, windExposure: 0 }, WD);
      say(`     한겨울 자정 야생 평지 24년 — 조잡베옷 ${rh.hit} · **장인베옷 ${rhm.hit}** · 가죽옷 ${rl.hit} · 갖옷 ${rf.hit}`);
      ok(rh.hit >= 12 && rl.hit <= 2 && rf.hit === 0,
        '★★⑯㉦ 계단이 선다 — 베옷 ≥50% · 가죽 ≤10% · 모피 ≈0%(평지 기준선 불변)',
        `${rh.hit}/24 · ${rl.hit}/24 · ${rf.hit}/24`);
      ok(rhm.hit > rl.hit, '★★⑯㉦ **장인 베옷도 가죽옷을 못 대신한다**(하향의 목적 그 자체)',
        `장인베옷 ${rhm.hit}/24 > 가죽옷 ${rl.hit}/24`);
    }

    // ── ㉧ 바닷물 — 회복 0 + 갈증 가속 · 민물은 종전 [T3 동봉] ──────────────
    {
      const Salt2 = require(path.join(ROOT, 'server', 'salt.js'));
      const SEA_CTX2 = { isSea: (x, y) => H.isSeaTileLocal(x, y) };
      // ★자리는 **찾는다**(족보 73) — 갯벌 판정 정본을 그대로 쓴다
      let flat = null;
      for (let y = 118000; y < 130000 && !flat; y += 64) for (let x = 20000; x < 60000; x += 64) {
        if (Salt2.isTidalFlat(x, y, SEA_CTX2) && !H.isTerrainBlockedLocal(x, y)) { flat = [x, y]; break; }
      }
      let bank = null;
      for (let y = 60000; y < 85000 && !bank; y += 64) for (let x = 36000; x < 48000; x += 64) {
        if (H.isWaterTileLocal(x, y)) continue;
        for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32]]) {
          if (H.isWaterTileLocal(x + dx, y + dy) && !H.isSeaTileLocal(x + dx, y + dy)) { bank = [x, y]; break; }
        }
      }
      ok(!!flat && !!bank, '★⑯㉧ (상황) 갯벌 자리와 민물 물가를 **찾았다**(둘 다 없으면 아래가 무의미)',
        `갯벌 ${flat} · 민물 ${bank}`);
      const drinkAt = (xy) => {
        const P = mkPlayer('sea_' + xy[0]); P.x = xy[0]; P.y = xy[1];
        P.thirst = 40; B.ensure(P);
        H.tryGather(P);
        return { p: P, thirst: P.thirst, notes: P.__notices() };
      };
      if (flat && bank) {
        const sea = drinkAt(flat);
        ok(sea.thirst === 40, '★★⑯㉧ **바닷물은 갈증을 한 점도 안 채운다**(종전엔 +30 이었다)', `갈증 ${sea.thirst}`);
        ok(sea.notes.some((t) => /짠물/.test(t)), '★⑯㉧ 화면이 왜 안 되는지 말한다(서버 문구 · 클라 무접촉)',
          JSON.stringify(sea.notes.slice(-1)));
        ok(B.brineActive(sea.p, Date.now()), '★★⑯㉧ 짠물 기운이 붙었다 — **확정적**이다(확률 굴리기 없음)');
        // 갈증이 실제로 **더 빨리** 준다 — 같은 60초를 짠물 있음/없음으로 A/B
        const run = (brine) => { const P = { hunger: 100, thirst: 80 }; B.ensure(P);
          if (brine) B.drinkBrine(P, 0);
          for (let s2 = 0; s2 < 60; s2++) B.tick(P, 1, DRY({ day: WD, night: false, warmth: 0, now: s2 * 1000 }));
          return P.thirst; };
        const plainT = run(false), brineT = run(true);
        ok(brineT < plainT - 0.05, '★★⑯㉧ 짠물 뒤엔 **갈증이 더 빨리 준다**(같은 60초 A/B)',
          `보통 ${plainT.toFixed(3)} → 짠물 ${brineT.toFixed(3)}`);
        ok(Math.abs((80 - brineT) / Math.max(1e-9, 80 - plainT) - B.CFG.BRINE_MULT) < 0.02,
          '★⑯㉧ 가속 배율이 손잡이 그대로다(숨은 상수 없음)', `×${((80 - brineT) / (80 - plainT)).toFixed(3)}`);
        // 민물은 **종전 그대로** — 이 배치가 강·호수를 건드리지 않았다
        const fresh = drinkAt(bank);
        ok(fresh.thirst === 70, '★★⑯㉧ **민물은 종전대로 +30 회복**한다(강·호수는 안 건드렸다)', `40 → ${fresh.thirst}`);
        ok(!B.brineActive(fresh.p, Date.now()), '★⑯㉧ 민물엔 짠물 기운이 안 붙는다');
        // 사본 금지 — 바다 판정은 자염 정본 술어 하나다
        const zsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
        const seaFns = (zsrc.match(/function isSeaTileLocal/g) || []).length;
        ok(seaFns === 1, '★★⑯㉧ 바다 술어는 **하나뿐**이다(자염 정본 재사용 · 사본 금지)', `${seaFns}개`);
      }
      // ★★[뒤집힘 · T44] 짠물 자체는 피를 안 깎지만 **갈증을 극단으로 몰아** 결국 깎는다
      const P2 = { hunger: 100, thirst: 100, hp: 71 };
      B.drinkBrine(P2, 0);
      let a2 = 0;
      for (let s2 = 0; s2 < 1800; s2++) { B.tick(P2, 1, DRY({ day: WD, night: true, warmth: 0, windExposure: 1, now: s2 * 1000 })); a2 += B.takeHpDamage(P2); }
      ok(a2 > 0 && P2.thirst === 0,
        '★★⑯㉧ 짠물 + 최대 노출 한겨울 밤 30분이면 **갈증이 바닥나고 HP 가 깎인다**(T44 캐논)',
        `${a2}HP · cold ${B.ensure(P2).cold} · thirst ${P2.thirst.toFixed(1)}`);
      ok(B.ensure(P2).cold <= 1 && P2.thirst >= 0, '★★⑯㉧ 상태값 **0~1 / 0~100** 규약 불변', `cold ${B.ensure(P2).cold}`);
    }

    // ── ㉨ 비용 — **틱은 0 이어야 한다**(셀 캐시가 지형 몫을 전부 먹는다) ────
    {
      Wind._reset();
      const t0 = Date.now();
      for (let i = 0; i < 300; i++) Wind.exposureAt(ridgeAt[0] + i * 32, ridgeAt[1] + i * 16, WD, 0);
      const missMs = Date.now() - t0;
      const st = Wind.stats();
      const t1 = process.hrtime.bigint();
      for (let i = 0; i < 300; i++) Wind.exposureAt(ridgeAt[0] + i * 32, ridgeAt[1] + i * 16, WD, 0);
      const hitUs = Number(process.hrtime.bigint() - t1) / 1000 / 300;
      say(`     노출 계산 비용: 새 셀 ${st.usecPerMiss}µs(300셀 ${missMs}ms) · **캐시 적중 ${hitUs.toFixed(2)}µs** · 적중률 ${Wind.stats().hitRate}`);
      ok(hitUs < 20, '★★⑯㉨ 캐시가 적중하면 **틱 비용이 사실상 0** 이다(지형 몫은 셀 캐시가 먹는다)',
        `${hitUs.toFixed(2)}µs/질의`);
      ok(st.usecPerMiss > hitUs * 10, '★⑯㉨ 자명 통과 금지 — 새 셀은 실제로 비싸다(캐시가 일을 하고 있다)',
        `새 셀 ${st.usecPerMiss}µs vs 적중 ${hitUs.toFixed(2)}µs`);
    }
  }

  // ═══ ⑰ 극단 HP 감소 — 캐논 변경 [T44 · 재민 확정 2026-09-01 §12] ═════════════
  //   *"허기·갈증·극한 추위·더위는 극단에 닿기 전엔 디버프만, 극단에 닿으면 HP 가 아주 천천히
  //     깎인다. 고증 최우선 — 물 안 마셔도 사는 세계는 없다. 여러 축이 동시에 극단이면
  //     감소율은 **기여의 합**(연속·가산)."*
  say('\n⑰ 극단 HP 감소 — 가산 · 연속 · 정본 경로');
  {
    const GMIN_PER_SEC = 1;   // 시간 구조 불변 캐논에서 나온다 — 바로 아래 ㉠ 이 그걸 확인한다

    // ── ㉠ 단위의 근거 — "현실 1초 = 게임 1분"이 **설정에서** 나오는가 ────────
    const cfgSrc2 = fs.readFileSync(path.join(ROOT, 'server', 'zone-config.js'), 'utf8');
    const mDay = cfgSrc2.match(/dayLengthMs:\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
    const dayMs = mDay ? (+mDay[1] * +mDay[2] * +mDay[3]) : 0;
    ok(dayMs > 0 && (1440 / (dayMs / 1000)) === GMIN_PER_SEC,
      '★★⑰㉠ **현실 1초 = 게임 1분** — r 의 단위(HP/게임분)가 설정에서 유도된다(HP/실초와 같은 수)',
      `하루 ${dayMs / 60000}분 ⇒ ${1440 / (dayMs / 1000)} 게임분/실초`);
    // ★극단 문턱을 **리터럴로 적지 않았다** — 단계 표에서 유도한다(사본 금지)
    const bsrc3 = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'body.js'), 'utf8'));
    const exFn = bsrc3.split('function extremeAt')[1].split('\nfunction ')[0];
    ok(/STAGE_AT\[axis\]/.test(exFn) && !/0\.8\d|0\.9\d/.test(exFn),
      '★★⑰㉠ 극단 문턱은 **단계 표에서 유도**한다(숫자를 새로 안 적었다)', exFn.trim().slice(0, 80));
    for (const a of B.DRAIN_AXES) {
      ok(Math.abs(B.extremeAt(a) - B.STAGE_AT[a][2]) < 1e-12, `★⑰㉠ ${a} 극단 = 3단계 문턱`, B.extremeAt(a).toFixed(4));
    }

    // ── ㉡ 역산 표가 실제 소요와 맞는가 — 표와 코드가 어긋나면 표가 거짓말이다 ─
    const drainSecs = (setup) => {
      const P = { hunger: 100, thirst: 100, hp: 100, maxHp: 100 };
      B.ensure(P); Object.assign(P, setup.g || {}); Object.assign(B.ensure(P), setup.b || {});
      for (let t = 1; t <= 20000; t++) {
        const r = B.extremeHpRate(P).rate;
        if (r <= 0) return null;
        B.ensure(P).hpDebt += r * 1;      // 1 실초 = 1 게임분
        P.hp -= B.takeHpDamage(P);
        if (P.hp <= 0) return t;
      }
      return null;
    };
    const tHunger = drainSecs({ g: { hunger: 0 } });
    const tThirst = drainSecs({ g: { thirst: 0 } });
    const tCold = drainSecs({ b: { cold: 1 } });
    const near = (got, want) => got !== null && Math.abs(got - want) <= Math.max(2, want * 0.01);
    ok(near(tHunger, 3 * 1440), '★★⑰㉡ 허기 극단 최심 → HP 0 = **게임 3일**(표 그대로)',
      `${tHunger}초 = 게임 ${(tHunger / 1440).toFixed(2)}일 = 실시간 ${(tHunger / 60).toFixed(1)}분`);
    ok(near(tThirst, 1.5 * 1440), '★★⑰㉡ 갈증 극단 최심 → HP 0 = **게임 1.5일**',
      `${tThirst}초 = 게임 ${(tThirst / 1440).toFixed(2)}일 = 실시간 ${(tThirst / 60).toFixed(1)}분`);
    ok(near(tCold, 6 * 60), '★★⑰㉡ 추위 극단 최심 → HP 0 = **게임 6시간**',
      `${tCold}초 = 게임 ${(tCold / 60).toFixed(2)}시간 = 실시간 ${(tCold / 60).toFixed(1)}분`);
    ok(tThirst < tHunger, '★⑰㉡ 고증 순서 — **갈증이 허기보다 먼저 죽인다**', `${tThirst}초 < ${tHunger}초`);

    // ── ㉢ 가산 — 두 축이 동시에 극단이면 **합**이다(더 나쁜 쪽 하나가 아니라) ─
    const mk = (setup) => { const P = { hunger: 100, thirst: 100, hp: 100 }; B.ensure(P);
      Object.assign(P, setup.g || {}); Object.assign(B.ensure(P), setup.b || {}); return P; };
    const rH = B.extremeHpRate(mk({ g: { hunger: 0 } })).rate;
    const rT = B.extremeHpRate(mk({ g: { thirst: 0 } })).rate;
    const rC = B.extremeHpRate(mk({ b: { cold: 1 } })).rate;
    const rHT = B.extremeHpRate(mk({ g: { hunger: 0, thirst: 0 } })).rate;
    const rAll = B.extremeHpRate(mk({ g: { hunger: 0, thirst: 0 }, b: { cold: 1 } })).rate;
    ok(Math.abs(rHT - (rH + rT)) < 1e-6, '★★⑰㉢ 허기 + 갈증 = **정확히 합**(최댓값이 아니다)',
      `${rH.toFixed(6)} + ${rT.toFixed(6)} = ${rHT.toFixed(6)}`);
    ok(Math.abs(rAll - (rH + rT + rC)) < 1e-6, '★★⑰㉢ 세 축 동시 극단도 **합**이다', `${rAll.toFixed(6)}`);
    ok(rH > 0 && rT > 0 && rC > 0 && rH !== rT && rT !== rC,
      '★⑰㉢ 자명 통과 금지 — 세 항이 **서로 다른 값**으로 실제로 살아 있다',
      `허기 ${rH.toFixed(6)} · 갈증 ${rT.toFixed(6)} · 추위 ${rC.toFixed(6)}`);
    const tBoth = drainSecs({ g: { hunger: 0, thirst: 0 } });
    ok(tBoth !== null && tBoth < Math.min(tHunger, tThirst),
      '★★⑰㉢ 두 축 동시 극단이면 **더 빨리** 죽는다', `${tBoth}초 = 실시간 ${(tBoth / 60).toFixed(1)}분`);

    // ── ㉣ 연속 — 문턱에서 0 에서 시작하고 어디에도 계단이 없다 ───────────────
    {
      let worst = 0, worstAt = 0, prev = null;
      for (let g = 100; g >= 0; g -= 0.05) {
        const r = B.extremeHpRate(mk({ g: { hunger: g } })).rate;
        if (prev !== null) { const j = Math.abs(r - prev); if (j > worst) { worst = j; worstAt = g; } }
        prev = r;
      }
      const rAtGate = B.extremeHpRate(mk({ g: { hunger: (1 - B.extremeAt('hunger')) * 100 } })).rate;
      ok(rAtGate === 0, '★★⑰㉣ **문턱에서 정확히 0** 이다 — 계단 없이 0 에서 시작한다', `${rAtGate}`);
      ok(worst < rH * 0.02, `★★⑰㉣ 게이지 0.05 스윕 최대 도약 ${worst.toFixed(8)} < ${(rH * 0.02).toFixed(8)} = **계단 없음**`, `게이지 ${worstAt.toFixed(2)}`);
      // ★자명 통과 금지 — 그 구간에서 값이 실제로 크게 변하긴 하는가
      ok(rH > 0 && worst > 0, '★⑰㉣ 자명 통과 금지 — 스윕 안에서 감소율이 실제로 자란다');
    }

    // ── ㉤ 벗어나면 **즉시 0** — 빚이 따라다니지 않는다 ──────────────────────
    {
      const P = mk({ g: { hunger: 0 } });
      for (let i = 0; i < 30; i++) B.tick(P, 1, { moving: false });
      const debt = B.ensure(P).hpDebt;
      ok(debt > 0 && debt < 1, '(상황) 아직 1HP 이 안 찬 **이월분**이 실제로 남아 있다 — 자명 통과 금지', debt.toFixed(4));
      P.hunger = 100;                                   // 먹었다
      B.tick(P, 1, { moving: false });
      ok(B.extremeHpRate(P).rate === 0 && B.ensure(P).hpDebt === 0,
        '★★⑰㉤ 극단에서 벗어나면 **즉시 0** — 이월분도 버린다(빚이 따라다니지 않는다)');
    }

    // ── ㉥ 총량 보존 — 적용은 정수지만 **깎인 총합은 정확**하다 ───────────────
    {
      //   ★허기를 매 틱 되돌린다 — 3,000초는 허기 시계(2,880초)보다 길어서 안 그러면 항이 둘이 된다.
      const P = mk({ g: { thirst: 0 } });
      let applied = 0;
      const N = 3000;
      for (let i = 0; i < N; i++) { P.hunger = 100; P.thirst = 0; B.tick(P, 1, { moving: false }); applied += B.takeHpDamage(P); }
      const want = B.CFG.EXTREME_HP_THIRST * N;
      ok(Math.abs(applied + B.ensure(P).hpDebt - want) < 1e-6,
        '★★⑰㉥ 적용분 + 이월분 = **비율 × 시간**(양자화가 총량을 안 훔친다)',
        `${applied} + ${B.ensure(P).hpDebt.toFixed(4)} = ${want.toFixed(4)}`);
      ok(applied > 0, '(상황) 실제로 적용된 정수 피해가 있다', `${applied}HP`);
    }

    // ── ㉦ 마을 안에서도 깎인다(§0-ⓓ) — 불사는 **쓰러진 뒤**의 이야기다 ──────
    {
      const V = { hunger: 0, thirst: 0, hp: 100 }; B.ensure(V);
      let a = 0;
      for (let i = 0; i < 600; i++) { B.tick(V, 1, { villageShelter: 1, moving: false }); a += B.takeHpDamage(V); }
      ok(a > 0, '★★⑰㉦ **마을 안에서도 허기·갈증 극단이면 깎인다**(§12: 마을의 불사는 쓰러진 뒤 옮겨 준다는 뜻)',
        `마을 한복판 10분에 ${a}HP`);
      ok(!/villageShelter[^\n]*hpDebt|hpDebt[^\n]*villageShelter/.test(bsrc3),
        '★⑰㉦ 마을 예외를 **코드에 안 넣었다** — 추위발 감소가 마을에서 0 인 건 기존 완충의 결과다');
    }

    // ── ㉧ 부상이 안 생긴다 · 상태값 규약 불변 ───────────────────────────────
    {
      const P = mk({ g: { hunger: 0, thirst: 0 }, b: { cold: 1 } });
      let biggest = 0;
      for (let i = 0; i < 1200; i++) { B.tick(P, 1, { moving: false }); const d = B.takeHpDamage(P); if (d > biggest) biggest = d; }
      ok(biggest > 0 && biggest < B.CFG.INJURY_DMG,
        '★★⑰㉧ 한 번에 나가는 피해가 **부상 문턱보다 작다** — 굶주림이 "부상"을 만들지 않는다',
        `최대 ${biggest}HP < 문턱 ${B.CFG.INJURY_DMG}`);
      ok(B.ensure(P).cold <= 1 && B.ensure(P).cold >= 0 && P.hunger >= 0 && P.thirst >= 0,
        '★⑰㉧ 상태값 0~1 / 0~100 규약 불변');
    }

    // ── ㉨ 되돌리기 손잡이 — 셋 다 0 이면 캐논 변경 전과 **비트 동일** ────────
    {
      const code = [
        `const B=require(${JSON.stringify(path.join(ROOT, 'server', 'body.js'))});`,
        'const P={hunger:0,thirst:0,hp:100};B.ensure(P).cold=1;',
        'let a=0;for(let i=0;i<600;i++){B.tick(P,1,{moving:false});a+=B.takeHpDamage(P);}',
        "process.stdout.write('OFF'+JSON.stringify({rate:B.extremeHpRate(P).rate,a}));",
      ].join('');
      const r = require('child_process').spawnSync(process.execPath, ['-e', code], {
        env: Object.assign({}, process.env, { BODY_EXTREME_HP_HUNGER: '0', BODY_EXTREME_HP_THIRST: '0', BODY_EXTREME_HP_COLD: '0' }),
        encoding: 'utf8',
      });
      let got = null;
      try { got = JSON.parse((r.stdout || '').split('OFF')[1]); } catch (e) {}
      ok(got && got.rate === 0 && got.a === 0,
        '★★⑰㉨ 손잡이 셋을 0 으로 두면 **한 점도 안 깎인다**(캐논 변경 전 재현 · env 로만)',
        JSON.stringify(got));
    }

    // ── ㉩ 대리 지표 표 ──────────────────────────────────────────────────────
    say('     극단 최심 → HP 0 소요:');
    for (const [n, t] of [['허기', tHunger], ['갈증', tThirst], ['추위', tCold], ['허기+갈증', tBoth],
      ['셋 다', drainSecs({ g: { hunger: 0, thirst: 0 }, b: { cold: 1 } })]]) {
      say(`       ${n.padEnd(10)} ${t === null ? '-' : `게임 ${(t / 1440).toFixed(2)}일 (${(t / 60).toFixed(1)}분 · ${t}초)`}`);
    }
  }

  // ═══ ⑱ 여름 — 더위는 온도가 아니라 갈증이다 (T64) ══════════════════════════
  //   PM 판정(2026-09-03 · T44 회부 B-1 닫음): 더위 축은 안 만든다. 여름철 갈증 배율 하나다.
  say('\n⑱ 여름 — 더위는 온도가 아니라 갈증이다(축 0 · 곱 하나)');
  {
    const W = B.CFG.HEAT_THIRST_W;
    ok(W > 0, '★⑱ 손잡이가 하나 있고 켜져 있다(`BODY_HEAT_THIRST_W`)', `W ${W}`);

    // ── ㉠ 거울 정합 — 계절 표를 두 벌 두지 않았다 ────────────────────────────
    //   ★자명 통과 금지: 추위 쪽 수를 **소스에서 유도**해 네 계절 전수로 맞댄다.
    //     누가 추위 표를 바꾸면(예: 겨울 0.9) 거울이 깨지고 여기서 빨개진다.
    {
      const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
      const m = /const v = se === 'winter' \? ([\d.]+) : \(se === 'summer' \? ([\d.]+) : ([\d.]+)\);/.exec(zsrc);
      ok(!!m, '★⑱㉠ [상황] 추위 계절 가중을 **소스에서** 읽었다(하네스가 수를 지어내지 않는다)',
        m ? `겨울 ${m[1]} · 여름 ${m[2]} · 봄가을 ${m[3]}` : '못 읽음');
      const cold = { winter: +m[1], summer: +m[2], spring: +m[3], autumn: +m[3] };
      const want = { winter: 0, summer: 1, spring: +m[3], autumn: +m[3] };
      let bad = [];
      for (const se of ['winter', 'spring', 'summer', 'autumn']) {
        if (B.seasonHeatOf(cold[se]) !== want[se]) bad.push(`${se}: ${B.seasonHeatOf(cold[se])} ≠ ${want[se]}`);
      }
      ok(bad.length === 0,
        '★★⑱㉠ 여름 가중은 **추위 가중의 거울**이다 — 네 계절 전수(계절 표 두 벌 0)',
        `겨울 ${B.seasonHeatOf(cold.winter)} · 봄가을 ${B.seasonHeatOf(cold.spring)} · 여름 ${B.seasonHeatOf(cold.summer)}` + (bad.length ? ` · ${bad.join(' / ')}` : ''));
      // ★그리고 계절의 정본이 하나임을 못 박는다 — `events.seasonOf` 밖에 계절 표가 없다
      ok(/require\('\.\/events'\)\.seasonOf/.test(zsrc),
        '★⑱㉠ 계절의 정본은 `events.seasonOf` 하나다(zone 이 그걸 부른다)');
    }

    // ── ㉡ 배율표 전수 — 낮/밤 × 계절 × 실내/야외 ────────────────────────────
    {
      const rows = [];
      let bad = [];
      for (const [ko, sc] of [['겨울', 1], ['봄가을', 0.35], ['여름', 0]]) {
        for (const night of [false, true]) {
          for (const indoor of [false, true]) {
            const m = B.heatThirstMult({ seasonCold: sc, night, indoor });
            const want = (night || indoor) ? 1 : 1 + W * B.seasonHeatOf(sc);
            if (Math.abs(m - want) > 1e-9) bad.push(`${ko}/${night ? '밤' : '낮'}/${indoor ? '실내' : '야외'} ${m} ≠ ${want}`);
            rows.push(`${ko}${night ? '밤' : '낮'}${indoor ? '실내' : '야외'} ×${m}`);
          }
        }
      }
      ok(bad.length === 0, '★★⑱㉡ 배율 전수 — 밤 1 · 실내 1 · 겨울 1 · 여름낮만 ×(1+W)',
        bad.length ? bad.join(' / ') : rows.filter((r) => /야외/.test(r) && /낮/.test(r)).join(' · '));
      ok(B.heatThirstMult({ seasonCold: 0, night: false, indoor: false }) === 1 + W
        && B.heatThirstMult({ seasonCold: 1, night: false, indoor: false }) === 1,
        '★★⑱㉡ **여름 낮 = 겨울 × (1+W)** 정확히', `${B.heatThirstMult({ seasonCold: 0, night: false, indoor: false })} vs 1`);
      // ★★**0(여름)과 무(無)는 다른 값이다.** 계절을 안 넘긴 호출이 조용히 한여름이 되면
      //   계절을 모르는 모든 자리가 여름으로 물든다(초안이 실제로 그랬다 — ⑪·⑯㉧ 이 뒤집혔다).
      ok(B.heatThirstMult({ night: false, indoor: false }) === 1
        && B.heatThirstMult({}) === 1 && B.heatThirstMult() === 1,
        '★★⑱㉡ **계절을 안 주면 여름이 없다** — `undefined` 를 0(여름)으로 읽지 않는다',
        `무 ${B.heatThirstMult({})} vs 여름 ${B.heatThirstMult({ seasonCold: 0 })}`);
    }

    // ── ㉢ 실제 감쇠가 그만큼 빨라지는가 — **정본 tick 으로** 잰다 ────────────
    {
      const run = (ctx, secs) => {
        const P = { hunger: 100, thirst: 100 }; B.ensure(P);
        for (let i = 0; i < secs; i++) B.tick(P, 1, Object.assign({ day: 1, now: Date.now() }, ctx));
        return 100 - P.thirst;
      };
      const win = run({ seasonCold: 1, night: false, indoor: false }, 300);
      const sum = run({ seasonCold: 0, night: false, indoor: false }, 300);
      const sumN = run({ seasonCold: 0, night: true, indoor: false }, 300);
      const sumIn = run({ seasonCold: 0, night: false, indoor: true }, 300);
      ok(win > 1, '★⑱㉢ [상황] 겨울 낮에도 갈증이 실제로 준다(0 이면 아래가 자명 통과)', `${win.toFixed(3)}`);
      ok(Math.abs(sumN - win) < 1e-6 && Math.abs(sumIn - win) < 1e-6,
        '★★⑱㉢ **여름밤·여름실내는 겨울과 한 치도 안 다르다**', `밤 ${sumN.toFixed(4)} · 실내 ${sumIn.toFixed(4)} · 겨울 ${win.toFixed(4)}`);
      ok(sum > win * 1.3,
        '★★⑱㉢ 여름 낮 야외는 **눈에 띄게 빨리 마른다**(상태 의존 감쇠라 배수는 정확히 W 가 아니다)',
        `여름낮 ${sum.toFixed(3)} vs 겨울 ${win.toFixed(3)} = ×${(sum / win).toFixed(3)}`);
      // ★★한 스텝의 **비율은 정확히 배율**이다 — 상태가 같은 순간끼리 맞대야 그게 보인다
      {
        const step = (ctx) => {
          const P = { hunger: 100, thirst: 100 }; B.ensure(P);
          B.tick(P, 1, Object.assign({ day: 1, now: Date.now() }, ctx));
          return 100 - P.thirst;
        };
        const a = step({ seasonCold: 1, night: false, indoor: false });
        const b = step({ seasonCold: 0, night: false, indoor: false });
        ok(Math.abs(b / a - (1 + W)) < 1e-9,
          '★★⑱㉢ **같은 상태에서 한 스텝의 비는 정확히 (1+W)** 다(곱이 하나라는 증거)',
          `${b.toFixed(6)} / ${a.toFixed(6)} = ${(b / a).toFixed(6)}`);
      }
    }

    // ── ㉣ 되돌림 — W=0 이면 T56 과 비트 동일 ────────────────────────────────
    {
      const keep = B.CFG.HEAT_THIRST_W;
      B.CFG.HEAT_THIRST_W = 0;
      let bad = 0;
      for (const sc of [0, 0.35, 1]) for (const night of [false, true]) for (const indoor of [false, true]) {
        if (B.heatThirstMult({ seasonCold: sc, night, indoor }) !== 1) bad++;
      }
      const run0 = (ctx) => { const P = { hunger: 100, thirst: 100 }; B.ensure(P);
        for (let i = 0; i < 300; i++) B.tick(P, 1, Object.assign({ day: 1, now: Date.now() }, ctx)); return P.thirst; };
      const sum0 = run0({ seasonCold: 0, night: false, indoor: false });
      const win0 = run0({ seasonCold: 1, night: false, indoor: false });
      B.CFG.HEAT_THIRST_W = keep;
      ok(bad === 0 && sum0 === win0,
        '★★⑱㉣ **`BODY_HEAT_THIRST_W=0` 이면 여름이 사라진다** — 곱이 전수 1 이고 감쇠가 비트 동일(되돌림 스위치)',
        `전수 위반 ${bad} · 여름낮 ${sum0} === 겨울낮 ${win0}`);
    }

    // ── ㉤ 물은 그대로다 — 회복 식을 한 자도 안 건드렸다 ─────────────────────
    {
      const Tidal = require(path.join(ROOT, 'server', 'tidal.js'));
      const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
      const wd = /const WATER_DRINK_AMOUNT = (\d+)/.exec(zsrc);
      ok(wd && +wd[1] === 35 && Tidal.DRINK_THIRST === 30,
        '★★⑱㉤ **회복량은 무변**이다 — 물가 +35 · 물 한 되 +30(정본을 읽어 확인)',
        `물가 +${wd && wd[1]} · 되 +${Tidal.DRINK_THIRST}`);
      // 배율이 **감쇠에만** 걸린다 — 회복 경로에 곱이 새지 않았다(소스로 못 박는다)
      const bsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'body.js'), 'utf8'));
      const uses = (bsrc.match(/heatThirstMult\(/g) || []).length;
      ok(uses === 2, '★★⑱㉤ `heatThirstMult` 를 부르는 자리는 **정의 1 + 갈증 감쇠 1** 뿐이다(회복에 안 샌다)',
        `${uses}곳`);
    }

    // ── ㉥ 돌연변이 — 곱을 지우면 빨개지는가 ─────────────────────────────────
    {
      const keep = B.CFG.HEAT_THIRST_W;
      B.CFG.HEAT_THIRST_W = 0;                      // = 곱이 없는 세계(T56 판)
      const P = { hunger: 100, thirst: 100 }; B.ensure(P);
      for (let i = 0; i < 300; i++) B.tick(P, 1, { day: 1, now: Date.now(), seasonCold: 0, night: false, indoor: false });
      const noHeat = 100 - P.thirst;
      B.CFG.HEAT_THIRST_W = keep;
      const Q = { hunger: 100, thirst: 100 }; B.ensure(Q);
      for (let i = 0; i < 300; i++) B.tick(Q, 1, { day: 1, now: Date.now(), seasonCold: 0, night: false, indoor: false });
      const withHeat = 100 - Q.thirst;
      ok(withHeat > noHeat * 1.3,
        '★★⑱㉥ 돌연변이 — **곱을 없애면 여름이 겨울이 된다**(이 절이 ✗ 를 낼 수 있다)',
        `곱 없음 ${noHeat.toFixed(3)} → 있음 ${withHeat.toFixed(3)}`);
    }

    // ── ㉦ 대리 지표 — 계절×낮밤 "물 없이 버티는 시간" ───────────────────────
    {
      const dry = (ctx) => {
        const P = { hunger: 100, thirst: 100 }; B.ensure(P);
        let s = 0; const thr = 100 * (1 - B.extremeAt('thirst'));
        while (P.thirst > thr && s < 100000) { B.tick(P, 1, Object.assign({ day: 1, now: Date.now() }, ctx)); s++; }
        return s;
      };
      say('     물 없이 **갈증 극단**까지(정본 tick 적분):');
      for (const [ko, sc] of [['한겨울', 1], ['봄·가을', 0.35], ['한여름', 0]]) {
        const d = dry({ seasonCold: sc, night: false, indoor: false });
        const n = dry({ seasonCold: sc, night: true, indoor: false });
        const i = dry({ seasonCold: sc, night: false, indoor: true });
        say(`       ${ko.padEnd(7)} 낮 야외 ${(d / 60).toFixed(1)}분 · 밤 ${(n / 60).toFixed(1)}분 · 낮 실내 ${(i / 60).toFixed(1)}분`);
      }
    }
  }

  // ═══ ⑲ 젖음 — 젖은 옷은 단열을 잃는다 [T105 · 재민 확정 2026-09-05] ═══════════
  //   ★이 절의 제1 원칙: **앵커를 두 번 적지 않는다.** 마르는 시간·손실률을 여기에 숫자로
  //     베껴 쓰면 그게 사본이고, 누가 `body.js` 를 고치는 날 하네스가 **조용히** 초록으로 남는다.
  //     ⇒ 기대값은 전부 `B.CFG` 와 세계의 시계(`zone-config.dayLengthMs`)에서 **유도한다.**
  {
    say('\n⑲ 젖음 — 비를 맞으면 옷이 단열을 잃고, 마르는 데 시간이 든다 (T105)');
    const bsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'body.js'), 'utf8'));
    const bsrcAll = fs.readFileSync(path.join(ROOT, 'server', 'body.js'), 'utf8');
    const Wx = require(path.join(ROOT, 'server', 'weather.js'));
    const zcfg = require(path.join(ROOT, 'server', 'zone-config.js'));
    // 세계의 시계에서 유도 — "게임 1시간이 몇 초인가"를 이 파일에 적지 않는다.
    const HOUR = (zcfg.WORLD.dayLengthMs / 1000) / 24;
    ok(HOUR === 60, '⑲ⓐ 전제 — 게임 1시간 = 실시간 60초(`zone-config WORLD.dayLengthMs` 에서 유도)', `${HOUR}초`);

    // ── ⓐ 앵커 둘과 출처 — 기계가 읽는다 ────────────────────────────────────
    ok(/usariem\.health\.mil\/assets\/docs\/partnering\/tbmed508\.pdf/.test(bsrcAll),
      '⑲ⓐ 출처 URL 이 소스에 있다(TB MED 508 · US Army)');
    ok(/50 percent or more/.test(bsrcAll) && /overnight/.test(bsrcAll),
      '⑲ⓐ2 인용문 둘이 소스에 그대로 있다(손실률 · 마르는 시간)');
    ok(B.CFG.WET_LOSS === 0.5, '⑲ⓐ3 손실률 앵커 = 0.5 (문서의 "reduced by 50 percent or more")', B.CFG.WET_LOSS);
    // ★새 수는 **둘뿐**이다 — 젖음 이름을 단 환경변수가 셋을 넘으면(되돌림 스위치 포함) 빨강.
    const wetKnobs = (bsrc.match(/_num\('([A-Z0-9_]*(?:WET|T105)[A-Z0-9_]*)'/g) || []).map((x) => x.slice(6, -1));
    ok(wetKnobs.length === 3, '⑲ⓐ4 젖음이 들여온 수는 **둘 + 되돌림 하나**뿐이다', wetKnobs.join(' '));
    // ★재질 열 0 — 출처에 재질 표가 없으므로 만들지 않았다(카드 §1).
    ok(!/wetLoss|WET_LOSS_[A-Z]|wet.*(?:leather|fur|hemp|ramie)/i.test(bsrc),
      '⑲ⓐ5 재질별 손실 표가 **없다** — 출처에 없는 것을 지어내지 않았다(회부)');

    // ── ⓑ 마르는 시간 = 앵커 · 순서는 불 곁 > 실내 > 실외 ────────────────────
    //   기대값을 유도한다: 실내 = WET_DRY_SEC × COLD_INDOOR_MULT · 불 = × COLD_FIRE_TARGET.
    let dryDay = -1;
    for (let d = 0; d < 60 && dryDay < 0; d++) if (Wx.precipAt(d) === 0) dryDay = d;
    ok(dryDay >= 0, '⑲ⓑ 전제 — 비가 안 오는 게임일을 찾았다(비 오는 날엔 마름을 못 잰다)', `게임일 ${dryDay}`);
    const dryTime = (ctx) => {
      const q = mkPlayer('wetdry');
      B.ensure(q).wet = 1;
      let t = 0;
      while (B.wetOf(q) > 0 && t < 200000) { B.wetStep(q, 1, Object.assign({ day: dryDay }, ctx)); t += 1; }
      return t;
    };
    const tOut = dryTime({}), tIn = dryTime({ indoor: true }), tFire = dryTime({ nearFire: true });
    const expIn = B.CFG.WET_DRY_SEC * B.CFG.COLD_INDOOR_MULT;
    const expFire = B.CFG.WET_DRY_SEC * B.CFG.COLD_FIRE_TARGET;
    say(`    마름: 실외 ${(tOut / HOUR).toFixed(2)}게임시간 · 실내 ${(tIn / HOUR).toFixed(2)} · 불 곁 ${(tFire / HOUR).toFixed(2)}`);
    ok(Math.abs(tIn - expIn) <= 2, '⑲ⓑ2 ★실내 마름이 **앵커 그대로**다(하룻밤 = 8게임시간)',
      `${tIn}초 vs 유도 ${expIn}초 (=${(expIn / HOUR).toFixed(1)}게임시간)`);
    ok(Math.abs(tOut - B.CFG.WET_DRY_SEC) <= 2, '⑲ⓑ3 실외 마름 = `WET_DRY_SEC`', `${tOut}초 vs ${B.CFG.WET_DRY_SEC}초`);
    ok(Math.abs(tFire - expFire) <= 2, '⑲ⓑ4 불 곁 마름 = `WET_DRY_SEC × COLD_FIRE_TARGET`', `${tFire}초 vs ${expFire}초`);
    ok(tFire < tIn && tIn < tOut, '⑲ⓑ5 ★★불 곁 > 실내 > 실외 — 순서가 선다(새 수 0 · 세계가 이미 적어 둔 배율)');

    // ── ⓒ 비 오는 날 실외 1시간 → 젖음 > 0 · 실내면 0 ────────────────────────
    let wetDay = -1;
    for (let d = 0; d < 60 && wetDay < 0; d++) if (Wx.precipAt(d) > 0.05) wetDay = d;
    ok(wetDay >= 0, '⑲ⓒ 전제 — 비가 제법 오는 게임일을 찾았다', `게임일 ${wetDay} · 세기 ${Wx.precipAt(wetDay)}`);
    const runWet = (ctx, dt, n) => { const q = mkPlayer('wetrun'); for (let i = 0; i < n; i++) B.wetStep(q, dt, Object.assign({ day: wetDay }, ctx)); return B.wetOf(q); };
    const outHour = runWet({}, 1, HOUR);
    ok(outHour > 0, '⑲ⓒ2 ★비 오는 날 실외에 1시간 있으면 젖는다', outHour.toFixed(4));
    ok(Math.abs(outHour - Wx.precipAt(wetDay)) < 1e-9,
      '⑲ⓒ3 ★젖음의 바닥이 **그날의 세기**다 — T98 의 강도 눈금이 그대로 산다(새 문턱 0)',
      `${outHour} = precipAt ${Wx.precipAt(wetDay)}`);
    ok(runWet({ indoor: true }, 1, HOUR) === 0, '⑲ⓒ4 ★지붕 아래선 안 젖는다(술어는 `indoor` — 마을 완충이 아니다)');
    // ★자명 통과 금지 — 마을 한복판(완충 1)이어도 하늘은 열려 있다
    ok(runWet({ villageShelter: 1 }, 1, HOUR) > 0, '⑲ⓒ5 ★★마을 한복판도 **젖는다** — 미기후는 지붕이 아니다');
    // ★dt 불변 — 틱 길이가 답을 바꾸면 그건 세계가 아니라 계측 오차다(1차 실장이 여기서 틀렸다)
    const dts = [1, 10, 60, 600].map((dt) => runWet({}, dt, Math.round(3600 / dt)));
    ok(dts.every((v) => Math.abs(v - dts[0]) < 1e-9), '⑲ⓒ6 ★★틱 길이가 답을 안 바꾼다(dt 불변)', dts.map((v) => v.toFixed(4)).join(' '));

    // ── ⓓ 곱 — 젖음 1 이면 단열이 (1−LOSS) 배 ───────────────────────────────
    const W43 = B.warmthInsC(43), W43w = B.warmthInsC(43, 1);
    ok(Math.abs(W43w - W43 * (1 - B.CFG.WET_LOSS)) < 1e-12,
      '⑲ⓓ ★젖음 1 에서 단열이 정확히 `1−LOSS` 배다', `${W43.toFixed(4)}℃ → ${W43w.toFixed(4)}℃`);
    ok(B.warmthInsC(43, 0) === W43, '⑲ⓓ2 젖음 0 은 종전과 **비트 동일**(옛 호출부 계약 보존)');
    ok(Math.abs(B.warmthInsC(43, 0.5) - W43 * (1 - 0.5 * B.CFG.WET_LOSS)) < 1e-12, '⑲ⓓ3 중간 젖음은 선형이다');
    // ★추위 목표점에 실제로 걸린다(곱만 있고 배선이 없으면 위 셋이 자명 통과다)
    const CTX = { day: wetDay, night: true, warmth: 43, villageShelter: 0, windExposure: 0 };
    const tDry = B.coldTarget(Object.assign({}, CTX, { wet: 0 }));
    const tWet = B.coldTarget(Object.assign({}, CTX, { wet: 1 }));
    ok(tWet > tDry, '⑲ⓓ4 ★★젖으면 **추위 목표점이 오른다** — 곱이 실제로 배선돼 있다', `${tDry} → ${tWet}`);

    // ── ⓔ 추위 **한 축**만 — 허기·갈증·HP 는 안 건드린다 ────────────────────
    //   같은 상황을 젖음만 갈아 두 번 돌린다. 추위를 **불로 눌러** 두 판의 추위를 같게 만들면
    //   나머지 축이 갈릴 이유가 없다(추위→허기 가중은 종전부터 있던 결합이라 그건 이 카드가 아니다).
    const runBody = (wet) => {
      const q = mkPlayer('wetaxis'); q.hunger = 100; q.thirst = 100;
      for (let i = 0; i < 60; i++) B.tick(q, 10, Object.assign({}, CALM, { day: dryDay, nearFire: true, warmth: 43, wet }));
      return { hunger: q.hunger, thirst: q.thirst, hp: q.hp, hpDebt: B.ensure(q).hpDebt, cold: B.ensure(q).cold };
    };
    const aDry = runBody(0), aWet = runBody(1);
    ok(aDry.hunger === aWet.hunger && aDry.thirst === aWet.thirst && aDry.hp === aWet.hp && aDry.hpDebt === aWet.hpDebt,
      '⑲ⓔ ★★추위가 같으면 허기·갈증·HP 가 **비트 동일**하다(젖음은 그 축들에 직접 안 닿는다)',
      `허기 ${aDry.hunger.toFixed(4)} / 갈증 ${aDry.thirst.toFixed(4)}`);
    ok(aDry.cold === aWet.cold, '⑲ⓔ2 전제 — 불이 두 판의 추위를 같게 눌렀다(그래야 위가 자명 통과가 아니다)', aDry.cold);
    // ★소스로도 못 박는다 — 허기·갈증·HP 줄에 `wet` 이 없다
    for (const [ax, re] of [['허기', /p\.hunger = [^\n]*/], ['갈증', /p\.thirst = [^\n]*/], ['HP', /b\.hpDebt \+= [^\n]*/]]) {
      const line = (bsrc.match(re) || [''])[0];
      ok(line.length > 0 && !/wet/i.test(line), `⑲ⓔ3 ${ax} 식에 젖음이 **한 글자도** 없다`, line.trim().slice(0, 60));
    }

    // ── ⓕ 재접속에 살아남는다 — 젖음은 유도값이 아니다 ──────────────────────
    const q1 = mkPlayer('wetsave');
    for (let i = 0; i < 30; i++) B.wetStep(q1, 10, { day: wetDay });
    const savedWet = B.toSave(q1);
    ok(savedWet.wet > 0, '⑲ⓕ 전제 — 저장 직전 실제로 젖어 있었다', savedWet.wet);
    const q2 = mkPlayer('wetsave'); B.fromSave(q2, savedWet);
    ok(B.wetOf(q2) === savedWet.wet, '⑲ⓕ2 ★재접속에 젖음이 **그대로** 산다', `${savedWet.wet} → ${B.wetOf(q2)}`);
    const q3 = mkPlayer('wetsave');
    ok(B.dirtySince(q1, B.snapshot(q3)), '⑲ⓕ3 젖음이 변하면 **저장이 일어난다**(안 그러면 위가 화면 밖에서 깨진다)');
    // ★옛 저장본 승격 — `wet` 없는 저장에서 마른 몸으로 시작한다(불이익 0)
    const q4 = mkPlayer('wetold'); B.fromSave(q4, { cold: 0.4, fatigue: 0.1, injury: 0, morale: 0, stam: 1 });
    ok(B.wetOf(q4) === 0, '⑲ⓕ4 옛 저장본은 **마른 몸**으로 승격된다');

    // ── ⓖ 돌연변이 — 곱을 빼면 빨개진다 ─────────────────────────────────────
    {
      const keep = B.CFG.WET_LOSS;
      B.CFG.WET_LOSS = 0;
      const mutated = B.warmthInsC(43, 1);
      B.CFG.WET_LOSS = keep;
      ok(mutated === W43 && W43w !== W43,
        '⑲ⓖ ★★(돌연변이) 손실률을 0 으로 두면 ⓓ 가 무너진다 — 그 판정이 실제로 곱을 재고 있다',
        `LOSS=0 ⇒ ${mutated.toFixed(4)} · LOSS=${keep} ⇒ ${W43w.toFixed(4)}`);
    }

    // ── ⓗ 되돌림 `T105_WET=0` — T98 세계와 **비트 동일** ────────────────────
    {
      const bp = require.resolve(path.join(ROOT, 'server', 'body.js'));
      const keepMod = require.cache[bp];
      const keepEnv = process.env.T105_WET;
      delete require.cache[bp]; process.env.T105_WET = '0';
      let B0 = null;
      try { B0 = require(bp); } finally {
        delete require.cache[bp];
        if (keepEnv === undefined) delete process.env.T105_WET; else process.env.T105_WET = keepEnv;
        require.cache[bp] = keepMod;                       // ★원래 인스턴스를 도로 꽂는다(뒤 검사 오염 금지)
      }
      const z = mkPlayer('revert');
      for (let i = 0; i < 60; i++) B0.wetStep(z, 10, { day: wetDay });
      ok(B0.wetOf(z) === 0, '⑲ⓗ ★`T105_WET=0` 이면 비를 맞아도 젖음이 0 이다');
      ok(B0.warmthInsC(43, 1) === B0.warmthInsC(43),
        '⑲ⓗ2 ★★그리고 곱도 안 걸린다 — 되돌림이 **총체적**이다(명시로 젖음을 준 호출부에도)',
        B0.warmthInsC(43, 1));
      ok(B0.warmthInsC(43) === W43, '⑲ⓗ3 되돌린 단열이 T98 값과 **비트 동일**', W43);
      ok(B.CFG.WET_ON !== 0, '⑲ⓗ4 (오염 검사) 되돌림 뒤에도 이 하네스의 정본은 켜져 있다');
    }

    // ── ⓙ ★★그래서 젖은 겨울밤은 얼마나 더 위험한가 — **⑮가 안 재는 수를 여기서 잰다** ──
    //   ⑮·⑯ 의 옷 티어 계단은 이제 명시로 **마른 세계**에서 잰다(위 `DRY` 주석). 그 대신
    //   "비 맞은 밤"의 값은 반드시 **어딘가에 적혀야** 한다 — 감추면 그건 자리를 나눈 게 아니라 숨긴 거다.
    {
      const PI2 = require(path.join(ROOT, 'server', 'player-items.js'));
      const A3 = Wx.anchors();
      const wdw = Math.round(A3.winterMid);
      const S3w = B.STAGE_AT.cold[2] + B.CFG.STAGE_HYST;
      const leather = PI2.craftItem('clothes', 5, { leather: 3 }).attrs.warmth;
      const nights = (wet) => {
        let hit = 0;
        for (let k = 0; k < 24; k++) {
          const P = { hunger: 100, thirst: 100 }; B.ensure(P);
          let got = false;
          for (let s2 = 1; s2 <= 3600 && !got; s2++) {
            B.tick(P, 1, { day: wdw + 365 * k, night: true, warmth: leather, villageShelter: 0, wet });
            if (B.ensure(P).cold >= S3w) got = true;
          }
          if (got) hit++;
        }
        return hit;
      };
      const dryN = nights(0), wetN = nights(1);
      say(`     한겨울 자정 야생 24년 · 가죽옷(방한 ${leather}) — 마른 밤 ${dryN}/24 → **흠뻑 젖은 밤 ${wetN}/24**`);
      ok(wetN > dryN, '⑲ⓙ ★★젖으면 같은 가죽옷으로도 겨울밤이 **눈에 띄게** 위험해진다', `${dryN} → ${wetN}`);
      ok(dryN <= 2, '⑲ⓙ2 (대조) 마른 밤의 값은 ⑮㉣ 이 서명한 그 계단 그대로다(≤10%)', `${dryN}/24`);
    }

    // ── ⓘ 접점 — `weatherFor` 가 `wet` 을 싣고, 클라는 낱말 하나만 얹는다 ────
    //   ⚠소스를 **글자 수로 자르지 않는다**(족보 115·T85) — 함수 끝까지 구조로 자른다.
    {
      const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
      const at = zsrc.indexOf('\nfunction weatherFor(');
      const end = zsrc.indexOf('\n}\n', at);
      const fn = at >= 0 && end > at ? zsrc.slice(at, end + 3) : '';
      ok(fn.length > 0 && /exp: wexp/.test(fn), '⑲ⓘ 전제 — `weatherFor` 본문을 통째로 집었다', `${fn.split('\n').length}줄`);
      ok(/Body\.wetOf\(/.test(fn), '⑲ⓘ2 젖음의 정본(`Body.wetOf`)을 부른다 — 여기서 다시 재지 않는다(사본 0)');
      ok(/warmthInsC\([\s\S]*?,\s*wet\)/.test(fn), '⑲ⓘ3 ★`insC` 를 **젖은 뒤의 값**으로 보낸다(화면이 참말을 한다)');
      ok(/\bwet:\s*\+wet/.test(fn.slice(fn.indexOf('return Object.assign'))), '⑲ⓘ4 응답에 `wet` 이 실린다');
      const hud = fs.readFileSync(path.join(ROOT, 'public', 'client', '44-h-hud.js'), 'utf8');
      ok(/'\s*·\s*젖음'/.test(hud), '⑲ⓘ5 ★HUD 는 **낱말 하나**다(새 패널 0)');
      const wxc = fs.readFileSync(path.join(ROOT, 'public', 'client', '37-r1-weather.js'), 'utf8');
      ok(!/\bwet\b/.test(wxc), '⑲ⓘ6 (T93·T98 무접촉) 비·눈 층은 `wet` 을 모른다 — 이 카드가 그 파일을 안 건드렸다');
    }
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
