// === server/body.js — 플레이어 신체 상태 (§7) ===================================
//
// ★[재민 확정 2026-08-26] 헌법 두 줄:
//   ① **상태는 생존 압박이 아니라 경제·리듬의 접속면**이다.
//      채택 기준 = "오늘 내 판단을 바꾸는가 vs 주기적으로 채우는 유지비인가"(§7).
//      그래서 여기엔 **아사가 없다**(재민 확정으로 이미 폐지됐고 되살리지 않는다) —
//      결핍은 **기울기**로만 말한다. 벽이 아니라 저녁의 효율 저하다.
//   ② **속은 연속, 겉은 계단**(§8.3). 역학은 piecewise linear 연속함수,
//      표시는 3~4단계 양자화 + **전환에만** 히스테리시스.
//
// ★★이 모듈이 만든 게 아닌 것 — 배치 전 실측(이 배치의 §0 규약):
//   `hunger`·`thirst` 는 **이미 있었다**(연속값 · 접속 중에만 감쇠 · 스프린트 게이트 ·
//   HP 회복 게이트 · 밤 추위 허기 가속). 장비 슬롯도 있었고 `clothes.attrs.warmth` 가
//   이미 밤 추위를 막고 옷이 닳았다. 식사(`doEat`/`doCook`/`doEatDish`)도 있었다.
//   ⇒ 이 모듈은 **새로 짓는 게 아니라 흩어진 것을 한 정본으로 모으고**,
//     없던 축(추위·피로·부상·사기)과 **연속 효과 곡선**을 얹는다.
//
// ★오프라인 감쇠 절대 금지(§7 재민 확정 · §6 숙제 금지):
//   `tick()` 은 **호출될 때 흐른 실시간만** 적분한다. 접속하지 않은 동안은 아무도 이걸 안 부른다.
//   `lastSeen` 같은 걸로 따라잡기(catch-up)를 **넣지 마라** — `test-body ①` 이 그걸 막는다.
'use strict';

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };

