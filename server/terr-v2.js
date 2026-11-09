// === server/terr-v2.js — ★★[T1238 2026-11-09 · ★재민 11-09 영토 v2 · 족보 794 · 문 36 마감] 영토 v2 의 순수 규칙 ==========================
//
// ★무엇: 영토 v2 의 판정 · 산수만 담는 **순수 모듈**(상태 0 · 세계 0 · 시계 0). 부르는 쪽(`villages.js` · `zone.js`)이 칸 · 날 · 술어를 넘긴다.
//   ① 묵힘 — 칸마다 마지막으로 쓴 날에서 `DECAY_YEARS` 해가 지나면 빈 땅 후보 · 하루 `DECAY_CELLS_PER_DAY` 칸씩 · 중심에서 먼 칸부터 · 영토를 두 조각으로 안 가른다(구멍은 난다)
//   ② 개간의 되돌림 — 영토 밖에 남은 개간 진척은 `BRUSH_YEARS` 해에 걸쳐 덤불로 돌아간다(선형)
//   ③ 박은 말뚝 — 뽑으면 `POST_ROT_YEARS` 해에 걸쳐 썩은 몫만큼 부러진다(선형)
//   ④ 끌어 고르기 — 네모 안에서 제 영토와 (고른 칸을 거쳐) 맞닿은 칸만
//   ⑤ 남의 마을이 자랄 길 막기(바둑식) — 그 칸 하나 때문에 다른 마을 영토가 바깥 빈 땅과 하나도 안 맞닿게 되면 거부
//   ⑥ 갇힘 — 집 · 회관에서 바깥 들판까지 0-1 너비 우선(울타리 = 1 · 나머지 = 0 · 벽 · 물 · 바위 = 못 감) — 깰 울타리가 가장 적은 길
// ★고증(출처 · 범위 · 미확인 — 보고/T1238 §2 표):
//   묵힘 3년 — 『경국대전』 권2 호전 전택: "過三年陳田 許人告耕"(3년 넘게 묵힌 밭은 남이 관에 고하고 갈게 한다 — 우리역사넷 「조선 왕조의 농지 개간 장려」 인용) ·
//     "3년간 묵힌 토지는 다른 사람이 관에 신고하여 경작할 수 있도록 하였다"(한국민족문화대백과사전 「진전」) ·
//     『수교집록』 호전 제전(1556 · 명종 11): "過三年陳田 許人告耕者 非謂永給 待本主還推間 姑許耕食" — 아주 주는 것이 아니라 본주가 되찾을 때까지(같은 쪽 · 되찾기는 넣지 않았다 — 회부).
//     이른 시기: 고려 광종 24년(973) 진전 개간 — 사전 첫해 수확 전부 · 공전 3년 면세(백과 「진전」).
//   덤불 15년 — 이규송 2006 「화전 후 묵밭의 식생 천이에 따른 식물량 …」(Journal of Ecology and Environment 29(3) 237–245):
//     초본 식물량 5년째가 꼭대기 · 나무 밀도는 15년까지 빠르게 는다 · 총식물량 5년 5 · 10년 14 · 20년 75 · 50년 251 t/ha · 80년 신갈나무 숲.
//     강병화 · 마경호 · 심상인 2003(한국환경농학회지 22(1) 53–59): 묵힌 밭 2 ~ 3년 한해살이 · 6 ~ 7년 여러해살이(억새) — 넓게 5 ~ 20년(15 = 나무 밀도 꼭대기).
//   말뚝 10년 — 땅에 박은 기둥 건물: "usually lasted ten years without repair"(1684 펜실베이니아 이주 안내 — Carson et al. 1981 「Impermanent Architecture」 인용 ·
//     Lost Towns Project 「Impermanent Architecture in a Less Permanent Town」 203쪽) · 넓게: 생재 심재 대부분 평균 5년 · 썩음에 강한 심재 20년까지
//     (Raphael 1956 MSU Circular 724) · 소나무 2년(Freeman et al. 2005 AWPA 101:136) · 3 ~ 7년(Conners 2003 Kentucky FORFS 03-05). 송국리 목책 수종 · 보수 주기 미확인.
//   한 칸씩 — 카드 낱말("한 칸씩 천천히") 그대로 = 마을 하나 하루 1칸.
//   말뚝 뽑기 — EXARC EuroREA 3/2006: 흙 1.8 m³ / 사람 · 하루 · 목책 도랑 깊이 0.6 m · 기둥 지름 25 ~ 30 cm(다른 유적 · 송국리 목책혈 깊이 미확인).
'use strict';

