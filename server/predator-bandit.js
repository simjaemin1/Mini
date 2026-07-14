// ═══════════════════════════════════════════════════════════════════════════
// server/predator-bandit.js — 포식자 도적 (bandit-raid.js 진화형)
//   "항상 사냥" → 배회하다 지각·판단·억지·리드요격하는 포식종("캐러밴을 사냥하는 인간 포식자").
//   설계(사용자 Proposal 1+2, 무주사위·결정론):
//     ① 배회 semi-camp: 라이더는 소굴↔교역로 사이 앵커 주위를 배회 → 약탈 출발점이 점이 아니라
//        '구름'이 되어 사거리 절벽이 결정론적으로 falloff(주사위 없이 이분법 완화).
//     ② 지각·판단: 캐러밴을 지각하면 파티력(주변 동료 합) vs 호위력(호위 수×atk)을 비교 —
//        약하면 억지(fear, 회피), 강하면 파티 결집해 commit. → 큰 호위=회피, 자잘=자주 약탈이 창발.
//     ③ 리드요격: 표적 진행방향 앞점 조준(야생 늑대 요격 재사용) — 꼬리물기 아닌 가로채기.
//     ④ break-off: 교전 중 파티가 문턱 이하로 줄면 도주(자살돌격 회피 — _raidScrum 완화의 공간판).
//   ★무주사위: 전투 결과·commit·요격은 전부 결정론. rng은 배회 앵커 지터·무기티어(시드 재현)뿐.
//   ★econ 무접촉: 전투=host.damage, 결과=host 콜백. host 미주입/미호출이면 완전 불활성(계약 무해).
//
//   host 인터페이스(bandit-raid.js와 호환 + 확장):
//     host.getCaravans() → [ { cid, x, y(px), alive, escorts:[def], trader:def|null,
//                              vx?, vy?, ang?,        // 진행 속도/방향(없으면 위치델타로 추정 → 리드요격)
//                              arrived?,              // 목적지 도착(true면 더는 표적 아님 — 거리-빈도 창발의 핵심)
//                              onDefeat(), onRepel(), onAvoided?(),  _resolved?, _everEngaged? } ]
//       def = { hp, atk, alive, lastAtk? }
//     host.damage(def, dmg, src) · host.removeRaider(r) · host.spawnCorpse(r) · host.broadcast(msg)
//     host.terrainBlocked(px,py)→bool · host.rng()→[0,1)  (모두 선택)
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const PI = require('./player-items.js');

