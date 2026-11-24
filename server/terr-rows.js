// =============================================================================
// server/terr-rows.js — ★★[T1433 2026-11-22] 영토 행 묶어 적기 · 글 꼴(순수 · DB 0 · 상태 0)
//
// 왜: 영토 칸 하나 = `village_buildings` 행 하나(`type = 'terr'`)라 800날 판에서 표의 78.9 %(748,080행)가 영토였다
//   (T1379). 행이 느는 까닭은 죽은 행이 아니라 **영토가 실제로 넓어지기 때문**이다(T1433 §1 — 칸 하나 = 행 하나 · 중복 0 ·
//   두 마을이 가진 칸 0 · 영토 ÷ 인구 ≈ 상한 식 그대로) ⇒ 칸을 지우는 게 아니라 **저장 꼴**을 바꾼다(상한 새로 0 · 재민 "상한 좀 두지 말라니까").
//
// 꼴: 영토 칸을 **넣은 차례 그대로** 한 행(`type = 'terrseq'`)의 `data` 에 싣는다.
//   ★차례가 값이다 — 부팅은 행을 `ORDER BY id` 로 읽어 `_terrSet`(Set) 에 넣고, 그 Set 의 순회 차례가 영토 후보의 동점
//     (`_terrGrow` 정렬)과 실물화 차례에 닿는다(T538 — "31마을이 순서만 달랐다"). 사각 · 가로 줄로만 적으면 집합은 같아도
//     차례가 갈려 다시 뜬 세계가 한 번에 돈 세계와 달라진다. 그래서 **차례를 지키는 줄**만 묶는다(앞 칸의 x+1 이 바로 이어질 때).
//
//   글 v1: "1|bx,by|tok;tok;…"   — bx,by = 이 행의 기준점(쓸 때의 마을 가운데) · 좌표는 그 차(dx = x − bx)
//     "dx,dy"     칸 하나 더함
//     "dx,dy,n"   가로 줄 n 칸(dx … dx+n−1 · 같은 dy) 더함 — n ≥ 2 · 차례 그대로 이어진 칸만
//     "!dx,dy"    칸 하나 뺌(T1238 묵힘 — 종전 `deleteVillageCell` 이 그 칸 행을 지우던 그 뜻)
//     "@dx,dy"    반지름 증거(칸 아님) — 이관이 지운 죽은 행(T569 겹친 칸의 진 쪽)이 쥐던 가장 먼 점.
//                 부팅 반지름(`getVillageFarthest` — 마을 모든 행의 가장 먼 점)이 종전과 같은 값을 내게 행의 cx,cy 에 그 점을 둔다.
//   되읽기 = 토막을 차례대로 Set 에 더하고(있으면 그대로 — 종전 중복 행과 같은 뜻) · 빼고(지운 뒤 다시 더하면 끝으로 — 종전 새 행 id 와 같은 뜻).
//
// 행의 cx,cy = 그 행 칸(과 증거) 가운데 마을 가운데에서 가장 먼 점(제곱 거리 · 같으면 앞 것) — `getVillageFarthest` 가 행 꼴을 몰라도 같은 답.
// =============================================================================
'use strict';

const VER = '1';
const ADD = 1, DEL = -1, WIT = 0;

