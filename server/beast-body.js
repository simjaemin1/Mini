'use strict';
// =============================================================================
// server/beast-body.js — ★★[T1331 2026-11-16 · S14 · ★재민 11-15 "그게 추상 아니야? 모든 짐승도 다 몸이 있어야지"] **야생 짐승 몸 표**
//
// ★무엇: 마을 사냥터의 야생 짐승을 숫자 장부(`villages.js _gameRich` — 칸 → 마릿수) 대신 **몸 하나하나**로 쥔다.
//   손잡이 `T1331_BEAST_BODY`(**끔 기본** · `'1'` 만 켬 · 켬은 재민 판정) — 끔이면 이 모듈은 **실리지도 않는다**(villages · wildlife · zone 이 켬 갈래 안에서만 require).
//   켬: 마을마다 사냥터 장부를 지은 그 순간 **한 번** 장부 수만큼 몸을 그 칸에 세우고(이행) 장부를 버린다(`_gameRich = null` · 다시 안 읽는다).
//   그 뒤는 몸 규칙만 — 장부 규칙 넷을 몸 규칙으로 옮긴 것이다(보고/T1331 §2 설계 한 장):
//     ⓐ 주 단위 로지스틱 회복 → **번식**: 7날마다 암컷 몸 곁(그 칸)에 새끼 몸. 몸 수 기대값 = 랩 식 그대로 `7 · L_GAMER · n · (1 − n/K)`(암컷 몫으로 나눠 굴림).
//        넘친 몸(K 위 — 벌채로 K 가 줄면)은 같은 식의 음수 몫으로 **굶어 죽는다**(사라짐 0 — 죽음으로 센다).
//     ⓑ 14일 재정착 +2(이웃이 30% 넘으면 · 이웃은 안 준다 = 생성) → **걸음**: 날마다 몸이 서식 칸을 따라 걷는다(한 걸음 = 체비셰프 2칸 안의 서식 칸 · 하루 30걸음)
//        — 빈 칸은 이웃 몸이 걸어 들어와 찬다. 14일마다 밀도 2% 아래 무리터(마을 서식)에 30% 넘는 이웃 무리터의 몸이 그 몫(2% × K)만큼 **걸어서** 옮긴다. 생성 0.
//     ⓒ 사냥 차감 → **그 몸이 죽는다**: 사냥꾼 하루 몫 = 랩 `huntTake`(밀도의 함수) ÷ 몸 환율 — 모인 몫이 한 마리가 되면 사냥꾼 현장에서 가장 가까운 몸 하나가 죽는다.
//        보이는 몸(존 몹으로 선 몸)은 사람 · 화살 · NPC 의 죽음 길 셋(zone `respawnMobLater` 문)으로 죽는다 — 다시 낳기 0.
//     ⓓ 벌채 삭제 → 서식 칸이 줄 뿐(K 감소) — 그 칸의 몸은 남은 서식 칸으로 **걸어 떠나고**, 갈 칸이 없으면 이웃 무리터로, 그것도 없으면 **굶어 죽는다**.
//     ⓔ 먹이 = 서식 칸(사냥터 밴드 = 숲 · 풀밭 — 장부를 지은 그 술어). 철 · 도토리(T325) · 맹수의 초식 몸 먹기는 이 판 밖(회부).
// ★몸 환율(장부 개체 몇 = 몸 하나) `T1331_BEAST_SCALE` — 기본 = `L_GAMEMAX / MOB_DENS` = 100 / 0.02 = **5,000**.
//   읽은 자리: 랩 블록이 "그 칸 풍부도에 서는 몸 수"로 이미 쓰는 밀도(`wildlife.js` `MOB_DENS` · `target = vg / L_GAMEMAX × MOB_DENS`) — 새 수가 아니라 랩의 몸 밀도다.
//   ⚠장부 한 개체 = 몸 하나로 읽으면(T1195 의 읽기) 한반도 1,498만 · 닛폰 554만 몸이다(메모리 · DB · 걸음 못 버팀) — 두 읽기가 1 : 5,000 으로 갈린다(보고 §1 · 회부 1).
// ★주사위 0: 굴림은 전부 자리의 함수(`h32(몸 id, 날, 소금)`) — 같은 판은 같은 몸 · 같은 걸음.
// ★보존: 살아 있는 몸 = 처음(이행) + 태어남 − 죽음(사냥 · 굶음 · 사람 · 늙음 · 맹수) − 넘어감 + 넘어옴 − 길듦. 날마다 센다(`audit`).
// =============================================================================
const SCALE_DEF = 5000;
const MOB_DENS = 0.02;          // wildlife.js MOB_DENS(랩 블록 몸 밀도 — 하네스가 그 글자와 같은지 본다)
const STEPS = 30;               // 하루 걸음 = 랩 무리 웨이포인트 끝(60m · `d>60` · 1칸 = 1m) ÷ 표본 간격 2칸
const STEP_R = 2;               // 한 걸음 = 체비셰프 2칸(표본 격자 간격 — 마을마다 짝홀이 달라도 이웃 서식 칸에 닿는다)
const PICK = 6;                 // 걸을 곳 표본 = 랩 스폰 셀 표본 6(`for(let t2=0;t2<6;t2++)`)
const RESET_DEP = 2, RESET_SRC = 0.3, RESET_ADD = 2;   // 랩 14일 재정착 그 수(빈 칸 g < 2 · 이웃 > 30% · +2)
const S_SEX = 0x13310a, S_SP = 0x13310b, S_BREED = 0x13310c, S_WALK = 0x13310d, S_DIE = 0x13310e;
function h32(a, b, c) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h ^ (b | 0), 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h ^ (c | 0), 0x27d4eb2f);
  h ^= h >>> 16; return h >>> 0;
}
const u01 = (h) => h / 4294967296;
const KEY = (cx, cy) => cx * 65536 + cy;
const KX = (k) => Math.floor(k / 65536), KY = (k) => k % 65536;

