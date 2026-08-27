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
  for (const a of B.AXES) {
    const c = B.CURVES[a];
    ok(c && c.move.length >= 4 && c.move.length <= 6, `★${B.KO[a]} 곡선 제어점 4~6개(§8.3)`, c ? c.move.length : 'X');
  }
  say(`    단계 경계(1단계 = 이속 −5% 체감점, 곡선에서 **유도**한 값):`);
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
  for (const a of B.AXES) {
    for (let x = 0; x <= 1.0001; x += STEP) {
      const y0 = B.lerpCurve(B.CURVES[a].move, x), y1 = B.lerpCurve(B.CURVES[a].move, x + STEP);
      const w0b = B.lerpCurve(B.CURVES[a].work, x), w1b = B.lerpCurve(B.CURVES[a].work, x + STEP);
      const j = Math.max(Math.abs(y1 - y0), Math.abs(w1b - w0b));
      if (j > worstJump) { worstJump = j; worstAt = `${B.KO[a]} @ ${x.toFixed(3)}`; }
    }
  }
  const bound = STEP * 1.2;   // 0.002 폭에서 이보다 크게 뛰면 그건 절벽이다
  ok(worstJump < bound, `★★③ 인접 표본 최대 도약 ${worstJump.toFixed(5)} < ${bound.toFixed(5)} = **절벽 없음**`, worstAt);
  // ★자명 통과 금지 — 곡선이 아예 평평하면 위가 공짜다. 실제로 내려가는지 본다.
  const dropAll = B.AXES.map((a) => 1 - B.lerpCurve(B.CURVES[a].move, 1));
  ok(dropAll.every((d) => d > 0.05), '★★자명 통과 금지 — 각 축이 최악에서 실제로 이속을 깎는다',
    dropAll.map((d, i) => `${B.KO[B.AXES[i]]} −${(d * 100).toFixed(0)}%`).join(' · '));

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
