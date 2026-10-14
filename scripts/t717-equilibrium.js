#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T717 계측기 · 제품 무변 · 읽기만)
// === scripts/t717-equilibrium.js — **마을 둘레 나무의 평형**: 베는 몫 = 자라는 몫(지금 종 표) + 빠진 공급원 둘(맹아 · 고사목·삭정이 — 출처) ==========
//
// ★왜 [지시 T717 ①] 마을 둘레(T702 의 140셀 원 · 걸음 띠) 나무 수가 "베는 몫 = 자라는 몫"에서 어디에 서나 · 마을마다
//   "나무꾼 n 명이 영원히 벨 수 있는 하루 몫". 세계를 띄우지 않는다 — 서버가 부르는 **그 함수·표**만 읽는다(사본 0):
//   · 나무 — T702 숲 감사(`scripts/t702-forest-audit.js`)가 낸 나무 키 표(`--trees` · 키 → [마을 · 걸음 띠 · 칸]) — 모든 마을 시딩 영토 칸 나무는 이미 빠졌다.
//     그 키의 청크를 `chunk.generateChunkResources`(청크가 켜질 때 부르는 그 함수)로 다시 낳아 개체의 크기(`r`)·종(`sp`)을 읽는다.
//   · 한 그루의 단 — 존 전리품 표(`zone.js lootOfResource` 의 식 `3 + ⌊r/3⌋` — 존을 띄우지 않으려고 식만 읽는다 · 아래 `woodOf` 가 소스 줄을 대조한다)
//   · 자라는 햇수 — `server/trees.js`(`matureYearsOf` · `stageYearsOf` — 종 표 `mature` 4~40 게임년 · 그루터기 끝 = T122 비율 22/52)
//     벤 자리는 그루터기 → 묘목(그루터기 끝 해) → 성목(성목 해). 나무꾼은 성목·묘목을 다 벤다(`zone.js _T325_TYPES`) — 한 자리의 최대 몫은
//     성목까지 기다려 베기(성목 단 ÷ 성목 해)와 묘목에서 베기(묘목 단 ÷ 그루터기 끝 해 · 묘목 단 = 같은 식에 반경 0.45배) 중 큰 쪽이다.
//   · 한 해 = 365 게임일(`events.yearDaysOf` — `chunk.js _yearDays` 가 쓰는 그 정본) · 1셀 = 1 m²(실축 캐논 `server/rescue.js` "1걸음 = 1셀 = 1m = 32px")
//     · 1단 = 3.00 kg(`weights.js kgOf('wood')`) · 짐 25 kg(`carry.js CAP_KG`) · 걸음 64 px/초(`zone.js MOVE_SPEED`) · 낮 = 하루 24분 × 0.7(`zone-config WORLD`)
//   · 영토 칸은 다시 안 난다(T566 — 감사 표가 시딩 영토를 이미 뺐다 · 400일 영토가 걷는 30~50셀 띠는 따로 적는다)
//
// ★빠진 공급원 둘 — 수는 전부 출처에서(새 수 0 · 열린 URL):
//   ⓐ 그루터기 맹아(움갱이) — 참나무류는 벤 그루터기에서 다시 돋는다. 일본 사토야마 참나무(졸참 Q. serrata · 상수리 Q. acutissima) 맹아림:
//      Wikipedia "Satoyama" — "cut down these trees for firewood and charcoal every 15 to 20 years" (https://en.wikipedia.org/wiki/Satoyama)
//      환경성 사토야마 소책자 — "harvesting the trees every 10 to 30 years" · 그림 "5-7 years later" "10-30 years later" (https://www.env.go.jp/nature/satoyama/pamph/pamph2/full.pdf)
//      (졸참 맹아 9개월 키 131.5 cm — Tran et al. 2005 규슈대 https://catalog.lib.kyushu-u.ac.jp/opac_download_md/4660/p471.pdf)
//      ⇒ 종 표의 참나무(`oak` 성목 40 게임년)만 맹아 주기로 바꿔 센다(15~20 · 범위 10~30). 다른 종은 표의 햇수가 이미 그 범위 밑이거나(밤 12 · 개암 6 ·
//        뽕 8 · 버들 7 · 머루 4) 맹아를 안 낸다(소나무 · 잣 — 이 카드는 출처를 안 찾았다: 소나무·잣은 손대지 않는다).
//   ⓑ 고사목·삭정이 줍기 — 숲 바닥에 떨어지는 죽은 가지 · 쓰러진 나무(살아 있는 나무는 안 벤다):
//      가는 가지 낙엽 — 계방산 장기생태조사지(신갈나무 우점 활엽수림) 총 낙엽 6,593 kg/ha/년의 가지 8.7% ≈ 574 kg/ha/년
//        (Lee et al. 2006 J. Ecol. Field Biol. 29(6):585 https://accesson.kr/jecoenv/assets/pdf/6603/journal-29-6-585.pdf)
//      굵은 고사목 유입 — 점봉산 신갈나무림 1.20 Mg/ha/년(Yoon et al. 2011 J. Ecol. Field Biol. 34(1):115 https://scholar.korea.ac.kr/handle/2021.sw.korea/114620)
//                       · 광릉 졸참 우점 노령림 4.81 Mg/ha/년(해마다 변동 큼 · Son et al. 2011 For. Sci. Tech. 7(4):145 https://scholar.korea.ac.kr/item/370d36a6-de48-43fc-9bad-d22bce0de5a1)
//      ⇒ 빽빽한 숲 칸(숲 배수 > 1.5 — 숲 격자가 나무를 심는 칸 · T702 감사 `cells.dense` · 곧은 140셀 원) 1 m² 마다 그 몫이 떨어진다고 센다.
//   ⚠고증 자리: 청동기 한반도 탄화목은 참나무속이 대부분이다(T702 §고증 · 평택 현화리 집터 숯 741점 "Most of samples were deciduous oaks" —
//     박원규·김수철 1999 보존과학회지 8(1) https://www.earticle.net/Article/A142312). 맹아 주기 · 고사목 수는 현대 한·일 참나무 숲의 값이다(청동기 값을 적은 출처는 못 찾았다).
//
// 쓰는 법: node scripts/t717-equilibrium.js --audit /tmp/t702/audit.json --trees /tmp/t702/trees.json [--runs <판 JSON 폴더(.t717.json)>] [--json out.json]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const AUD = arg('--audit', '/tmp/t702/audit.json'), TRF = arg('--trees', '/tmp/t702/trees.json'), RUNS = arg('--runs', ''), JOUT = arg('--json', '');

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const C = R('server/chunk');
const TR = R('server/trees');
const W = R('server/weights'), CA = R('server/carry');
const EV = R('server/events');
const Z = 'hanbando', ZONE = ZONES[Z], CS = C.CHUNK_SIZE, SZ = 32;
const SRC_ECON = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const SRC_ZONE = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const num = (re, src) => { const m = (src || SRC_ECON).match(re); if (!m) throw new Error('상수 못 읽음: ' + re); return +m[1]; };
const FIREWOOD_PC = num(/const FIREWOOD_PC = ([\d.]+);/);
const LJ_BASE = R('sim/economy-sim').JOBS.lumberjack.base;
const MOVE_SPEED = num(/const MOVE_SPEED = (\d+);/, SRC_ZONE);
const KG = W.kgOf('wood'), CAP = CA.CFG.CAP_KG;
const YEAR = (EV.yearDaysOf && EV.yearDaysOf()) || 365;
const DAY_S = ZONES && R('server/zone-config').WORLD.dayLengthMs * R('server/zone-config').WORLD.dayPhaseRatio / 1000;
// 존 전리품 식 — 소스 줄을 대조한다(식이 바뀌면 이 자가 먼저 멈춘다)
if (!/if \(t === 'tree'\) \{\s*const l = \{ wood: 3 \+ Math\.floor\(\(r\.r \|\| 8\) \/ 3\), twig: 1 \};/.test(SRC_ZONE)) throw new Error('zone.js 나무 전리품 식이 바뀌었다 — woodOf 를 다시 맞출 것');
if (!/if \(t === 'sapling'\)\s*return \{ wood: 1 \+ Math\.floor\(\(r\.r \|\| 4\) \/ 3\), twig: 1 \};/.test(SRC_ZONE)) throw new Error('zone.js 묘목 전리품 식이 바뀌었다');
const woodOf = (r) => 3 + Math.floor((r || 8) / 3);
const sapWoodOf = (r) => 1 + Math.floor(((r || 8) * 0.45) / 3);   // 묘목 = 같은 식에 반경 0.45배(`chunk.js` 재생 단계 `entity.r *= 0.45`)
const REG = C.REGROW;
const stageY = (sp) => TR.stageYearsOf(sp, REG.TREE_STUMP_Y(), REG.TREE_FULL_Y());   // [그루터기 끝 해, 성목 해]

// ── 출처 수(위 머리말) ────────────────────────────────────────────────────────
const SRC = {
  coppiceY: { lo: 15, hi: 20, wideLo: 10, wideHi: 30 },               // Satoyama(Wikipedia) 15~20 · 환경성 10~30
  fineKgHaYr: 6593 * 0.087,                                          // 계방산 — 총 낙엽 × 가지 몫
  cwdKgHaYr: { jumbong: 1200, gwangneung: 4810 },                    // 점봉산 신갈나무림 · 광릉 노령림
};
const HA = 10000;   // 1 ha = 10,000 m² = 10,000 셀(1셀 = 1 m²)
const deadPerCellDay = (kgHaYr) => kgHaYr / HA / KG / YEAR;          // 단/셀/일

// ── 읽기 ─────────────────────────────────────────────────────────────────────
const A = JSON.parse(fs.readFileSync(AUD, 'utf8'));
const TB = JSON.parse(fs.readFileSync(TRF, 'utf8'));
const BN = TB.bands;   // ['0~30','30~50','50~100','100~140','140~200','못 닿음']
const names = TB.names;
const nV = names.length;
// 청크마다 한 번 — 키 → 개체(r · sp)
const byChunk = new Map();
for (const k of Object.keys(TB.keys)) { const m = k.match(/^(\d+)_(\d+)_/); if (!m) continue; const ck = m[1] + ',' + m[2]; let a = byChunk.get(ck); if (!a) byChunk.set(ck, (a = [])); a.push(k); }
const ent = new Map();
let miss = 0;
for (const [ck, keys] of byChunk) {
  const [qx, qy] = ck.split(',').map(Number);
  const want = new Set(keys);
  for (const e of C.generateChunkResources(Z, ZONE.biome, qx, qy, CS)) if (e.type === 'tree' && want.has(e.seedKey)) ent.set(e.seedKey, { r: e.r, sp: e.sp || TR.speciesAt(Z, Math.floor(e.x / SZ), Math.floor(e.y / SZ)) });
  for (const k of keys) if (!ent.has(k)) miss++;
}
// ── 마을 × 띠 합 ─────────────────────────────────────────────────────────────
const Z0 = () => ({ n: 0, wood: 0, yMat: 0, yCopLo: 0, yCopHi: 0, yCopWideLo: 0, yCopWideHi: 0, oak: 0, sapBetter: 0, bySp: {} });
const V = Array.from({ length: nV }, () => BN.map(Z0));
for (const [k, t] of Object.entries(TB.keys)) {
  const e = ent.get(k); if (!e) continue;
  const [vi, b] = t;
  const S = V[vi][b];
  const w = woodOf(e.r), ws = sapWoodOf(e.r);
  const [sY, fY] = stageY(e.sp);
  S.n++; S.wood += w; S.bySp[e.sp] = (S.bySp[e.sp] || 0) + 1;
  //   한 자리의 최대 몫 — 성목까지 기다려 베기(단 ÷ 성목 해) ∨ 묘목에서 베기(묘목 단 ÷ 그루터기 끝 해 — 벤 뒤 그루터기 시계가 다시 돈다) 중 큰 쪽
  const yM = Math.max(w / fY, ws / sY) / YEAR;
  S.yMat += yM;
  if (ws / sY > w / fY) S.sapBetter++;
  if (e.sp === 'oak') {
    S.oak++;
    for (const [key, cy] of [['yCopLo', SRC.coppiceY.hi], ['yCopHi', SRC.coppiceY.lo], ['yCopWideLo', SRC.coppiceY.wideHi], ['yCopWideHi', SRC.coppiceY.wideLo]]) S[key] += Math.max(yM, w / (Math.min(fY, cy) * YEAR));
  } else for (const key of ['yCopLo', 'yCopHi', 'yCopWideLo', 'yCopWideHi']) S[key] += yM;
}
// ── 인구(판 JSON — 있으면) ────────────────────────────────────────────────────
const pop = {};   // 이름 → { d30:[..], d400:[..] }
if (RUNS && fs.existsSync(RUNS)) {
  for (const f of fs.readdirSync(RUNS).filter((x) => /\.t717\.json$/.test(x))) {
    const P = JSON.parse(fs.readFileSync(path.join(RUNS, f), 'utf8'));
    const k30 = P.days.indexOf(30), k400 = P.days.length - 1;
    P.names.forEach((nm, i) => { const o = pop[nm] || (pop[nm] = { d30: [], d400: [] }); if (k30 >= 0) o.d30.push(P.v[i].n[k30]); o.d400.push(P.v[i].n[k400]); });
  }
}
const med = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const sumB = (S, bs, key) => bs.reduce((a, b) => a + S[b][key], 0);
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
// 걸음 — 한 몸이 하루에 지고 오는 단(그 띠 가운데 거리 · 한 짐 = ⌊짐 ÷ (단 × kg)⌋그루, 최소 1그루 — `_t341TripsPerDay` · `_t341TreesPerLoad` 의 식)
const bodyDay = (cells, w) => { const round = 2 * cells * SZ / MOVE_SPEED; const trips = Math.floor(DAY_S / round); const per = Math.max(1, Math.floor(CAP / (w * KG))); return trips * per * w; };
const MID = [15, 40, 75, 120, 170];

const rows = [];
const IN = [1, 2, 3];        // 30~140 (T702 140셀 원 · 시딩 영토 밖)
const FAR = [2, 3];          // 50~140 (400일 영토가 걷는 30~50 띠를 뺀 것)
for (let i = 0; i < nV; i++) {
  const a = A.rows.find((r) => r.name === names[i]) || {};
  const S = V[i];
  const n140 = sumB(S, IN, 'n'), w140 = sumB(S, IN, 'wood');
  const yMat = sumB(S, IN, 'yMat'), yMatFar = sumB(S, FAR, 'yMat'), yMat200 = sumB(S, [4], 'yMat');
  const yCopLo = sumB(S, IN, 'yCopLo'), yCopHi = sumB(S, IN, 'yCopHi');
  const dense = (a.cells && a.cells.dense) || 0;
  const yFine = dense * deadPerCellDay(SRC.fineKgHaYr);
  const yCwdLo = dense * deadPerCellDay(SRC.cwdKgHaYr.jumbong), yCwdHi = dense * deadPerCellDay(SRC.cwdKgHaYr.gwangneung);
  const landWood = a.land ? a.land.wood : NaN;
  const D1 = LJ_BASE * landWood;   // 수식 나무꾼 한 명 하루 몫(도구 배율 1)
  const p = pop[names[i]] || null;
  const N30 = p ? med(p.d30) : NaN, N400 = p ? med(p.d400) : NaN;
  const wbar = n140 ? w140 / n140 : NaN;
  const carry = Number.isFinite(wbar) ? bodyDay(MID[2], Math.round(wbar)) : NaN;   // 50~100 띠 가운데(75셀)에서 한 몸
  rows.push({ name: names[i], landWood, dense, n140, w140, yMat, yMatFar, yMat200, yCopLo, yCopHi, yFine, yCwdLo, yCwdHi,
    yAllLo: yCopLo + yFine + yCwdLo, yAllHi: yCopHi + yFine + yCwdHi, D1, nMax: D1 > 0 ? Math.floor(yMat / D1) : NaN,
    standAtD1: D1 > 0 ? Math.max(0, 1 - D1 / yMat) : NaN, daysToBare: (D1 > yMat && yMat >= 0) ? w140 / (D1 - yMat) : Infinity,
    N30, N400, needFire400: Number.isFinite(N400) ? N400 * FIREWOOD_PC : NaN, carry, bands: S.map((x) => ({ n: x.n, wood: x.wood, yMat: x.yMat })), oak: sumB(S, IN, 'oak'), sapBetter: sumB(S, IN, 'sapBetter') });
}

// ── 표 ───────────────────────────────────────────────────────────────────────
console.log(`\n=== T717 ① 평형 — 51마을 · 나무 ${ent.size.toLocaleString()}그루(감사 표 ${Object.keys(TB.keys).length.toLocaleString()} · 못 찾음 ${miss}) · 한 해 ${YEAR}일 · 1단 ${KG}kg · 낮 ${DAY_S}초 ===`);
const allSp = {}; for (const S of V) for (const b of IN) for (const [k, c] of Object.entries(S[b].bySp)) allSp[k] = (allSp[k] || 0) + c;
console.log('종(30~140 띠 합): ' + Object.entries(allSp).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}(성목 ${stageY(k)[1]}년 · 묘목 ${f(stageY(k)[0], 1)}년)`).join(' · '));
console.log(`묘목을 베는 편이 나은 자리: ${rows.reduce((a, r) => a + r.sapBetter, 0)} / ${rows.reduce((a, r) => a + r.n140, 0)}`);
console.log('\n| 마을 | land.wood | 30~140 나무 · 단 | 평형 하루 몫(종 표 · 자리마다 성목·묘목 베기 중 큰 쪽) | 50~140 만 | +맹아(참나무 20~15년) | +고사목·삭정이(빽빽 숲 칸 · 가지 낙엽 + 고사목 점봉산~광릉) | 합 | 수식 나무꾼 한 명 몫(0.9×land.wood) | 그 몫으로 영원히 벨 수 있는 나무꾼 n | 한 명이 베면 나무가 서는 자리(선 몫) · 다 베는 날 | 400일 인구 · 땔감 수요식(0.085n) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${f(r.landWood)} | ${r.n140} · ${r.w140} | ${f(r.yMat, 3)} | ${f(r.yMatFar, 3)} | ${f(r.yCopLo, 3)}~${f(r.yCopHi, 3)} | ${f(r.yFine + r.yCwdLo, 3)}~${f(r.yFine + r.yCwdHi, 3)} | ${f(r.yAllLo, 2)}~${f(r.yAllHi, 2)} | ${f(r.D1, 3)} | ${Number.isFinite(r.nMax) ? r.nMax : '—'} | ${f(100 * r.standAtD1, 0)}% · ${Number.isFinite(r.daysToBare) ? Math.round(r.daysToBare) + '일' : '안 빔'} | ${f(r.N400, 0)} · ${f(r.needFire400, 2)} |`);
const M = (k) => med(rows.map((r) => r[k]));
console.log(`\n중앙 — 평형 하루 몫 ${f(M('yMat'), 3)}단 · 50~140 ${f(M('yMatFar'), 3)} · +맹아 ${f(M('yCopLo'), 3)}~${f(M('yCopHi'), 3)} · 고사목·삭정이 ${f(med(rows.map((r) => r.yFine + r.yCwdLo)), 3)}~${f(med(rows.map((r) => r.yFine + r.yCwdHi)), 3)} · 합 ${f(M('yAllLo'), 2)}~${f(M('yAllHi'), 2)} · 수식 한 명 ${f(M('D1'), 3)} · 400일 땔감 수요식 ${f(M('needFire400'), 2)} · 한 몸 걸음 몫(75셀) ${f(M('carry'), 0)}단/일`);
console.log(`140~200 띠(참고) 평형 하루 몫 중앙 ${f(M('yMat200'), 3)} · 30~140 평형 몫 0.1 미만 마을 ${rows.filter((r) => r.yMat < 0.1).length}/${nV}`);
console.log(`n(수식 몫으로 영원히) = 0 인 마을 ${rows.filter((r) => r.nMax === 0).length}/${nV} · 한 명이 베면 다 베는 날 중앙 ${f(med(rows.filter((r) => Number.isFinite(r.daysToBare)).map((r) => r.daysToBare)), 0)}일`);
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ src: SRC, consts: { FIREWOOD_PC, LJ_BASE, MOVE_SPEED, KG, CAP, YEAR, DAY_S }, species: allSp, miss, rows }, null, 1));
