#!/usr/bin/env node
// =============================================================================
// analyze-village50 — 51곳 전수 시딩 랩 결과 → **마을별 처방전** [배치 15 v2]
//   재민 질문: "마을 위치를 바꿔야 해? 아니면 비옥도를 수정해야 하나?"
//
// 입력: /tmp/lab/all51_<seed>.json  (SEED_ALL=1 로 돌린 econ-lab-real 덤프)
//       /tmp/village50-plan.json    (plan-village-50.js 의 땅값 전수표)
// 출력: 표 + /tmp/village50-rx.json (map-editor 오버레이용)
//
// ★판정 순서가 곧 원칙이다 — **먼저 살았나 죽었나를 보고**, 죽은 자리만 땅값으로 분해한다.
//   시딩 하한(식량 2.0)은 '선별' 잣대일 뿐 '생존' 잣대가 아니다. 하한 미달인데 800일을 버티면
//   그 자리는 **고칠 게 없다**(하한이 과보수였던 것). 그 구분이 이 스크립트의 존재 이유다.
//
// 사인 분해는 엔진이 이미 남긴 값을 읽기만 한다(사본 금지):
//   kDbg  = {slotK(경작 자리) · prodK(식량 흐름) · fuelK(연료 흐름)} — K = min 셋
//   history = 10일 간격 {d, p(인구), f(식량환산)}
// =============================================================================
'use strict';
const fs = require('fs');
const SEEDS = (process.env.SEEDS || '42,7,1020').split(',');
const PLAN = process.env.PLAN || '/tmp/village50-plan.json';
const OUT = process.env.OUT || '/tmp/village50-rx.json';

const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
const planBy = new Map(plan.rows.map(r => [r.name, r]));

const dumps = [];
for (const s of SEEDS) {
  const p = `/tmp/lab/all51_${s}.json`;
  if (!fs.existsSync(p)) { console.log(`  (없음: ${p} — 건너뜀)`); continue; }
  dumps.push({ seed: s, d: JSON.parse(fs.readFileSync(p, 'utf8')) });
}
if (!dumps.length) { console.error('덤프가 하나도 없다.'); process.exit(1); }
console.log(`덤프 ${dumps.length}개: ${dumps.map(x => x.seed).join(', ')}`);

// ── 마을별 집계 ──────────────────────────────────────────────────────────────
const agg = new Map();
for (const { seed, d } of dumps) {
  for (const v of (d.villages || [])) {
    if (!agg.has(v.name)) agg.set(v.name, { name: v.name, seeds: [] });
    const a = agg.get(v.name);
    const hist = v.history || [];
    const pop = (v.pop != null) ? v.pop : (hist.length ? hist[hist.length - 1].p : 0);   // ★덤프의 인구 필드는 v.pop 이다(counts 는 직업별)
    const extinct = (v.everPop === 1 || v.everPop === undefined) && pop === 0;
    // 좀비 = 살아는 있으나 최근 300일 인구가 초기치 근처에서 눌려 있는 것(랩 관용 정의 — 8 시작)
    const tail = hist.filter(h => h.d >= 500);
    const tailMax = tail.length ? Math.max(...tail.map(h => h.p)) : pop;
    const zombie = !extinct && pop > 0 && tailMax <= 12;
    // kDbg 키는 slot/prod/fuel 이다(엔진 _kDbg 그대로 — 1차에 slotK/prodK/fuelK 로 잘못 읽어 전부 '-' 였다).
    const k = v.kDbg || {};
    const kmin = ['slot', 'prod', 'fuel'].filter(x => k[x] != null)
      .sort((x, y) => k[x] - k[y])[0] || null;
    // 죽은 날 — 인구가 0 이 된 첫 표본
    let deathDay = null;
    for (const h of hist) if (h.p === 0) { deathDay = h.d; break; }
    // 식량 바닥 도달 — f 가 0 근처로 내려앉은 첫 표본
    let starveDay = null;
    for (const h of hist) if (h.f != null && h.f < 1) { starveDay = h.d; break; }
    a.seeds.push({ seed, pop, extinct, zombie, kDbg: k, kmin, deathDay, starveDay,
      peak: hist.length ? Math.max(...hist.map(h => h.p)) : pop,
      jobs: v.jobs || {}, expansions: v.expansions || 0 });
  }
}

