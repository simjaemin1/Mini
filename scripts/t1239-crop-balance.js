#!/usr/bin/env node
// === scripts/t1239-crop-balance.js — 작물 균형 표(T1239 · 계산만 · 제품 · 하네스 0 · 게임에 넣는 수 0) ==========
//
// 읽는 것(사본 0 — 수를 옮겨 적지 않고 정본을 부른다):
//   · 작물 정본 `server/crops.js` — 칸당 kg(T1215 식 `cellKgOf` · 이 스크립트가 `T1215_FIELD_M2=1` 로 싣는다) ·
//     낱개(`harvestUnits`) · 물 배수(`waterMult`) · 자라는 날(`growDaysOf` · 농사로 표 켬 기본) · 저장(`keepDaysOf`) ·
//     고르기(`villageCropPick`) · 익는 날(`readyDay`) · 달(`monthOf`)
//   · 열량 정본 `server/kcal.js`(`DAY_KCAL` · `econUnitsOf`) · econ 생곡 계수 `sim/economy-sim.js`(`RAW_GRAINS` · `RAW_GRAIN_FOOD_FACTOR`)
//   · 생활층 칸 일 시간 `server/villages.js`(`_t1221Cost` · `CROP_WEED_STAGES` — T1221 켬일 때의 일 시간)
//   · 고증 긴 표 `계측/T1239_2026-11-09/고증.tsv`(출처 `출처.tsv`) — 수량 · 일손 · 버팀 · 철 · 청동기
// 쓰는 것: `계측/T1239_2026-11-09/` 균형.tsv · 지배.tsv · 고르기.tsv · 고르기_마을.tsv · 모서리.tsv · 고증_칸.tsv · 요약.json
//
// 다리(내 셈 — 표 안의 짝에서 유도한다 · 지어낸 비 0):
//   다리A = (근대 직전 한국 값 ÷ 같은 작물 1970s 값) 의 범위 — 조 · 수수 · 콩 세 짝
//   다리B = (근대 이전 가운데 또는 근대 직전 값 ÷ 같은 작물 현대 가운데) 의 범위 — 조 · 기장 · 수수 · 벼 · 보리 짝
//
// 실행: node scripts/t1239-crop-balance.js   (몇 초 · 존 안 띄움 · 자식 프로세스로 손잡이 판을 나눈다)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '계측', 'T1239_2026-11-09');

// ── 자식: 고르기 판(손잡이 env 를 부모가 준다 · 같은 정본 함수를 부른다) ───────────────────────────
function pickChild() {
  const C = require(path.join(ROOT, 'server', 'crops'));
  const K = require(path.join(ROOT, 'server', 'kcal'));
  const N = +process.env.T1239_SEEDS || 50, S0 = +process.env.T1239_SEED0 || 1;
  const START = +process.env.T1239_START || 0, YEARS = +process.env.T1239_YEARS || 4;
  const SLOTS = [['논', 0], ['밭', 0], ['밭', 1]];
  const supplyOf = (f) => (f === '논' ? 5 : 1);   // 생활층 `_t368Item` 과 같은 규칙(논 5 · 밭 1)
  const pdOf = (c, f) => C.harvestUnits(c, { supply: supplyOf(f), seedFresh: 1 }) * (C.kgOf(c) || 0) * C.kcalOf(c) / K.DAY_KCAL;
  const rows = [];
  let chk = 0, bad = 0;
  for (let seed = S0; seed < S0 + N; seed++) {
    for (const [f, par] of SLOTS) {
      const R = { seed, f, par, plant: {}, harv: {}, occ: {}, pdY: new Array(YEARS).fill(0), nY: new Array(YEARS).fill(0), seqY: Array.from({ length: YEARS }, () => []) };
      let cell = null;
      for (let d = START; d < START + 365 * YEARS; d++) {
        const y = Math.floor((d - START) / 365);
        if (cell && d >= cell.rd) {
          if (chk < 200) { chk++; if (!C.isReady(cell.c, cell.p, d) || C.isReady(cell.c, cell.p, d - 1)) bad++; }   // readyDay ↔ isReady 같음(생활층은 isReady 로 거둔다)
          R.harv[cell.c] = (R.harv[cell.c] || 0) + 1; R.pdY[y] += pdOf(cell.c, f); R.nY[y]++; R.seqY[y].push(cell.c);
          if (C.isPerennial(cell.c)) { const rd = C.readyDay(cell.c, d); cell = rd != null ? { c: cell.c, p: d, rd } : null; }
          else cell = null;
        }
        if (!cell) {
          const c = C.villageCropPick(seed, f, C.monthOf(d), par);
          if (c) { const rd = C.readyDay(c, d); if (rd != null) { cell = { c, p: d, rd }; R.plant[c] = (R.plant[c] || 0) + 1; } }
        }
        if (cell) R.occ[cell.c] = (R.occ[cell.c] || 0) + 1;
      }
      rows.push(R);
    }
  }
  process.stdout.write(JSON.stringify({ bronze: C.T1201_BRONZE_CROPS, m2: C.T1215_FIELD_M2, N, S0, START, YEARS, chk, bad, rows }) + '\n');
}