const CFG = {
  // ── 감쇠(초당) ─────────────────────────────────────────────────────────────
  //   ★채택 근거: 종전은 허기 10분·갈증 7분에 0 이었다 — 1시간에 6끼라 **잔소리**다.
  //   재민 지시의 목표는 **"1시간 세션에 식사 2~3회"**.
  //   ★채택은 실측으로 잡았다(`scripts/body-metrics.js` ②):
  //     1800s(30분) → 조리 고기 한 덩이 기준 **4끼/시간** — 목표보다 잦다
  //     2700s(45분) → **3끼/시간** = 목표 상단. 1단계(체감점)는 31분에 온다.
  //   ⇒ 2700 채택. 한겨울 밤엔 추위가 허기를 밀어 더 자주 먹게 되는데, 그건 **의도**다
  //     (겨울 준비 = 옷·불·비축이라는 판단이 생긴다 · §7 "추위는 옷감 수요와 연결").
  HUNGER_SEC: _num('BODY_HUNGER_SEC', 2700),   // 100 → 0 까지 초
  THIRST_SEC: _num('BODY_THIRST_SEC', 1200),   // 물은 강가에서 공짜라 더 빨라도 된다(물가로 끄는 힘)
  SPRINT_MULT: _num('BODY_SPRINT_MULT', 1.5),
  COLD_HUNGER_EXTRA: _num('BODY_COLD_HUNGER_EXTRA', 0.6),   // 추울수록 에너지를 더 쓴다

  // ── 추위 ───────────────────────────────────────────────────────────────────
  COLD_RISE_SEC: _num('BODY_COLD_RISE_SEC', 600),    // 맨몸·한밤에 0→1 까지
  COLD_FALL_SEC: _num('BODY_COLD_FALL_SEC', 180),    // 불가·실내에서 1→0 까지
  WARMTH_FULL: _num('BODY_WARMTH_FULL', 50),         // 옷 방한 이 값이면 추위 0(기존 상수와 같은 뜻)
  COLD_SEASON_W: _num('BODY_COLD_SEASON_W', 1.0),    // 계절 배율의 세기

  // ── 피로 ───────────────────────────────────────────────────────────────────
  //   ★"24분 하루의 자연 마디"(§7). 하루 종일 일하면 저녁에 효율이 떨어지는 **정도**다.
  //   채광 1타/초로 24분 = 1,440타 ⇒ 타당 0.0008 이면 하루 끝에 대략 1.0 에 닿는다.
  FATIGUE_PER_LABOR: _num('BODY_FATIGUE_PER_LABOR', 0.0008),
  FATIGUE_REST_SEC: _num('BODY_FATIGUE_REST_SEC', 900),   // 가만히 있으면 1→0 까지
  FATIGUE_INDOOR_MULT: _num('BODY_FATIGUE_INDOOR_MULT', 2.0),
  FATIGUE_MOVE_MULT: _num('BODY_FATIGUE_MOVE_MULT', 0.25),  // 걷는 중엔 덜 쉰다

  // ── 부상 ───────────────────────────────────────────────────────────────────
  //   ★**주사위 금지**(일관성 원칙) — 확률이 아니라 **피해량 문턱**으로 생긴다.
  //   한 방에 이만큼 맞으면 다친다. 늑대 한 대(≈15)면 다치고 잔타는 안 다친다.
  INJURY_DMG: _num('BODY_INJURY_DMG', 12),
  INJURY_PER_DMG: _num('BODY_INJURY_PER_DMG', 0.02),   // 문턱 초과분 1당 이만큼
  INJURY_HEAL_SEC: _num('BODY_INJURY_HEAL_SEC', 3600), // 그냥 두면 1→0 까지(게임 2.5일)
  INJURY_HERB_MULT: _num('BODY_INJURY_HERB_MULT', 6),  // 약초 쓰면 회복 ×이 값
  INJURY_HERB_MS: _num('BODY_INJURY_HERB_MS', 120000), // 약초 한 번의 효력 시간

  // ── 사기(당근) ─────────────────────────────────────────────────────────────
  //   ★§7: 심심함·스트레스는 **기각**됐다. 대신 좋은 음식이 **버프**를 준다.
  MORALE_COOKED: _num('BODY_MORALE_COOKED', 0.55),
  MORALE_RAW: _num('BODY_MORALE_RAW', 0.10),
  MORALE_SEC: _num('BODY_MORALE_SEC', 600),            // 1→0 까지
  MORALE_WORK: _num('BODY_MORALE_WORK', 0.12),         // 사기 1 일 때 작업속도 +12%

  // ── 죽음의 나선 방지(§7 재민 확정) ─────────────────────────────────────────
  MOVE_FLOOR: _num('BODY_MOVE_FLOOR', 0.6),
  WORK_FLOOR: _num('BODY_WORK_FLOOR', 0.6),
  SHOW_MAX: _num('BODY_SHOW_MAX', 3),                  // 동시에 보여 주는 심각 상태 개수 상한

  // ── 표시(겉은 계단) ────────────────────────────────────────────────────────
  //   단계 경계와 **히스테리시스 폭**. 경계에서 값이 떨릴 때 아이콘이 깜빡이지 않게 한다.
  STAGE_HYST: _num('BODY_STAGE_HYST', 0.04),
  DIRTY_EPS: _num('BODY_DIRTY_EPS', 0.01),             // §8.3: Δ>0.01 이면 dirty
};

// ── 연속 효과 곡선 (piecewise linear · 제어점 4~6) ────────────────────────────
// ★문턱 절벽 없음(§8.3). x = 그 축의 **심각도**(0 좋음 … 1 최악), y = 배율.
//   ★1단계(=아이콘이 처음 뜨는 자리)는 **효과 체감점(이속 −5%)** 에 맞춘다 —
//     아래 `STAGE_AT` 이 각 곡선에서 y=0.95 가 되는 x 를 그대로 쓴다(상수로 박지 않는다).
const CURVES = {
  hunger: { move: [[0, 1], [0.45, 1], [0.7, 0.95], [0.9, 0.88], [1, 0.82]],
            work: [[0, 1], [0.4, 1], [0.7, 0.92], [1, 0.78]] },
  thirst: { move: [[0, 1], [0.45, 1], [0.7, 0.95], [0.9, 0.87], [1, 0.80]],
            work: [[0, 1], [0.5, 1], [0.8, 0.93], [1, 0.85]] },
  cold:   { move: [[0, 1], [0.35, 1], [0.65, 0.95], [0.85, 0.90], [1, 0.85]],
            work: [[0, 1], [0.3, 1], [0.6, 0.93], [1, 0.80]] },
  fatigue:{ move: [[0, 1], [0.4, 1], [0.7, 0.95], [1, 0.88]],
            work: [[0, 1], [0.3, 1], [0.62, 0.92], [0.85, 0.82], [1, 0.72]] },
  injury: { move: [[0, 1], [0.15, 0.97], [0.5, 0.88], [1, 0.72]],
            work: [[0, 1], [0.2, 0.96], [0.6, 0.86], [1, 0.75]] },
};
const AXES = ['hunger', 'thirst', 'cold', 'fatigue', 'injury'];
const KO = { hunger: '배고픔', thirst: '목마름', cold: '추위', fatigue: '피로', injury: '부상', morale: '사기' };
const EMO = { hunger: '🍖', thirst: '💧', cold: '🥶', fatigue: '😮‍💨', injury: '🩹', morale: '✨' };

