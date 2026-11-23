'use strict';
// ═══ ★★[T1447 2026-11-23 · ★재민 11-22 판정 55 · 56 · 57 · 58 · 59 · 61] 마을이 사람에게 품는 원한 ═══
//   손잡이 `T1447_PERSON_GRUDGE`('1' 만 켬 · ★끔 기본 — 끔이면 villages.js · zone.js 가 이 모듈의 셈을 부르지 않는다 = 종전 바이트).
//   카드 `지시/지시_T1447.md`(덧붙임 여섯까지). 피해자가 마을이면 그 마을의 원한 · 피해자가 사람이면 벌점(판정 55).
//   원한은 두 칸(판정 56):
//     ㉮ 해코지 원한 — 길 막기 · 마을 땅에서 훔치기 · 마을 것 부수기. 장부 = 있는 마을끼리 원한 `econ._grudge` 에 사람 열쇠(`PK + playerId`)로.
//        값으로 쌓고 값으로 갚는다(판정 58 — 그 마을이 그 자원에 매기는 값 · 환산은 `VALUE_PER_GRUDGE` 한 줄).
//        감쇠 · 교역 기피(`grudgeBlockSweep` 의 문턱 `WAR_GRUDGE_BLOCK_TH`)는 마을끼리 고리 그대로 탄다(war-core 손 0).
//        하는 일 = 그 마을 캐러밴 · 주민과 거래 안 함 · 가입 거절 · 제 마을 사람이면 추방(판정 46 술어 자리를 갈음) · 짐을 값만큼 가져감(토벌 때).
//     ㉯ 땅 원한 — 그 사람 사유지가 그 마을의 넓힘을 막은 칸 수(판정 58 "막힌 칸" — 시간으로 쌓이는 수가 아니다 · 감쇠 0).
//        장부 = `econ._grudgeLand[playerId]` = { c: [센 칸 'x,y' — 한 번만], d0(처음 막힌 날), off(가입을 권한 날) }.
//        가입을 막지 않는다 · 그 마을에 들면 그 자리에서 지운다(덮이니 원인이 사라진다) · 문턱을 넘으면 토벌 명분(판정 59 — 지금 명분은 땅 하나).
//   이 파일은 표 · 셈만 갖는다(순수 — 존 · 마을 시뮬이 같이 쓴다 · 한 프로세스에 하나). 몸 · 걸음 · 부수기는 villages.js · zone.js 의 있는 문을 탄다.
const ON = process.env.T1447_PERSON_GRUDGE === '1';

// ── 사람 열쇠 ───────────────────────────────────────────────────────────────
//   마을끼리 원한의 열쇠는 마을 이름(플레이어 마을은 사람이 적은 글자 — `foundPlayerVillage` 가 거르지 않는다)이라
//   사람이 적을 수 없는 글자(U+0001)를 머리에 둔다 — 마을 이름과 안 부딪히고 · JSON 저장(econ 직렬화 `serializeEcon` 그대로)에 그대로 든다.
const PK = '\u0001';
const pkey = (pid) => PK + String(pid);
const isPKey = (k) => typeof k === 'string' && k.length > 1 && k.charCodeAt(0) === 1;
const pidOf = (k) => (isPKey(k) ? k.slice(1) : null);

// ── 사유지 칸 표(존이 채운다) ────────────────────────────────────────────────
//   칸 'x,y' → { pid, name, cid, kind, vid } — 개인 · 임시 사유지 중 아직 주인이 있는 것(`free` = 풀린 땅 · 막지 않는다).
//   vid = 주인이 든 마을(이 존 · 없으면 null) — "그 마을 사람이면 덮고 아니면 못 덮는다"(T1441 덧붙임 넷 · 판정 54).
const CI = { at: new Map(), byPid: new Map(), stamp: null, builds: 0 };
function ciBuild(rows, stamp) {   // rows: [{ cid, pid, name, kind, state, cells: [[x,y]…], vid }]
  CI.at.clear(); CI.byPid.clear(); CI.stamp = stamp; CI.builds++;
  for (const r of rows) {
    if (!r || !r.pid || (r.kind !== 'personal' && r.kind !== 'temporary') || r.state === 'free') continue;
    const o = { pid: String(r.pid), name: r.name || '', cid: r.cid, kind: r.kind, vid: r.vid == null ? null : (r.vid | 0) };
    let S = CI.byPid.get(o.pid); if (!S) CI.byPid.set(o.pid, (S = new Set()));
    for (const [x, y] of r.cells) { const k = x + ',' + y; CI.at.set(k, o); S.add(k); }
  }
  return CI;
}
function ciAt(x, y) { return CI.at.get(x + ',' + y) || null; }
function ciCellsOf(pid) { return CI.byPid.get(String(pid)) || null; }