// ── 판정 + 처방 ──────────────────────────────────────────────────────────────
const rows = [];
for (const [name, a] of agg) {
  const n = a.seeds.length;
  const ext = a.seeds.filter(s => s.extinct).length;
  const zom = a.seeds.filter(s => s.zombie).length;
  const popAvg = a.seeds.reduce((q, s) => q + s.pop, 0) / n;
  const peakAvg = a.seeds.reduce((q, s) => q + s.peak, 0) / n;
  const kminVote = {};
  for (const s of a.seeds) if (s.kmin) kminVote[s.kmin] = (kminVote[s.kmin] || 0) + 1;
  const kmin = Object.entries(kminVote).sort((x, y) => y[1] - x[1])[0];
  const p = planBy.get(name) || {};

  let verdict, rx;
  if (ext > 0) {
    verdict = `소멸 ${ext}/${n}`;
    rx = prescribe(p, kmin ? kmin[0] : null, true);
  } else if (zom === n) {
    verdict = `좀비 ${zom}/${n}`;
    rx = prescribe(p, kmin ? kmin[0] : null, false);
  } else if (zom > 0) {
    verdict = `좀비 ${zom}/${n}`;
    rx = prescribe(p, kmin ? kmin[0] : null, false);
  } else {
    verdict = '생존';
    rx = { 처방: '그대로 OK', 근거: `${n}/${n} 시드 800일 생존 · 평균 인구 ${popAvg.toFixed(0)}` };
  }
  rows.push({ name, type: p.type, cx: p.cx, cy: p.cy, seedCls: p.cls,
    food: p.food, need: p.need, fertility: p.fertility, water: p.water, game: p.game, stone: p.stone, wood: p.wood,
    popAvg: +popAvg.toFixed(1), peakAvg: +peakAvg.toFixed(1), ext, zom, n, kmin: kmin ? kmin[0] : null, verdict, ...rx });
}

function prescribe(p, kmin, dead) {
  // ★처방의 잣대는 **선별 프록시 공식**이다(에디터에서 무엇을 만지면 시딩이 바뀌는지):
  //     비옥도(프록시) = clamp(0.4 + 물원시×0.9 − 바위밀도×1.5, 0.1, 2)
  //     식량            = 비옥도×1.5 + 물(=원시×1.6)×1.2 + 사냥×0.7
  //   ⇒ d(식량)/d(물원시) = 1.35 + 1.92 = **3.27** · 물원시 = 1 − 최근접물거리/140셀
  //   ⇒ 물을 1셀 당기면 식량 +0.0234. 필요분 Δ → **Δ×42.8 셀** 만큼 물을 당기면 된다.
  //   ★비옥도 레이어를 칠하는 것은 **선별을 안 바꾼다**(선별 시점엔 영토가 없어 필드를 안 읽는다).
  //     칠한 비옥도는 심긴 뒤의 실제 생산엔 반영된다 — 둘을 섞지 마라.
  const need = p.need || 0;
  const cellsCloser = Math.ceil(need * 42.8);
  const out = { 처방: [], 근거: '' };
  if (kmin === 'fuelK') out.처방.push('연료(나무) — 사냥터 밴드(중심 40~130셀)와 반경 140셀 안에 숲을 늘려라');
  if (kmin === 'slotK') out.처방.push('경작 자리 — 영토 안 물·바위 비율을 낮춰 경작 가능 셀을 늘려라');
  if (need > 0) {
    out.처방.push(`물 접근 — 최근접 물을 약 ${cellsCloser}셀 당겨라(개천·못). 식량 ${p.food} → 2.0 통과`);
    if ((p.stone || 0) > 1.2) out.처방.push(`바위 — 반경 140셀 바위 밀도가 높다(stone ${p.stone}) — 걷어내면 프록시 비옥도가 오른다(계수 −1.5)`);
    if ((p.game || 0) < 0.6) out.처방.push(`사냥감 — 사냥터 밴드 숲 비율↑ (game ${p.game} · 필요 Δ식량 ${need} ÷ 0.7 = game +${(need / 0.7).toFixed(2)})`);
  }
  if (!out.처방.length) out.처방.push(kmin ? `K 병목 ${kmin} — 궤적 확인 필요` : '원인 미분류 — 궤적 확인 필요');
  out.근거 = `${dead ? '소멸' : '좀비'} · K 병목 ${kmin || '?'} · 시딩 잣대 식량 ${p.food}${need > 0 ? `(하한 2.0 미달 ${need})` : '(하한 통과)'}`;
  out.처방 = out.처방.join(' / ');
  return out;
}