function lerpCurve(pts, x) {
  x = x < 0 ? 0 : (x > 1 ? 1 : x);
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const t = (x1 - x0) < 1e-9 ? 0 : (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return pts[pts.length - 1][1];
}
// 이 곡선에서 배율이 처음 `y` 아래로 내려가는 x — **1단계 경계의 정본**.
function xWhereBelow(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (y0 >= y && y1 < y) {
      const t = (y0 - y1) < 1e-9 ? 0 : (y0 - y) / (y0 - y1);
      return x0 + (x1 - x0) * t;
    }
  }
  return 1;
}
// 단계 경계 — 1단계는 **이속 −5% 지점**(체감점), 2·3단계는 그 사이를 고르게.
const STAGE_AT = {};
for (const a of AXES) {
  const s1 = xWhereBelow(CURVES[a].move, 0.95);
  STAGE_AT[a] = [s1, s1 + (1 - s1) * 0.45, s1 + (1 - s1) * 0.8];
}

// ── 상태 그릇 ────────────────────────────────────────────────────────────────
//   ★기존 `hunger`/`thirst`(0..100)는 **그 자리에 그대로 둔다** — 저장·전송·스프린트 게이트가
//     이미 그 필드를 본다. 여기서 새 이름으로 옮기면 그 전부를 갈아야 하고 얻는 게 없다.
//   새 축만 `p.body` 에 0..1 로 담는다(0 좋음 … 1 최악, 사기만 0 없음 … 1 최고).
function ensure(p) {
  if (!p.body || typeof p.body !== 'object') {
    p.body = { cold: 0, fatigue: 0, injury: 0, morale: 0, herbUntil: 0, stages: {} };
  }
  if (!p.body.stages) p.body.stages = {};
  return p.body;
}
// 각 축의 **심각도** 0..1 — 곡선의 입력. 여기가 단위 환산의 유일한 자리다.
function severity(p) {
  const b = ensure(p);
  return {
    hunger: 1 - Math.max(0, Math.min(100, p.hunger == null ? 100 : p.hunger)) / 100,
    thirst: 1 - Math.max(0, Math.min(100, p.thirst == null ? 100 : p.thirst)) / 100,
    cold: b.cold, fatigue: b.fatigue, injury: b.injury,
  };
}

// ── 효과 — 곱 합산 + **바닥**(죽음의 나선 방지) ───────────────────────────────
//   반환의 `parts` 가 상태 패널의 "이속 −8% (피로 0.62)" 문장을 만드는 원자료다.
//   ★하네스가 이 문장을 다시 계산하지 않게 **여기서 다 내준다**(사본 계측기 금지).
function effects(p) {
  const sev = severity(p), b = ensure(p);
  let move = 1, work = 1;
  const parts = [];
  for (const a of AXES) {
    const s = sev[a];
    const m = lerpCurve(CURVES[a].move, s), w = lerpCurve(CURVES[a].work, s);
    move *= m; work *= w;
    if (m < 0.999 || w < 0.999) parts.push({ axis: a, ko: KO[a], emo: EMO[a], sev: +s.toFixed(3), move: m, work: w });
  }
  const moraleBonus = 1 + CFG.MORALE_WORK * (b.morale || 0);
  work *= moraleBonus;
  if ((b.morale || 0) > 0.01) parts.push({ axis: 'morale', ko: KO.morale, emo: EMO.morale, sev: +(b.morale).toFixed(3), move: 1, work: moraleBonus });
  const moveF = Math.max(CFG.MOVE_FLOOR, move);
  const workF = Math.max(CFG.WORK_FLOOR, work);
  // 심한 것부터 — 패널·무들이 상위 몇 개만 보여 준다(§7 동시 표시 제한)
  parts.sort((x, y) => (x.move * x.work) - (y.move * y.work));
  return {
    moveMult: +moveF.toFixed(4), workMult: +workF.toFixed(4),
    rawMove: +move.toFixed(4), rawWork: +work.toFixed(4),
    floored: move < CFG.MOVE_FLOOR || work < CFG.WORK_FLOOR,
    parts,
  };
}

