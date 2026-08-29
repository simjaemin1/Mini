// === server/facility.js — 시설 정본 + 제작 대기열 [재민 확정 2026-08-29] ==========
//
// 재민 확정(§8.5): **"제작창 = 시설의 창"** — 전 레시피 대목록 화면은 만들지 않는다.
//   화덕/모닥불 = 요리 · 작업대 = 도구 · 노 = 제련.
// 헌법(일관성 원칙): **제작은 마법 메뉴가 아니라 시설 앞의 물리 행위다.**
//   그래서 ① 어디서나 만들 수 없고(시설 반경) ② 즉석이 아니다(시간).
//
// ★★대기열의 문법은 이 레포가 이미 세 번 쓴 것과 **같다** — 광맥·낚시 자리·채집 군락의
//   **lazy 시간**이다. 틱을 돌지 않는다. 넣을 때 `doneAt` 을 적고, **볼 때** 지금과 견준다.
//   그래서 **오프라인에도 진행된다** — 시설이 일하는 것이지 플레이어가 일하는 게 아니다.
//   ("가마는 밤새 탄다." 수령만 접속해서 한다 — 물건이 손에 오는 건 사람의 일이다.)
//
// ★대기열은 **시설에 붙는다**(플레이어가 아니라). 한 시설은 한 번에 하나씩 만든다 —
//   그래서 둘째 주문은 첫째가 끝난 뒤에 시작한다(`startAt = max(now, 앞 주문의 doneAt)`).
//   ⇒ "작업대를 하나 더 지으면 두 배로 만든다"가 성립한다(시설이 생산수단이다).
//
// ⚠econ 무접촉: 여기엔 가격도 재고도 없다. 품질은 `player-items.craftItem` 정본이 낸다.
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };

// ── 시설 표 — **한 곳** ─────────────────────────────────────────────────────
//   kind: 이 시설이 여는 창 · range: 손이 닿는 거리(px) · ko: 화면 이름
const FACILITIES = {
  campfire:      { kind: 'cook',  ko: '모닥불',  range: _num('FACILITY_RANGE_PX', 96) },
  furnace:       { kind: 'smelt', ko: '노',      range: _num('FACILITY_RANGE_PX', 96) },
  charcoal_kiln: { kind: 'smelt', ko: '숯가마',  range: _num('FACILITY_RANGE_PX', 96) },
  workbench:     { kind: 'tool',  ko: '작업대',  range: _num('FACILITY_RANGE_PX', 96) },
};
// 창 → 그 창을 여는 시설 종류들
const KIND_TYPES = {};
for (const [t, f] of Object.entries(FACILITIES)) (KIND_TYPES[f.kind] || (KIND_TYPES[f.kind] = [])).push(t);

// ── 제작 시간 ───────────────────────────────────────────────────────────────
//   ★재민 지시: "정품 도끼 몇 분 급(env)". 요리는 짧고(불에 얹는 일), 도구는 길다(갈아 만든다).
//   ⚠**게임일이 아니라 실시간**이다 — 오프라인 진행이 뜻을 가지려면 벽시계여야 한다.
const CRAFT_MS = {
  cook:    Math.max(0, Math.round(_num('CRAFT_COOK_MS', 20 * 1000))),
  tool:    Math.max(0, Math.round(_num('CRAFT_TOOL_MS', 180 * 1000))),   // 정품 간석기 3분
  smelt:   Math.max(0, Math.round(_num('CRAFT_SMELT_MS', 120 * 1000))),
};
const MAX_QUEUE = Math.max(1, Math.round(_num('CRAFT_QUEUE_MAX', 5)));

