#!/usr/bin/env node
// (@regress 없음 — 표 기계 · 제품 무변 · 판정 0)
// === scripts/t1207-terr-table.js — T1207 영토 한 칸 값의 표: 플레이어 마을이 30 · 60 · 100명 규모 영토까지 걸리는 날 · 둥글게 ↔ 칠레형 띠 ===
//
// ★무엇을 재나(존을 안 띄운다 — 정본 `server/terr-cost.js` 의 `cellCost` 와 `villages.js _t1207CellCost` 를 그대로 부른다):
//   플레이어 마을(창설 영토 = 반경 `PV_TERR_R` 원 · 49칸)에서 한 칸씩 넓힌다. 칸마다 그때의 영토 넓이 · 중심 거리 · 맞닿은 변으로 값을 매긴다.
//   ① 둥글게 — 중심에 가장 가까운 맞닿은 칸부터(값이 가장 싼 차례 · 플레이어가 할 수 있는 가장 싼 길)
//   ② 칠레형 띠 — 폭 W 칸(중심 줄 ± (W−1)/2)으로 동쪽으로만 · 같은 칸 수
//   목표 넓이 = 영토 목표 식(`village-layout territoryTarget` — 집 ⌈주거 ÷ 6⌉ × 600 + 1,500 · 주거 = 사람 수) — 30명 4,500 · 60명 7,500 · 100명 11,700.
//   날 = 개간 분 합 ÷ 몸 하나의 낮(정본 게임일 1,440 분 × 낮 비율 `WORLD.dayPhaseRatio`) — 플레이어 혼자 낮마다 개간만 할 때.
//   ⚠셈 밖: 그 칸의 나무 베기(숲이면 먼저 벤다 — 통나무가 나온다) · 통나무를 구하는 일 · 걷기 · 밤 일. 통나무는 따로 센다.
//   참고 팔(넣지 않음 · 회부 재료): α 0(모양 벌점 없음) · 시작 영토 = 그 마을의 창설 49칸(카드 글자의 다른 읽기).
//
// 실행: node scripts/t1207-terr-table.js [--out 계측/T1207_<날짜>]
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t1207-table-${process.pid}.db`;
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const V = require(path.join(ROOT, 'server/villages.js'));
const T = require(path.join(ROOT, 'server/terr-cost.js'));
const VL = require(path.join(ROOT, 'server/village-layout.js'));
const { WORLD } = require(path.join(ROOT, 'server/zone-config.js'));
const A = process.argv.slice(2);
const OUT = (() => { const i = A.indexOf('--out'); return i >= 0 ? A[i + 1] : null; })();

const S0 = VL.TERR_CORE, DAY_MIN = WORLD.dayLengthMs / 1000 * WORLD.dayPhaseRatio;
const PV_R = (() => { const m = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8').match(/PVILLAGE_TERR_R \|\| '(\d+)'/); return m ? +m[1] : 4; })();
const POPS = [30, 60, 100];
const TARGET = (pop) => VL.territoryTarget(0, pop).target;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const disc = (R) => { const s = new Set(); for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) if (dx * dx + dy * dy <= R * R) s.add(dx + ',' + dy); return s; };

//   정본 값이 맞는지 — 한 번 `villages.js _t1207CellCost` 와 맞춘다(이 표는 같은 이웃 수 · 넓이 · 거리를 재서 같은 `cellCost` 를 부른다)
function crossCheck() {
  const P = V.__labProbe._t569Probe;
  const keep = P.setup({ ta: { isBlocked: () => false, isWater: () => false, isRock: () => false, fert: () => 0.5 }, villages: [], db: null });
  const vil = { dbId: 1, name: 'P', ccx: 0, ccy: 0, _terrSet: disc(PV_R), econ: { founder: 'x' } };
  P.setup({ villages: [vil] });
  const a = V._t1207CellCost(vil, PV_R + 1, 0, null);
  const nb = 1, b = T.cellCost({ S: vil._terrSet.size, r: PV_R + 1, nb, S0 });
  P.setup(keep);
  return Math.abs(a.laborMin - b.laborMin) < 1e-12 && Math.abs(a.wood - b.wood) < 1e-12 && a.nb === nb;
}

// 한 칸씩 넓힌다 — order(own, front) 가 다음 칸을 고른다 · 값 = 정본 cellCost(S0 · α 를 바꾼 참고 팔도 같은 함수)
function grow(order, targets, opt) {
  const own = disc(PV_R), front = new Map();   // 맞닿은 칸 → [x, y]
  const addFront = (x, y) => { for (const [dx, dy] of N4) { const k = (x + dx) + ',' + (y + dy); if (!own.has(k)) front.set(k, [x + dx, y + dy]); } };
  for (const k of own) { const [x, y] = k.split(',').map(Number); addFront(x, y); }
  const s0 = own.size, rows = [];
  let lab = 0, wood = 0, woodCeil = 0, posts = 0, mMax = 0, cells = 0, ti = 0;
  const maxT = targets[targets.length - 1];
  while (own.size < maxT) {
    const c = order(own, front); if (!c) break;
    const [x, y] = c, k = x + ',' + y;
    let nb = 0; for (const [dx, dy] of N4) if (own.has((x + dx) + ',' + (y + dy))) nb++;
    const q = T.cellCost({ S: own.size, r: Math.hypot(x, y), nb, S0: opt.S0, alpha: opt.alpha });
    lab += q.laborMin; wood += q.wood; woodCeil += Math.ceil(q.wood - 1e-9); posts += q.posts; if (q.m > mMax) mMax = q.m; cells++;
    own.add(k); front.delete(k); addFront(x, y);
    while (ti < targets.length && own.size >= targets[ti]) {
      rows.push({ target: targets[ti], size: own.size, cells, labMin: +lab.toFixed(1), days: +(lab / DAY_MIN).toFixed(1), realH: +(lab / 3600).toFixed(2)   /* 실제 시간 — 1 실초 = 1 게임 분 */, wood: +wood.toFixed(1), woodCeil, posts: +posts.toFixed(1), mLast: +q.m.toFixed(2), mMax: +mMax.toFixed(2) });
      ti++;
    }
  }
  return { start: s0, rows };
}
const roundOrder = (own, front) => { let best = null, bd = Infinity; for (const c of front.values()) { const d = Math.hypot(c[0], c[1]) + c[1] * 1e-7 + c[0] * 1e-9; if (d < bd) { bd = d; best = c; } } return best; };
const stripOrder = (W) => (own, front) => { const h = (W - 1) / 2; let best = null; for (const c of front.values()) { if (c[0] < 0 || Math.abs(c[1]) > h) continue; if (!best || c[0] < best[0] || (c[0] === best[0] && (Math.abs(c[1]) < Math.abs(best[1]) || (Math.abs(c[1]) === Math.abs(best[1]) && c[1] < best[1])))) best = c; } return best; };

const ok0 = crossCheck();
const targets = POPS.map(TARGET);
const ARMS = [
  { key: 'card', label: `카드(S₀ ${S0} · α ${T.ALPHA} · k ${T.K})`, S0, alpha: T.ALPHA },
  { key: 'a0', label: `참고 — α 0(모양 벌점 없음)`, S0, alpha: 0 },
  { key: 's49', label: `참고 — 시작 영토 = 창설 ${disc(PV_R).size}칸`, S0: disc(PV_R).size, alpha: T.ALPHA },
];
const out = { src: { clearMinPerM2: T.clearMinPerM2(), postSpacingM: T.POST_SRC.spacingM, woodPerPost: T.woodPerPost(), k: T.K, alpha: T.ALPHA, S0, dayMin: DAY_MIN, pvR: PV_R, start: disc(PV_R).size, targets, pops: POPS }, crossCheck: ok0, arms: {} };
for (const a of ARMS) {
  const r = grow(roundOrder, targets, a);
  const strips = {};
  for (const W of [10, 20]) strips[W] = grow(stripOrder(W), targets, a);
  out.arms[a.key] = { label: a.label, round: r.rows, strip: Object.fromEntries(Object.entries(strips).map(([W, s]) => [W, s.rows])) };
}

const f = (n) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(n));
const md = [];
md.push(`정본 값 대조(\`_t1207CellCost\` = \`cellCost\`): ${ok0 ? '같음' : '✗ 다름'} · 몸 하나의 낮 = ${f(DAY_MIN)} 게임 분 · 창설 영토 ${disc(PV_R).size}칸(반경 ${PV_R})`);
for (const a of ARMS) {
  const R = out.arms[a.key];
  md.push('', `### ${a.label}`, '', '| 사람 | 영토 목표 | 넓힌 칸 | 둥글게 — 날 · 개간 분 · 통나무 · 끝 칸 값 × | 띠 폭 10 — 날 · 통나무 · 끝 칸 값 × | 띠 ÷ 둥글게(개간 · 통나무) | 띠 폭 20 — 날 · 띠 ÷ 둥글게 |', '|---:|---:|---:|:-:|:-:|:-:|:-:|');
  R.round.forEach((r, i) => {
    const s10 = R.strip[10][i], s20 = R.strip[20][i];
    md.push(`| ${POPS[i]} | ${f(r.target)} | ${f(r.cells)} | ${f(r.days)}날 · ${f(r.labMin)} · ${f(r.woodCeil)} · ×${r.mLast} | ${s10 ? `${f(s10.days)}날 · ${f(s10.woodCeil)} · ×${s10.mLast}` : '—'} | ${s10 ? `×${(s10.labMin / r.labMin).toFixed(2)} · ×${(s10.woodCeil / Math.max(1, r.woodCeil)).toFixed(2)}` : '—'} | ${s20 ? `${f(s20.days)}날 · ×${(s20.labMin / r.labMin).toFixed(2)}` : '—'} |`);
  });
}
const txt = md.join('\n');
console.log(txt);
if (OUT) {
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OUT, 't1207-terr-table.json'), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(ROOT, OUT, 't1207-terr-table.md'), txt + '\n');
  console.log(`\n→ ${OUT}/t1207-terr-table.{json,md}`);
}
process.exit(ok0 ? 0 : 1);