// ── ㉯ 땅 원한 — 막힌 칸 ─────────────────────────────────────────────────────
//   넓힘이 고른 칸(그날 가장 값진 `want` 칸 — 사유지가 없었다면 가졌을 칸) 가운데 그 사람 사유지 칸 = 막힌 칸.
//   한 번 센 칸은 다시 안 센다 · 읽을 때는 지금도 그 사람 사유지 칸인 것만 센다(사유지를 줄이거나 옮기면 다시 센다 — 덧붙임 넷 2).
function landOf(econ, pid) { const L = econ && econ._grudgeLand; return (L && L[String(pid)]) || null; }
function landAdd(econ, pid, k, day) {
  if (!econ) return false;
  const L = econ._grudgeLand || (econ._grudgeLand = {}), id = String(pid);
  let g = L[id]; if (!g) g = L[id] = { c: [], d0: day | 0 };
  if (g.c.includes(k)) return false;
  g.c.push(k); g.dl = day | 0;
  return true;
}
function landCount(econ, pid) {   // 지금도 그 사람 사유지 칸인 센 칸 수
  const g = landOf(econ, pid); if (!g) return 0;
  const S = ciCellsOf(pid); if (!S) return 0;
  let n = 0; for (const k of g.c) if (S.has(k)) n++;
  return n;
}
function landClear(econ, pid) { const L = econ && econ._grudgeLand; if (!L || !L[String(pid)]) return false; delete L[String(pid)]; if (!Object.keys(L).length) delete econ._grudgeLand; return true; }

//   넓힘 하루의 막힌 칸 가르기(순수) — all = [[칸, 값, 주인|null]…](넓힘 후보 + 못 가진 사유지 칸 · 만난 차례) · want = 그날 넓힐 칸 수
//   → 사유지가 없었다면 고른 위 `want` 칸 가운데 사유지 칸 [[칸, 주인]…]. 정렬은 넓힘과 같은 값 · 같은 차례(안정 정렬 — 같은 값이면 만난 차례).
function pickBlocked(all, want) {
  const s = all.slice().sort((a, b) => b[1] - a[1]), out = [];
  for (let i = 0; i < s.length && i < want; i++) if (s[i][2]) out.push([s[i][0], s[i][2]]);
  return out;
}

// ── ㉮ 해코지 원한 — 마을끼리 원한 장부 그대로(`warGrudge` · `warAddGrudge` — 0 ~ 1 · 감쇠 · 교역 기피 문턱은 war-core 고리) ─────────────
const W = require('../sim/war-core');
const TH = W.WAR_GRUDGE_BLOCK_TH;            // 문 셋(거래 · 가입 · 추방)의 문턱 = 마을끼리 교역 기피 문턱 그대로(0.45 · 새 수 0)
//   값 없는 해코지(길 막기 한 번)의 원한 = 종전 벌점(`VP_BREAK_FENCE` 8)이 벌점 문턱(`VP_THRESHOLD` 50)에서 차지하던 몫을 원한 문턱에 옮긴 것
//   = 8 ÷ 50 × 0.45 = 0.072(새 수 0 — 세 수의 비). 종전 "벌점 50 = 길 막기 일곱 번"과 같은 걸음으로 문턱에 닿는다(일곱 번째에 0.504).
const VP_BLOCK = 8, VP_TH = 50;
const BLOCK_G = (VP_BLOCK / VP_TH) * TH;
//   판정 61 — 주인 없는 땅에 세운 것이 막았을 때는 "조금만": PM 시작값 ½(표 — ½ · ¼ · 가장 작은 단위 · 재민 판정 감)
const FREE_MUL = 0.5;
//   판정 58 — 값으로 쌓고 값으로 갚는다: 원한 = 값 ÷ (그 마을 원한 1 의 값). 원한 1 의 값 = 그 마을 한 사람의 `VALUE_DAYS` 날 식량(그 마을 시세 · PM 시작값 100 — 보고 §2 표:
//     100 이면 나무 한 그루 ≈ 0.18 · 밀 한 칸 ≈ 0.05 · 길 막기 0.072 — 문턱까지 나무 셋 · 밀 아홉 칸 · 길 막기 일곱 번(종전 벌점 걸음과 같은 결) · 30 이면 나무 한 그루가 바로 문턱)
const VALUE_DAYS = 100;
function harmOf(econ, pid) { return W.warGrudge(econ, pkey(pid)); }
function harmAdd(econ, pid, g) {
  if (!econ || !(g > 0)) return 0;
  const b = harmOf(econ, pid);
  W.warAddGrudge(econ, pkey(pid), g);
  return harmOf(econ, pid) - b;
}
function harmPay(econ, pid, g) {   // 갚음 — 값만큼 내린다(0.01 밑이면 지운다 — 감쇠 고리와 같은 바닥)
  if (!econ || !econ._grudge || !(g > 0)) return 0;
  const k = pkey(pid), b = econ._grudge[k] || 0; if (!(b > 0)) return 0;
  const nv = b - g;
  if (nv < 0.01) delete econ._grudge[k]; else econ._grudge[k] = nv;
  return b - Math.max(0, nv < 0.01 ? 0 : nv);
}
function harmShut(econ, pid) { return harmOf(econ, pid) >= TH; }   // 거래 끊김 · 가입 거절 · 추방의 술어(마을끼리 `grudgeBlockSweep` 의 그 문턱 — 하루를 안 기다린다)
function gOfValue(value, unit) { return (value > 0 && unit > 0) ? value / unit : 0; }

