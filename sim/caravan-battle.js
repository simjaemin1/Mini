// sim/caravan-battle.js — 캐러밴 약탈 전투를 battle-core로 해결(병종·대형·사기).
//   기존 flat 스크럼(hp100·atk=10+무기×0.2·병종X) → 전쟁과 같은 급의 병종 전투.
//   호위 = 창병(spear, 마을 전사) + 궁수(archer, 활 든 사냥꾼) + 상인(militia 1) 원형 방어(캐러밴 라거).
//   도적 = 석검(dagger) 산개 접근. battle-core가 사격·방패벽·사기붕괴·궤주를 결정.
//   ★econ 무접촉: 순수 계산. 결과(repelled/화물손실)만 호출측이 econ에 반영.
'use strict';
const BC = require('./battle-core.js');
function mkRng(s) { s = (s >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// resolveRaid — 호위 병종 구성 vs 도적. battle-core 인스턴스 1회전.
//   spear/archer = 호위 병종 수 · banditN = 도적 수 · weapQ = 마을 무기품질(호위 atk 배수)
//   반환: { repelled, win, escStart, escAlive, traderAlive, banditStart, banditAlive, ticks }
function resolveRaid({ spear = 0, archer = 0, banditN = 6, weapQ = 0.5, banditWeapQ = 0.46, seed = 1, dt = 0.1, maxT = 6000, militia = 0, banditMilitia = 0, mrlA = null, rng = null, world = null } = {}) {
  const spec = {
    A: { spear, archer, form: 'circle' },   // 호위 원형 방어(창병 외곽·궁수 내부). 상인은 비전투 — 호위 격퇴 시 안전
    B: { dagger: Math.max(1, banditN | 0), form: 'line' },
    terrain: 'plain',
    quality: { A: { weapQ }, B: { weapQ: banditWeapQ } },
  };
  //   ★[T1431] 고른 칸(안 주면 종전 글자 그대로 — 아래 세 줄이 안 닿는다): 행상(`militia` — A 의 농기구 민병) · 맨손 도적(`banditMilitia` — B 의 민병 ·
  //     든 도적 = `banditN` 석검 · 0 이면 석검 0) · A 편 사기 칸(`mrlA` — battle-core `sides.A.armyMrl` · T1076 이 연 그 칸) · 흐름(`rng` — 씨 대신).
  if (militia > 0) spec.A.militia = militia | 0;
  if (banditMilitia > 0) { spec.B.militia = banditMilitia | 0; spec.B.dagger = Math.max(0, banditN | 0); }
  const h = BC.createBattle(spec, { rng: rng || mkRng(seed) });
  if (mrlA != null) h.ctx.sides.A.armyMrl = mrlA;
  if (world) { h.ctx.world = world; if (world.settle) world.settle(h.ctx); }   // ★[T1459] (settle = 막힌 칸에 선 몸을 가장 가까운 빈 칸으로 — 빈 땅이면 아무도 안 옮긴다)
  //   ★[T1459] 존 지형 판 — 막힘 · 시야 · 엄폐만 존이 답한다(걸음 · 궤주 방향 · 쫓음은 battle-core 그대로 = 머리 없는 판과 같은 식) · 판 결과는 같은 식(`_judge`)을 걸음마다
  let t = 0;
  for (; t < maxT && !h.result; t++) { h.step(dt); if (world) BC._judge(h.ctx); }
  const A = h.units.filter(u => u.side === 'A'), B = h.units.filter(u => u.side === 'B');
  const escAlive = A.filter(u => u.hp > 0).length;
  const banditAlive = B.filter(u => u.hp > 0).length;
  const win = (h.result && h.result.win) || '무';
  const repelled = win === 'A';
  const out = { repelled, win, escStart: spear + archer, escAlive, traderAlive: repelled, banditStart: Math.max(1, banditN | 0), banditAlive, ticks: t };
  if (militia > 0 || banditMilitia > 0 || mrlA != null) {   // ★[T1431] 몸마다 — 죽은 호위(창 · 활) · 행상(민병) 산 몸 · 도적 시작 수(석검 + 맨손)
    out.escDead = A.filter(u => u.type !== 'militia' && u.hp <= 0).length;
    out.traderAlive = A.filter(u => u.type === 'militia' && u.hp > 0).length > 0;
    out.banditStart = B.length; out.banditDead = B.filter(u => u.hp <= 0).length; out.secs = +(h.tick || 0).toFixed(1);
  }
  return out;
}

// ★★[T1431 2026-11-22 · ★재민 11-22 판정 35] **도적과 캐러밴은 몸으로 싸운다** — 거리 안에 들면 전투 · 밀리고 사기가 낮으면 짐을 버리고 달아난다.
//   "도적과 npc의 싸움도 전투실험실처럼 물리적인 전투가 일어나야 해 … 캐러밴이 도적과 일정 거리 안에 들어오면 전투 모드.. 전력 차이+낮은 행복(사기)면
//    바로 짐 버리고 도주.. 그렇지 않으면 싸움.." — 전투 = 위 `resolveRaid`(battle-core 한 판 · 병종 · 개별 사기 · 궤주). 새 수 0:
//   ① 거리 `ENGAGE_R` = 50칸(= m) — 전쟁 층의 그 수(server/war-live.js `WAR_ENGAGE_R` "두 대형 지휘관 접근 거리") · battle-core 표준 배치의 두 편 간격과 같다
//      (앞줄 40 · DEPLOY_W − 40 → 50m). 하네스가 두 글자가 같은지 본다.
//   ② 전력 = 란체스터 제곱 법칙의 편 세기 — (편 공격 합) × (편 hp 합) · 몸마다 battle-core `UNITS` 의 atk · hp(병종) × 품질 배수(battle-core spawn 그 식
//      0.85 + 0.3 × (weapQ − 0.5) · 무기). 같은 병종 N 명이면 N² × atk × hp(제곱 법칙 그 꼴). 밀린다 = 캐러밴 세기 < 도적 세기.
//   ③ 사기 = battle-core 사기 목표 식을 만나는 순간(접촉 전 · 길 위 행렬 — 대형 항 0)에 편 전체로: (MRL0[병종] + M_KODDS × (fN − eN) ÷ (fN + eN + 1)) × 행복 —
//      fN = 제 편 다른 몸 수 · eN = 보이는 적 수 · 행복 = 집 마을 `happiness`(econ 스탯 0~1)를 T1076 이 연 편 칸 `armyMrl` 그 자리에 싣는다(교전 중에도 같은 칸).
//      낮다 = 편 평균이 battle-core 궤주 문턱 `M_BREAK` 밑(문턱을 새로 안 적는다 — 시작 전에 이미 궤주 문턱을 넘었나).
//   달아남 = ② 밀림 **그리고** ③ 낮음(판정 글자 "전력 차이 + 낮은 행복"). 아니면 싸운다.
const ENGAGE_R = 50;
function inRange(dx, dy) { return dx * dx + dy * dy <= ENGAGE_R * ENGAGE_R; }   // 칸 차(dx · dy) — 거리 안이면 전투 모드(양쪽 다 · 길목에 선 단이 먼저 본다)
function _qm(q) { return 0.85 + 0.3 * ((q == null ? 0.5 : q) - 0.5); }   // battle-core spawn 품질 배수(같은 식)
function _side(list, q) {   // list = [[병종, 수], …]
  let atk = 0, hp = 0, n = 0;
  for (const [t, k] of list) { const D = BC.UNITS[t]; if (!D || !(k > 0)) continue; atk += D.atk * _qm(q) * k; hp += D.hp * k; n += k; }
  return { S: atk * hp, n };
}
function decide({ A, B, qA, qB, happy }) {
  const a = _side(A, qA), b = _side(B, qB), h = happy == null ? 1 : Math.max(0, Math.min(1, +happy));
  let m = 0;
  for (const [t, k] of A) {
    if (!(k > 0)) continue;
    const fN = a.n - 1, eN = b.n;
    let tg = ((BC.MRL0[t] || 0.8) + BC.M_KODDS * (fN - eN) / (fN + eN + 1)) * h;   // battle-core 사기 목표(접촉 · 대형 0 · armyMrl = 행복)
    tg = tg < 0 ? 0 : tg > 1 ? 1 : tg;
    m += tg * k;
  }
  m = a.n > 0 ? m / a.n : 0;
  const outmatched = a.S < b.S, low = m < BC.M_BREAK;
  return { flee: outmatched && low, outmatched, low, sA: a.S, sB: b.S, mrl: m, happy: h };
}
//   길 위 한 판 — econ 약탈 판(`_raidScrum` 자리)의 꼴로 돌려준다. 씨 = (날 · 캐러밴 · 단) 해시(주사위 0 · 같은 판 두 번 같음).
//   esc = 호위(창병) · armed = 든 도적(석검) · 나머지 맨손(민병) · qA = 집 마을 무기 품질 · qB = 단 무기 품질(기록 없음 = econ `_escAtk` 의 0.42).
function seedOf(day, cid, gid) {
  let h = (Math.imul((day | 0) >>> 0, 374761393) + Math.imul((cid | 0) >>> 0, 668265263) + Math.imul((gid | 0) >>> 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) || 1;
}
//   행상: 호위가 있으면 싸우는 몸이 아니다(이 파일 `resolveRaid` 의 그 약속 — "상인은 비전투") — 짐 곁에 있다가 호위가 지면 궤주에 섞여 달아난다(쓰러진 몸만 죽는다 · 판정 35).
//     호위가 없으면 행상 혼자가 그 편의 몸이다(농기구 민병 — econ 스크럼도 행상을 싸우는 몸으로 셌다) — 혼자면 거의 늘 밀리고 사기가 낮아 짐을 버리고 달아난다.
function raidBattle({ esc = 0, gangN = 1, armed = null, qA = 0.42, qB = 0.42, happy = 1, seed = 1, world = null } = {}) {
  const E = Math.max(0, esc | 0), G = Math.max(1, gangN | 0), Ar = armed == null ? G : Math.max(0, Math.min(G, Math.floor(armed)));
  const A = E > 0 ? [['spear', E]] : [['militia', 1]], B = [['dagger', Ar], ['militia', G - Ar]];
  const d = decide({ A, B, qA, qB, happy });
  if (d.flee) return { fled: true, repel: false, banditsKilled: 0, escKilled: 0, traderDead: false, escStart: E, loss: 1, d, secs: 0 };
  const r = resolveRaid({ spear: E, militia: E > 0 ? 0 : 1, banditN: Ar, banditMilitia: G - Ar > 0 ? G - Ar : 0, weapQ: qA, banditWeapQ: qB, seed, mrlA: d.happy, world });   // ★[T1459] world = 존 지형 어댑터(안 주면 빈 들판 — 종전)
  if (E > 0) r.traderAlive = true;   // 싸우지 않은 행상 — 산다(위)
  //   진 쪽이 궤주한다 — 캐러밴이 지면(도적 승) 짐을 그 자리에 버리고 달아난다(손실 1 · 산 몸은 산다) · 비기면(120초 판 끝) 도적이 못 가져갔다(손실 0).
  const repel = r.win !== 'B';
  return { fled: false, repel, draw: r.win === '무', banditsKilled: r.banditDead, escKilled: r.escDead, traderDead: !r.traderAlive, escStart: E, loss: repel ? 0 : 1, d, secs: r.secs, win: r.win };
}

// ★★[T1459 2026-11-23 · 세션6 · T1431 회부 2] **존 지형 위 판** — 표준 배치(battle-core 0 ~ 130m 상자 · 두 편 50m)를 만난 자리로 옮겨 돌려 놓는다:
//   상자 가운데(65 · 65) = 캐러밴 자리와 단 자리의 가운데 · 상자 x 축 = 캐러밴 → 단 방향(A = 캐러밴 · B = 단). 존 1칸 = 1m(zone "32px = 1m").
//   cell(cx, cy) = { b 막힘(지형 · 물 · 건물 · 나무 — 전쟁 층 `_warBlockedCell` 그 술어) · l 화살을 막음(바위 · 도랑 · 건물 · 나무) · c 엄폐(나무 · 건물) } — 호스트가 준다.
//   어댑터는 막힘 · 시야 · 엄폐 셋만 답한다 — 걸음 · 궤주 방향(제 편 뒤쪽) · 쫓음은 battle-core 그대로라 빈 땅이면 머리 없는 판과 **같은 판**이다(하네스).
function zoneWorld(ax, ay, bx, by, cell) {   // ax · ay = 캐러밴 자리(칸) · bx · by = 단 자리(칸)
  const ox = (ax + bx) / 2, oy = (ay + by) / 2, L = Math.hypot(bx - ax, by - ay), ux = L > 1e-6 ? (bx - ax) / L : 1, uy = L > 1e-6 ? (by - ay) / L : 0;
  const C = (x, y) => { const lx = x - 65, ly = y - 65; return [Math.floor(ox + lx * ux - ly * uy), Math.floor(oy + lx * uy + ly * ux)]; };
  const memo = new Map(), at = (x, y) => { const [cx, cy] = C(x, y), k = cx * 65536 + cy; let v = memo.get(k); if (v === undefined) { v = cell(cx, cy) || {}; memo.set(k, v); } return v; };
  return {
    blocked(x, y) { return !!at(x, y).b; },
    losBlocked(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), n = Math.ceil(d / 1.5); for (let i = 1; i < n; i++) { const s = i / n; if (at(x1 + dx * s, y1 + dy * s).l) return true; } return false; },   // 1.5m 표본(전쟁 층 `_warWorld` 그 간격)
    coverAt(x, y) { return !!at(x, y).c; },
    toZone: C,   // 판 자리 → 존 칸(몸 · 더미 자리 읽기)
    settle(ctx) {   // 표준 배치에서 막힌 칸(물 · 벽 · 나무)에 선 몸 — 가장 가까운 빈 칸 가운데로(1m 고리를 넓혀 가며 · 판 상자 안 · 못 찾으면 그 자리)
      for (const u of ctx.units) {
        if (!this.blocked(u.x, u.y)) continue;
        let done = false;
        for (let r = 1; r <= 65 && !done; r++) for (let dx = -r; dx <= r && !done; dx++) for (const dy of [-r, r]) { const x = u.x + dx, y = u.y + dy; if (!this.blocked(x, y)) { u.x = x; u.y = y; done = true; break; } }
        for (let r = 1; r <= 65 && !done; r++) for (let dy = -r + 1; dy <= r - 1 && !done; dy++) for (const dx of [-r, r]) { const x = u.x + dx, y = u.y + dy; if (!this.blocked(x, y)) { u.x = x; u.y = y; done = true; break; } }
      }
    },
  };
}

module.exports = { resolveRaid, decide, raidBattle, seedOf, inRange, ENGAGE_R, zoneWorld };
