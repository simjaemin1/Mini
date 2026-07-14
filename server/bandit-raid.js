// ═══════════════════════════════════════════════════════════════════════════
// server/bandit-raid.js — 도적 습격 실체 층 (Phase 2, bandits.js 21~24 유예분 구현)
//   wildlife.js 패턴 미러: 호스트 주입식 init/tick, 자체 엔티티 배열, per-entity 근접.
//   ★econ 무접촉: 전투는 host.damage(=zone.js damagePlayer) + 결과는 host 콜백으로만 되먹임.
//   ★전투 모델 = zone.js 충실(hp100 · atk=10+무기×0.2 · 평면). skirmish/encounter-lab로 검증된 모델.
//   ★host 미주입/미호출이면 완전 불활성(계약 무해). ENABLE 게이트는 호스트(zone.js)가 관리.
//
//   host 인터페이스:
//     host.getCaravans() → [ { cid, x, y(px), alive, escorts:[def], trader:def|null,
//                              onDefeat(), onRepel(), _resolved?, _everEngaged? } ]
//       def = { hp, atk, alive, lastAtk? }  (호위/상인 몸체)
//     host.damage(defEntity, dmg, src)   — 방어 몸체 피해(zone.js damagePlayer 래핑; alive/hp 갱신 책임)
//     host.removeRaider(r) / host.spawnCorpse(r) / host.broadcast(msg)  (선택)
//     host.terrainBlocked(px,py)→bool (선택) · host.rng()→[0,1) (선택, 결정론 주입용)
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const PI = require('./player-items.js');

// ── zone.js 충실 상수 ──
const HP = 100, BASE_ATK = 10, WSCALE = 0.2, CELL_PX = 32;
// ── 습격 상수 ──
const DETECT_PX = 45 * CELL_PX;   // 캐러밴 감지 반경
const ENGAGE_PX = 2 * CELL_PX;    // 근접 교전 사거리(PLAYER_ATTACK_RANGE 근사)
const SPEED_PPS = 2.6 * CELL_PX;  // 추격 이동 px/s(도보)
const ATK_CD_MS = 600;            // 근접 쿨다운(zone.js PLAYER_ATTACK_COOLDOWN_MS 근사)
const RETAL_PX  = ENGAGE_PX * 1.5;// 방어측 반격 사거리
// ── 의도적 진행형 티어 → 무기 풀 ──
const TIER_POOL = { light: ['stone', 'wood', 'bone'], veteran: ['iron', 'obsidian', 'bronze'] };
function rollAtk(pool, rng) { const mat = pool[(rng() * pool.length) | 0]; return BASE_ATK + Math.round(PI.craftItem('weapon', 3, { [mat]: 3 }).attrs.attack * WSCALE); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function create(host) {
  const rng = (host && host.rng) || Math.random;
  const raiders = [];
  let _rid = 1;

  // gang: { id, camp:{px,py}, n, tier:'light'|'veteran' }
  function spawnGang(gang) {
    const pool = TIER_POOL[gang.tier] || TIER_POOL.light;
    const out = [];
    for (let i = 0; i < gang.n; i++) {
      const r = {
        rid: _rid++, gid: gang.id,
        px: gang.camp.px + (rng() - 0.5) * 3 * CELL_PX,
        py: gang.camp.py + (rng() - 0.5) * 3 * CELL_PX,
        hp: HP, maxHp: HP, atk: rollAtk(pool, rng),
        tgt: null, engage: null, lastAtk: 0, st: 'hunt',
      };
      raiders.push(r); out.push(r);
    }
    return out;
  }

  function nearestCaravan(r, caravans) {
    let best = null, bd = DETECT_PX;
    for (const c of caravans) { if (!c.alive) continue; const d = dist(r.px, r.py, c.x, c.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function pickDefender(c) {                       // 호위 우선, 없으면 상인
    for (const e of c.escorts) if (e.alive) return e;
    if (c.trader && c.trader.alive) return c.trader;
    return null;
  }

  function tick(dtMs, nowMs) {
    const caravans = host.getCaravans ? (host.getCaravans() || []) : [];
    // 1) raider — 표적 획득·추격·근접타
    for (const r of raiders) {
      if (r.hp <= 0) { r.st = 'dead'; continue; }
      if (!r.tgt || !r.tgt.alive) { r.tgt = nearestCaravan(r, caravans); r.engage = null; }
      const c = r.tgt; if (!c || !c.alive) { r.st = 'hunt'; continue; }
      if (!r.engage || !r.engage.alive) r.engage = pickDefender(c);
      const tgt = r.engage; if (!tgt) continue;
      if (dist(r.px, r.py, c.x, c.y) > ENGAGE_PX) {   // 접근
        const step = SPEED_PPS * dtMs / 1000;
        const dx = c.x - r.px, dy = c.y - r.py, dd = Math.hypot(dx, dy) || 1;
        const nx = r.px + dx / dd * step, ny = r.py + dy / dd * step;
        if (!host.terrainBlocked || !host.terrainBlocked(nx, ny)) { r.px = nx; r.py = ny; }
        r.st = 'hunt';
      } else {                                        // 교전
        r.st = 'engage'; c._everEngaged = true;
        if (nowMs - r.lastAtk >= ATK_CD_MS) { r.lastAtk = nowMs; host.damage(tgt, r.atk, `bandit:${r.gid}`); }
      }
    }
    // 2) 방어측(호위·상인) 반격 — 근접 raider 최근접
    for (const c of caravans) {
      if (!c.alive) continue;
      const defs = c.trader ? c.escorts.concat([c.trader]) : c.escorts;
      for (const dfn of defs) {
        if (!dfn.alive) continue;
        if (dfn.lastAtk == null) dfn.lastAtk = 0;
        if (nowMs - dfn.lastAtk < ATK_CD_MS) continue;
        let best = null, bd = RETAL_PX;
        for (const r of raiders) { if (r.hp <= 0) continue; const d = dist(r.px, r.py, c.x, c.y); if (d < bd) { bd = d; best = r; } }
        if (best) { dfn.lastAtk = nowMs; best.hp -= (dfn.atk || BASE_ATK); if (best.hp <= 0) { best.hp = 0; best.st = 'dead'; if (host.spawnCorpse) host.spawnCorpse(best); } }
      }
    }
    // 3) 사망 raider 제거
    for (let i = raiders.length - 1; i >= 0; i--) { if (raiders[i].hp <= 0) { if (host.removeRaider) host.removeRaider(raiders[i]); raiders.splice(i, 1); } }
    // 4) 캐러밴별 결과 판정(1회)
    for (const c of caravans) {
      if (!c.alive || c._resolved) continue;
      const defsAlive = c.escorts.some(e => e.alive) || (c.trader && c.trader.alive);
      const gangAlive = raiders.some(r => r.tgt === c && r.hp > 0);
      if (!defsAlive) { c._resolved = 'defeated'; if (c.onDefeat) c.onDefeat(); }        // 화물 전손
      else if (c._everEngaged && !gangAlive) { c._resolved = 'repelled'; if (c.onRepel) c.onRepel(); }
    }
  }

  return { raiders, spawnGang, tick, _c: { HP, ATK_CD_MS, ENGAGE_PX, DETECT_PX, SPEED_PPS } };
}

module.exports = { create, HP, BASE_ATK, WSCALE, TIER_POOL, ATK_CD_MS, _rollAtk: rollAtk };