// ── 단계(겉은 계단) — 전환에만 히스테리시스 ──────────────────────────────────
//   ★올라갈 땐 경계+H, 내려갈 땐 경계−H 를 넘어야 바뀐다. 그래서 경계에서 값이 떨려도
//     아이콘이 깜빡이지 않는다(`e2e-ui` 가 경계 진동을 실제로 넣어 확인한다).
function stageOf(p, axis, sev) {
  const b = ensure(p);
  const prev = b.stages[axis] || 0;
  const at = STAGE_AT[axis], H = CFG.STAGE_HYST;
  let s = prev;
  while (s < 3 && sev >= at[s] + H) s++;
  while (s > 0 && sev < at[s - 1] - H) s--;
  b.stages[axis] = s;
  return s;
}
// 지금 보여 줄 무들 — 심한 순, 최대 SHOW_MAX 개.
function moodles(p) {
  const sev = severity(p), out = [];
  for (const a of AXES) {
    const s = stageOf(p, a, sev[a]);
    if (s > 0) out.push({ axis: a, ko: KO[a], emo: EMO[a], stage: s, sev: +sev[a].toFixed(3) });
  }
  out.sort((x, y) => y.stage - x.stage || y.sev - x.sev);
  return out.slice(0, CFG.SHOW_MAX);
}

// ── 시간 진행 ────────────────────────────────────────────────────────────────
//   ctx: { night, nearFire, indoor, warmth, seasonCold(0..1), moving, sprint }
//   ★**호출된 만큼만** 흐른다. 오프라인 따라잡기 없음.
function tick(p, dtSec, ctx) {
  if (!(dtSec > 0)) return;
  const b = ensure(p);
  const c = ctx || {};
  // 추위 — 밤·계절이 올리고, 불·실내·옷이 내린다.
  const coldFactor = Math.max(0, 1 - (c.warmth || 0) / CFG.WARMTH_FULL);
  const exposure = Math.max(0, Math.min(1, (c.night ? 1 : 0) * 0.7 + (c.seasonCold || 0) * CFG.COLD_SEASON_W * 0.6)) * coldFactor;
  if (c.nearFire || c.indoor || exposure <= 0) {
    b.cold = Math.max(0, b.cold - dtSec / CFG.COLD_FALL_SEC);
  } else {
    b.cold = Math.min(1, b.cold + (dtSec / CFG.COLD_RISE_SEC) * exposure);
  }
  // 허기·갈증 — 달리면 빨리, 추우면 허기만 더.
  const dm = (c.sprint && c.moving) ? CFG.SPRINT_MULT : 1;
  const cm = 1 + CFG.COLD_HUNGER_EXTRA * b.cold;
  p.hunger = Math.max(0, (p.hunger == null ? 100 : p.hunger) - (100 / CFG.HUNGER_SEC) * dtSec * dm * cm);
  p.thirst = Math.max(0, (p.thirst == null ? 100 : p.thirst) - (100 / CFG.THIRST_SEC) * dtSec * dm);
  // 피로 — 일하면 오르고(그건 onLabor 가 한다) 쉬면 내린다.
  let restMult = c.indoor ? CFG.FATIGUE_INDOOR_MULT : 1;
  if (c.moving) restMult *= CFG.FATIGUE_MOVE_MULT;
  b.fatigue = Math.max(0, b.fatigue - (dtSec / CFG.FATIGUE_REST_SEC) * restMult);
  // 부상 — 시간이 낫게 하고 약초가 재촉한다.
  const now = c.now || Date.now();
  const herb = (b.herbUntil || 0) > now ? CFG.INJURY_HERB_MULT : 1;
  b.injury = Math.max(0, b.injury - (dtSec / CFG.INJURY_HEAL_SEC) * herb);
  // 사기 — 좋은 걸 먹은 기억은 식는다.
  b.morale = Math.max(0, b.morale - dtSec / CFG.MORALE_SEC);
}