const SRC = {
  decay: { years: 3, ref: '『경국대전』 권2 호전 전택(우리역사넷 인용) · 한국민족문화대백과사전 「진전」', hanja: '過三年陳田 許人告耕', later: '『수교집록』 1556 — 본주가 되찾을 때까지 임시' },
  brush: { years: 15, range: [5, 20], ref: '이규송 2006 J.Ecol.Environ. 29(3):237–245 · 강병화 외 2003 한국환경농학회지 22(1):53–59' },
  post: { years: 10, range: [2, 20], ref: 'Carson et al. 1981(Lost Towns 203쪽 인용) · Raphael 1956 MSU Circ.724 · Freeman et al. 2005 · Conners 2003' },
};
//   말뚝 뽑기 일 — 박힌 말뚝을 뽑으려면 그 둘레 흙을 파야 한다(뽑기 = 그 말뚝 부피만큼 다시 파기 — 하한 · 구덩이는 말뚝보다 넓다 · 미확인).
//     흙 1.8 m³ / 사람 · 하루("a strong person was able to dig and remove 1,8 m3 of earth per day" — 사슴뿔 곡괭이 · 나무 삽) ·
//     목책 도랑 깊이 0.6 m · 목책 기둥 지름 25 ~ 30 cm(같은 글) — EXARC EuroREA 3/2006 「Construction of a circular ditch system and houses of the Middle Neolithic」.
SRC.pull = { m3PerDay: 1.8, depthM: 0.6, ref: 'EXARC EuroREA 3/2006 (Middle Neolithic circular ditch system — 실험 재현)' };
//   말뚝 하나를 뽑는 사람 · 하루 — 지름 `diamM`(부르는 쪽 정본 — `terr-cost POST_SRC.diamM` 송국리 0.30 m) 원기둥 × 깊이 ÷ 하루 파는 흙
function pullDaysPerPost(diamM) { const r = (diamM > 0 ? diamM : 0.3) / 2; return Math.PI * r * r * SRC.pull.depthM / SRC.pull.m3PerDay; }
const DECAY_YEARS = SRC.decay.years;
const BRUSH_YEARS = SRC.brush.years;
const POST_ROT_YEARS = SRC.post.years;
const DECAY_CELLS_PER_DAY = 1;   // 카드 "한 칸씩 천천히"
//   한 칸에 같이 붙는 몸 — 칸 넓이 ÷ 몸 하나가 서는 넓이(1 m² = 지도 셀 하나 · `village-layout` "1셀 = 1m") — 'map' 읽기면 1(회부 — 'field' 250 이면 250명)
const PERSON_M2 = 1;
const bodiesPerCell = (cellM2) => Math.max(1, Math.floor((cellM2 > 0 ? cellM2 : 1) / PERSON_M2));

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x, y) => x + ',' + y;
const parse = (k) => { const i = k.indexOf(','); return [+k.slice(0, i), +k.slice(i + 1)]; };

// ② 영토 밖 개간 진척 — `c0` 를 `day0` 에 남겼다 · `day` 의 값(선형으로 0 까지)
function clearLeft(c0, day0, day, yearDays) {
  const c = Math.max(0, Math.min(1, +c0 || 0));
  if (!(c > 0)) return 0;
  const span = BRUSH_YEARS * (yearDays > 0 ? yearDays : 365);
  const age = Math.max(0, (day | 0) - (day0 | 0));
  return Math.max(0, c * (1 - age / span));
}
// ③ 박은 지 `ageDays` 된 말뚝을 뽑을 때 부러지는 몫(0 ~ 1)
function breakFrac(ageDays, yearDays) {
  const span = POST_ROT_YEARS * (yearDays > 0 ? yearDays : 365);
  return Math.max(0, Math.min(1, Math.max(0, +ageDays || 0) / span));
}
//   뽑아 돌려받는 통나무 — 박은 통나무 `logs` 중 안 부러진 몫(내림 · 부러진 것은 땔감도 아니다 — 썩은 나무)
function pullBack(logs, ageDays, yearDays) {
  const n = Math.max(0, Math.floor(+logs || 0));
  return Math.floor(n * (1 - breakFrac(ageDays, yearDays)) + 1e-9);
}

