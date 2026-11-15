'use strict';
// (@regress 없음 — 러너 밖 · T1333 표 자 · 읽기만)
// === scripts/t1333-arms.js — T1333 팔 여럿(끔 · ⓐ 합금 발주 · ⓑ 수출 주조 · ④ 투입재 상한 밖 · ⓐ + ④ …)의 판 요약(카드 ⑥ 칸) ==========
//   쓰는 법: node scripts/t1333-arms.js <이름=머리> [<이름=머리> …] [--json 요약.json] [--at 날]
//     머리 = 판 JSON 경로에서 `.json` 을 뗀 것(곁 관찰기 JSON: t1256 · t1313 · t1333 · t1243 · 판 JSON). 첫 팔이 끔(끔비의 분모).
//   칸(날 = 판 마지막 날 머리 · `--at` 이면 그 날 머리):
//     · 청동 무기 누계 · 녹임 누계(t1256 날 머리 줄 합 — T1313 표와 같은 셈 · 없으면 t1313 ①) · 끔비(청동 ÷ 첫 팔 청동)
//     · 광산5 로 간 구리 짐 수 · 양(t1333 ② econ 교역 장부 — 보낸 짐 + 귀로 짐 · 광산5 가 받은 쪽) · 금속 짐(구리 · 주석 · 은 · 무기 — 줄 수)
//     · 잠김 주석 · 납 · 은 %(T1293 보고 §3 셈 — t1256 광산 마을 · 그 광물 녹이는 날(흐름 목표 ≥ 1 · 날 11 ~) 가운데 값표 목표 < 흐름 목표 ÷ 2 ∧ 곳간 ≥ 값표 목표 ∧ 이튿날 머리 몸이 든 것 0 인 날의 몫 —
//       값은 t1313 ① 원석 칸 [곳간 · 흐름 목표 · 값표 목표])
//     · 무기 Q(t1333 ① — 온 마을 무기 곳간 가중 `_weapQ` 평균 · 청동을 낸 마을만의 평균)
//     · 광산5 · 광산6 · 어촌1 청동 · 광산5 구리 값(날 11 ~ 가운데) · 세계 구리 · 주석 · 은 곳간(끝) · 인구 · 하루 CPU
const fs = require('fs');
const args = process.argv.slice(2), arms = [], opt = {};
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
for (let i = 0; i < args.length; i++) { if (args[i] === '--json' || args[i] === '--at') opt[args[i].slice(2)] = args[++i]; else { const k = args[i].indexOf('='); arms.push([args[i].slice(0, k), args[i].slice(k + 1)]); } }
if (!arms.length) { console.error('쓰는 법: node scripts/t1333-arms.js <이름=머리> … [--json 요약.json] [--at 날]'); process.exit(2); }
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const f0 = (x) => x == null ? '—' : Math.round(+x).toLocaleString('en-US'), f1 = (x) => x == null ? '—' : (+x).toFixed(1), f2 = (x) => x == null ? '—' : (+x).toFixed(2), pc = (x) => x == null ? '—' : (100 * x).toFixed(1);
const MIN = ['ore_tin', 'ore_lead', 'ore_silver'];
function one(h) {
  const A = rd(h + '.t1256.json'), Q = rd(h + '.t1313.json'), O = rd(h + '.t1333.json'), C = rd(h + '.t1243.json'), J = rd(h + '.json');
  const lastQ = Q ? Math.max(...Object.keys(Q.day).map(Number)) : null, lastA = A ? Math.max(...Object.keys(A.day).map(Number)) : null;
  const L = opt.at ? +opt.at : (lastA != null ? Math.min(lastA, lastQ != null ? lastQ : lastA) : lastQ);
  const I = (k) => A ? A.dcols.indexOf(k) : -1, QI = (k) => Q ? Q.vcols.indexOf(k) : -1;
  const headA = A && A.day[L], headQ = Q && Q.day[L];
  const bronze = headA ? sum(headA.map((r) => r[I('bronzeW')])) : (headQ ? sum(Object.values(headQ).map((r) => r[QI('bronzeW')])) : null);
  const smelt = headA ? sum(headA.map((r) => r[I('smeltTot')])) : (headQ ? sum(Object.values(headQ).map((r) => r[QI('smelt')])) : null);
  const bzOf = (vn) => headQ && headQ[vn] ? headQ[vn][QI('bronzeW')] : (headA ? ((headA.find((r) => r[0] === vn) || [])[I('bronzeW')]) : null);
  // 짐(t1333 ② — econ 교역 장부) · 날 L 앞까지
  const legs = O ? O.legs.filter((x) => x[0] < L) : [];
  const cu5 = legs.filter((x) => x[3] === 'copper' && x[2] === '광산5');
  const cnt = (res) => legs.filter((x) => x[3] === res).length;
  // 잠김 %(T1293 §3 셈 — t1313 원석 칸 [곳간 · 흐름 목표 · 값표 목표] · 캔 것 = t1256 이튿날 머리 bodyInY)
  let lock = null;
  if (Q && Q.ore && A) {
    const mines = new Set(A.mines || []); lock = {}; for (const k of MIN) lock[k] = { melt: 0, lock: 0 };
    const prodOf = (d, vn, k) => { const rows = A.day[d + 1]; if (!rows) return null; const r = rows.find((q) => q[0] === vn); return r ? ((r[I('bodyInY')] || {})[k] || 0) : 0; };
    for (const [ds, V] of Object.entries(Q.ore)) {
      const d = +ds; if (d < 11 || d >= L) continue;
      for (const [vn, o] of Object.entries(V)) { if (!mines.has(vn)) continue; for (const k of MIN) { const q = o[k]; if (!q) continue; const [s, f, t] = q; if (!(f >= 1) || t == null) continue; const p = prodOf(d, vn, k); if (p == null) continue; lock[k].melt++; if (t < f / 2 && s >= t && p === 0) lock[k].lock++; } }
    }
  }
  // 무기 Q · 광산5 구리 값 · 세계 곳간(t1333 ①)
  let wq = null, wqB = null, p5 = null, world = null;
  if (O && O.day[L]) {
    const D = O.day[L], c = O.vcols; const iw = c.indexOf('weapon'), iq = c.indexOf('weapQ'), ib = c.indexOf('bronzeW');
    let sw = 0, sq = 0, nb = 0, qb = 0; for (const r of Object.values(D)) { if (r[iq] == null) continue; sw += r[iw] || 0; sq += (r[iw] || 0) * r[iq]; if (r[ib] > 0) { nb++; qb += r[iq]; } }
    wq = sw > 0 ? sq / sw : null; wqB = nb ? qb / nb : null;
    const ps = []; for (const [ds, M] of Object.entries(O.met)) { if (+ds < 11 || +ds >= L) continue; const m = (M['광산5'] || {}).copper; if (m && m[5] != null) ps.push(m[5]); }
    ps.sort((a, b) => a - b); p5 = ps.length ? ps[ps.length >> 1] : null;
    const M = O.met[L] || {}; world = { cu: 0, sn: 0, ag: 0 }; for (const o of Object.values(M)) { if (o.copper) world.cu += o.copper[0]; if (o.tin) world.sn += o.tin[0]; if (o.silver) world.ag += o.silver[0]; }
  }
  const cpu = C && C.cpu ? C.cpu.filter((q) => q[0] >= 2 && q[0] <= L) : [];
  return { L, bronze, smelt, b5: bzOf('광산5'), b6: bzOf('광산6'), b1: bzOf('어촌1'), cu5n: cu5.length, cu5amt: sum(cu5.map((x) => x[4])), cu5first: cu5.length ? cu5[0][0] : null,
    legs: { copper: cnt('copper'), tin: cnt('tin'), silver: cnt('silver'), weapon: cnt('weapon') }, lock, wq, wqB, p5, world, knobs: O ? O.knobs : null,
    pop: J && J.eight ? J.eight.pop : null, cpuDay: cpu.length ? sum(cpu.map((q) => q[1])) / cpu.length : null };
}
const S = {}; for (const [n, h] of arms) S[n] = one(h);
const base = S[arms[0][0]];
const out = [];
out.push('| 칸 | ' + arms.map((a) => a[0]).join(' | ') + ' |', '|---|' + arms.map(() => '---:').join('|') + '|');
const line = (name, fn) => out.push('| ' + name + ' | ' + arms.map(([n]) => { try { return fn(S[n]); } catch (e) { return '—'; } }).join(' | ') + ' |');
line('날(머리)', (s) => s.L);
line('손잡이(ⓐ · ⓑ · ④)', (s) => s.knobs ? [s.knobs.alloy ? 'ⓐ' : '', s.knobs.exportCast ? 'ⓑ' : '', s.knobs.ws ? '④' : ''].filter(Boolean).join(' + ') || '끔' : '—');
line('**청동 무기 누계**', (s) => `**${f2(s.bronze)}**`);
line('끔비(청동)', (s) => base && base.bronze ? f2(s.bronze / base.bronze) : '—');
line('녹임 누계', (s) => f1(s.smelt));
line('광산5 · 광산6 · 어촌1 청동', (s) => `${f2(s.b5)} · ${f2(s.b6)} · ${f2(s.b1)}`);
line('광산5 로 간 구리 짐(수 · 양 · 첫 날)', (s) => `${s.cu5n} · ${f1(s.cu5amt)} · ${s.cu5first == null ? '—' : 'd' + s.cu5first}`);
line('금속 짐 줄 — 구리 · 주석 · 은 · 무기', (s) => `${s.legs.copper} · ${s.legs.tin} · ${s.legs.silver} · ${s.legs.weapon}`);
line('잠김 주석 · 납 · 은 %', (s) => s.lock ? MIN.map((k) => s.lock[k].melt ? pc(s.lock[k].lock / s.lock[k].melt) : '—').join(' · ') : '—');
line('무기 Q(곳간 가중 · 청동 낸 마을)', (s) => `${s.wq == null ? '—' : s.wq.toFixed(3)} · ${s.wqB == null ? '—' : s.wqB.toFixed(3)}`);
line('광산5 구리 값(날 11 ~ 가운데)', (s) => f2(s.p5));
line('세계 곳간 끝 — 구리 · 주석 · 은', (s) => s.world ? `${f1(s.world.cu)} · ${f1(s.world.sn)} · ${f1(s.world.ag)}` : '—');
line('인구', (s) => f0(s.pop));
line('하루 CPU 초(날 2 ~)', (s) => f2(s.cpuDay));
console.log(out.join('\n'));
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(S));
