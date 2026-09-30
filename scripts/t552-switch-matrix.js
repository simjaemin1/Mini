#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T552 자)
// =============================================================================
// T552 — 켬 후보 셋의 판정 입력 표 — `T530_TRADE_ARMS` · `T525_CROSS_ZONE` · `T374_DEMAND_STOP`
//   홀로 · 둘씩 · 셋 다 × 3시드 800일(`t17-metrics`) + 1020 `t176-ab` 두 자 차. **판정 0 · 새 수 0 · 제품 0**(표만).
//
//   판 JSON(판 도는 쪽은 셸 한 줄 — 보고 §0):
//     T525 가 없는 판 = `T17_ZONE=hanbando node scripts/t17-metrics.js 800 <씨>` 의 `T17_JSON`
//     T525 가 든 판   = `node scripts/t525-cross-zone.js two hanbando nippon 800 <씨> --out …`(= `T17_ZONE=hanbando+nippon` t17) — **한반도 열만** 견준다(`eight.hanbando`)
//     t176            = `ENABLE_VILLAGES=1 node scripts/t176-ab.js 800 1020` 의 `T17_JSON`(t17 과 같은 꼴 · T525 판은 없다 — t176 은 존 하나)
//   이름: `<팔>-<씨>.json` · 팔 = off · c525 · b374 · a530 · norm(`T484_T17_NORMALS`) · paleo(`T484_PALEO`) · all(셋) · clim(기후 둘) · five(다섯 다)
//         · (덧 · 첫 카드) a530b374 · a530c525 · b374c525 — T525 가 든 판(all · five 포함)은 두 존 판
//   칼날 위 · 바닥 마을(ⓚ/ⓛ 문법) = 그 판 t17 로그의 한 줄(`⇒ **칼날 위 n곳 / 바닥 마을 m곳**`)을 읽는다(`<로그 dir>/<팔>-<씨>.hanbando.t17.log`).
//
// 쓰는 법: node scripts/t552-switch-matrix.js <판 dir> <로그 dir> [md]
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const [DIR, LOGD, MD] = process.argv.slice(2);
if (!DIR || !LOGD) { console.error('쓰는 법: node scripts/t552-switch-matrix.js <판 dir> <로그 dir> [md]'); process.exit(2); }
const md = MD === 'md';
const SEEDS = [1020, 7, 42];
//   ★[T552 추신] 팔 다섯 — 경계(T525) · 수요(T374) · 무기(T530 — 도구 다리를 뺀 판은 팔 안에 없다 ⇒ 그대로) · 평년값(T484 한반도 · 자 팔 `T484_T17_NORMALS`) · 고기후(`T484_PALEO`)
//     판 = 끔 · 홀로 다섯 · 셋(경계·수요·무기) · 기후 둘 · 다섯 다 = 9판 · 겹침은 셋끼리 · 기후 둘끼리(+ 다섯 = 셋 + 둘) · 둘씩 판(첫 카드)은 덧표로.
const ARMS = [['off', '끔', []], ['c525', 'T525 경계', ['c525']], ['b374', 'T374 수요', ['b374']], ['a530', 'T530 무기', ['a530']],
  ['norm', '평년값', ['norm']], ['paleo', 'PALEO', ['paleo']],
  ['all', '셋(경계·수요·무기)', ['a530', 'b374', 'c525']], ['clim', '기후 둘', ['norm', 'paleo']], ['five', '다섯 다', ['a530', 'b374', 'c525', 'norm', 'paleo']],
  ['a530b374', '(덧) T530+T374', ['a530', 'b374']], ['a530c525', '(덧) T530+T525', ['a530', 'c525']], ['b374c525', '(덧) T374+T525', ['b374', 'c525']]];
const OVER = [['all', ['c525', 'b374', 'a530']], ['clim', ['norm', 'paleo']], ['five', ['all', 'clim']],
  ['a530b374', ['a530', 'b374']], ['a530c525', ['a530', 'c525']], ['b374c525', ['b374', 'c525']]];
const KEYS = [['pop', '인구', (e) => e.base.pop], ['weapQ', '무기Q', (e) => e.base.weapQ], ['expand', '확장셀', (e) => e.base.expand],
  ['board', '게시', (e) => e.board.reqOpened], ['toolQ', '도구Q', (e) => e.tool.q], ['preserve', '보존식', (e) => e.preserve.stock], ['grain', '생곡', (e) => e.eight && e.eight.grain]];
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const hanOf = (j) => (j ? (j.eight && j.eight.hanbando ? j.eight.hanbando : (j.base ? j : null)) : null);   // 두 존 판 → 한반도 열
const raw = (f) => { try { return fs.readFileSync(f); } catch (e) { return null; } };
function edge(arm, sd) {
  let t = ''; try { t = fs.readFileSync(path.join(LOGD, `${arm}-${sd}.hanbando.t17.log`), 'utf8'); } catch (e) { return null; }
  const m = t.match(/칼날 위 (\d+)곳 \/ 바닥 마을 (\d+)곳/); return m ? { edge: +m[1], floor: +m[2] } : null;
}
const E = {};
for (const [a] of ARMS) for (const sd of SEEDS) E[`${a}-${sd}`] = hanOf(read(path.join(DIR, `${a}-${sd}.json`)));
const L = [];
const row = (c) => (md ? '| ' + c.join(' | ') + ' |' : c.join('\t'));
const hdr = (c) => (md ? [row(c), row(c.map(() => '---'))] : [row(c)]);
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : (+x).toFixed(1)));
const sg = (p) => (p == null || !isFinite(p) ? '—' : (p >= 0 ? '+' : '') + p.toFixed(1) + '%');
const val = (e, k) => { const K = KEYS.find((x) => x[0] === k); return e ? +K[2](e) : null; };
const pct = (x, b) => (x == null || !b ? null : (x / b - 1) * 100);