// ① 그 칸을 빼도 영토가 (그 칸 둘레에서) 두 조각으로 안 갈리나 — 8칸 고리에서 영토 칸들의 4-이음 덩어리가 하나 이하면 참("단순점")
//   고리 차례: N, NE, E, SE, S, SW, W, NW — 곁(N · E · S · W)끼리는 사이 모서리(NE · SE · SW · NW)가 영토일 때만 4-이음
function isSimplePoint(has, x, y) {
  const ring = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]].map(([dx, dy]) => has(key(x + dx, y + dy)));
  const side = [0, 2, 4, 6].filter((i) => ring[i]);
  if (side.length <= 1) return true;
  //   곁 칸들을 이음: 이웃한 곁 i, i+2 는 모서리 i+1 이 영토일 때 이어진다
  let comps = 0; const seen = new Set();
  for (const s of side) {
    if (seen.has(s)) continue;
    comps++;
    const st = [s]; seen.add(s);
    while (st.length) {
      const a = st.pop();
      for (const b of [(a + 2) % 8, (a + 6) % 8]) {
        if (!ring[b] || seen.has(b)) continue;
        const corner = b === (a + 2) % 8 ? (a + 1) % 8 : (a + 7) % 8;
        if (ring[corner]) { seen.add(b); st.push(b); }
      }
    }
  }
  return comps <= 1;
}
// ① 묵힌 칸 고르기 — `cells`(영토 칸 열쇠) 중 `usedDay(k)` 가 `limitDays` 넘게 지난 칸 · 쓰는 땅(`inUse(k)` — 집 · 밭 · 건물 · 길)은 빼고 ·
//   단순점만(빼도 영토가 두 조각으로 안 갈린다) · 중심에서 먼 차례(같으면 열쇠 차례 — 결정론)로 `n` 칸까지.
//   ★바깥 칸만 고르지 **않는다** — 바깥 줄이 쓰는 칸(울타리 · 밭 · 집)이면 그 안의 묵힌 칸이 영영 안 빠진다(둘레를 쓰면 안을 지키는 길 —
//     카드 5 "둘레 유지비를 쓰지 않는다"와 같은 꼴의 구멍). 안쪽 칸이 빠지면 영토 안에 구멍(빈 땅)이 난다 — 가르지는 않는다.
//     먼 차례라 보통은 바깥부터 빠진다(바깥 줄이 쓰는 칸일 때만 안쪽이 먼저).
function pickDecay(o) {
  const { cells, has, usedDay, inUse, day, limitDays, n, cx, cy } = o;
  const cand = [];
  for (const k of cells) {
    const u = usedDay(k);
    if (!(day - u >= limitDays)) continue;
    if (inUse && inUse(k)) continue;
    const [x, y] = parse(k);
    cand.push({ k, x, y, d: (x - cx) * (x - cx) + (y - cy) * (y - cy) });
  }
  cand.sort((a, b) => (b.d - a.d) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  const out = [], gone = new Set();
  const has2 = (k) => has(k) && !gone.has(k);
  for (const c of cand) {
    if (out.length >= n) break;
    if (!isSimplePoint(has2, c.x, c.y)) continue;
    out.push(c.k); gone.add(c.k);
  }
  return out;
}

// ④ 끌어 고르기 — 네모(x0..x1 · y0..y1 · 칸) 안에서 `canTake(x, y)` 인 칸 중 제 영토(`own(k)`)와 4-이웃으로 맞닿은 칸에서 시작해
//   고른 칸을 거쳐 이어지는 칸만(너비 우선 · 결정론 차례) · `cap` 칸까지 · 네모가 `maxSide` 를 넘으면 잘라 낸다
function pickRect(o) {
  const { own, canTake, cap, maxSide } = o;
  let x0 = Math.min(o.x0, o.x1) | 0, x1 = Math.max(o.x0, o.x1) | 0, y0 = Math.min(o.y0, o.y1) | 0, y1 = Math.max(o.y0, o.y1) | 0;
  if (maxSide > 0) { if (x1 - x0 + 1 > maxSide) x1 = x0 + maxSide - 1; if (y1 - y0 + 1 > maxSide) y1 = y0 + maxSide - 1; }
  const inR = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const q = [], seen = new Set(), out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = key(x, y);
    if (own(k) || !canTake(x, y)) continue;
    let adj = false; for (const [dx, dy] of N4) if (own(key(x + dx, y + dy))) { adj = true; break; }
    if (adj) { q.push([x, y]); seen.add(k); }
  }
  let h = 0;
  while (h < q.length && (!(cap > 0) || out.length < cap)) {
    const [x, y] = q[h++];
    out.push(key(x, y));
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy, nk = key(nx, ny);
      if (!inR(nx, ny) || seen.has(nk) || own(nk) || !canTake(nx, ny)) continue;
      seen.add(nk); q.push([nx, ny]);
    }
  }
  return { cells: out, rect: [x0, y0, x1, y1] };
}

