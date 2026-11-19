'use strict';
// (@regress 없음 — 러너 밖 · T1344 표 자 · 읽기만)
// === scripts/t1344-arms.js — T1344 팔 여럿(끔 · ⓐ · ⓐ + 병기고 · ⓐ + 병기고 + 섞어 싣기 …)의 t1344 관찰기 칸(t1333-arms.js 표 곁) ==========
//   쓰는 법: node scripts/t1344-arms.js <이름=머리> [<이름=머리> …] [--v 광산5] [--json 요약.json]
//     머리 = 판 JSON 경로에서 `.json` 을 뗀 것(곁 `.t1344.json` — 큰 것은 `.gz`). 첫 팔이 끔(식량 교역 비의 분모).
//   칸: 손잡이 · 그 마을(기본 광산5) 잘 먹는 날(식량 안보 > 0.45 — 청동 몫 한도 갈래) · 주조 문 닫힌 날(종전 곳간 = 근접검 전부 · 새 곳간 = 켬이면 청동 근접검) ·
//       청동 몫(끝) · 둘째 화물(출발 · 닿음 · 품목 · 구리 · 광산5 로 간 구리) · 식량 교역량(econ 식량 단위 — 보낸 · 받아 온 · 끔비) ·
//       주조(수 · 은 든 수 · 은 든 주조의 등급 → 은 뺀 등급 · 산출 → 은 뺀 산출 · 청동 → 은 뺀 청동) ·
//       구리를 내보낼 수 있던 출발(수 · 고른 다리 짐 몫 가운데 · 구리 → 광산5 다리였다면 짐 몫 가운데 · 구리 다리가 더 컸을 출발 수) · 광산5 로 간 출발(수 · 남는 kg ≥ 구리 한 낱개 · 둘째 화물)
const fs = require('fs');
const zlib = require('zlib');
const args = process.argv.slice(2), arms = [], opt = { v: '광산5' };
for (let i = 0; i < args.length; i++) { if (args[i] === '--json' || args[i] === '--v') opt[args[i].slice(2)] = args[++i]; else { const k = args[i].indexOf('='); arms.push([args[i].slice(0, k), args[i].slice(k + 1)]); } }
if (!arms.length) { console.error('쓰는 법: node scripts/t1344-arms.js <이름=머리> … [--v 마을] [--json 요약.json]'); process.exit(2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e2) { return null; } } };
const f0 = (x) => x == null ? '—' : Math.round(+x).toLocaleString('en-US'), f1 = (x) => x == null ? '—' : (+x).toFixed(1), f2 = (x) => x == null ? '—' : (+x).toFixed(2), f3 = (x) => x == null ? '—' : (+x).toFixed(3);
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
function one(h) {
  const X = rd(h + '.t1344.json');
  if (!X) return null;
  const K = X.knobs || {}, ac = X.acols, I = (k) => ac.indexOf(k);
  const days = Object.keys(X.day).map(Number).sort((a, b) => a - b), L = days.length ? days[days.length - 1] : 0;
  // ① 그 마을 주조 문(대장장이가 있던 날만) — 한도 = 잘 먹으면 사람 × 0.72 × 0.45 · 아니면 max(2, 전사 × 1.2)
  let fed = 0, nd = 0, smd = 0, oldShut = 0, newShut = 0, oldShutFed = 0, qEnd = null, bsEnd = null;
  for (const d of days) {
    const r = X.day[d][opt.v]; if (!r) continue; nd++;
    const secF = r[I('secF')], pop = r[I('pop')], war = r[I('warrior')], sm = r[I('smith')], w = r[I('weapon')], sf = r[I('swordFrac')] == null ? 0.5 : r[I('swordFrac')], q = r[I('q')];
    const isFed = secF != null && secF > 0.45; if (isFed) fed++;
    const cap = isFed ? pop * 0.72 * 0.45 : Math.max(2, war * 1.2);
    const melee = w * sf, bz = (K.bronzeStock && isFed) ? melee * (q || 0) : melee;
    if (sm > 0) { smd++; if (melee >= cap) { oldShut++; if (isFed) oldShutFed++; } if (bz >= cap) newShut++; }
    if (q != null) { qEnd = q; bsEnd = melee * q; }
  }
  // ② 둘째 화물
  const mix = X.mix || [], dep = X.depart || [];
  const kinds = {}; for (const m of mix) kinds[m[5]] = (kinds[m[5]] || 0) + 1;
  const cuMix = mix.filter((m) => m[5] === 'copper'), cuTo5 = sum(cuMix.filter((m) => m[2] === opt.v).map((m) => m[6]));
  // ③ 식량 교역
  const T = Object.values(X.trade || {}); const fOut = sum(T.map((t) => t[1])), fBack = sum(T.map((t) => t[2])), rows = sum(T.map((t) => t[0]));
  // ④ 주조 · 은
  const cc = X.ccols, ci = (k) => cc.indexOf(k), casts = X.casts || [];
  const ag = []; for (let i = 0; i < (X.noAg || []).length; i += 2) ag.push([casts[X.noAg[i]], X.noAg[i + 1]]);
  const agG = ag.map(([c]) => c[ci('grade')]), agAmt = sum(ag.map(([c]) => c[ci('amt')])), agBz = sum(ag.map(([c]) => c[ci('amt')] * c[ci('bz')]));
  const altOk = ag.filter(([, a]) => a), altG = altOk.map(([, a]) => a[0]), altAmt = sum(altOk.map(([, a]) => a[3])), altBz = sum(altOk.map(([, a]) => a[3] * a[1]));
  const agBzCasts = ag.filter(([c]) => c[ci('bz')] > 0).length;
  // ⑤ 첫째 화물 다리
  const lc = X.lcols || [], li = (k) => lc.indexOf(k), legs = (X.legs || []);
  const cuL = legs.filter((l) => l[li('cuSurplus')] > 0), cuWin = cuL.filter((l) => l[li('cuTot5')] != null && l[li('cuTot5')] > l[li('profit')]).length;
  const to5 = legs.filter((l) => l[li('to')] === opt.v), to5room = to5.filter((l) => l[li('roomKg')] != null && l[li('roomKg')] >= 3.5).length, to5mix = to5.filter((l) => l[li('res2')]).length;
  return { L, K, nd, fed, smd, oldShut, newShut, oldShutFed, qEnd, bsEnd, mixN: mix.length, depN: dep.length, kinds, cuMixN: cuMix.length, cuTo5, fOut, fBack, rows,
    casts: casts.length, agN: ag.length, agBzCasts, agGm: med(agG), altGm: med(altG), agAmt, altAmt, agBz, altBz, altNull: ag.length - altOk.length,
    cuL: cuL.length, cuLprof: med(cuL.map((l) => l[li('profit')])), cuLtot5: med(cuL.map((l) => l[li('cuTot5')]).filter((x) => x != null)), cuLpu5: med(cuL.map((l) => l[li('cuPu5')]).filter((x) => x != null)), cuWin,
    to5: to5.length, to5room, to5mix, err: X.err };
}
const S = {}; for (const [n, h] of arms) S[n] = one(h);
const base = S[arms[0][0]];
const out = [];
out.push('| 칸 | ' + arms.map((a) => a[0]).join(' | ') + ' |', '|---|' + arms.map(() => '---:').join('|') + '|');
const line = (name, fn) => out.push('| ' + name + ' | ' + arms.map(([n]) => { try { return S[n] ? fn(S[n]) : '—'; } catch (e) { return '—'; } }).join(' | ') + ' |');
line('날 · 손잡이(ⓐ · 병기고 · 섞어 싣기)', (s) => `${s.L} · ${[s.K.alloy ? 'ⓐ' : '', s.K.bronzeStock ? '병' : '', s.K.mixLoad ? '섞' : ''].filter(Boolean).join(' + ') || '끔'}`);
line(`${opt.v} 잘 먹는 날(식량 안보 > 0.45 — 청동 몫 한도 갈래) / 날`, (s) => `${s.fed} / ${s.nd}`);
line(`${opt.v} 대장장이 있던 날 · 주조 문 닫힘 — 종전 곳간(근접검 전부) · 새 곳간 · 종전 닫힘 가운데 잘 먹는 날`, (s) => `${s.smd} · ${s.oldShut} · ${s.newShut} · ${s.oldShutFed}`);
line(`${opt.v} 청동 몫(끝) · 청동 근접검(끝)`, (s) => (s.qEnd == null ? '— (끔)' : `${f3(s.qEnd)} · ${f2(s.bsEnd)}`));
line('둘째 화물 — 출발 · 닿은 줄', (s) => `${f0(s.depN)} · ${f0(s.mixN)}`);
line('둘째 화물 품목(닿은 줄 · 많은 다섯)', (s) => Object.entries(s.kinds).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(' · ') || '—');
line(`둘째 화물 구리 — 줄 · ${opt.v} 로 간 양`, (s) => `${s.cuMixN} · ${f1(s.cuTo5)}`);
line('식량 교역량(econ 식량 단위) — 보낸 · 받아 온 · 끔비', (s) => `${f0(s.fOut)} · ${f0(s.fBack)} · ${base && base.fOut + base.fBack > 0 ? f3((s.fOut + s.fBack) / (base.fOut + base.fBack)) : '—'}`);
line('교역 장부 줄(닿음)', (s) => f0(s.rows));
line('주조 수 · 은 든 주조(그 가운데 청동)', (s) => `${s.casts} · ${s.agN}(${s.agBzCasts})`);
line('은 든 주조 — 등급 가운데 → 은 뺀 배합 등급 가운데', (s) => `${f3(s.agGm)} → ${f3(s.altGm)}`);
line('은 든 주조 — 산출 합 → 은 뺀 산출 · 청동 합 → 은 뺀 청동 · 은 빼면 못 붓는 주조', (s) => `${f2(s.agAmt)} → ${f2(s.altAmt)} · ${f2(s.agBz)} → ${f2(s.altBz)} · ${s.altNull}`);
line(`구리를 내보낼 수 있던 출발 — 수 · 고른 다리 짐 몫 가운데 · 구리 → ${opt.v} 낱개 몫 가운데 · 짐 몫 가운데 · 구리 다리가 더 컸던 출발`, (s) => `${s.cuL} · ${f1(s.cuLprof)} · ${f2(s.cuLpu5)} · ${f1(s.cuLtot5)} · ${s.cuWin}`);
line(`${opt.v} 로 간 출발 — 수 · 남는 kg ≥ 3.5(구리 한 낱개) · 둘째 화물 실림`, (s) => `${s.to5} · ${s.to5room} · ${s.to5mix}`);
console.log(out.join('\n'));
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(S));