// ── 자기검사 — 끔 3시드 = 넷째 판-c · 두 존 판 끔 팔은 T534 가 이미 바이트 같다고 보였다 ───────
L.push('## 자기검사');
const offPop = SEEDS.map((sd) => E[`off-${sd}`] && `${E[`off-${sd}`].base.pop} · ${E[`off-${sd}`].base.dead}/${E[`off-${sd}`].base.ever}`);
L.push(`  끔 3시드 한반도 = ${offPop.join(' / ')}(넷째 판-c 7997 · 8015 · 7863 · 0/51)`);
//   T374 가 든 판 = 안 든 짝과 JSON 바이트 같은가(t17 · 두 존)
const twins = [['b374', 'off'], ['a530b374', 'a530'], ['b374c525', 'c525'], ['all', 'a530c525'], ['norm', 'off'], ['paleo', 'off'], ['clim', 'off']];
for (const [x, y] of twins) {
  const r = SEEDS.map((sd) => { const A = raw(path.join(DIR, `${x}-${sd}.json`)), B = raw(path.join(DIR, `${y}-${sd}.json`));
    if (!A || !B) return '—'; if (A.equals(B)) return '바이트 같다';
    const a = hanOf(JSON.parse(A)), b = hanOf(JSON.parse(B)); return JSON.stringify(a) === JSON.stringify(b) ? '한반도 열 같다' : '다르다'; });
  L.push(`  ${x} ↔ ${y}: ${r.join(' · ')}`);
}

// ── ① 여덟 수 표 — 한반도 열 · 3시드 · 끔 대비 % ─────────────────────────────────────
L.push('', '## ① 판 × 3시드 — 한반도 열(T525 판은 두 존 판의 한반도) · 끔 대비 %');
L.push(...hdr(['판', '씨', '인구', '소멸', ...KEYS.slice(1).map((k) => k[1])]));
for (const [a, nm] of ARMS) for (const sd of SEEDS) {
  const e = E[`${a}-${sd}`], o = E[`off-${sd}`]; if (!e) { L.push(row([nm, sd, '(판 없음)'])); continue; }
  if (a === 'off') L.push(row([nm, sd, e.base.pop, `${e.base.dead}/${e.base.ever}`, ...KEYS.slice(1).map(([k]) => f1(val(e, k)))]));
  else L.push(row([nm, sd, `${e.base.pop} (${sg(pct(e.base.pop, o && o.base.pop))})`, `${e.base.dead}/${e.base.ever}`, ...KEYS.slice(1).map(([k]) => sg(pct(val(e, k), val(o, k))))]));
}
//   3시드 평균 Δ%
L.push('', '### 3시드 평균 Δ%(끔 대비)');
L.push(...hdr(['판', ...KEYS.map((k) => k[1])]));
const MEAN = {};
for (const [a, nm] of ARMS) { if (a === 'off') continue;
  const m = {}; for (const [k] of KEYS) { const xs = SEEDS.map((sd) => pct(val(E[`${a}-${sd}`], k), val(E[`off-${sd}`], k))).filter((x) => x != null); m[k] = xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : null; }
  MEAN[a] = m; L.push(row([nm, ...KEYS.map(([k]) => sg(m[k]))])); }