// ── 시설 찾기 ───────────────────────────────────────────────────────────────
//   ★건물 목록을 여기서 다시 뒤지지 않는다 — 부르는 쪽(zone)이 이터러블을 준다(사본 금지).
//   ★`canUse` 를 주면 **쓸 수 있는 것 중에서** 가장 가까운 것을 고른다.
//     안 그러면 내 작업대와 남의 작업대가 나란히 섰을 때 남의 것이 뽑혀 "내 것이 아니다"가 뜬다
//     (하네스가 실제로 그 자리를 밟았다 — 두 사람이 같은 자리에 짓는 건 마을에선 흔한 일이다).
function nearest(kind, x, y, buildings, canUse) {
  const types = KIND_TYPES[kind] || [];
  let best = null, bestD = Infinity, fallback = null, fbD = Infinity;
  for (const b of buildings) {
    if (!types.includes(b.type)) continue;
    const f = FACILITIES[b.type];
    const d = Math.hypot(b.x - x, b.y - y);
    if (d > f.range) continue;
    if (d < fbD) { fbD = d; fallback = b; }
    if (canUse && !canUse(b)) continue;
    if (d < bestD) { bestD = d; best = b; }
  }
  const pick = best || fallback, pd = best ? bestD : fbD;
  return pick ? { b: pick, d: pd, kind, ko: FACILITIES[pick.type].ko } : null;
}
// 반경 안의 모든 시설(창 자동 개방 판단용) — 가장 가까운 것 하나만 돌려준다.
function anyNear(x, y, buildings, canUse) {
  let best = null, bestD = Infinity, fallback = null, fbD = Infinity;
  for (const b of buildings) {
    const f = FACILITIES[b.type];
    if (!f) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d > f.range) continue;
    if (d < fbD) { fbD = d; fallback = b; }
    if (canUse && !canUse(b)) continue;
    if (d < bestD) { bestD = d; best = b; }
  }
  const pick = best || fallback, pd = best ? bestD : fbD;
  return pick ? { b: pick, d: pd, kind: FACILITIES[pick.type].kind, ko: FACILITIES[pick.type].ko } : null;
}

// ── 대기열 (시설에 붙는다 · lazy) ──────────────────────────────────────────
function _q(b) {
  if (!b.data || typeof b.data !== 'object') b.data = {};
  if (!Array.isArray(b.data.queue)) b.data.queue = [];
  return b.data.queue;
}
// 넣는다. 앞 주문이 끝난 뒤에 시작한다(시설은 하나씩 만든다).
function enqueue(b, job, now) {
  const q = _q(b);
  if (q.length >= MAX_QUEUE) return { ok: false, err: `대기열이 찼다(${MAX_QUEUE})` };
  const ms = job.ms != null ? job.ms : (CRAFT_MS[job.kind] || 0);
  const startAt = Math.max(now, q.length ? q[q.length - 1].doneAt : now);
  const rec = Object.assign({}, job, { startAt, doneAt: startAt + ms, ms });
  q.push(rec);
  return { ok: true, job: rec, ahead: q.length - 1 };
}
// 본다(안 꺼낸다). 남은 시간은 **조회 시각**으로 계산한다 — 틱 비용 0.
function view(b, now) {
  return _q(b).map((j, i) => ({
    i, id: j.id, kind: j.kind, label: j.label, owner: j.owner,
    doneAt: j.doneAt, leftMs: Math.max(0, j.doneAt - now), done: j.doneAt <= now,
  }));
}
// 끝난 것만 꺼낸다(순서 보장 — 앞이 안 끝났으면 뒤도 못 꺼낸다).
function collect(b, ownerId, now) {
  const q = _q(b);
  const out = [];
  while (q.length && q[0].doneAt <= now) {
    if (ownerId != null && q[0].owner !== ownerId) break;   // 남의 주문은 안 건드린다
    out.push(q.shift());
  }
  return out;
}
function pending(b, ownerId) { return _q(b).filter((j) => ownerId == null || j.owner === ownerId).length; }
function clear(b) { if (b.data) b.data.queue = []; }

module.exports = { FACILITIES, KIND_TYPES, CRAFT_MS, MAX_QUEUE, nearest, anyNear, enqueue, view, collect, pending, clear };