// ── 사건 훅 ──────────────────────────────────────────────────────────────────
function onLabor(p, weight) { const b = ensure(p); b.fatigue = Math.min(1, b.fatigue + CFG.FATIGUE_PER_LABOR * (weight || 1)); }
// ★확률이 아니라 **문턱**이다. 같은 상황이면 같은 결과 — 주사위 금지 원칙 정합.
function onDamage(p, dmg) {
  const b = ensure(p);
  const over = (dmg || 0) - CFG.INJURY_DMG;
  if (over <= 0) return 0;
  const add = Math.min(1, over * CFG.INJURY_PER_DMG);
  b.injury = Math.min(1, b.injury + add);
  return +add.toFixed(4);
}
function onEat(p, opts) {
  const b = ensure(p);
  const gain = (opts && opts.cooked) ? CFG.MORALE_COOKED : CFG.MORALE_RAW;
  b.morale = Math.min(1, b.morale + gain);
  return b.morale;
}
function onHerb(p, now) { const b = ensure(p); b.herbUntil = (now || Date.now()) + CFG.INJURY_HERB_MS; return b.herbUntil; }

// ── 전송 — 본인에겐 연속, 남에겐 단계만(§8.3) ────────────────────────────────
function selfPayload(p) {
  const b = ensure(p), e = effects(p);
  return {
    hunger: +(p.hunger == null ? 100 : p.hunger).toFixed(2),
    thirst: +(p.thirst == null ? 100 : p.thirst).toFixed(2),
    cold: +b.cold.toFixed(4), fatigue: +b.fatigue.toFixed(4),
    injury: +b.injury.toFixed(4), morale: +b.morale.toFixed(4),
    herb: (b.herbUntil || 0) > Date.now(),
    moveMult: e.moveMult, workMult: e.workMult, floored: e.floored,
    parts: e.parts.map((x) => ({ axis: x.axis, ko: x.ko, emo: x.emo, sev: x.sev,
      move: +x.move.toFixed(4), work: +x.work.toFixed(4) })),
    moodles: moodles(p),
  };
}
// 남에게 보낼 것 — **단계뿐**. 외형 반영은 이번 범위 밖이라 소비자가 없지만,
// 전송 설계를 지금 정해 두지 않으면 나중에 연속값이 새어 나간다(§8.3 공학 확정).
function peerPayload(p) { return { moodles: moodles(p).map((m) => ({ axis: m.axis, stage: m.stage })) }; }

// 저장/복원 — 주기 저장(`SAVE_INTERVAL_MS`) 경로에 실린다.
function toSave(p) { const b = ensure(p); return { cold: +b.cold.toFixed(4), fatigue: +b.fatigue.toFixed(4), injury: +b.injury.toFixed(4), morale: +b.morale.toFixed(4) }; }
function fromSave(p, saved) {
  const b = ensure(p);
  if (!saved || typeof saved !== 'object') return b;
  for (const k of ['cold', 'fatigue', 'injury', 'morale']) {
    if (typeof saved[k] === 'number' && Number.isFinite(saved[k])) b[k] = Math.max(0, Math.min(1, saved[k]));
  }
  return b;
}
// dirty — §8.3 "Δ>0.01 이면 갱신". 주기 저장의 판정에도 쓴다.
function dirtySince(p, snap) {
  const b = ensure(p), s = snap || {};
  if (Math.abs((p.hunger == null ? 100 : p.hunger) - (s.hunger == null ? 100 : s.hunger)) > CFG.DIRTY_EPS * 100) return true;
  if (Math.abs((p.thirst == null ? 100 : p.thirst) - (s.thirst == null ? 100 : s.thirst)) > CFG.DIRTY_EPS * 100) return true;
  for (const k of ['cold', 'fatigue', 'injury', 'morale']) {
    if (Math.abs((b[k] || 0) - (s[k] || 0)) > CFG.DIRTY_EPS) return true;
  }
  return false;
}
function snapshot(p) { const b = ensure(p); return { hunger: p.hunger, thirst: p.thirst, cold: b.cold, fatigue: b.fatigue, injury: b.injury, morale: b.morale }; }

module.exports = {
  CFG, CURVES, AXES, KO, EMO, STAGE_AT,
  lerpCurve, xWhereBelow, ensure, severity, effects, stageOf, moodles,
  tick, onLabor, onDamage, onEat, onHerb,
  selfPayload, peerPayload, toSave, fromSave, dirtySince, snapshot,
};
