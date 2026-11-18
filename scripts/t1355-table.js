'use strict';
// (@regress 없음 — 러너 밖 · T1355 표 자 · 읽기만)
// === scripts/t1355-table.js — T1355 표: 남는 시간 요리 문 가름 · 로트 건강이 가는 길 · 건강 몫 · 랩 해마다 칸 · 마을별 최악 칸 · 행복 몫 · 곳간 몫 · T1205 부담 칸 ==========
//   쓰는 법: R=<랩 판 폴더> RS=<서버 판 폴더> [R60=<T1360 랩 판 폴더>] node scripts/t1355-table.js
//     랩 판 = R/<팔>-<시드>/{farm.json, probe.json}(`t1355-lab-probe.js`) · R/S<팔>[2]-1020/split.json(`t1355-happy-split.js`) ·
//     R/B<팔>-1020/burden.json(`t1355-happy-burden.js`) · 서버 판 = RS/<이름>-<시드>.obs.json(`t1355-observe.js`)
//     R60 = T1360 랩 50판 풀어 둔 곳(`계측/T1360_2026-11-17/runs.tgz`) — 끝 날 마을별 최악 칸을 열 시드로
//   칸 · 셈은 다 판 JSON 에서(손 셈 0) · 가운데 · 같은 방향(가운데 부호와 같은 시드 수)
const fs = require('fs'), path = require('path');
const R = process.env.R || '/root/t1355runs/lab', RS = process.env.RS || '/root/t1355runs', R60 = process.env.R60 || '';
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((p, q) => p - q); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a / b - 1) * 100 : null);
const f1 = (x) => (x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%');
const f3 = (x) => (x == null ? '—' : (+x).toFixed(3));
const same = (xs) => { const m = med(xs); if (m == null) return '—'; const s = Math.sign(m); return `${xs.filter((x) => Number.isFinite(x) && Math.sign(x) === s).length}/${xs.length}`; };
const SEEDS = [1020, 7, 42];
const ARMS = ['OFF', 'ALL', 'XM', 'XH'];
const NAME = { OFF: '끔(바탕 B)', ALL: '셋 켬', XM: 'MOVE 없이 둘(HEALTH + DIV)', XH: 'MOVE 만' };

// ── 1. 남는 시간 요리 문(서버 G 판) ─────────────────────────────────────────────
console.log('# T1355 표\n');
console.log('## 1. 남는 시간 요리 — 마을-날 가름(서버 몸 판 · `t1355-observe.js` · 가름 = 그날 econ 이 적은 칸)\n');
console.log('가름: 남는 손 없음(그날 포만으로 깎인 몫 0 — 문을 안 셈) · 문 닫힘(곳간 합 < 사람×35 또는 식량 < 사람×8 — 정원 요리사와 같은 식량 안보 문) · 재료 없음(문 열림 · 식량도 곡식 한 단도 모자람) · 요리함\n');
for (const nm of fs.readdirSync(RS).filter((f) => /^G[A-Z-]*-\d+\.obs\.json$/.test(f)).sort()) {
  const o = rd(path.join(RS, nm)); if (!o || !o.days) continue;
  const W = 10, rows = [];
  for (let a = 0; a < o.days.length; a += W) {
    const ds = o.days.slice(a, a + W), c = [0, 0, 0, 0]; let vd = 0, fam = 0, g35 = 0, tag = 0;
    for (const d of ds) { for (let i = 0; i < 4; i++) c[i] += d.c[i]; vd += d.vd; fam += d.famine; g35 += d.gate35; tag += d.tag; }
    rows.push(`| ${ds[0].day} ~ ${ds[ds.length - 1].day} | ${vd} | ${c[0]} | ${c[1]} | ${c[2]} | **${c[3]}** | ${fam} | ${g35} | ${tag} |`);
  }
  const stop = []; let run = null;
  for (const d of o.days) { if (d.c[3] === 0) { if (!run) run = [d.day, d.day]; else run[1] = d.day; } else if (run) { stop.push(run); run = null; } }
  if (run) stop.push(run);
  console.log(`### ${nm.replace('.obs.json', '')} — 손잡이 ${JSON.stringify(o.knobs)}\n`);
  console.log(`요리 0 인 날 줄기(첫 ~ 끝): ${stop.filter((s) => s[1] - s[0] >= 2).map((s) => `${s[0]} ~ ${s[1]}`).join(' · ') || '없음'}\n`);
  console.log('| 날 | 마을-날 | 남는 손 없음 | 문 닫힘 | 재료 없음 | **요리함** | 기근(< 30) | 곳간 ≥ 35 | 로트 적음 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) console.log(r);
  // 요리한 마을 — 멈추기 앞 마지막 요리 날 둘레의 곳간 ÷ 사람
  const V = o.vill || {}, cooks = Object.entries(V).filter(([, s]) => s.some((x) => x[3] === 3));
  const lastCook = Math.max(0, ...o.days.filter((d) => d.c[3] > 0 && d.day < (stop.find((s) => s[1] - s[0] >= 5) || [1e9])[0]).map((d) => d.day));
  if (cooks.length) {
    console.log(`\n요리한 마을 ${cooks.length} — 멈춤 앞 마지막 요리 날 ${lastCook} 둘레(날 · 곳간 합 ÷ 사람 · 가름 0 손 없음 · 1 문 닫힘 · 2 재료 없음 · 3 요리):\n`);
    console.log('| 마을 | 요리한 날 수 | ' + [-6, -3, 0, 3, 6, 10].map((k) => `날 ${lastCook + k}`).join(' | ') + ' |');
    console.log('|---|---:|' + [-6, -3, 0, 3, 6, 10].map(() => '---').join('|') + '|');
    for (const [n, s] of cooks.sort((p, q) => q[1].filter((x) => x[3] === 3).length - p[1].filter((x) => x[3] === 3).length).slice(0, 8)) {
      const at = (d) => { const x = s.find((y) => y[0] === d); return x ? `${x[2]} · ${x[3]}` : '—'; };
      console.log(`| ${n} | ${s.filter((x) => x[3] === 3).length} | ` + [-6, -3, 0, 3, 6, 10].map((k) => at(lastCook + k)).join(' | ') + ' |');
    }
  }
  console.log('');
}

// ── 2. 로트 건강이 가는 길(서버 C 판 · T1197 몸 끼니 켬) ──────────────────────────────
console.log('## 2. 로트 건강이 가는 길 — 끼니마다 나간 로트 건강 ↔ 그날 셈이 쓴 칸(서버 몸 판 · T1197 몸 끼니 켬)\n');
console.log('판 이름: CB = 시드 3(가상 시계 없음 — 벽시계가 판을 가른다) · CBV = 시드 1020 가상 시계(`--vclock` — 옛 · 고친 판이 첫 다름까지 같은 세계) · OLD = 옛 코드 `07b429e77` · NEW = 고친 코드 `cf37564fd`\n');
console.log('| 판 | 날 | 로트 적음(건강 > 0 번) | 로트 건강 — 몸 끼니 · 마을 틱 끼니 | 기대(몸 + 틱) | 그날 셈이 쓴 칸 | 빠진 몫 | 빠진 비 | 로트 단위 — 기대 · 쓴 |');
console.log('|---|---:|---:|---|---:|---:|---:|---:|---|');
for (const nm of fs.readdirSync(RS).filter((f) => /^CBV?-[A-Z]+-\d+\.obs\.json$/.test(f)).sort()) {
  const o = rd(path.join(RS, nm)); if (!o || !o.days) continue;
  const s = o.days.reduce((a, d) => { a.tag += d.tag; a.tagH += d.tagH; a.b += d.bodyH; a.t += d.tickH; a.e += d.expH; a.u += d.usedH; a.g += d.gapH; a.bu += d.bodyU; a.tu += d.tickU; a.uu += d.usedU; return a; }, { tag: 0, tagH: 0, b: 0, t: 0, e: 0, u: 0, g: 0, bu: 0, tu: 0, uu: 0 });
  console.log(`| ${nm.replace('.obs.json', '')} | ${o.days.length ? o.days[o.days.length - 1].day : 0} | ${s.tag}(${s.tagH}) | ${s.b.toFixed(2)} · ${s.t.toFixed(2)} | ${s.e.toFixed(2)} | ${s.u.toFixed(2)} | **${s.g.toFixed(2)}** | ${s.e > 0 ? (s.g / s.e * 100).toFixed(1) + '%' : '—'} | ${(s.bu + s.tu).toFixed(1)} · ${s.uu.toFixed(1)} |`);
}
console.log('');

// ── 3. 건강 몫(서버 G 판 · 5날마다) ────────────────────────────────────────────
console.log('## 3. 건강 몫 — 사람 가중(서버 몸 판 · 5날마다 · 그날 셈과 같은 입력)\n');
for (const nm of fs.readdirSync(RS).filter((f) => /\.obs\.json$/.test(f)).sort()) {
  const o = rd(path.join(RS, nm)); if (!o || !o.snaps || !o.snaps.length || !o.knobs.HEALTH) continue;
  const groups = [...new Set(o.snaps.flatMap((s) => Object.keys(s.eatGrp || {})))].sort();
  console.log(`### ${nm.replace('.obs.json', '')}\n`);
  console.log(`| 날 | 사람 | 건강 | 먹은 것 몫 | 다양성 몫 | 나머지 | ${groups.map((g) => `먹은 ${g}`).join(' | ')} | 분자 로트 몫 · 평균 칸 몫 | 다양성 군 | 행복 |`);
  console.log(`|---:|---:|---:|---:|---:|---:|${groups.map(() => '---:').join('|')}|---|---:|---:|`);
  for (const s of o.snaps.filter((x, i) => i % 3 === 0 || i === o.snaps.length - 1)) {
    const rest = s.health != null ? s.health - (s.eaten || 0) - (s.div || 0) : null;
    console.log(`| ${s.day} | ${s.pop} | ${f3(s.health)} | ${f3(s.eaten)} | ${f3(s.div)} | ${f3(rest)} | ${groups.map((g) => f3((s.eatGrp || {})[g])).join(' | ')} | ${f3(s.numLot)} · ${f3(s.numAvg)} | ${f3(s.fg)} | ${f3(s.happy)} |`);
  }
  console.log('');
}

// ── 4. 랩 해마다 칸(셋 시드 · 두 해 넘는 판) ──────────────────────────────────────
const L = {};
for (const a of ARMS) for (const s of SEEDS) { const d = path.join(R, `${a}-${s}`); const p = rd(path.join(d, 'probe.json')), f = rd(path.join(d, 'farm.json')); if (p && f) (L[a] || (L[a] = {}))[s] = { p, f }; }
const yr = (x, i) => (x && x.p.years[i]) || null, en = (x, i) => (x && x.p.ends[i]) || null;
console.log('## 4. 랩 해마다 칸 — 800날 판 셋 시드(1020 · 7 · 42) · 해 1 = 날 1 ~ 365 · 해 2 = 366 ~ 730 · 끝 = 731 ~ 800 · 칸 = 끔 대비 시드 짝 Δ% 가운데(같은 방향/3)\n');
console.log('| 팔 | 해 | 인구(해 끝) | 건강 | 다양성 | 행복 | 들여옴(그 해) | 기근 마을-날 |');
console.log('|---|---|---:|---:|---:|---:|---:|---:|');
for (const a of ARMS.slice(1).filter((x) => L[x])) for (let i = 0; i < 3; i++) {
  const col = (fn) => SEEDS.map((s) => pct(fn(L[a] && L[a][s], i), fn(L.OFF && L.OFF[s], i)));
  const popF = (x, j) => { const e = en(x, j); return e ? e.pop : null; };
  const impF = (x, j) => { const e = en(x, j), e0 = j > 0 ? en(x, j - 1) : null; return e ? e.imp - (e0 ? e0.imp : 0) : null; };
  const yF = (k) => (x, j) => { const y = yr(x, j); return y ? y[k] : null; };
  const cells = [col(popF), col(yF('health')), col(yF('fg')), col(yF('happy')), col(impF), col(yF('famine'))];
  console.log(`| ${NAME[a]} | ${['해 1', '해 2', '끝 70날'][i]} | ${cells.map((c) => `${f1(med(c))} (${same(c)})`).join(' | ')} |`);
}
console.log('\n끔(바탕) 절대값 — 셋 시드 합 · 평균:\n');
console.log('| 해 | 인구 합 | 건강 | 다양성 | 행복 | 들여옴 합 | 기근 합 |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
for (let i = 0; i < 3; i++) {
  const xs = SEEDS.map((s) => L.OFF && L.OFF[s]).filter(Boolean); if (!xs.length) break;
  const m = (k) => xs.reduce((t, x) => t + (yr(x, i) ? yr(x, i)[k] : 0), 0) / xs.length;
  console.log(`| ${['해 1', '해 2', '끝 70날'][i]} | ${xs.reduce((t, x) => t + (en(x, i) ? en(x, i).pop : 0), 0)} | ${f3(m('health'))} | ${f3(m('fg'))} | ${f3(m('happy'))} | ${xs.reduce((t, x) => t + ((en(x, i) ? en(x, i).imp : 0) - (i > 0 && en(x, i - 1) ? en(x, i - 1).imp : 0)), 0).toFixed(0)} | ${xs.reduce((t, x) => t + (yr(x, i) ? yr(x, i).famine : 0), 0)} |`);
}
console.log('');

// ── 5. 마을별 최악 칸 ────────────────────────────────────────────────────────────
console.log('## 5. 마을별 최악 칸 — 끔 대비 같은 마을(이름)의 비 · 평균 아님\n');
console.log('칸: 사람 비 가장 낮은 마을(끔 사람 ≥ 10) · 끔엔 사는데 켬엔 빈 마을 수(+) · 끔엔 빈데 켬엔 사는 마을 수(−) · 행복 차 · 건강 차 가장 낮은 마을(두 판 다 사람 ≥ 10 · 끔 → 켬) · 사람 비 < 0.8 인 마을 수\n');
console.log('| 팔 | 시드 | 날 | 사람 비 최저(마을) | 빈 마을 +/− | 행복 차 최저(마을) | 건강 차 최저(마을) | 사람 비 < 0.8 |');
console.log('|---|---:|---:|---|---:|---|---|---:|');
const worst = (Pa, Po) => {   // Pa · Po = [[이름, 사람, 행복, 건강, …]]
  const mo = new Map(Po.map((x) => [x[0], x])); let r = null, h = null, g = null, die = 0, rise = 0, low = 0;
  for (const x of Pa) {
    const y = mo.get(x[0]); if (!y) continue;
    if (y[1] > 0 && x[1] === 0) die++; if (y[1] === 0 && x[1] > 0) rise++;
    if (y[1] >= 10) { const q = x[1] / y[1]; if (!r || q < r[1]) r = [x[0], q, y[1], x[1]]; if (q < 0.8) low++; }
    if (x[1] >= 10 && y[1] >= 10 && x[2] != null && y[2] != null) { const d = x[2] - y[2]; if (!h || d < h[1]) h = [x[0], d, y[2], x[2]]; }   // 행복 · 건강 차는 두 판 다 사람 ≥ 10 인 마을만(작은 마을의 튐을 거른다)
    if (x[1] >= 10 && y[1] >= 10 && x[3] != null && y[3] != null) { const d = x[3] - y[3]; if (!g || d < g[1]) g = [x[0], d, y[3], x[3]]; }
  }
  return { r, h, g, die, rise, low };
};
for (const a of ARMS.slice(1)) for (const s of SEEDS) for (const i of [1, 2]) {
  const ea = en(L[a] && L[a][s], i), eo = en(L.OFF && L.OFF[s], i); if (!ea || !eo) continue;
  const w = worst(ea.per, eo.per);
  console.log(`| ${NAME[a]} | ${s} | ${ea.day} | ${w.r ? `${w.r[1].toFixed(2)}(${w.r[0]} ${w.r[2]} → ${w.r[3]})` : '—'} | +${w.die} / −${w.rise} | ${w.h ? `${w.h[1].toFixed(3)}(${w.h[0]} ${w.h[2]} → ${w.h[3]})` : '—'} | ${w.g ? `${w.g[1].toFixed(3)}(${w.g[0]} ${w.g[2]} → ${w.g[3]})` : '—'} | ${w.low} |`);
}
if (R60 && fs.existsSync(R60)) {
  console.log('\n열 시드 800날(T1360 판 `farm.json` 의 `per` — 사람 = 끝 날 · 행복 · 건강 = 판 전체 사람-날 가중 평균 `lsHappy` · `lsHealth`(t176-ab 가 낸 값 — 하루 값의 튐을 거른다) · 행복이 0.2 넘게 준 마을 수):\n');
  console.log('| 팔 | 시드 | 사람 비 최저(마을) | 빈 마을 +/− | 행복 차 최저(마을 · 판 평균) | 건강 차 최저(마을 · 판 평균) | 사람 비 < 0.8 | 행복 −0.2 넘게 준 마을 |');
  console.log('|---|---:|---|---:|---|---|---:|---:|');
  const S10 = [1020, 7, 42, 1, 2, 3, 4, 5, 6, 8];
  const tot = {};
  for (const a of ['ALL', 'XM']) for (const s of S10) {
    const fa = rd(path.join(R60, `${a}-${s}`, 'farm.json')), fo = rd(path.join(R60, `OFF-${s}`, 'farm.json')); if (!fa || !fo) continue;
    const av = (x, k) => (x.lsW > 0 && x[k] != null ? +(+x[k]).toFixed(3) : null);   // `per` 의 ls* 는 이미 사람-날 가중 평균(t176-ab `lsHappy = lsHap ÷ lsW`)
    const P = (f) => f.per.map((x) => [x.name, x.N, av(x, 'lsHappy'), av(x, 'lsHealth')]);
    const pa = P(fa), po = new Map(P(fo).map((x) => [x[0], x]));
    const w = worst(pa, P(fo));
    const hd = pa.filter((x) => { const y = po.get(x[0]); return y && x[1] >= 10 && y[1] >= 10 && x[2] != null && y[2] != null && x[2] - y[2] < -0.2; }).length;
    const T = tot[a] || (tot[a] = { die: 0, rise: 0, low: 0, hd: 0, n: 0 }); T.die += w.die; T.rise += w.rise; T.low += w.low; T.hd += hd; T.n++;
    console.log(`| ${NAME[a]} | ${s} | ${w.r ? `${w.r[1].toFixed(2)}(${w.r[0]} ${w.r[2]} → ${w.r[3]})` : '—'} | +${w.die} / −${w.rise} | ${w.h ? `${w.h[1].toFixed(3)}(${w.h[0]} ${w.h[2]} → ${w.h[3]})` : '—'} | ${w.g ? `${w.g[1].toFixed(3)}(${w.g[0]} ${w.g[2]} → ${w.g[3]})` : '—'} | ${w.low} | ${hd} |`);
  }
  for (const [a, T] of Object.entries(tot)) console.log(`\n* ${NAME[a]} 열 시드 합: 끔엔 사는데 켬엔 빈 마을 ${T.die} · 거꾸로 ${T.rise} · 사람 비 < 0.8 마을 ${T.low} · 판 평균 행복이 0.2 넘게 준 마을 ${T.hd}(마을-시드 ${T.n} × 51 가운데)`);
}
console.log('');

// ── 6. 행복 몫 가르기 ────────────────────────────────────────────────────────────
console.log('## 6. 행복 몫(셋 시드 평균 · 사람-날 가중) — 마을 행복 h(`lastStats.happiness`)에서 좋은 것 G 안의 다양성 몫 · 여가 몫을 뗀 "나머지"(G 의 곳간 · 옷 · 사치품 + G 밖의 T1205 인구 부담 · 겪은 일 · 천천히 따라감 — §8 이 가른다)\n');
console.log('| 팔 | 해 | 행복 | 다양성 몫 | 여가 몫 | 나머지 | 끔 대비 행복 차 = 다양성 + 여가 + 나머지 |');
console.log('|---|---|---:|---:|---:|---:|---|');
for (const a of ARMS) for (let i = 0; i < 3; i++) {
  const xs = SEEDS.map((s) => L[a] && L[a][s]).filter(Boolean), xo = SEEDS.map((s) => L.OFF && L.OFF[s]).filter(Boolean); if (!xs.length) continue;
  const m = (X, k) => X.reduce((t, x) => t + (yr(x, i) ? yr(x, i)[k] : 0), 0) / X.length;
  const d = (k) => m(xs, k) - m(xo, k);
  console.log(`| ${NAME[a]} | ${['해 1', '해 2', '끝 70날'][i]} | ${f3(m(xs, 'happy'))} | ${f3(m(xs, 'hDiv'))} | ${f3(m(xs, 'hLei'))} | ${f3(m(xs, 'hRest'))} | ${a === 'OFF' ? '—' : `${d('happy').toFixed(3)} = ${d('hDiv').toFixed(3)} + ${d('hLei').toFixed(3)} + ${d('hRest').toFixed(3)}`} |`);
}
console.log('\n같은 자 확인 — 이 판 끝 날 인구 ↔ T1360 판(같은 팔 · 같은 시드 · `farm.json` `pop`):\n');
if (R60 && fs.existsSync(R60)) for (const a of ARMS) for (const s of SEEDS) { const f = L[a] && L[a][s] && L[a][s].f, g = rd(path.join(R60, `${a}-${s}`, 'farm.json')); if (f && g) console.log(`* ${a}-${s}: ${f.pop} ↔ ${g.pop} ${f.pop === g.pop ? '같음' : '다름'}`); }

// ── 7. 행복 곳간 몫 — 식량 품목 · 식량 아닌 품목(곁 `t1355-happy-split.js` · 시드 1020) ──────────────
{
  const runs = [];
  for (const d of fs.readdirSync(R).filter((x) => /^S[A-Z]+2?-\d+$/.test(x)).sort()) { const o = rd(path.join(R, d, 'split.json')); if (o && o.snaps && o.snaps.length) runs.push([d, o]); }
  if (runs.length) {
    console.log('\n## 7. 행복 곳간 몫 — 곳간 몫 = 그대로 행복 − 그 묶음을 뺀 곳간의 행복(정본 `_computeVillageStats` · 프로토타입 겹 · 사람 가중)\n');
    console.log('표본 30날마다 판(`*2`)은 해 안 표본 평균(사람 가중) · 해 끝 날만 판은 그 날 하루 값(해 안 철마다 오르내려 해 평균과 다르다).\n');
    console.log('| 판 | 해(표본 수) | 사람(표본 평균) | 행복 | 식량 품목 곳간 몫 | 식량 아닌 품목 곳간 몫 | 식량 품목 큰 것 | 식량 아닌 품목 큰 것 |');
    console.log('|---|---|---:|---:|---:|---:|---|---|');
    for (const [d, o] of runs) {
      const many = o.snaps.length > 4;
      const groups = many ? [[1, 365], [366, 730], [731, 1e9]] : o.snaps.map((x) => [x.day, x.day]);
      for (const [a, b] of groups) {
        const xs = o.snaps.filter((x) => x.day >= a && x.day <= b); if (!xs.length) continue;
        const W = xs.reduce((t, x) => t + x.pop, 0), m = (k) => xs.reduce((t, x) => t + (x[k] || 0) * x.pop, 0) / W;
        const top = (k) => { const acc = {}; for (const x of xs) for (const [id, v] of (x[k] || [])) acc[id] = (acc[id] || 0) + v * x.pop; return Object.entries(acc).map(([id, v]) => [id, v / W]).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, 5).map(([id, v]) => `${id} ${v.toFixed(3)}`).join(' · ') || '—'; };
        const lab = many ? `${a <= 365 ? '해 1' : a <= 730 ? '해 2' : '끝'}(${xs.length})` : `날 ${a}`;
        console.log(`| ${d} | ${lab} | ${Math.round(W / xs.length)} | ${m('happy').toFixed(3)} | ${m('foodStore').toFixed(3)} | ${m('otherStore').toFixed(3)} | ${top('foodTop')} | ${top('otherTop')} |`);
      }
    }
  }
}

// ── 8. 행복 = clip01(S − B) — 정본 T1205 칸(곁 `t1355-happy-burden.js` · 시드 1020) ──────────────────────
{
  const B = {}; for (const a of ['BOFF', 'BALL', 'BXM']) { const o = rd(path.join(R, `${a}-1020`, 'burden.json')); if (o && o.years) B[a] = o; }
  if (B.BOFF) {
    console.log('\n## 8. 행복 = clip01(천천히 S − 인구 부담 B) — T1134 · T1205(켬 기본) 칸 · 시드 1020 · 해마다 사람-날 가중(econ 이 그날 `lastStats` 에 적은 값)\n');
    console.log('S 는 목표 0.5 + G − E 로 반감기 30날에 다가간다 · G = 좋은 것(`_computeVillageStats` 행복 + 사치품 항) · E = 겪은 일(굶은 몫 · 승전) · B = c × 사람² ÷ √영토(c 0.003)\n');
    console.log('| 팔 | 해 | 행복 h | 좋은 것 G(사치품) | 겪은 일 E | 목표 | 천천히 S | **인구 부담 B** | 0 밑 자름 | h 차 = G 차 − E 차 − B 차 + 따라감 · 자름 |');
    console.log('|---|---|---:|---|---:|---:|---:|---:|---:|---|');
    for (const a of ['BOFF', 'BALL', 'BXM']) { const o = B[a]; if (!o) continue; for (let i = 0; i < o.years.length; i++) {
      const y = o.years[i], z = B.BOFF.years[i] || {}; const d = (k) => (y[k] || 0) - (z[k] || 0);
      const rest = d('h') - (d('G') - d('E') - d('B'));
      const sg = (x) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(3), pr = (x) => (x < 0 ? `(−${Math.abs(x).toFixed(3)})` : x.toFixed(3));
      console.log(`| ${a === 'BOFF' ? '끔' : a === 'BALL' ? '셋 켬' : '둘'} | ${['해 1', '해 2', '끝 70날'][i]} | ${f3(y.h)} | ${f3(y.G)}(${f3(y.lux)}) | ${f3(y.E)} | ${f3(y.target)} | ${f3(y.S)} | **${f3(y.B)}** | ${f3(y.clipLo)} | ${a === 'BOFF' ? '—' : `${sg(d('h'))} = ${sg(d('G'))} − ${pr(d('E'))} − **${pr(d('B'))}** ${rest < 0 ? '−' : '+'} ${Math.abs(rest).toFixed(3)}`} |`);
    } }
    console.log('\n부담의 두 손 — 해 끝 날 마을 칸(사람 · 영토 `terrCells`) · B = c × 사람² ÷ √영토 이므로 영토가 그대로면 B 는 마을 크기 제곱을 따른다:\n');
    console.log('| 팔 | 날 | 마을 | 사람 | 사람 가중 마을 크기 | 사람 가중 B | 영토 셀(가장 작은 ~ 가장 큰) |');
    console.log('|---|---:|---:|---:|---:|---:|---|');
    for (const a of ['BOFF', 'BALL', 'BXM']) { const o = B[a]; if (!o || !o.ends) continue; for (const e of o.ends) {
      let V = 0, N = 0, wn = 0, wB = 0, tMin = Infinity, tMax = -Infinity;
      for (const [, n, , , b, t] of e.per) { if (!(n > 0)) continue; V++; N += n; wn += n * n; wB += n * (b || 0); if (t != null) { tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); } }
      console.log(`| ${a === 'BOFF' ? '끔' : a === 'BALL' ? '셋 켬' : '둘'} | ${e.day} | ${V} | ${N} | ${N ? (wn / N).toFixed(1) : '—'} | ${N ? (wB / N).toFixed(3) : '—'} | ${Number.isFinite(tMin) ? (tMin === tMax ? `${tMin} 모두 같음` : `${tMin} ~ ${tMax}`) : '—'} |`);
    } }
    console.log('\n같은 자 확인 — 곁 관찰기는 읽기만(세계 무변): 부담 판 · 곳간 판 `farm.json` ↔ 같은 팔 판 · 730날 판(`*2`)은 날 365 · 730 마을별 칸 ↔ 같은 팔 800날 판:\n');
    const txt = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
    for (const [b, a] of [['BOFF', 'OFF'], ['BALL', 'ALL'], ['BXM', 'XM'], ['SOFF', 'OFF'], ['SALL', 'ALL'], ['SXM', 'XM']]) {
      const x = txt(path.join(R, `${b}-1020`, 'farm.json')), y = txt(path.join(R, `${a}-1020`, 'farm.json')); if (x && y) console.log(`* ${b}-1020 ↔ ${a}-1020 farm.json: ${x === y ? '같음' : '다름'}`);
    }
    for (const [b, a] of [['SOFF2', 'OFF'], ['SALL2', 'ALL']]) {
      const p = rd(path.join(R, `${b}-1020`, 'probe.json')), q = rd(path.join(R, `${a}-1020`, 'probe.json')); if (!p || !q) continue;
      const ok = [365, 730].map((dd) => { const u = p.ends.find((e) => e.day === dd), w = q.ends.find((e) => e.day === dd); return !!(u && w && JSON.stringify(u.per) === JSON.stringify(w.per)); });
      console.log(`* ${b}-1020 ↔ ${a}-1020 날 365 · 730 마을별 칸: ${ok.every(Boolean) ? '같음' : '다름'}`);
    }
  }
}