// ── 표 읽기 ──────────────────────────────────────────────────────────────────────────────
function readTsv(p) {
  const L = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());
  const H = L[0].split('\t');
  return L.slice(1).map((l) => { const c = l.split('\t'); const o = {}; H.forEach((h, i) => (o[h] = c[i] == null ? '' : c[i])); return o; });
}
const rng = (s) => { const m = String(s).replace(/,/g, '').split('~').map(Number); return m.length === 2 ? [m[0], m[1]] : [m[0], m[0]]; };
const mid = (r) => (r ? (r[0] + r[1]) / 2 : null);
const r0 = (x) => (x == null || !isFinite(x) ? '' : String(Math.round(x)));
const r1 = (x) => (x == null || !isFinite(x) ? '' : (+x).toFixed(1));
const r2 = (x) => (x == null || !isFinite(x) ? '' : (+x).toFixed(2));
const rr = (r, f) => (r ? (Math.abs(r[0] - r[1]) < 1e-9 ? f(r[0]) : f(r[0]) + '~' + f(r[1])) : '');

function main() {
  process.env.T1215_FIELD_M2 = '1';   // T1215 식(PM 이 잰 판) — 이 프로세스 안에서만
  const C = require(path.join(ROOT, 'server', 'crops'));
  const K = require(path.join(ROOT, 'server', 'kcal'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const V = require(path.join(ROOT, 'server', 'villages'));
  const B = V.__p3Bind({});
  const DAY = K.DAY_KCAL, HA = C.FIELD_CELL_M2 / 10000;
  // 게임 칸 일 시간(T1221 켬일 때 · 생활층 정본 `_t1221Cost` — 파종 1 · 김매기 차례 수만큼 · 수확 1) · 끔이면 일감 수로 모든 작물이 같다
  const gameCellH = (B._t1221Cost(2) + V.CROP_WEED_STAGES * B._t1221Cost(1) + B._t1221Cost(5)) / 60;
  const gameHaH = gameCellH / HA;

  // 고증 긴 표 → 작물 · 축
  const G = readTsv(path.join(OUT, '고증.tsv'));
  const ev = {};
  for (const r of G) { const a = ev[r.id] || (ev[r.id] = {}); (a[r.축] || (a[r.축] = [])).push(r); }
  const one = (id, ax) => (ev[id] && ev[id][ax] && ev[id][ax][0]) || null;
  const star = (ax) => one('*', ax);

  // 다리 비(표 안의 짝에서)
  const ratioA = [], ratioB = [];
  for (const id of C.IDS) {
    const near = one(id, '수량_근대직전'), s70 = one(id, '수량_1970s'), pre = one(id, '수량_근대이전'), mod = one(id, '수량_현대');
    if (near && s70 && s70.상태 === '확인') ratioA.push([id, rng(near.값)[0] / rng(s70.값)[0]]);
    const base = pre ? mid(rng(pre.값)) : (near ? rng(near.값)[0] : null);
    if (base != null && mod) ratioB.push([id, base / mid(rng(mod.값))]);
  }
  const span = (a) => [Math.min(...a.map((x) => x[1])), Math.max(...a.map((x) => x[1]))];
  const RA = span(ratioA), RB = span(ratioB);

  const isRaw = (id) => E.RAW_GRAINS.indexOf(id) >= 0;
  const rows = [];
  for (const id of C.IDS) {
    const c = C.get(id), kcal = C.kcalOf(id), kg1 = C.kgOf(id) || 0;
    const fields = ['논', '밭'].filter((f) => C.fitsField(id, f));
    const cellKg = C.cellKgOf(id);
    const pdPM = cellKg * kcal / DAY;
    const lifePd = {}, econPd = {};
    for (const f of fields) {
      const u = C.harvestUnits(id, { supply: f === '논' ? 5 : 1, seedFresh: 1 });
      lifePd[f] = u * kg1 * kcal / DAY;
      const per = isRaw(id) ? E.RAW_GRAIN_FOOD_FACTOR : K.econUnitsOf(id, 1);   // econ(T368 켬) 낱개당 식량등가 — 생곡 셋은 도정 계수
      econPd[f] = u * per;
    }
    const gd = C.growDaysOf(id), calD = C.calDaysOf(id);
    // 고증 수량
    const pre = one(id, '수량_근대이전'), near = one(id, '수량_근대직전'), s70 = one(id, '수량_1970s'), mod = one(id, '수량_현대');
    let kgha = null, way = '';
    if (pre) { kgha = rng(pre.값); way = '근대이전(' + pre.출처 + ')'; }
    else if (near) { kgha = rng(near.값); way = '근대직전(' + near.출처 + ')'; }
    else if (s70) { const v = rng(s70.값); kgha = [v[0] * RA[0], v[1] * RA[1]]; way = '다리A(' + s70.출처 + ' × ' + r2(RA[0]) + '~' + r2(RA[1]) + ')'; }
    else if (mod) { const v = rng(mod.값); kgha = [v[0] * RB[0], v[1] * RB[1]]; way = '다리B(' + mod.출처 + ' × ' + r2(RB[0]) + '~' + r2(RB[1]) + ')'; }
    const evKg = kgha ? [kgha[0] * HA, kgha[1] * HA] : null;
    const evPd = evKg && kcal > 0 ? [evKg[0] * kcal / DAY, evKg[1] * kcal / DAY] : null;
    // 고증 일손(h/ha) — 갈기 · 김매기(모든 작물) + 심기 · 새 · 거두기 · 털기(작물 줄)
    const till = rng(star('일손_갈기').값), weed = rng(star('일손_김매기').값);
    const sow = one(id, '일손_심기'), bird = one(id, '일손_새'), harv = one(id, '일손_거두기'), thr = one(id, '일손_털기'), now = one(id, '일손_현대');
    let lab = null, labWay = '';
    if (sow && harv && kgha) {
      const t = [kgha[0] / 1000, kgha[1] / 1000];
      const hv = rng(harv.값), hp = harv.단위 === 'h/t' ? [hv[0] * t[0], hv[1] * t[1]] : hv;
      const th = thr ? rng(thr.값) : [0, 0], tp = thr ? (thr.단위 === 'h/t' ? [th[0] * t[0], th[1] * t[1]] : th) : [0, 0];
      const bd = bird ? rng(bird.값)[0] : 0, sw = rng(sow.값)[0];
      lab = [till[0] + sw + weed[0] + bd + hp[0] + tp[0], till[1] + sw + weed[1] + bd + hp[1] + tp[1]];
      const st = [sow, harv, thr, bird].filter(Boolean).map((x) => x.상태);
      labWay = (st.every((s) => s === '확인') ? '확인' : '이웃') + (thr ? '' : ' · 털기 없음') + (bird ? '' : ' · 새 줄 없음(0)');
    } else if (now) { lab = rng(now.값); labWay = '현대(' + now.출처 + ')'; }
    const evKcalH = lab && kgha && kcal > 0 ? [kgha[0] * kcal / lab[1], kgha[1] * kcal / lab[0]] : null;
    // 고증 자라는 날
    const dRow = one(id, '철_자라는날');
    const evDays = dRow ? rng(dRow.값) : (calD != null ? [calD, calD] : null);
    const evDaysWay = dRow ? dRow.출처 : (calD != null ? 'C01(농사로 표 — 게임도 이 값)' : '');
    const evKcalD = evDays && evKg && kcal > 0 ? [evKg[0] * kcal / evDays[1], evKg[1] * kcal / evDays[0]] : null;
    const hard = Object.keys(ev[id] || {}).filter((a) => a.startsWith('버팀_') && one(id, a).값 === '1').map((a) => a.slice(3));
    const weak = Object.keys(ev[id] || {}).filter((a) => a.startsWith('약점_') && one(id, a).값 === '1').map((a) => a.slice(3));
    const bz = one(id, '청동기');
    rows.push({
      id, ko: c.ko, group: c.group, field: c.field, fields, life: c.lifecycle, sowMo: C.sowMonthsOf(id), sowTxt: c.sowMonths,
      gd, gdCat: c.growDays, calD, yieldG: c.yield, kg1, kcal, keep: c.keep, keepD: C.keepDaysOf(id), water: c.water, care: c.care, pest: c.pest,
      wDry: C.waterMult(id, 1), w: { 논: C.waterMult(id, 5), 밭: C.waterMult(id, 1) }, cellKg, pdPM, lifePd, econPd,
      gameKcalH: kcal > 0 ? cellKg * kcal / gameCellH : 0, gameKcalD: kcal > 0 && gd > 0 ? cellKg * kcal / gd : 0,
      kgha, way, evPd, lab, labWay, evKcalH, evDays, evDaysWay, evKcalD, hard, weak,
      bronzeSet: C.T1201_BRONZE_SET.has(id), bronze: bz ? bz.값 : '미확인', bronzeSrc: bz ? bz.출처 : '',
    });
  }
  const food = rows.filter((r) => r.kcal > 0);

  // ── 지배(모든 축에서 아래) ─────────────────────────────────────────────────────────────
  //   경쟁자 = 같은 자리(논/밭)에 같은 달 하나 이상 심을 수 있는 먹는 작물. B 가 A 를 지배 = (그 자리에서) 모든 축 ≥ · 하나 이상 >.
  //   축 값은 범위([낮은 끝, 높은 끝])다 — 'mid' 판은 가운데끼리 · 'firm'(굳은) 판은 B 의 낮은 끝 ≥ A 의 높은 끝일 때만 ≥ 로 친다.
  const share = (a, b, f) => a.fields.includes(f) && b.fields.includes(f) && a.sowMo.some((m) => b.sowMo.includes(m));
  function dominates(b, a, axes, f, mode) {
    let gt = false;
    for (const [get, kind] of axes) {
      const x = get(a, f), y = get(b, f);
      if (x == null || y == null) return false;
      if (kind === 'set') { if (!x.every((t) => y.includes(t))) return false; if (y.length > x.length) gt = true; continue; }
      const X = Array.isArray(x) ? x : [x, x], Y = Array.isArray(y) ? y : [y, y];
      const xv = mode === 'firm' ? X[1] : (X[0] + X[1]) / 2, yv = mode === 'firm' ? Y[0] : (Y[0] + Y[1]) / 2;
      if (yv < xv - 1e-9) return false;
      if (yv > xv + 1e-9) gt = true;
    }
    return gt;
  }
  const AX_NOW = [[(r) => r.pdPM, 'n'], [(r) => r.gameKcalD, 'n'], [(r) => r.keepD, 'n'], [(r, f) => r.w[f], 'n']];
  const AX_EV = [[(r) => r.evPd, 'n'], [(r) => r.evKcalH, 'n'], [(r) => r.evKcalD, 'n'], [(r) => r.hard, 'set']];
  const AX_EV3 = [[(r) => r.evPd, 'n'], [(r) => r.evKcalD, 'n'], [(r) => r.hard, 'set']];
  const domRows = [];
  const domOf = (axes, tag, need, mode) => {
    const out = { dom: [], free: [], unk: [] };
    for (const a of food) {
      if (need && need.some((g) => g(a) == null)) { out.unk.push(a.id); domRows.push([tag, a.id, a.ko, '판정 못 함(고증 칸 빔)', '']); continue; }
      const by = [];
      for (const b of food) { if (b === a) continue; for (const f of a.fields) if (share(a, b, f) && dominates(b, a, axes, f, mode)) { by.push(b.ko + '(' + f + ')'); break; } }
      if (by.length) { out.dom.push(a.id); domRows.push([tag, a.id, a.ko, '지배됨', by.join(' · ')]); } else { out.free.push(a.id); domRows.push([tag, a.id, a.ko, '지배 안 됨', '']); }
    }
    return out;
  };
  const NEED4 = [(r) => r.evPd, (r) => r.evKcalH, (r) => r.evKcalD], NEED3 = [(r) => r.evPd, (r) => r.evKcalD];
  const DNOW = domOf(AX_NOW, '지금 식(칸당 사람-날 · 밭 하루당 kcal · 저장일 · 그 자리 물 배수)', null, 'mid');
  const DEV = domOf(AX_EV, '고증 넷(사람-날 · 일 시간당 kcal · 밭 하루당 kcal · 버팀) · 가운데', NEED4, 'mid');
  const DEVF = domOf(AX_EV, '고증 넷 · 굳은(범위가 안 겹칠 때만)', NEED4, 'firm');
  const DEV3 = domOf(AX_EV3, '고증 셋(일손 뺌) · 가운데', NEED3, 'mid');
  const DEV3F = domOf(AX_EV3, '고증 셋 · 굳은', NEED3, 'firm');

  // ── 고르기 판(자식) ──────────────────────────────────────────────────────────────────
  const child = (env) => {
    const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; delete e.T1201_BRONZE_CROPS;
    Object.assign(e, { T1215_FIELD_M2: '1' }, env);
    const s = execFileSync(process.execPath, [__filename, '--pick'], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 256 << 20 });
    return JSON.parse(s.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  };
  const ARMS = [
    { tag: '청동기 켬 · 3월 1일 시작', env: { T1201_BRONZE_CROPS: '1', T1239_START: '0' } },
    { tag: '청동기 끔 · 3월 1일 시작', env: { T1239_START: '0' } },
    { tag: '청동기 켬 · 9월 1일 시작', env: { T1201_BRONZE_CROPS: '1', T1239_START: '184' } },
    { tag: '청동기 끔 · 9월 1일 시작', env: { T1239_START: '184' } },
  ];
  const ko = (id) => (C.get(id) ? C.get(id).ko : id);
  const pickTsv = [['판', '자리', '작물', '심기 몫 %', '밭 차지 날 몫 %', '거둔 사람-날 몫 %', '심기 수', '차지 날', '거둔 사람-날']];
  const villTsv = [['판', '마을 시드', '논 여름 작물(4년 동안 심긴 것)', '논 여름 작물(둘째 해부터 거둔 것)', '논 피 몫 %(심기)', '밭 피 몫 %(심기)', '밭 율무 몫 %(심기)', '논 사람-날/년', '밭 사람-날/년(짝 · 홀 평균)', '밭 한 해 거둠 수(평균)', '논 한 해 거둠 수(평균)']];
  const armSum = [];
  for (const arm of ARMS) {
    const J = child(Object.assign({ T1239_SEEDS: '50', T1239_SEED0: '1', T1239_YEARS: '4' }, arm.env));
    const big = child(Object.assign({ T1239_SEEDS: '2000', T1239_SEED0: '1', T1239_YEARS: '3' }, arm.env));
    for (const f of ['논', '밭']) {
      const P = {}, O = {}, H = {};
      let pT = 0, oT = 0, hT = 0;
      for (const R of big.rows.filter((x) => x.f === f)) {
        for (const c in R.plant) { P[c] = (P[c] || 0) + R.plant[c]; pT += R.plant[c]; }
        for (const c in R.occ) { O[c] = (O[c] || 0) + R.occ[c]; oT += R.occ[c]; }
      }
      for (const R of big.rows.filter((x) => x.f === f)) for (let y = 1; y < big.YEARS; y++) for (const c of R.seqY[y]) { const v = C.harvestUnits(c, { supply: f === '논' ? 5 : 1, seedFresh: 1 }) * (C.kgOf(c) || 0) * C.kcalOf(c) / DAY; H[c] = (H[c] || 0) + v; hT += v; }
      const ids = Object.keys(P).sort((a, b) => P[b] - P[a]);
      for (const c of ids) pickTsv.push([arm.tag + ' · 시드 1~2000', f, ko(c), r1(100 * P[c] / pT), r1(100 * (O[c] || 0) / oT), r1(100 * (H[c] || 0) / (hT || 1)), P[c], O[c] || 0, r0(H[c] || 0)]);
    }
    // 마을별(시드 1~50 · 넷째 해까지 · 첫해 뺌)
    const bySeed = {};
    for (const R of J.rows) (bySeed[R.seed] || (bySeed[R.seed] = [])).push(R);
    const nongPi = [], batPi = [], batAd = [], nongPd = [], batPd = [], batN = [];
    const steady = { 피: [], 벼: [], 미나리: [], 섞임: [], 없음: [] };   // 논 여름 작물(첫해 뺀 해들 · 월동 작물 뺌)
    for (const s of Object.keys(bySeed)) {
      const L = bySeed[s], N = L.find((x) => x.f === '논'), Bs = L.filter((x) => x.f === '밭');
      const pc = (R, c) => { let t = 0; for (const k in R.plant) t += R.plant[k]; return t ? 100 * (R.plant[c] || 0) / t : 0; };
      const pcB = (c) => { let t = 0, n = 0; for (const R of Bs) { for (const k in R.plant) t += R.plant[k]; n += R.plant[c] || 0; } return t ? 100 * n / t : 0; };
      const avgY = (R, k) => { let t = 0; for (let y = 1; y < J.YEARS; y++) t += R[k][y]; return t / (J.YEARS - 1); };
      const first = Object.keys(N.plant).filter((c) => c === 'rice' || c === 'barnyard_millet').map(ko).join('·') || '—';
      const np = pc(N, 'barnyard_millet'), bp = pcB('barnyard_millet'), ba = pcB('adlay');
      const nd = avgY(N, 'pdY'), bd = (avgY(Bs[0], 'pdY') + avgY(Bs[1], 'pdY')) / 2, bn = (avgY(Bs[0], 'nY') + avgY(Bs[1], 'nY')) / 2, nn = avgY(N, 'nY');
      nongPi.push(np); batPi.push(bp); batAd.push(ba); nongPd.push(nd); batPd.push(bd); batN.push(bn);
      const sm = [...new Set(N.seqY.slice(1).flat().filter((c) => !C.isWinterCrop(c)))];
      const one1 = sm.length === 1 ? sm[0] : null;
      (one1 === 'barnyard_millet' ? steady.피 : one1 === 'rice' ? steady.벼 : one1 === 'water_dropwort' ? steady.미나리 : sm.length ? steady.섞임 : steady.없음).push(+s);
      const sm2 = [...new Set(N.seqY.slice(1).flat().filter((c) => !C.isWinterCrop(c)))].map(ko).join('·') || '—';
      villTsv.push([arm.tag, s, first, sm2, r1(np), r1(bp), r1(ba), r1(nd), r1(bd), r2(bn), r2(nn)]);
    }
    const q = (a) => { const s = a.slice().sort((x, y) => x - y); return [s[0], s[Math.floor(s.length / 2)], s[s.length - 1]]; };
    const par = (a) => ({ 홀: a.filter((x) => x % 2 === 1).length, 짝: a.filter((x) => x % 2 === 0).length });
    armSum.push({ tag: arm.tag, steady: { 피: par(steady.피), 벼: par(steady.벼), 미나리: par(steady.미나리), 섞임: par(steady.섞임), 없음: par(steady.없음) }, chk: [J.chk, J.bad, big.chk, big.bad], nongPi: q(nongPi), nongPiAll: nongPi.filter((x) => x >= 99.9).length, nongPiNone: nongPi.filter((x) => x <= 0.1).length, batPi: q(batPi), batAd: q(batAd), nongPd: q(nongPd), batPd: q(batPd), batN: q(batN), n: nongPi.length });
  }

  // ── 모서리 ──────────────────────────────────────────────────────────────────────────
  //   ① 쏠림 — 한 자리에 늘 같은 작물(그 작물의 첫 파종 달에 심고 · 거두면 다음 파종 달에 다시)일 때 한 해 사람-날(같은 시계 · 같은 물 규칙)
  const mono = (c, f) => {
    let cell = null, pd = 0, n = 0; const Y = 4;
    for (let d = 0; d < 365 * Y; d++) {
      if (cell && d >= cell.rd) { if (d >= 365) { pd += C.harvestUnits(c, { supply: f === '논' ? 5 : 1, seedFresh: 1 }) * (C.kgOf(c) || 0) * C.kcalOf(c) / DAY; n++; } cell = null; }
      if (!cell && C.sowMonthsOf(c).includes(C.monthOf(d))) { const rd = C.readyDay(c, d); if (rd != null) cell = { rd }; }
    }
    return [pd / (Y - 1), n / (Y - 1)];
  };
  const corner = [['갈래', '경우', '값', '단위', '읽는 법']];
  for (const [c, f] of [['rice', '논'], ['barnyard_millet', '논'], ['soybean', '밭'], ['barnyard_millet', '밭'], ['foxtail_millet', '밭'], ['millet', '밭'], ['wheat', '밭'], ['barley', '밭'], ['radish', '밭'], ['cabbage', '밭']]) {
    const [pd, n] = mono(c, f);
    corner.push(['① 쏠림(한 작물만)', `${f} · ${ko(c)}만(파종 달마다 다시)`, r1(pd), '사람-날/칸/년', `한 해 거둠 ${r2(n)}번 · 게임에 이어짓기 벌 · 작물별 병충해 · 땅심 칸이 없다(코드 읽기)`]);
  }
  const A0 = armSum[0], A1 = armSum[1];
  corner.push(['① 쏠림(한 작물만)', '해시 고르기 · 청동기 켬(시드 1~50 가운데)', r1(A0.nongPd[1]) + ' · ' + r1(A0.batPd[1]), '사람-날/칸/년(논 · 밭)', '위 줄과 견줌']);
  corner.push(['② 논 없는 마을', '밭 자리만 · 청동기 켬(시드 1~50)', rr([A0.batPd[0], A0.batPd[2]], r1) + ' (가운데 ' + r1(A0.batPd[1]) + ')', '사람-날/칸/년', '논 몫(벼 · 피)이 통째 빠진다 · 밭 후보에도 피가 있다(밭·논 겸용)']);
  corner.push(['③ 겨울 작물 × 휴경', '밭 한 해 거둠 수 · 청동기 켬(시드 1~50)', rr([A0.batN[0], A0.batN[2]], r2) + ' (가운데 ' + r2(A0.batN[1]) + ')', '번/칸/년', '휴경은 코드에 없다(villages.js T1229 주석 · 비율 근거 미확인) · 게임은 거두면 그 달 후보로 바로 다시 심는다(그루갈이) — 청동기 그루갈이 근거 0(고증.tsv 철_그루갈이)']);
  for (const id of ['radish', 'cabbage', 'cucumber', 'lettuce', 'scallion', 'chive', 'garlic', 'ginger', 'taro', 'yam', 'korean_melon', 'gourd']) {
    const r = rows.find((x) => x.id === id);
    corner.push(['④ 플레이어만 심는 채소', `${r.ko} — 지금 식 · 고증`, r1(r.pdPM) + ' → ' + (r.evPd ? rr(r.evPd, r1) : '미확인'), '사람-날/칸', `칸 ${r1(r.cellKg)} kg(다리) ↔ 고증 ${r.kgha ? rr([r.kgha[0] * HA, r.kgha[1] * HA], r0) + ' kg' : '미확인'} · 저장 ${r.keepD}일 · 읽는 곳 = 열량 하나(맛 · 건강 0)`]);
  }

  // ── 고증 칸(34종 × 다섯 축 상태) ────────────────────────────────────────────────────
  const AXES5 = ['수량', '일손', '버팀', '철', '청동기'];
  const cellTsv = [['id', '작물', ...AXES5]];
  const cnt = { 확인: 0, 이웃: 0, 미확인: 0 };
  for (const r of rows) {
    const e = ev[r.id] || {};
    const st = {};
    // 수량: 근대이전/근대직전 확인 → 확인 · 1970s/현대만(다리) → 이웃 · 없음 → 미확인
    st.수량 = (one(r.id, '수량_근대이전') || one(r.id, '수량_근대직전')) ? '확인' : ((one(r.id, '수량_1970s') || one(r.id, '수량_현대')) ? '이웃' : '미확인');
    // 일손: 작물 줄이 모두 확인 → 확인 · 이웃 줄이 섞이거나 현대만 → 이웃 · 없음 → 미확인
    st.일손 = r.lab ? (r.labWay.startsWith('확인') ? '확인' : '이웃') : '미확인';
    const hb = Object.keys(e).filter((a) => a.startsWith('버팀_') || a.startsWith('약점_'));
    st.버팀 = hb.length ? (hb.some((a) => e[a][0].상태 === '확인') ? '확인' : '이웃') : '미확인';
    const ch = Object.keys(e).filter((a) => a.startsWith('철_'));
    st.철 = (r.calD != null || ch.some((a) => e[a][0].상태 === '확인' && a === '철_자라는날')) ? '확인' : (ch.length ? '이웃' : '미확인');
    st.청동기 = e.청동기 ? e.청동기[0].상태 : '미확인';
    for (const a of AXES5) cnt[st[a]]++;
    cellTsv.push([r.id, r.ko, ...AXES5.map((a) => st[a])]);
  }

  // ── 쓰기 ──────────────────────────────────────────────────────────────────────────────
  const W = (name, T) => fs.writeFileSync(path.join(OUT, name), T.map((l) => l.join('\t')).join('\n') + '\n');
  const bal = [['id', '작물', '분류', '자리', '재배유형', '파종월', '청동기 고르기 안', '자라는 날(게임)', '자라는 날(카탈로그)', '수확 등급', '낱개 kg', 'kcal/kg',
    '칸 kg(지금 식)', '사람-날/칸(지금 식)', '사람-날/칸(생활층 · 밭 물 · 내림)', '사람-날/칸(econ T368 켬)', '일 시간당 kcal(게임 T1221)', '밭 하루당 kcal(게임)', '저장성', '저장일', '물 요구', '관리', '밭 물 배수',
    '고증 kg/ha', '고증 갈래', '사람-날/칸(고증)', '일손 h/ha(고증)', '일손 갈래', '일 시간당 kcal(고증)', '자라는 날(고증)', '자라는 날 출처', '밭 하루당 kcal(고증)', '버팀(고증)', '약점(고증)', '청동기 출토', '청동기 출처']];
  for (const r of rows) {
    const lf = r.fields.map((f) => f + ' ' + r1(r.lifePd[f])).join(' · '), ef = r.fields.map((f) => f + ' ' + r1(r.econPd[f])).join(' · ');
    bal.push([r.id, r.ko, r.group, r.field, r.life, r.sowTxt, r.bronzeSet ? '○' : '', r.gd, r.gdCat, r.yieldG, r.kg1, r.kcal,
      r1(r.cellKg), r1(r.pdPM), lf, ef, r0(r.gameKcalH), r0(r.gameKcalD), r.keep, r.keepD, r.water, r.care, r.fields.includes('밭') ? r2(r.wDry) : '—',
      r.kgha ? rr(r.kgha, r0) : '미확인', r.way, r.evPd ? rr(r.evPd, r1) : '', r.lab ? rr(r.lab, r0) : '미확인', r.labWay, r.evKcalH ? rr(r.evKcalH, r0) : '', r.evDays ? rr(r.evDays, r0) : '미확인', r.evDaysWay,
      r.evKcalD ? rr(r.evKcalD, r0) : '', r.hard.join(' · '), r.weak.join(' · '), r.bronze, r.bronzeSrc]);
  }
  W('균형.tsv', bal);
  W('지배.tsv', [['판', 'id', '작물', '판정', '지배하는 작물(같은 자리 · 같은 달)'], ...domRows]);
  W('고르기.tsv', pickTsv);
  W('고르기_마을.tsv', villTsv);
  W('모서리.tsv', corner);
  W('고증_칸.tsv', cellTsv);
  const sum = {
    gameCellH: +gameCellH.toFixed(3), gameHaH: +gameHaH.toFixed(1), ratioA: ratioA.map(([i, v]) => [i, +v.toFixed(3)]), RA: RA.map((x) => +x.toFixed(3)), ratioB: ratioB.map(([i, v]) => [i, +v.toFixed(3)]), RB: RB.map((x) => +x.toFixed(3)),
    cells: cnt, kgHaSourced: rows.filter((r) => r.kgha).length, kgHaPre: rows.filter((r) => /^근대/.test(r.way)).length, labN: rows.filter((r) => r.lab).length,
    domNow: DNOW, domEv: DEV, domEvFirm: DEVF, domEv3: DEV3, domEv3Firm: DEV3F, arms: armSum,
  };
  fs.writeFileSync(path.join(OUT, '요약.json'), JSON.stringify(sum, null, 1) + '\n');
  // 화면
  console.log(`칸 일 시간(게임 T1221 켬) ${gameCellH.toFixed(2)} h/칸 = ${gameHaH.toFixed(0)} h/ha(모든 작물 같음)`);
  console.log(`다리A ${RA.map(r2).join('~')} (${ratioA.map(([i, v]) => ko(i) + ' ' + r2(v)).join(' · ')}) · 다리B ${RB.map(r2).join('~')} (${ratioB.map(([i, v]) => ko(i) + ' ' + r2(v)).join(' · ')})`);
  console.log(`고증 칸 170: 확인 ${cnt.확인} · 이웃 ${cnt.이웃} · 미확인 ${cnt.미확인} · kg/ha 있는 작물 ${sum.kgHaSourced}(근대 이전 · 직전 ${sum.kgHaPre}) · 일손 h/ha ${sum.labN}`);
  const dl = (D) => `${D.dom.length}(${D.dom.map(ko).join(' · ')}${D.unk.length ? ' · 판정 못 함 ' + D.unk.length : ''})`;
  console.log(`지배됨 — 지금 식 ${dl(DNOW)}`);
  console.log(`         고증 넷 ${dl(DEV)} · 굳은 ${dl(DEVF)}`);
  console.log(`         고증 셋 ${dl(DEV3)} · 굳은 ${dl(DEV3F)}`);
  for (const a of armSum) console.log(`${a.tag}: 논 여름 작물(둘째 해부터) 피만 ${JSON.stringify(a.steady.피)} · 벼만 ${JSON.stringify(a.steady.벼)} · 미나리만 ${JSON.stringify(a.steady.미나리)} · 섞임 ${JSON.stringify(a.steady.섞임)} · 없음 ${JSON.stringify(a.steady.없음)}`);
  for (const a of armSum) console.log(`${a.tag}: 같음 확인 ${a.chk.join('/')} · 논 피 몫 % [최소 가운데 최대] ${a.nongPi.map(r1).join(' ')} (100% 마을 ${a.nongPiAll}/${a.n} · 0% ${a.nongPiNone}) · 밭 피 ${a.batPi.map(r1).join(' ')} · 밭 율무 ${a.batAd.map(r1).join(' ')} · 논 사람-날/년 ${a.nongPd.map(r1).join(' ')} · 밭 ${a.batPd.map(r1).join(' ')} · 밭 거둠/년 ${a.batN.map(r2).join(' ')}`);
}

if (process.argv[2] === '--pick') pickChild(); else main();