// ── 출력 ─────────────────────────────────────────────────────────────────────
const order = { '소멸': 0, '좀비': 1, '생존': 2 };
rows.sort((a, b) => (order[a.verdict.split(' ')[0]] - order[b.verdict.split(' ')[0]]) || a.popAvg - b.popAvg);
const W = (s, n) => String(s == null ? '-' : s).padEnd(n);
const Nn = (v, n, d = 1) => String(typeof v === 'number' ? v.toFixed(d) : (v == null ? '-' : v)).padStart(n);
console.log(`\n=== 51곳 전수 시딩 800일 · ${dumps.length}시드 ===`);
console.log(`${W('마을', 8)}${W('타입', 10)}${W('시딩잣대', 10)}${Nn('식량', 6)}${Nn('인구', 7)}${Nn('최고', 6)}${W('  판정', 10)}${W('K병목', 8)} 처방`);
for (const r of rows) {
  console.log(`${W(r.name, 8)}${W(r.type, 10)}${W(r.seedCls, 10)}${Nn(r.food, 6, 2)}${Nn(r.popAvg, 7)}${Nn(r.peakAvg, 6)}  ${W(r.verdict, 8)}${W(r.kmin, 8)} ${r.처방}`);
}
const nExt = rows.filter(r => r.ext > 0).length, nZom = rows.filter(r => r.ext === 0 && r.zom > 0).length;
console.log(`\n요약: 생존 ${rows.length - nExt - nZom} · 좀비 ${nZom} · 소멸 ${nExt} / 총 ${rows.length}곳`);
const needEdit = rows.filter(r => r.verdict !== '생존');
console.log(`에디터 손이 필요한 자리: ${needEdit.length}곳 — ${needEdit.map(r => r.name).join(', ') || '(없음)'}`);

// ── ★시딩 하한(식량 2.0)이 생존을 예측하는가 — 이 배치의 핵심 판정 ────────────
//   "심지 않은 이유"와 "심으면 죽는지"가 같은 축인지 **실측으로** 본다.
{
  const bad = new Set(needEdit.map(r => r.name));
  const under = rows.filter(r => (r.food || 0) < 2.0), over = rows.filter(r => (r.food || 0) >= 2.0);
  const uBad = under.filter(r => bad.has(r.name)).length, oBad = over.filter(r => bad.has(r.name)).length;
  console.log(`\n=== 시딩 하한(식량 2.0)의 예측력 ===`);
  console.log(`  하한 미달 ${under.length}곳 중 문제 ${uBad}곳 (${(uBad / under.length * 100).toFixed(0)}%)`);
  console.log(`  하한 통과 ${over.length}곳 중 문제 ${oBad}곳 (${(oBad / over.length * 100).toFixed(0)}%)`);
  const uSurv = under.filter(r => !bad.has(r.name)).sort((a, b) => a.food - b.food).slice(0, 5);
  console.log(`  하한 미달인데 멀쩡한 곳(식량 낮은 순): ${uSurv.map(r => `${r.name}(식량 ${r.food}·인구 ${r.popAvg})`).join(' · ')}`);
  console.log(`  하한 통과인데 문제인 곳: ${over.filter(r => bad.has(r.name)).map(r => `${r.name}(식량 ${r.food})`).join(' · ') || '(없음)'}`);
}
// 시드별 원장 — 어느 시드에서 무엇이 죽었나(칼날 평형 판별)
console.log(`\n=== 시드별 원장 ===`);
for (const s of dumps.map(x => x.seed)) {
  const e = [], z = [];
  for (const [name, a] of agg) { const r = a.seeds.find(q => q.seed === s); if (!r) continue; if (r.extinct) e.push(name); else if (r.zombie) z.push(name); }
  console.log(`  seed ${String(s).padEnd(5)} 소멸 ${e.length ? e.join(',') : '없음'} · 좀비 ${z.length ? z.join(',') : '없음'}`);
}
fs.writeFileSync(OUT, JSON.stringify({ seeds: dumps.map(x => x.seed), rows }, null, 1));
console.log(`JSON: ${OUT}`);