// ── ② 겹침 — 더하기인가: 둘(셋) 켠 Δ ↔ 홀로 Δ 의 합 · 어긋남 = 교호항 ─────────────────
//   교호항 I = Δ(겹) − ΣΔ(홀로) (끔 대비 %p) · **어긋남 표시** = |I| 가 홀로 Δ 가운데 큰 것의 절반보다 크고 2%p 를 넘거나, 겹 Δ 와 홀로 합의 부호가 반대(2%p 넘을 때)
//   (문턱은 표를 읽는 눈금일 뿐 — 판정 0 · T534 가 보인 씨 안 폭 7~36%p 를 같이 읽어라)
L.push('', '## ② 겹침 — Δ(겹) ↔ ΣΔ(홀로) · 교호항 I(%p) · ✗ = 어긋남(|I| > ½·max|홀로| 이고 > 2%p · 또는 부호 반대) · 셋끼리 · 기후 둘끼리 · 다섯 = 셋 + 둘 · (덧) 둘씩');
L.push(...hdr(['겹', '씨', ...KEYS.map((k) => k[1])]));
let bad = 0, cells = 0; const badList = [];
for (const [a, parts] of OVER) { const nm = (ARMS.find((x) => x[0] === a) || [a, a])[1] + ' ↔ ' + parts.map((p) => (ARMS.find((x) => x[0] === p) || [p, p])[1]).join(' + ');
  for (const sd of SEEDS) { const o = E[`off-${sd}`], x = E[`${a}-${sd}`]; if (!o || !x) continue;
    const c = KEYS.map(([k]) => {
      const d = pct(val(x, k), val(o, k)); const ds = parts.map((p) => pct(val(E[`${p}-${sd}`], k), val(o, k)));
      if (d == null || ds.some((y) => y == null)) return '—';
      const s = ds.reduce((p, q) => p + q, 0), I = d - s, mx = Math.max(...ds.map(Math.abs));
      const off = (Math.abs(I) > 0.5 * mx && Math.abs(I) > 2) || (Math.sign(d) !== Math.sign(s) && Math.abs(d - s) > 2 && Math.abs(d) > 1 && Math.abs(s) > 1);
      cells++; if (off) { bad++; badList.push(`${nm}§${sd}§${KEYS.find((q) => q[0] === k)[1]}`); }
      return `${sg(d)} ↔ ${sg(s)} (I ${I >= 0 ? '+' : ''}${I.toFixed(1)})${off ? ' ✗' : ''}`;
    });
    L.push(row([nm, sd, ...c])); } }
L.push('', `  어긋남 ${bad} / ${cells} 칸`);
const byPair = {}; for (const b of badList) { const p = b.split('§')[0]; byPair[p] = (byPair[p] || 0) + 1; }
L.push(`  겹마다(21칸 중): ${Object.entries(byPair).map(([p, n]) => `${p.split(' ↔ ')[0]} ${n}`).join(' / ') || '없음'}`);

// ── ③ 소멸 · 칼날 위 · 바닥 마을(ⓚ·ⓛ 문법 — 판 로그) ───────────────────────────────
L.push('', '## ③ 소멸 · 칼날 위 · 바닥 마을(한반도 · 판 t17 로그의 ⓛ 한 줄)');
L.push(...hdr(['판', ...SEEDS.map((sd) => `${sd} 소멸 · 칼날 · 바닥`)]));
for (const [a, nm] of ARMS) L.push(row([nm, ...SEEDS.map((sd) => { const e = E[`${a}-${sd}`], g = edge(a, sd);
  return e ? `${e.base.dead}/${e.base.ever} · ${g ? g.edge : '—'} · ${g ? g.floor : '—'}` : '—'; })]));

// ── ④ 다섯째 판 후보 한 줄 · t176 두 자 차 ───────────────────────────────────────────
L.push('', '## ④ 다섯 다 켠 3시드(한반도) — 다섯째 판 기준선 후보 한 줄(★PM 이 세운다 · 재민 거부권)');
const all = SEEDS.map((sd) => E[`five-${sd}`]);
if (all.every(Boolean)) {
  L.push(`  인구 ${all.map((e) => e.base.pop).join(' / ')} · 소멸 ${all.map((e) => `${e.base.dead}/${e.base.ever}`).join(' · ')} · 무기Q ${all.map((e) => e.base.weapQ).join(' / ')} · 확장셀 ${all.map((e) => e.base.expand).join(' / ')} · 게시 ${all.map((e) => e.board.reqOpened).join(' / ')} · 도구Q ${all.map((e) => f1(e.tool.q)).join(' / ')} · 보존식 ${all.map((e) => f1(e.preserve.stock)).join(' / ')} · 생곡 ${all.map((e) => f1(e.eight.grain)).join(' / ')}`);
}
L.push('', '## t176 두 자 차 — 1020 · T525 가 없는 판(t176 은 존 하나)');
L.push(...hdr(['판', '자', '인구', '소멸', ...KEYS.slice(1).map((k) => k[1]), 't17 ↔ t176']));
for (const [a, nm] of ARMS) { if (a.includes('525')) continue;
  const t = E[`${a}-1020`], u = hanOf(read(path.join(DIR, `t176j-${a}-1020.json`))); if (!u) continue;   // t176 판이 있는 팔만
  for (const [who, e] of [['t17', t], ['t176', u]]) if (e) L.push(row([nm, who, e.base.pop, `${e.base.dead}/${e.base.ever}`, ...KEYS.slice(1).map(([k]) => f1(val(e, k))),
    who === 't176' && t ? (KEYS.every(([k]) => Math.abs((val(e, k) || 0) - (val(t, k) || 0)) < 0.05) ? '같다' : '다르다') : '']));
}
const text = L.join('\n');
console.log(text);
try { fs.writeFileSync(path.join(DIR, md ? 't552-table.md' : 't552-table.txt'), text); } catch (e) {}