// ── 명분(판정 59 — 지금 명분은 땅 하나) ─────────────────────────────────────
//   막힌 칸(지금도 그 사유지 칸인 것)이 그 사유지의 절반(`LAND_HALF`)쯤 또는 N칸(`LAND_N`)쯤 — 먼저 닿는 쪽(판정 58 재민 기준).
//   "그 사유지" = 막힌 칸이 든 그 사람 사유지 덩이(4방 이음)들의 칸 수. N 은 그림 실험을 보고 재민이 정한다 — PM 시작값 30.
const LAND_HALF = 0.5, LAND_N = 30;
function _comps(S) {   // 칸 집합 → 덩이들(4방)
  const seen = new Set(), out = [];
  for (const k of S) {
    if (seen.has(k)) continue;
    const comp = [], st = [k]; seen.add(k);
    while (st.length) { const c = st.pop(); comp.push(c); const i = c.indexOf(','), x = +c.slice(0, i), y = +c.slice(i + 1);
      for (const nk of [(x + 1) + ',' + y, (x - 1) + ',' + y, x + ',' + (y + 1), x + ',' + (y - 1)]) if (S.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); } }
    out.push(comp);
  }
  return out;
}
function casus(econ, pid) {
  const g = landOf(econ, pid), S = ciCellsOf(pid);
  if (!g || !S) return { ok: false, n: 0, size: 0, need: Infinity };
  const blk = g.c.filter((k) => S.has(k)), bs = new Set(blk);
  let size = 0; const cells = [];
  for (const comp of _comps(S)) if (comp.some((k) => bs.has(k))) { size += comp.length; for (const k of comp) cells.push(k); }
  const need = Math.min(Math.ceil(size * LAND_HALF), LAND_N);
  return { ok: blk.length > 0 && blk.length >= need, n: blk.length, size, need, cells };
}
//   토벌 뒤 푸는 칸(판정 57) — 그 마을 영토에 가까운 칸부터 `UNCLAIM_FRAC`(30 % · 올림 · 적어도 한 칸) · 같으면 마을 중심에 가까운 칸 · 같으면 칸 번호(y, x) — 결정론
const UNCLAIM_FRAC = 0.3;
function unclaimPick(cells, terr, ccx, ccy) {
  const n = Math.max(1, Math.ceil(cells.length * UNCLAIM_FRAC));
  const d2t = (x, y) => {   // 영토 칸까지 체비쇼프 거리(가까운 링부터 · 64 칸까지)
    for (let r = 1; r <= 64; r++) {
      for (let i = -r; i <= r; i++) { if (terr.has((x + i) + ',' + (y - r)) || terr.has((x + i) + ',' + (y + r)) || terr.has((x - r) + ',' + (y + i)) || terr.has((x + r) + ',' + (y + i))) return r; }
    }
    return 65;
  };
  const rows = cells.map((k) => { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1); return { k, x, y, d: d2t(x, y), c: Math.hypot(x - ccx, y - ccy) }; });
  rows.sort((a, b) => (a.d - b.d) || (a.c - b.c) || (a.y - b.y) || (a.x - b.x));
  return rows.slice(0, n).map((r) => r.k);
}
const CARRY_KG = 25;   // 한 몸이 질 수 있는 kg(`carry.js CAP_KG` 기본 — 존이 몸마다 `capKg` 로 다시 잰다)

module.exports = { ON, PK, pkey, isPKey, pidOf, CI, ciBuild, ciAt, ciCellsOf, landOf, landAdd, landCount, landClear, pickBlocked,
  TH, BLOCK_G, FREE_MUL, VALUE_DAYS, harmOf, harmAdd, harmPay, harmShut, gOfValue, LAND_HALF, LAND_N, casus, UNCLAIM_FRAC, unclaimPick, CARRY_KG };
