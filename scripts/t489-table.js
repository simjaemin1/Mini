#!/usr/bin/env node
// === scripts/t489-table.js — T489 표 넷: ① 밀도 분해 ② 인과(두 눈금) ③ 소문 분리 팔 ④ 켜기 조건 ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다.
//   `scripts/t474-arm.js` 가 남긴 판(`<팔>-<시드>.json` = t17 JSON · `arm-<팔>-<시드>.json` = 관측)과 맨 t17 판(`main-<시드>.json`)을 읽는다.
//   팔: off(둘 다 끔) · walk(T474 만) · split(T489 만 · 장부에 지리) · both(둘 다 · 짐 배수 시속 비) · bothday(둘 다 · 하루 비).
//
// ★산수는 전부 **나눗셈·합**이다(새 수 0):
//   ㉮ = 살아 있는 마을 × 날 ÷ 사건(t17 ⓚ 그 식) · 사건률 r = 1/㉮ · 유형 t 의 몫 r_t = 유형 t 사건 ÷ (마을 × 날).
//   ① 분해는 **정확히 더해진다**: Δ㉮ = 1/r₁ − 1/r₀ = −Σ_t Δr_t ÷ (r₀ r₁) ⇒ 유형 t 의 몫 = −Δr_t ÷ (r₀ r₁) (합 = Δ㉮ · 반올림 전).
//   가름은 T252 자 그대로(`인계/공통.md` §3: 부호 3/3 그리고 |평균| > 폭 → 가름 · 부호 3/3 · |평균| ≤ 폭 → 방향만 · 갈림 → 못 가름).
//   캐논 = 사건 밀도 ㉮ 2~3 일/건(`설계/설계_게임성_사건레이어_TODO.md` §10.1 "마을당 2~3일에 1건").
//
// 실행: node scripts/t489-table.js <판 폴더> [시드…]      (기본 시드 1020 7 42)
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] || '/tmp/t489/runs';
const SEEDS = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [1020, 7, 42];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } };
const same = (a, b) => { try { return fs.readFileSync(path.join(DIR, a)).equals(fs.readFileSync(path.join(DIR, b))); } catch (e) { return false; } };
const ARMS = ['off', 'walk', 'split', 'both', 'bothday'];
const NAME = { off: '끔(둘 다)', walk: 'T474 만', split: 'T489 만', both: '둘 다(시속 비)', bothday: '둘 다(하루 비)' };
const T = {}, A = {};
for (const a of ARMS) { T[a] = SEEDS.map((s) => rd(`${a}-${s}.json`)); A[a] = SEEDS.map((s) => rd(`arm-${a}-${s}.json`)); }
const have = (a) => T[a].every(Boolean) && A[a].every(Boolean);
const mean = (xs) => xs.reduce((p, x) => p + x, 0) / xs.length;
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : x.toFixed(2)));
const pc = (x) => (x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%');
const verdict = (ds) => {   // ds: 시드별 짝 Δ(%) — T252
  const pos = ds.filter((d) => d > 0).length, neg = ds.filter((d) => d < 0).length;
  if (ds.every((d) => d === 0)) return { v: '= 0', m: 0, w: 0 };
  const m = mean(ds), w = Math.max(...ds) - Math.min(...ds);
  return { v: (pos === ds.length || neg === ds.length) ? (Math.abs(m) > w ? '가름' : '방향만') : '못 가름', m, w };
};
const dens = (t) => t.live * t.days / t.board.emitted;      // ㉮ — t17 ⓚ 그 식(반올림 전)
const out = [];
const P = (s) => out.push(s);

// ── 끔 = main(두 가지 판) ─────────────────────────────────────────────────────
P('## 끔 = main · 소문만 뗀 판 = main (t17 JSON 바이트)');
P('');
P(`| 판 | ${SEEDS.join(' | ')} |`); P(`|---|${SEEDS.map(() => '---').join('|')}|`);
P(`| 끔(관측 기계 단 채) = main | ${SEEDS.map((s) => (same(`off-${s}.json`, `main-${s}.json`) ? '**동일**' : '다름')).join(' | ')} |`);
P(`| T489 만(장부에 소문 그래프 · 몸 속도) = main | ${SEEDS.map((s) => (same(`split-${s}.json`, `main-${s}.json`) ? '**동일**' : '다름')).join(' | ')} |`);
if (have('split')) P(`| (T489 만 판의 장부 소문 그래프 — 속도 · 걸음 수) | ${A.split.map((x) => (x.ledgerRumor ? `${x.ledgerRumor.speed} · ${x.ledgerRumor.walks}` : '없음')).join(' | ')} |`);
P('');

// ── ① 밀도 분해(끔 → T474 만) ─────────────────────────────────────────────────
if (have('off') && have('walk')) {
  const types = [...new Set([].concat(...A.off.map((x) => Object.keys(x.ledger.byType)), ...A.walk.map((x) => Object.keys(x.ledger.byType))))];
  const rows = [];
  let sumCheck = SEEDS.map(() => 0);
  const dOff = T.off.map(dens), dOn = T.walk.map(dens);
  for (const ty of types) {
    const per = SEEDS.map((_, i) => {
      const n0 = T.off[i].live * T.off[i].days, n1 = T.walk[i].live * T.walk[i].days;
      const r0 = 1 / dOff[i], r1 = 1 / dOn[i];
      const c0 = A.off[i].ledger.byType[ty] || 0, c1 = A.walk[i].ledger.byType[ty] || 0;
      const dr = c1 / n1 - c0 / n0;
      return { c0, c1, contrib: -dr / (r0 * r1) };
    });
    per.forEach((p, i) => { sumCheck[i] += p.contrib; });
    rows.push({ ty, c0: mean(per.map((p) => p.c0)), c1: mean(per.map((p) => p.c1)), contrib: mean(per.map((p) => p.contrib)), per });
  }
  rows.sort((a, b) => a.contrib - b.contrib);
  const dD = mean(SEEDS.map((_, i) => dOn[i] - dOff[i]));
  P('## ① 밀도 분해 — 끔 → T474 만(3시드 평균 · 유형별 몫이 Δ㉮ 에 정확히 더해진다)');
  P('');
  P(`㉮ 끔 ${dOff.map((x) => x.toFixed(3)).join(' · ')} → 켬 ${dOn.map((x) => x.toFixed(3)).join(' · ')} · Δ㉮ 평균 **${dD.toFixed(3)}**`);
  P('');
  P('| 유형 | 끔(평균) | 켬(평균) | Δ | Δ㉮ 몫(일/건) | 몫 % | 시드별 몫 |');
  P('|---|---:|---:|---:|---:|---:|---|');
  for (const r of rows) {
    if (!r.c0 && !r.c1) continue;
    P(`| ${r.ty} | ${f1(r.c0)} | ${f1(r.c1)} | ${(r.c1 - r.c0 >= 0 ? '+' : '') + f1(r.c1 - r.c0)} | ${r.contrib.toFixed(4)} | ${(r.contrib / dD * 100).toFixed(1)}% | ${r.per.map((p) => p.contrib.toFixed(3)).join(' · ')} |`);
  }
  P(`| **합** | ${f1(mean(A.off.map((x) => x.ledger.emitted)))} | ${f1(mean(A.walk.map((x) => x.ledger.emitted)))} | | **${mean(sumCheck).toFixed(4)}** | 100% | 합 = Δ㉮: ${SEEDS.map((_, i) => `${sumCheck[i].toFixed(4)}=${(dOn[i] - dOff[i]).toFixed(4)}`).join(' · ')} |`);
  P('');
  // 품목 — 값 유형 넷의 Δ 상위
  const VAL = ['STOCK_SHORTAGE', 'STOCK_GLUT', 'PRICE_SPIKE', 'PRICE_DROP'];
  const itemD = new Map();
  for (const ty of VAL) for (let i = 0; i < SEEDS.length; i++) {
    const o = (A.off[i].typeItem[ty] || {}), n = (A.walk[i].typeItem[ty] || {});
    for (const it of new Set([...Object.keys(o), ...Object.keys(n)])) {
      const k = it || '(없음)'; const cur = itemD.get(k) || { off: 0, on: 0 };
      cur.off += (o[it] || 0) / SEEDS.length; cur.on += (n[it] || 0) / SEEDS.length; itemD.set(k, cur);
    }
  }
  const items = [...itemD.entries()].map(([k, v]) => ({ k, ...v, d: v.on - v.off })).sort((a, b) => b.d - a.d);
  const totD = items.reduce((p, x) => p + x.d, 0);
  P(`### ①-품목 — 값 유형 넷(부족·글럿·값 오름·값 내림)의 Δ 가 **어느 품목**에서 왔나(3시드 평균 · 품목 ${items.length}종)`);
  P('');
  P('| 품목 | 끔 | 켬 | Δ | Δ 몫 | 누적 |'); P('|---|---:|---:|---:|---:|---:|');
  let acc = 0;
  for (const x of items.slice(0, 15)) { acc += x.d; P(`| ${x.k} | ${f1(x.off)} | ${f1(x.on)} | +${f1(x.d)} | ${(x.d / totD * 100).toFixed(1)}% | ${(acc / totD * 100).toFixed(1)}% |`); }
  const newItems = items.filter((x) => x.off < 0.5 && x.on >= 0.5);
  P(`| (끔엔 없던 품목 ${newItems.length}종) | | | +${f1(newItems.reduce((p, x) => p + x.d, 0))} | ${(newItems.reduce((p, x) => p + x.d, 0) / totD * 100).toFixed(1)}% | |`);
  P('');
}

// ── ② 인과 — 캐러밴 ×3 → … → 밀도 · 두 눈금 ───────────────────────────────────
if (have('off') && have('walk')) {
  const VAL = ['STOCK_SHORTAGE', 'STOCK_GLUT', 'PRICE_SPIKE', 'PRICE_DROP'];
  const vsum = (x) => VAL.reduce((p, t) => p + (x.ledger.byType[t] || 0), 0);
  const R = [
    ['캐러밴 띄운 수', (i, a) => A[a][i].caravan.launched],
    ['도착(교역 성사 시도 · `_tradeAudit.n`)', (i, a) => A[a][i].caravan.audit.arrived],
    ['  손절(도착가 < 출발가 ½ · bail)', (i, a) => A[a][i].caravan.audit.bail],
    ['  재routing', (i, a) => A[a][i].caravan.audit.reroute],
    ['값 사건(부족·글럿·값 오름·값 내림)', (i, a) => vsum(A[a][i])],
    ['값 사건 ÷ 도착', (i, a) => vsum(A[a][i]) / Math.max(1, A[a][i].caravan.audit.arrived)],
    ['FIRST_GOODS(처음 들어온 물건)', (i, a) => A[a][i].ledger.byType.FIRST_GOODS || 0],
    ['캐러밴이 닿은 마을·일 몫', (i, a) => A[a][i].touch.shareDays],
    ['값 사건 중 닿은 날 몫', (i, a) => A[a][i].touch.shareValue],
    ['값 사건 비율 — 닿은 날(마을·일당)', (i, a) => A[a][i].touch.rateTouched],
    ['값 사건 비율 — 안 닿은 날(마을·일당)', (i, a) => A[a][i].touch.rateUntouched],
    ['게시(의뢰)', (i, a) => A[a][i].ledger.reqOpened],
    ['  철회', (i, a) => A[a][i].ledger.reqClosed],
    ['  **깨진 약속**(T142 재검증 철회)', (i, a) => A[a][i].ledger.reqRevalidated],
    ['  깨진 약속 ÷ 게시', (i, a) => A[a][i].ledger.reqRevalidated / Math.max(1, A[a][i].ledger.reqOpened)],
    ['표적 노출(털린 기록 · 이 자에 도적 없음)', (i, a) => A[a][i].caravan.raided],
    ['CARAVAN_RAIDED + TRADER_KILLED', (i, a) => (A[a][i].ledger.byType.CARAVAN_RAIDED || 0) + (A[a][i].ledger.byType.TRADER_KILLED || 0)],
    ['인구(끝)', (i, a) => T[a][i].base.pop],
    ['사람·일(날마다 인구 합)', (i, a) => A[a][i].scale.personDays],
    ['사건 ÷ 마을·일(= 1/㉮)', (i, a) => A[a][i].ledger.emitted / (T[a][i].live * T[a][i].days)],
    ['사건 ÷ 사람·일(×1000)', (i, a) => A[a][i].ledger.emitted / A[a][i].scale.personDays * 1000],
    ['㉮ 마을 눈금(마을·일 ÷ 사건)', (i, a) => dens(T[a][i])],
    ['㉮′ 사람 눈금(인구를 끔에 맞춰 편 밀도 = ㉮ × 켬 사람·일 ÷ 끔 사람·일)', (i, a) => dens(T[a][i]) * (A[a][i].scale.personDays / A.off[i].scale.personDays)],
  ];
  P('## ② 인과 — 캐러밴 ×3 이 무엇을 늘려 밀도가 내려갔나(끔 → T474 만 · 3시드 · T252)');
  P('');
  P('| 고리 | 끔 평균 | 켬 평균 | 짝 Δ% | 가름 |'); P('|---|---:|---:|---:|---|');
  for (const [k, fn] of R) {
    const a0 = SEEDS.map((_, i) => fn(i, 'off')), a1 = SEEDS.map((_, i) => fn(i, 'walk'));
    const ds = SEEDS.map((_, i) => (a0[i] ? (a1[i] - a0[i]) / Math.abs(a0[i]) * 100 : (a1[i] === a0[i] ? 0 : Infinity)));
    const V = verdict(ds.filter(isFinite).length === ds.length ? ds : [0]);
    const fmt = (x) => (Math.abs(x) < 10 && !Number.isInteger(x) ? x.toFixed(4) : f1(x));
    P(`| ${k} | ${fmt(mean(a0))} | ${fmt(mean(a1))} | ${ds.every(isFinite) ? pc(mean(ds)) : '—'} | ${ds.every(isFinite) ? V.v : '—'} |`);
  }
  P('');
}

// ── ③ 소문 분리 팔 — T489 만 · 둘 다(시속 비 · 하루 비) ──────────────────────────
const EIGHT = [['인구', (t) => t.base.pop], ['소멸', (t) => t.base.dead], ['무기Q', (t) => t.base.weapQ], ['확장셀', (t) => t.base.expand],
  ['게시', (t) => t.board.reqOpened], ['도구Q', (t) => t.tool.q], ['보존식', (t) => t.preserve.stock], ['생곡', (t) => t.eight.grain], ['㉮', (t) => dens(t)]];
for (const a of ['split', 'both', 'bothday']) {
  if (!have(a) || !have('off')) continue;
  P(`## ③ ${NAME[a]} — 끔과 짝 Δ(3시드 · T252) · 캐러밴 시계 ${f1(A[a][0].clocks.caravan)} · 소문 시계(코드) ${f1(A[a][0].clocks.rumorCode)}`);
  P('');
  P(`| 수 | 끔 ${SEEDS.join(' · ')} | 켬 ${SEEDS.join(' · ')} | 짝 Δ% | 평균 | 폭 | T252 |`); P('|---|---|---|---|---:|---:|---|');
  for (const [k, fn] of EIGHT) {
    const a0 = T.off.map(fn), a1 = T[a].map(fn);
    if (k === '소멸') { P(`| 소멸 | ${a0.join(' · ')} | ${a1.join(' · ')} | | | | ${a1.some((x) => x > 0) ? '유의' : '0 = 0'} |`); continue; }
    const ds = SEEDS.map((_, i) => (a1[i] - a0[i]) / Math.abs(a0[i]) * 100), V = verdict(ds);
    P(`| ${k} | ${a0.map(f1).join(' · ')} | ${a1.map(f1).join(' · ')} | ${ds.map(pc).join(' · ')} | ${pc(V.m)} | ${V.w.toFixed(1)} | ${V.v} |`);
  }
  const rc = (x) => x.rumorCode;
  P(`| 소문 평균 지연(코드 · 일) | ${A.off.map((x) => rc(x).meanDelay).join(' · ')} | ${A[a].map((x) => rc(x).meanDelay).join(' · ')} | | | | |`);
  P(`| 소문 (사건×마을) 도달일 p10·p50·p90·최대 | ${A.off.map((x) => `${rc(x).delay.p10}·${rc(x).delay.p50}·${rc(x).delay.p90}·${rc(x).delay.max}`).join(' / ')} | ${A[a].map((x) => `${rc(x).delay.p10}·${rc(x).delay.p50}·${rc(x).delay.p90}·${rc(x).delay.max}`).join(' / ')} | | | | |`);
  P(`| 소문 7일 안 닿는 몫(쌍) | ${A.off.map((x) => rc(x).delay.within7).join(' · ')} | ${A[a].map((x) => rc(x).delay.within7).join(' · ')} | | | | |`);
  P(`| 사건이 전 마을에 닿는 날(p50) | ${A.off.map((x) => rc(x).fullReach.p50).join(' · ')} | ${A[a].map((x) => rc(x).fullReach.p50).join(' · ')} | | | | |`);
  P('');
}

// ── ④ 켜기 조건 표 ───────────────────────────────────────────────────────────
P('## ④ 켜기 조건 표 — {끔 · T474 만 · T489 만 · 둘 다} × {㉮ · 인구 · 게시 · 소멸 · 소문 전파일} · 캐논 ㉮ 2~3');
P('');
P('| 조합 | 캐러밴 시계(econ/일) | 소문 시계(코드) | ㉮ 3시드 | 인구 Δ%(T252) | 게시 Δ%(T252) | 소멸 | 소문 평균 지연(일) · 전 마을 p50 | 캐논 2~3 |');
P('|---|---:|---:|---|---|---|---|---|---|');
const best = [];
for (const a of ARMS) {
  if (!have(a)) continue;
  const d = T[a].map(dens), pop = T[a].map((t) => t.base.pop), req = T[a].map((t) => t.board.reqOpened), dead = T[a].map((t) => t.base.dead);
  const dv = (x0, x1) => { const ds = SEEDS.map((_, i) => (x1[i] - x0[i]) / Math.abs(x0[i]) * 100); const V = verdict(ds); return `${pc(V.m)} ${V.v}`; };
  const inCanon = d.every((x) => x >= 2 && x <= 3);
  const gap = mean(d.map((x) => (x < 2 ? 2 - x : x > 3 ? x - 3 : 0)));
  best.push({ a, gap, mean: mean(d) });
  P(`| ${NAME[a]} | ${f1(A[a][0].clocks.caravan)} | ${f1(A[a][0].clocks.rumorCode)} | ${d.map((x) => x.toFixed(2)).join(' · ')} | ${a === 'off' ? '—' : dv(T.off.map((t) => t.base.pop), pop)} | ${a === 'off' ? '—' : dv(T.off.map((t) => t.board.reqOpened), req)} | ${dead.join('·')} | ${mean(A[a].map((x) => x.rumorCode.meanDelay)).toFixed(2)} · ${A[a].map((x) => x.rumorCode.fullReach.p50).join('·')} | ${inCanon ? '○' : '✗(하한 ' + gap.toFixed(2) + ' 밑)'} |`);
}
P('');
const ok = best.filter((b) => b.gap === 0);
best.sort((x, y) => x.gap - y.gap);
P(ok.length ? `캐논 안 조합: ${ok.map((b) => NAME[b.a]).join(' · ')}` : `**캐논 안 조합: 없다.** 가장 가까운 조합 = ${best.map((b) => `${NAME[b.a]}(㉮ ${b.mean.toFixed(2)} · 하한까지 ${b.gap.toFixed(2)})`).join(' < ')}`);
console.log(out.join('\n'));