// ── zone.js 충실 상수 ──
const HP = 100, BASE_ATK = 10, WSCALE = 0.2, CELL_PX = 32;
// ── 지각·이동 ──
const DETECT_PX  = 45 * CELL_PX;   // 캐러밴 지각 반경
const ENGAGE_PX  = 2 * CELL_PX;    // 근접 교전 사거리
const SPEED_PPS  = 2.6 * CELL_PX;  // 추격 이동 px/s(도보)
const WANDER_PPS = SPEED_PPS * 0.45;// 배회 속도(느림 — 어슬렁)
const ATK_CD_MS  = 600;
const RETAL_PX   = ENGAGE_PX * 1.5;
// ── 배회·판단(무주사위 창발 파라미터) ──
const SEMI_R     = 6 * CELL_PX;    // semi-camp 배회 반경(배부를 때 — 앵커 주위 어슬렁)
const COMMIT_MARGIN = 1.15;        // commit 조건: 파티력 ≥ 호위력 × 이 배수(억지 문턱 — Lanchester 여유)
const BREAKOFF_FRAC = 0.5;         // 파티 생존이 초기의 이 비율 이하 → 도주(break-off)
const LEAD_MAX   = 6 * CELL_PX;    // 리드요격 최대 앞점
const ROUTE_BIAS = 0.6;            // semi-camp 앵커를 소굴→교역로 힌트 쪽으로 당기는 비율
// ── 굶주림 기반 탐색(★절벽 완화의 핵심): 굶으면 배회 반경 확장 → 먼 소굴은 더 굶어야 경로 도달
//    → 거리에 따라 약탈 빈도가 연속 falloff(계단→램프). 성공 약탈(포식)로 굶주림 리셋. 늑대 코싱 고증.
const HUNGER_RATE  = 1 / 550;      // 틱당 굶주림 상승(≈55초에 포화 — dt=100ms 기준)
const FORAGE_MULT  = 10;           // 최대 굶주림 시 배회 반경 = SEMI_R×(1+이 값)(≈66셀 도달)
const HUNGER_START = 0.4;          // 초기 굶주림 상한(라이더별 시드 스태거 — 동시 포화 방지)
// ── 진행형 티어 → 무기 풀 ──
const TIER_POOL = { light: ['stone', 'wood', 'bone'], veteran: ['iron', 'obsidian', 'bronze'] };
function rollAtk(pool, rng) { const mat = pool[(rng() * pool.length) | 0]; return BASE_ATK + Math.round(PI.craftItem('weapon', 3, { [mat]: 3 }).attrs.attack * WSCALE); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function create(host) {
  const rng = (host && host.rng) || Math.random;
  const raiders = [];
  const _lastPos = new Map();   // cid → {x,y} 직전 위치(속도/방향 추정 — 리드요격)
  let _rid = 1;

  // gang: { id, camp:{px,py}, n, tier, routeHint?:{px,py} }
  //   routeHint = 이 갱이 노리는 교역로상 한 점(호스트가 pairSync서 주입). 없으면 캠프 자체.
  function spawnGang(gang) {
    const pool = TIER_POOL[gang.tier] || TIER_POOL.light;
    const hint = gang.routeHint || gang.camp;
    const out = [];
    for (let i = 0; i < gang.n; i++) {
      // semi-camp 앵커: 소굴→교역로 힌트 쪽으로 ROUTE_BIAS 당기고 라이더별 지터(시드 재현) → 배회 구름
      const t = ROUTE_BIAS * (0.5 + 0.5 * rng());
      const ax = gang.camp.px + (hint.px - gang.camp.px) * t + (rng() - 0.5) * SEMI_R;
      const ay = gang.camp.py + (hint.py - gang.camp.py) * t + (rng() - 0.5) * SEMI_R;
      const r = {
        rid: _rid++, gid: gang.id,
        px: ax, py: ay, home: { px: ax, py: ay },
        hp: HP, maxHp: HP, atk: rollAtk(pool, rng),
        tgt: null, engage: null, lastAtk: 0, st: 'wander',
        _wphase: rng() * Math.PI * 2,   // 배회 위상(시드 — 결정론적 어슬렁)
        _party: 0,                      // commit 시 초기 파티 규모(break-off 기준)
        hunger: rng() * HUNGER_START,   // 굶주림(시드 스태거 — 동시 포화 방지)
      };
      raiders.push(r); out.push(r);
    }
    return out;
  }

  // ── 헬퍼 ──
  function caravanStrength(c) {
    let s = 0; for (const e of c.escorts) if (e.alive) s += (e.atk || BASE_ATK);
    if (c.trader && c.trader.alive) s += (c.trader.atk || BASE_ATK) * 0.5;   // 상인은 약한 전투원
    return s;
  }
  function caravanHeading(c) {   // 진행방향(호스트 제공 우선, 없으면 위치델타 추정)
    if (c.ang != null) return c.ang;
    if (c.vx != null || c.vy != null) return Math.atan2(c.vy || 0, c.vx || 0);
    const lp = _lastPos.get(c.cid);
    if (lp) { const dx = c.x - lp.x, dy = c.y - lp.y; if (dx || dy) return Math.atan2(dy, dx); }
    return 0;
  }
  function detect(r, caravans) {
    let best = null, bd = DETECT_PX;
    for (const c of caravans) { if (!c.alive || c.arrived || c._resolved) continue; const d = dist(r.px, r.py, c.x, c.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function pickDefender(c) { for (const e of c.escorts) if (e.alive) return e; if (c.trader && c.trader.alive) return c.trader; return null; }

  // ── commit 판단(결정론·무주사위): 억지 + 규모별 rally ──
  //   지각한 라이더가 '필요 규모(needN = 호위력×margin / 평균 atk)'를 산정 → 표적에 가장 가까운
  //   가용 갱원 needN명을 소집(rally). 갱이 needN을 못 모으면 회피(억지=fear).
  //   → 자잘한 호위=적은 소집(자주 약탈) · 대군 호위=큰 소집 필요→못 모으면 회피가 창발.
  //   흩어져 있어도 소집하므로 굶주림 배회(확장)와 양립 — 거리→빈도 falloff 유지.
  function tryCommit(r, caravans) {
    const c = detect(r, caravans); if (!c) return;
    const avail = raiders.filter(o => o.gid === r.gid && o.hp > 0 && (o.st === 'wander' || o.tgt === c));
    if (!avail.length) return;
    const escStr = caravanStrength(c);
    const avgAtk = avail.reduce((a, o) => a + o.atk, 0) / avail.length;
    const needN = Math.max(1, Math.ceil(escStr * COMMIT_MARGIN / Math.max(1, avgAtk)));
    if (avail.length < needN) return;   // 갱이 필요 규모를 못 모음 → 억지(회피)
    avail.sort((a, b) => dist(a.px, a.py, c.x, c.y) - dist(b.px, b.py, c.x, c.y));   // 표적 최근접 우선(결정론)
    for (let i = 0; i < needN; i++) { const o = avail[i]; o.st = 'hunt'; o.tgt = c; o.engage = null; o._party = needN; }
  }

  function stepToward(r, tx, ty, pps, dtMs) {
    const step = pps * dtMs / 1000;
    const dx = tx - r.px, dy = ty - r.py, dd = Math.hypot(dx, dy) || 1;
    const nx = r.px + dx / dd * step, ny = r.py + dy / dd * step;
    if (!host.terrainBlocked || !host.terrainBlocked(nx, ny)) { r.px = nx; r.py = ny; }
  }

  function tick(dtMs, nowMs) {
    const caravans = host.getCaravans ? (host.getCaravans() || []) : [];

    // 1) 라이더 상태기계
    for (const r of raiders) {
      if (r.hp <= 0) { r.st = 'dead'; continue; }

      if (r.st === 'wander') {
        // 어슬렁: 굶주림↑ → 배회 반경 확장(먼 소굴은 더 굶어야 경로 도달 → 거리별 빈도 연속 falloff)
        r.hunger = Math.min(1, r.hunger + HUNGER_RATE * dtMs / 100);
        r._wphase += dtMs / 1000 * 0.8;
        const effR = SEMI_R * (1 + r.hunger * FORAGE_MULT);
        const wx = r.home.px + Math.cos(r._wphase) * effR * 0.7;
        const wy = r.home.py + Math.sin(r._wphase * 0.7) * effR * 0.7;
        stepToward(r, wx, wy, WANDER_PPS, dtMs);
        tryCommit(r, caravans);
        continue;
      }

      // hunt / engage
      const c = r.tgt;
      if (!c || !c.alive || c.arrived || c._resolved) { r.st = 'wander'; r.tgt = null; r.engage = null; continue; }
      // break-off: 파티 생존이 초기의 BREAKOFF_FRAC 이하면 도주(억지 — 자살돌격 회피)
      const partyAlive = raiders.filter(o => o.tgt === c && o.hp > 0).length;
      if (r._party && partyAlive < Math.max(1, Math.ceil(r._party * BREAKOFF_FRAC))) {
        r.st = 'wander'; r.tgt = null; r.engage = null; continue;
      }
      if (!r.engage || !r.engage.alive) r.engage = pickDefender(c);
      const tgt = r.engage; if (!tgt) { r.st = 'wander'; r.tgt = null; continue; }

      const d = dist(r.px, r.py, c.x, c.y);
      if (d > ENGAGE_PX) {
        // 리드요격: 표적 진행방향 앞점 조준(야생 늑대 요격 재사용)
        const ang = caravanHeading(c);
        const lead = Math.min(LEAD_MAX, d * 0.45);
        stepToward(r, c.x + Math.cos(ang) * lead, c.y + Math.sin(ang) * lead, SPEED_PPS, dtMs);
        r.st = 'hunt';
      } else {
        r.st = 'engage'; c._everEngaged = true;
        if (nowMs - r.lastAtk >= ATK_CD_MS) { r.lastAtk = nowMs; host.damage(tgt, r.atk, `bandit:${r.gid}`); }
      }
    }

    // 2) 방어측(호위·상인) 반격
    for (const c of caravans) {
      if (!c.alive) continue;
      const defs = c.trader ? c.escorts.concat([c.trader]) : c.escorts;
      for (const dfn of defs) {
        if (!dfn.alive) continue;
        if (dfn.lastAtk == null) dfn.lastAtk = 0;
        if (nowMs - dfn.lastAtk < ATK_CD_MS) continue;
        let best = null, bd = RETAL_PX;
        for (const r of raiders) { if (r.hp <= 0) continue; const dd = dist(r.px, r.py, c.x, c.y); if (dd < bd) { bd = dd; best = r; } }
        if (best) { dfn.lastAtk = nowMs; best.hp -= (dfn.atk || BASE_ATK); if (best.hp <= 0) { best.hp = 0; best.st = 'dead'; if (host.spawnCorpse) host.spawnCorpse(best); } }
      }
    }

    // 3) 사망 raider 제거
    for (let i = raiders.length - 1; i >= 0; i--) { if (raiders[i].hp <= 0) { if (host.removeRaider) host.removeRaider(raiders[i]); raiders.splice(i, 1); } }

    // 4) 캐러밴 결과 판정(1회): 전손 / 격퇴 / 회피(억지로 교전 없이 통과)
    for (const c of caravans) {
      if (c._resolved) continue;
      if (c.alive && !c.arrived) {
        const defsAlive = c.escorts.some(e => e.alive) || (c.trader && c.trader.alive);
        const gangOnMe = raiders.some(r => r.tgt === c && r.hp > 0);
        if (!defsAlive) { c._resolved = 'defeated'; if (c.onDefeat) c.onDefeat();
          for (const r of raiders) if (r.tgt === c && r.hp > 0) r.hunger = 0;   // 포식 → 굶주림 리셋(배부르면 소굴 근처로 복귀)
        }
        else if (c._everEngaged && !gangOnMe) { c._resolved = 'repelled'; if (c.onRepel) c.onRepel(); }
      } else if (c.arrived && !c._everEngaged) {
        c._resolved = 'avoided'; if (c.onAvoided) c.onAvoided();   // 억지/미포착으로 무사 도착
      }
    }

    // 5) 위치 기억 갱신(다음 틱 진행방향 추정)
    for (const c of caravans) if (c.alive) _lastPos.set(c.cid, { x: c.x, y: c.y });
  }

  return { raiders, spawnGang, tick, _c: { HP, DETECT_PX, ENGAGE_PX, SPEED_PPS, WANDER_PPS, SEMI_R, COMMIT_MARGIN, BREAKOFF_FRAC, LEAD_MAX, ROUTE_BIAS, HUNGER_RATE, FORAGE_MULT } };
}

module.exports = { create, HP, BASE_ATK, WSCALE, TIER_POOL, ATK_CD_MS, _rollAtk: rollAtk };