// ops: [[op, x, y], …] (op 1 더함 · -1 뺌 · 0 증거) — 차례 그대로 글로
function encode(ops, bx, by) {
  bx |= 0; by |= 0;
  const out = [];
  let run = null;   // [dx, dy, n, lastX] — 이어지는 더함 줄
  const flush = () => { if (run) { out.push(run[2] > 1 ? run[0] + ',' + run[1] + ',' + run[2] : run[0] + ',' + run[1]); run = null; } };
  for (const o of ops) {
    const op = o[0], x = o[1] | 0, y = o[2] | 0, dx = x - bx, dy = y - by;
    if (op === ADD) {
      if (run && run[1] === dy && run[3] + 1 === x) { run[2]++; run[3] = x; continue; }
      flush(); run = [dx, dy, 1, x];
    } else { flush(); out.push((op === DEL ? '!' : '@') + dx + ',' + dy); }
  }
  flush();
  return VER + '|' + bx + ',' + by + '|' + out.join(';');
}
// 글 → fn(op, x, y, i) 차례대로(i = 이 행 안의 칸 차례 — 더함 줄은 칸마다 하나씩)
function decode(data, fn) {
  if (data == null) return 0;
  const s = String(data);
  const p1 = s.indexOf('|'), p2 = s.indexOf('|', p1 + 1);
  if (p1 < 0 || p2 < 0 || s.slice(0, p1) !== VER) throw new Error('terr-rows: 모르는 꼴 ' + s.slice(0, 16));
  const b = s.slice(p1 + 1, p2), bc = b.indexOf(','), bx = +b.slice(0, bc), by = +b.slice(bc + 1);
  const body = s.slice(p2 + 1);
  if (!body) return 0;
  let i = 0;
  for (const t of body.split(';')) {
    let op = ADD, u = t;
    const c0 = t.charCodeAt(0);
    if (c0 === 33) { op = DEL; u = t.slice(1); } else if (c0 === 64) { op = WIT; u = t.slice(1); }   // '!' · '@'
    const a = u.split(',');
    const x = bx + (+a[0]), y = by + (+a[1]);
    if (op === ADD && a.length > 2) { const n = +a[2]; for (let j = 0; j < n; j++) fn(ADD, x + j, y, i++); }
    else fn(op, x, y, i++);
  }
  return i;
}
// 마을 가운데(ccx, ccy)에서 가장 먼 점(제곱 거리 · 같으면 먼저 본 것) — 없으면 null
function farthest(points, ccx, ccy) {
  let best = null, bd = -1;
  for (const p of points) { const dx = p[0] - ccx, dy = p[1] - ccy, d = dx * dx + dy * dy; if (d > bd) { bd = d; best = [p[0], p[1]]; } }
  return best;
}
// 'x,y' 열쇠 차례(+ 증거 점 하나) → 글 — `encode(opsOfKeys(keys) + [증거])` 와 **같은 글**을 중간 배열 없이(부팅 이관이 마을마다 수만 칸을 쓴다)
//   반환 { data, n: 칸 수, far: 마을 가운데(cx, cy)에서 가장 먼 점(칸 · 증거 · 같으면 앞) }
function encodeKeys(keys, bx, by, wit, cx, cy) {
  bx |= 0; by |= 0;
  const out = [];
  let rx = 0, ry = 0, rn = 0, lastX = 0, n = 0, far = null, fd = -1;
  const see = (x, y) => { const dx = x - cx, dy = y - cy, d = dx * dx + dy * dy; if (d > fd) { fd = d; far = [x, y]; } };
  for (const k of keys) {
    const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1), dx = x - bx, dy = y - by;
    n++; see(x, y);
    if (rn && ry === dy && lastX + 1 === x) { rn++; lastX = x; continue; }
    if (rn) out.push(rn > 1 ? rx + ',' + ry + ',' + rn : rx + ',' + ry);
    rx = dx; ry = dy; rn = 1; lastX = x;
  }
  if (rn) out.push(rn > 1 ? rx + ',' + ry + ',' + rn : rx + ',' + ry);
  if (wit) { out.push('@' + ((wit[0] | 0) - bx) + ',' + ((wit[1] | 0) - by)); see(wit[0] | 0, wit[1] | 0); }
  return { data: VER + '|' + bx + ',' + by + '|' + out.join(';'), n, far };
}
// 'x,y' 열쇠 차례 → 더함 ops
function opsOfKeys(keys) {
  const ops = [];
  for (const k of keys) { const ci = k.indexOf(','); ops.push([ADD, +k.slice(0, ci), +k.slice(ci + 1)]); }
  return ops;
}
// 행 차례대로 되읽기 — rows: [{type, cx, cy, data}] (id 차례) → Set('x,y')
function replay(rows, into) {
  const S = into || new Set();
  for (const r of rows) {
    if (r.type === 'terr') S.add(r.cx + ',' + r.cy);
    else if (r.type === 'terrseq') decode(r.data, (op, x, y) => { if (op === ADD) S.add(x + ',' + y); else if (op === DEL) S.delete(x + ',' + y); });
  }
  return S;
}

module.exports = { VER, ADD, DEL, WIT, encode, encodeKeys, decode, farthest, opsOfKeys, replay };