function create(opt) {
  // opt = { L_GAMEMAX, L_GAMER, huntTake(g), species: [종 id…], scale, blocked(cx, cy) }
  const L_GAMEMAX = opt.L_GAMEMAX, L_GAMER = opt.L_GAMER;
  const SCALE = opt.scale > 0 ? opt.scale : SCALE_DEF;
  const SPECIES = (opt.species && opt.species.length) ? opt.species.slice() : ['deer'];
  const W = {
    bodies: new Map(),      // id → 몸 { id, sp, sex, born, mom, home, cx, cy, mat, mid, hp, tr, walk }
    homes: new Map(),       // 무리터(마을 dbId) → Set(id)
    hab: new Map(),         // 무리터 → { set: Set(칸 열쇠), list: [열쇠 …](지운 칸은 set 에서만 빠진다), K0(처음 K), N0(처음 몸 수), base, acc, adj: [[무리터, 내 칸, 저쪽 칸] …] }
    union: new Map(),       // 칸 열쇠 → 그 칸을 가진 무리터 수
    occ: new Map(),         // 칸 열쇠 → 그 칸에 선 몸 수(걸을 곳 고르기 · 밀도 — 세계 표)
    next: 1,
    st: { start: 0, born: 0, died: { hunt: 0, starve: 0, seen: 0, old: 0, pred: 0 }, out: 0, in: 0, tame: 0,
      migRem: 0, migN: 0, steps: 0, stepBad: 0, bornFar: 0, bornNoMom: 0, walkers: 0, arrive: 0, abort: 0,
      mismatch: 0, audits: 0, huntAcc: 0, matN: 0, dematN: 0, shown: 0, saveN: 0, loadN: 0, cpuMs: 0 },
    log: [],                // 날 줄 [날, 살아 있는 몸, 처음, 태어남, 죽음 합, 넘어감, 넘어옴, 길듦] — 400 줄까지
    dayAudit: -1,
    habDirty: false,
  };
  const alive = () => W.bodies.size;
  const diedSum = () => { const d = W.st.died; return d.hunt + d.starve + d.seen + d.old + d.pred; };
  const expect = () => W.st.start + W.st.born - diedSum() - W.st.out + W.st.in - W.st.tame + (W.st.reloadGap || 0);
  function occAdd(k, d) { const n = (W.occ.get(k) || 0) + d; if (n > 0) W.occ.set(k, n); else W.occ.delete(k); }
  function homeSet(v) { let s = W.homes.get(v); if (!s) { s = new Set(); W.homes.set(v, s); } return s; }
  function _put(b) { W.bodies.set(b.id, b); homeSet(b.home).add(b.id); occAdd(KEY(b.cx, b.cy), 1); return b; }
  function _drop(b) { W.bodies.delete(b.id); const s = W.homes.get(b.home); if (s) s.delete(b.id); occAdd(KEY(b.cx, b.cy), -1); }
  //   옮김 하나 — 'step' = 몸 규칙의 한 걸음(체비셰프 2칸 넘으면 걸음 감시 칸 · 늘 0) · 'see' = 보이는 몸(존 몹)이 제 다리로 간 자리를 몸 표에 적기
  function _moveTo(b, cx, cy, why) {
    if (why === 'step' && Math.max(Math.abs(cx - b.cx), Math.abs(cy - b.cy)) > STEP_R) W.st.stepBad++;
    occAdd(KEY(b.cx, b.cy), -1); b.cx = cx; b.cy = cy; occAdd(KEY(cx, cy), 1);
  }
  function _rehome(b, v) { const s = W.homes.get(b.home); if (s) s.delete(b.id); b.home = v; homeSet(v).add(b.id); }
  const Kof = (v) => { const h = W.hab.get(v); return h ? h.set.size * L_GAMEMAX / SCALE : 0; };
  const nOf = (v) => { const s = W.homes.get(v); return s ? s.size : 0; };

  // ── 이행(한 번) — 장부 칸마다 마릿수 ÷ 환율을 누적해 몸을 그 칸에 세운다(칸 차례 = 장부 차례 · 남는 몫은 센다)
  function migrate(v, ledger, base) {
    if (W.hab.has(v)) return 0;
    const h = { set: new Set(), list: [], K0: 0, N0: 0, base: base, acc: 0, adj: null };
    W.hab.set(v, h);
    let acc = 0, n = 0;
    for (const [k, g] of ledger) {
      const ci = k.indexOf(','), cx = +k.slice(0, ci), cy = +k.slice(ci + 1), kk = KEY(cx, cy);
      if (!h.set.has(kk)) { h.set.add(kk); h.list.push(kk); W.union.set(kk, (W.union.get(kk) || 0) + 1); }
      acc += (g > 0 ? g : 0) / SCALE;
      while (acc >= 1) {
        acc -= 1;
        const id = W.next++;
        _put({ id, sp: SPECIES[h32(cx, cy, S_SP + n) % SPECIES.length], sex: h32(id, 0, S_SEX) & 1, born: -1, mom: -1, home: v, cx, cy, mat: 0, mid: null, hp: 0, tr: 0, walk: null });
        n++;
      }
    }
    h.K0 = h.set.size * L_GAMEMAX / SCALE; h.N0 = n;
    W.st.start += n; W.st.migRem += acc; W.st.migN++;
    W.habDirty = true; adjDirty = true;
    return n;
  }
  // ── 무리터 이웃(장부 이웃 = ±2 · 같은 칸) — 무리터 A 의 칸 곁(체비셰프 2)에 B 의 칸이 있으면 이웃 · 맞닿은 칸 한 쌍을 적는다(서식이 바뀌면 다시)
  let adjDirty = true, owner = null;
  //   ★[T1495 · 판정 32] 집 무리터 칸 메모(`homeAt` 의 "그 칸을 가진 무리터가 없을 때 가장 가까운 무리터 칸" 훑기 답) — 켬 = wildlife 가 `t1495HomeMemo()` 로 연다(손잡이 `T1495_BEAST_LEAN` · T1461 켬 위) ·
  //     답은 무리터(칸 집합)만 읽는다 — 무리터가 바뀌는 문(이행 · 벌채 · 되읽기)은 다 `adjDirty` 를 세우고 `homeAt` 은 늘 먼저 `_adjBuild` 를 부른다 → 다시 지을 때 비운다(같은 답) · 끔 = null(종전 그대로 훑는다)
  let _t1495Hm = null; const _t1495HmSt = { hit: 0, miss: 0, clr: 0 };
  //   비용: 칸 전부 × 25 를 훑으면 한반도(15만 칸) 한 번 2초다 — 무리터 둘레 사각(± 2)이 겹치는 무리터끼리만, 그 겹친 사각 안 칸만 훑는다(같은 답 · 겹침 없는 쌍은 이웃일 수 없다).
  //   벌채가 서식을 바꾸면 다시 지어야 하지만 읽는 자리는 14일 재정착 · 떠나는 몸뿐이라 그때만 짓는다(`adjDirty`).
  function _adjBuild() {
    owner = new Map();   // 칸 → 처음 가진 무리터들
    const box = new Map();
    for (const [v, h] of W.hab) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const k of h.set) { const o = owner.get(k); if (o) o.push(v); else owner.set(k, [v]); const x = KX(k), y = KY(k); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      box.set(v, [x0 - STEP_R, x1 + STEP_R, y0 - STEP_R, y1 + STEP_R]);
    }
    for (const [v, h] of W.hab) {
      const a = box.get(v), near = [];
      for (const [w, b] of box) if (w !== v && b[0] <= a[1] && a[0] <= b[1] && b[2] <= a[3] && a[2] <= b[3]) near.push(b);
      const seen = new Map();
      if (near.length) for (const k of h.set) {
        const cx = KX(k), cy = KY(k);
        let inBox = false; for (const b of near) if (cx >= b[0] && cx <= b[1] && cy >= b[2] && cy <= b[3]) { inBox = true; break; }
        if (!inBox) continue;
        for (let dx = -STEP_R; dx <= STEP_R; dx++) for (let dy = -STEP_R; dy <= STEP_R; dy++) {
          const o = owner.get(KEY(cx + dx, cy + dy)); if (!o) continue;
          for (const w of o) if (w !== v && !seen.has(w)) seen.set(w, [w, k, KEY(cx + dx, cy + dy)]);
        }
      }
      if (h.set.size || !h.adj) h.adj = [...seen.values()];   // 서식이 다 없어진 무리터는 마지막 이웃을 쥔다(몸이 떠날 곳)
    }
    adjDirty = false; W.st.adjBuild = (W.st.adjBuild | 0) + 1;
    if (_t1495Hm) { _t1495Hm.clear(); _t1495HmSt.clr++; }   // ★[T1495] 무리터가 바뀌었다 — 메모를 비운다
  }
  // ── 걸음 하나 — 지금 칸에서 체비셰프 2 안의 서식 칸 중 목표에 가장 가까운 칸(동률 = 훑는 차례). 서식 칸이 곁에 없으면 막히지 않은 칸.
  function _step(b, tx, ty, okSet) {
    const cx = b.cx, cy = b.cy, d0 = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy);
    let bx = cx, by = cy, bd = d0, any = false;
    const off = !okSet && !W.union.has(KEY(cx, cy));   // 서식 밖에 선 몸(벌채된 칸 · 보이던 몸이 걸어 나간 자리) — 막히지 않은 칸을 곧장 밟아 목표로
    if (!off) for (let dx = -STEP_R; dx <= STEP_R; dx++) for (let dy = -STEP_R; dy <= STEP_R; dy++) {
      if (!dx && !dy) continue;
      const x = cx + dx, y = cy + dy, k = KEY(x, y);
      if (okSet ? !okSet.has(k) : !W.union.has(k)) continue;
      any = true;
      const d = (tx - x) * (tx - x) + (ty - y) * (ty - y);
      if (d < bd) { bd = d; bx = x; by = y; }
    }
    if (off || (!any && !okSet)) {   // 서식 밖 · 곁에 서식 칸이 없다 — 막히지 않은 칸으로
      for (let dx = -STEP_R; dx <= STEP_R; dx++) for (let dy = -STEP_R; dy <= STEP_R; dy++) {
        if (!dx && !dy) continue;
        const x = cx + dx, y = cy + dy; if (x < 1 || y < 1) continue;
        const d = (tx - x) * (tx - x) + (ty - y) * (ty - y);
        if (d < bd && !(opt.blocked && opt.blocked(x, y))) { bd = d; bx = x; by = y; }
      }
    }
    if (bx === cx && by === cy) return false;
    _moveTo(b, bx, by, 'step'); W.st.steps++;   // 걸음 감시는 `_moveTo` 가 센다(늘 0 — 하네스 미끼가 이 칸을 본다)
    return true;
  }
  function _walkTo(b, tx, ty, okSet, n) { let s = 0; while (s < n && (b.cx !== tx || b.cy !== ty) && _step(b, tx, ty, okSet)) s++; return s; }
  // 걸을 곳 — 제 무리터 서식 칸 표본 6 중 선 몸이 가장 적은 칸(동률 = 표본 차례)
  function _pickTarget(b, h, day) {
    let best = -1, bo = Infinity;
    const L = h.list.length; if (!L) return -1;
    for (let t = 0; t < PICK; t++) {
      const k = h.list[h32(b.id, day, S_WALK + t) % L];
      if (!h.set.has(k)) continue;
      const o = W.occ.get(k) || 0;
      if (o < bo) { bo = o; best = k; }
    }
    return best;
  }
  // ── 하루 걸음(무리터 하나) — 보이는 몸(존 몹)과 넘는 중인 몸은 제 다리로 이미 걷는다(건넌다)
  function walkDay(v, day) {
    const s = W.homes.get(v), h = W.hab.get(v); if (!s || !s.size) return 0;
    let n = 0;
    for (const id of [...s]) {
      const b = W.bodies.get(id); if (!b || b.mat || b.tr || b.wd === day) continue;
      b.wd = day;   // 하루 한 번(그날 옮겨 와 무리터가 바뀐 몸이 새 무리터 차례에 또 걷지 않게)
      if (b.walk) { _walkOn(b, day); n++; continue; }
      if (!h || !h.set.size) { _leave(b, day); n++; continue; }    // 서식이 다 없어졌다 — 이웃 무리터로 떠난다(없으면 굶는다)
      const k = _pickTarget(b, h, day); if (k < 0) continue;
      const before = W.st.steps;
      _walkTo(b, KX(k), KY(k), h.set.has(KEY(b.cx, b.cy)) ? h.set : null, STEPS);   // 제 서식 칸 위 = 제 칸만 밟는다 · 서식 밖(벌채 · 보이던 몸) = 아무 서식 칸 · 없으면 막히지 않은 칸
      if (W.st.steps > before) n++;
    }
    return n;
  }
  // 옮겨 가는 몸 — 그 무리터의 맞닿은 칸으로(여러 날) · 닿으면 그 무리터 몸 · 못 걸으면(그날 한 걸음도) 그만둔다
  function _walkOn(b, day) {
    const w = b.walk, th = W.hab.get(w.to);
    if (!th || !th.set.size) { b.walk = null; W.st.abort++; return; }
    const s0 = W.st.steps;
    _walkTo(b, KX(w.at), KY(w.at), null, STEPS);
    if (th.set.has(KEY(b.cx, b.cy)) || (b.cx === KX(w.at) && b.cy === KY(w.at))) { _rehome(b, w.to); b.walk = null; W.st.arrive++; return; }
    if (W.st.steps === s0) { b.walk = null; W.st.abort++; }
  }
  function _leave(b, day) {
    if (adjDirty) _adjBuild();
    const h = W.hab.get(b.home), adj = (h && h.adj) || [];
    let best = null;
    for (const a of adj) { const th = W.hab.get(a[0]); if (th && th.set.size) { best = a; break; } }
    if (!best) { _die(b, 'starve'); return; }
    b.walk = { to: best[0], at: best[2] }; W.st.walkers++;
    _walkOn(b, day);
  }
  function _die(b, cause) { _drop(b); W.st.died[cause] = (W.st.died[cause] || 0) + 1; return b; }
  // ── ⓐ 번식 · 넘친 몸 굶음(7날마다 · 랩 `g + 7·r·g·(1 − g/K)` 의 몸판)
  function breedWeek(v, day) {
    const s = W.homes.get(v); if (!s || !s.size) return { born: 0, died: 0 };
    const K = Kof(v), n = s.size;
    if (!(K > 0)) return { born: 0, died: 0 };
    const f = 7 * L_GAMER * (1 - n / K);
    let born = 0, died = 0;
    if (f > 0) {
      let nf = 0; for (const id of s) { const b = W.bodies.get(id); if (b && b.sex === 0 && !b.tr) nf++; }
      if (!nf) return { born: 0, died: 0 };
      const p = Math.min(1, f * n / nf), room = Math.max(0, Math.floor(K) - n);
      for (const id of [...s]) {
        if (born >= room) break;
        const m = W.bodies.get(id); if (!m || m.sex !== 0 || m.tr) continue;
        if (u01(h32(m.id, day, S_BREED)) >= p) continue;
        const kid = W.next++;
        // 어미 곁 = 어미가 선 그 칸(보이는 어미면 그 몸 자리 칸 — 다음 보임 판에 어미 곁에 선다)
        const k = _put({ id: kid, sp: m.sp, sex: h32(kid, day, S_SEX) & 1, born: day, mom: m.id, home: m.home, cx: m.cx, cy: m.cy, mat: 0, mid: null, hp: 0, tr: 0, walk: null });
        k.bx = k.cx; k.by = k.cy;   // 난 칸(계측 — 하네스가 어미의 그날 칸과 견준다 · 세계 규칙은 안 읽는다)
        if (Math.max(Math.abs(m.cx - k.cx), Math.abs(m.cy - k.cy)) > STEP_R) W.st.bornFar++;   // 어미 곁 감시(늘 0)
        W.st.born++; born++;
      }
    } else if (f < 0) {
      const p = Math.min(1, -f);
      for (const id of [...s]) {
        const b = W.bodies.get(id); if (!b || b.mat || b.tr) continue;
        if (u01(h32(b.id, day, S_DIE)) < p) { _die(b, 'starve'); died++; }
      }
    }
    return { born, died };
  }
  // ── ⓑ 14일 — 빈 무리터(밀도 < 2/K칸)에 30% 넘는 이웃 무리터의 몸이 걸어 온다(몫 = 2/칸 × 칸 수 ÷ 환율 · 남는 몫은 다음 14일로)
  function resettle(v, day) {
    if (adjDirty) _adjBuild();
    const h = W.hab.get(v); if (!h || !h.set.size || !h.adj || !h.adj.length) return 0;
    const K = Kof(v); if (!(K > 0)) return 0;
    if (nOf(v) / K >= RESET_DEP / L_GAMEMAX) return 0;
    let src = null;
    for (const a of h.adj) { const Ka = Kof(a[0]); if (Ka > 0 && nOf(a[0]) / Ka > RESET_SRC) { src = a; break; } }
    if (!src) return 0;
    h.acc += h.set.size * RESET_ADD / SCALE;
    let k = Math.floor(h.acc); h.acc -= k;
    let sent = 0;
    while (k-- > 0) {
      const b = _nearestOf(src[0], KX(src[2]), KY(src[2]), (x) => !x.mat && !x.tr && !x.walk);
      if (!b) break;
      b.walk = { to: v, at: src[1] }; W.st.walkers++; sent++;   // ★생성 0 — 저쪽 몸이 이쪽 맞닿은 칸으로 걸어 온다(오늘부터 날마다 30걸음)
    }
    return sent;
  }
  function nearestCell(v, x, y) {
    const b = _nearestOf(v, x, y, (q) => !q.tr);
    if (b) return { cx: b.cx, cy: b.cy };
    const h = W.hab.get(v); if (!h) return null;
    for (const k of h.set) return { cx: KX(k), cy: KY(k) };
    return null;
  }
  function _nearestOf(v, x, y, ok) {
    const s = W.homes.get(v); if (!s) return null;
    let best = null, bd = Infinity;
    for (const id of s) { const b = W.bodies.get(id); if (!b || !ok(b)) continue; const d = (b.cx - x) * (b.cx - x) + (b.cy - y) * (b.cy - y); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  // ── ⓒ 사냥꾼 하루 — 몫(huntTake(밀도) ÷ 환율)을 모아 한 마리가 되면 현장에서 가장 가까운 (안 보이는) 몸이 죽는다. @returns 죽은 몸(없으면 null)
  function hunt(v, p, wx, wy) {
    const K = Kof(v), n = nOf(v);
    const g = K > 0 ? L_GAMEMAX * Math.min(1, n / K) : 0;
    const take = opt.huntTake(g) / (opt.huntBody ? 1 : SCALE);   // ★[T1359] `huntBody` = 몸 하나 = 한 마리 읽기(랩 `huntTake` 를 몸 수로 · T158 · T1195 `_huntBud` 의 온전한 마리) · 끔 = ÷ 환율(장부 개체 읽기 · 종전)
    p._t1331Acc = (p._t1331Acc || 0) + take; W.st.huntAcc += take;
    if (p._t1331Acc < 1) return null;
    const b = n ? _nearestOf(v, wx, wy, (x) => !x.mat && !x.tr) : null;
    if (!b) { p._t1331Acc = Math.min(p._t1331Acc, 1); return null; }
    p._t1331Acc -= 1;
    return _die(b, 'hunt');
  }
  // ── ⓓ 벌채 — 서식 칸을 지운다(그 칸의 몸은 다음 걸음에 떠난다)
  function deforest(v, cx, cy, rad) {
    const h = W.hab.get(v); if (!h) return 0;
    let n = 0;
    for (let dx = -rad; dx <= rad; dx++) for (let dy = -rad; dy <= rad; dy++) {
      const k = KEY(cx + dx, cy + dy);
      if (h.set.delete(k)) { n++; const u = (W.union.get(k) || 0) - 1; if (u > 0) W.union.set(k, u); else W.union.delete(k); }
    }
    if (n) { W.habDirty = true; adjDirty = true; if (h.list.length > 2 * h.set.size + 64) h.list = h.list.filter((k) => h.set.has(k)); }
    return n;
  }
  // 14일 부존 — 랩 `land.game = base × clamp(합 / tot0, 0.05, 1)` 의 몸판: 합 = 지금 몸 수 · tot0(처음 장부 합) = 처음 몸 수(이행이 세운 몸 · 환율이 약분된다).
  //   ⚠처음 K(칸 × K ÷ 환율 · 소수)로 나누면 작은 무리터(칸 50 아래 = 몸 0)가 첫 14일에 5% 로 떨어진다(이행 내림 몫이 부존을 깎는다 — 첫 판에서 잼) ⇒ 처음 몸 수로.
  //   처음 몸이 0 인 무리터(장부 몫이 몸 하나가 안 됐다)는 견줄 처음이 없다 — 부존을 안 건드린다(null).
  function gameRatio(v) { const h = W.hab.get(v); if (!h || !(h.N0 > 0)) return null; return Math.max(0.05, Math.min(1, nOf(v) / h.N0)); }
  // ── 보임(존 몹) 문 — wildlife 다리가 부른다
  function showAt(b, mid, hp) { b.mat = 1; b.mid = mid; if (hp > 0) b.hp = hp; W.st.matN++; }
  function hideAt(b, px, py, hp) { b.mat = 0; b.mid = null; if (hp > 0) b.hp = hp; const cx = Math.floor(px / 32), cy = Math.floor(py / 32); if (cx !== b.cx || cy !== b.cy) _moveTo(b, cx, cy, 'see'); W.st.dematN++; }
  function follow(b, px, py) { const cx = Math.floor(px / 32), cy = Math.floor(py / 32); if (cx !== b.cx || cy !== b.cy) _moveTo(b, cx, cy, 'see'); }
  function diedAt(id, cause) { const b = W.bodies.get(id); if (!b) return null; return _die(b, cause || 'seen'); }   // 보이는 몸의 죽음(사람 · 화살 · NPC — 존 죽음 길 셋)
  function tameAt(id) { const b = W.bodies.get(id); if (!b) return null; _drop(b); W.st.tame++; return b; }
  // 존 넘김(T1321 문) — 숨김 · 드러냄 · 넘어감(답 OK) · 넘어옴
  function doorHide(id) { const b = W.bodies.get(id); if (b) b.tr = 1; return b; }
  function doorShow(id) { const b = W.bodies.get(id); if (b) b.tr = 0; return b; }
  function doorOut(id) { const b = W.bodies.get(id); if (!b) return null; _drop(b); W.st.out++; return b; }
  function pack(id) { const b = W.bodies.get(id); return b ? { sp: b.sp, sex: b.sex, born: b.born, mom: b.mom, src: b.id } : null; }
  function doorIn(t, px, py, home) {
    const id = W.next++;
    const b = _put({ id, sp: String(t.sp || SPECIES[0]), sex: t.sex ? 1 : 0, born: t.born | 0, mom: -1, home: home, cx: Math.floor(px / 32), cy: Math.floor(py / 32), mat: 0, mid: null, hp: 0, tr: 0, walk: null, from: t.src });
    W.st.in++;
    return b;
  }
  // 집 무리터 고르기(넘어온 몸 · 보이던 몸이 무리터 밖에서 죽지 않게) — 그 칸을 가진 무리터 → 없으면 가장 가까운 무리터의 칸
  function homeAt(cx, cy) {
    if (adjDirty) _adjBuild();
    const c = KEY(cx, cy), o = owner.get(c); if (o && o.length) return o[0];
    if (_t1495Hm && _t1495Hm.has(c)) { _t1495HmSt.hit++; return _t1495Hm.get(c); }   // ★[T1495] 같은 칸 · 같은 무리터 = 같은 답(아래 훑기를 다시 안 한다)
    let best = null, bd = Infinity;
    for (const [v, h] of W.hab) for (const k of h.set) { const d = (KX(k) - cx) ** 2 + (KY(k) - cy) ** 2; if (d < bd) { bd = d; best = v; } }
    if (_t1495Hm) { _t1495Hm.set(c, best); _t1495HmSt.miss++; }
    return best;
  }
  function t1495HomeMemo() { if (!_t1495Hm) _t1495Hm = new Map(); return _t1495HmSt; }   // ★[T1495] 메모를 연다(한 번 · 되돌림 없음) — 셈(맞음 · 훑음 · 비움)을 돌려준다
  // ── 보존 — 날마다(그날 첫 무리터가 부를 때 어제 몫을 센다)
  function audit(day) {
    if (W.dayAudit === day) return null;
    W.dayAudit = day;
    const a = alive(), e = expect(), bad = a !== e ? 1 : 0;
    W.st.audits++; if (bad) W.st.mismatch++;
    W.log.push([day, a, W.st.start, W.st.born, diedSum(), W.st.out, W.st.in, W.st.tame]);
    if (W.log.length > 400) W.log.splice(0, W.log.length - 400);
    return { day, alive: a, expect: e, bad };
  }
  // ── 저장 · 되읽기(존 DB 몸 표) — 행 = [id, 종, 암수, 난 날, 어미, 무리터, cx, cy, 옮길 무리터, 옮길 칸, hp] · 서식 = 무리터마다 칸 열쇠
  function rows() {
    const r = [];
    for (const b of W.bodies.values()) if (!b.tr) r.push([b.id, b.sp, b.sex, b.born, b.mom, b.home, b.cx, b.cy, b.walk ? b.walk.to : null, b.walk ? b.walk.at : null, b.hp | 0]);
    return r;
  }
  function habRows() { const r = []; for (const [v, h] of W.hab) r.push([v, JSON.stringify({ k: [...h.set], K0: h.K0, N0: h.N0, base: h.base, acc: h.acc })]); return r; }
  function meta() { return JSON.stringify({ next: W.next, st: W.st, log: W.log.slice(-60), scale: SCALE }); }
  function load(bodyRows, hRows, metaJson) {
    W.bodies.clear(); W.homes.clear(); W.hab.clear(); W.union.clear(); W.occ.clear();
    for (const [v, js] of hRows) {
      const o = JSON.parse(js), h = { set: new Set(o.k), list: o.k.slice(), K0: o.K0, N0: o.N0 | 0, base: o.base, acc: o.acc || 0, adj: null };
      W.hab.set(v, h); for (const k of h.set) W.union.set(k, (W.union.get(k) || 0) + 1);
    }
    for (const r of bodyRows) _put({ id: r[0], sp: r[1], sex: r[2], born: r[3], mom: r[4], home: r[5], cx: r[6], cy: r[7], mat: 0, mid: null, hp: r[10] | 0, tr: 0,
      walk: r[8] != null ? { to: r[8], at: r[9] } : null });
    if (metaJson) { const m = JSON.parse(metaJson); W.next = m.next; Object.assign(W.st, m.st); W.st.died = Object.assign({ hunt: 0, starve: 0, seen: 0, old: 0, pred: 0 }, m.st.died); W.log = m.log || []; }
    // 넘는 중이던 몸(숨김)은 저장하지 않았다 — 셈을 맞춘다(되읽은 판의 처음 = 되읽은 몸 · 셈 칸은 이어 간다 · 차이는 `reloadGap`)
    W.st.reloadGap = 0; W.st.reloadGap = alive() - expect();
    W.st.loadN++; adjDirty = true; W.habDirty = false;
    return { bodies: W.bodies.size, hab: W.hab.size };
  }
  function stat() {
    const by = {}, home = {}; let mat = 0, tr = 0, walk = 0;
    for (const b of W.bodies.values()) { by[b.sp] = (by[b.sp] | 0) + 1; if (b.mat) mat++; if (b.tr) tr++; if (b.walk) walk++; }
    for (const [v, s] of W.homes) if (s.size) home[v] = s.size;
    let cells = 0; for (const h of W.hab.values()) cells += h.set.size;
    return { scale: SCALE, alive: alive(), expect: expect(), by, mat, tr, walk, cells, habs: W.hab.size, st: JSON.parse(JSON.stringify(W.st)), home, last: W.log[W.log.length - 1] || null };
  }
  const api = { W, SCALE, migrate, walkDay, breedWeek, resettle, hunt, deforest, gameRatio, showAt, hideAt, follow, diedAt, tameAt,
    doorHide, doorShow, doorOut, doorIn, pack, homeAt, t1495HomeMemo, nearestCell, audit, rows, habRows, meta, load, stat, Kof, nOf, alive, expect, KEY, KX, KY,
    has: (v) => W.hab.has(v) };
  module.exports.current = api;   // 이 존의 몸 표(보임 다리 `wildlife` · 존 죽음 길 · 넘김 문이 같은 표를 본다 — 마지막에 지은 것)
  return api;
}
module.exports = { current: null, create, h32, SCALE_DEF, MOB_DENS, STEPS, STEP_R, PICK, RESET_DEP, RESET_SRC, RESET_ADD };