// ⑤ 바둑식 — 칸 (x, y) 를 가져가면 마을 `other`(칸 술어 `has`)가 바깥 빈 땅(`free(x, y)` — 막힘 아님 · 누구의 영토도 아님)과 하나라도 맞닿아 남나.
//   그 마을이 (x, y) 와 안 맞닿았으면 바뀌는 게 없다(참). 맞닿았으면 그 마을의 다른 "숨 자리"(빈 이웃 칸)를 하나라도 찾으면 참. `cells` = 그 마을 영토 열쇠들.
function keepsLiberty(o) {
  const { x, y, has, cells, free } = o;
  let touch = false; for (const [dx, dy] of N4) if (has(key(x + dx, y + dy))) { touch = true; break; }
  if (!touch) return true;
  const tk = key(x, y);
  for (const k of cells) {
    const [cx, cy] = parse(k);
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy, nk = key(nx, ny);
      if (nk === tk || has(nk)) continue;
      if (free(nx, ny)) return true;
    }
  }
  return false;
}

// ⑥ 갇힘 — 0-1 너비 우선. `step(ax, ay, bx, by)` → -1 못 감 · 0 그냥 감 · 1 울타리(깨야 감).
//   `isOut(x, y)` = 바깥 들판에 닿았나 · 출발 칸에서 체비쇼프 `maxR` 밖으로는 안 나간다(그 안에서 못 닿으면 갇힘 판정 밖 — 지형 · 너무 큰 우리).
//   → { reached(울타리 0 개로 닿음), cost(가장 적은 울타리 수 · 못 닿으면 -1), fences([x, y] — 그 길에서 깰 울타리 칸), visited,
//       free(x, y) — 울타리를 하나도 안 깨고 닿는 칸인가(0-1 차례라 울타리 1 개짜리 칸보다 먼저 다 정해진다 · 그 우리의 안쪽) }
function trapBfs(o) {
  const { sx, sy, maxR, step, isOut } = o;
  const W = 2 * maxR + 1, idx = (x, y) => (y - sy + maxR) * W + (x - sx + maxR);
  const dist = new Int32Array(W * W).fill(-1), prev = new Int32Array(W * W).fill(-1);
  const dq = new Int32Array(W * W * 8 + 4); let head = W * W * 4 + 2, tail = W * W * 4 + 2;   // 칸마다 넣기는 이웃 수(4)만큼까지 — 앞뒤로 넉넉히
  const put = (i, front) => { if (front) dq[--head] = i; else dq[tail++] = i; };
  dist[idx(sx, sy)] = 0; put(idx(sx, sy), false);
  const done = new Uint8Array(W * W);
  const zeroAt = (x, y) => { if (Math.abs(x - sx) > maxR || Math.abs(y - sy) > maxR) return false; const j = idx(x, y); return !!done[j] && dist[j] === 0; };
  let visited = 0;
  while (head < tail) {
    const i = dq[head++];
    if (done[i]) continue;
    done[i] = 1; visited++;
    const x = (i % W) + sx - maxR, y = ((i / W) | 0) + sy - maxR, d = dist[i];
    if (isOut(x, y)) {
      const fences = [];
      let j = i;
      while (j >= 0 && prev[j] >= 0) {
        const jx = (j % W) + sx - maxR, jy = ((j / W) | 0) + sy - maxR;
        const p = prev[j], px = (p % W) + sx - maxR, py = ((p / W) | 0) + sy - maxR;
        if (step(px, py, jx, jy) === 1) fences.push([jx, jy]);
        j = p;
      }
      return { reached: d === 0, cost: d, fences: fences.reverse(), visited, free: zeroAt };
    }
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (Math.abs(nx - sx) > maxR || Math.abs(ny - sy) > maxR) continue;
      const w = step(x, y, nx, ny);
      if (w < 0) continue;
      const j = idx(nx, ny), nd = d + w;
      if (done[j] || (dist[j] >= 0 && dist[j] <= nd)) continue;
      dist[j] = nd; prev[j] = i; put(j, w === 0);
    }
  }
  return { reached: false, cost: -1, fences: [], visited, free: zeroAt };
}

module.exports = { SRC, DECAY_YEARS, BRUSH_YEARS, POST_ROT_YEARS, DECAY_CELLS_PER_DAY, PERSON_M2, bodiesPerCell, pullDaysPerPost,
  clearLeft, breakFrac, pullBack, isSimplePoint, pickDecay, pickRect, keepsLiberty, trapBfs, key, parse };
