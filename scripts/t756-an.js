#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T756 분석 · 제품 무변)
// === scripts/t756-an.js — 엄격 최악 표: t686 자 판(T719_DEEP=1 · T756 주 스레드 CPU 칸)의 긴 걸음을 **빼앗긴 시간을 뺀** 셈으로 가른다 ==========
//   쓰는 법: T686_DIR=/tmp/t756 node scripts/t756-an.js W1 W2 W3 W4      (판마다 줄 + 합 표 JSON)
//            T686_DIR=/tmp/t756 node scripts/t756-an.js --verify V1          (t756-probe 견줌 판 — 칸 A* 창 값 갈림 표)
//
// ★엄격 판정(T750 회부 3 · T756) — 긴 걸음(벽 ≥ 5 ms)마다:
//   cpu  = 그 걸음 안 주 스레드가 실제로 돈 ms(`process.threadCpuUsage` · 정확 — schedstat 처럼 틱만큼 늦지 않다)
//   wait = 틱 머리부터 걸음 끝까지 런큐에 줄 선 ms(`schedstat` 둘째 칸 · 줄 섬은 다시 돌 때 바로 더해진다) — 걸음 안 줄 섬의 **위끝**
//   lost = 벽 − cpu − wait — 걸음 안 빼앗김(vCPU steal · 막힘)의 **아래끝**
//   ⇒ **셈** = cpu ≥ 8 ms(그 걸음이 정말 8 ms 넘게 돌았다) · **빼앗김** = lost ≥ 8 ms · **줄 섬** = wait ≥ 8 ms(위끝이라 '아마') · 그 밖 = 8 ms 아래 섞임
//   ★8 ms = T750 의 문턱(schedstat 늦음 ≤ 4 ms × 두 끝)을 그대로 쓴다 — cpu 는 정확하지만 표를 T750 줄과 견줄 수 있게.
//   꼴(갈래) = 그 걸음 안 가장 무거운 감싼 함수(T734 an.js 와 같은 규칙) · GC 겹침(벽 기준) · 바로 앞 V8 풀림(T715_JIT 로그).
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.env.T686_DIR || '/tmp/t756';
const TH = +(process.env.T756_TH || 8);
const CONT = new Set(['결정', '생활층', '길', '생활·닿는 현장', '생활·닿는가']);
const lab = (acc) => {
  const leaf = acc.filter((a) => !CONT.has(a[0])).sort((a, b) => b[1] - a[1])[0];
  const m = Object.fromEntries(acc.map((a) => [a[0], a[1]]));
  if (leaf && /닿는/.test(leaf[0])) return '닿는 칸';
  if (!leaf && (m['생활·닿는가'] !== undefined)) return '닿는 칸';
  if (leaf) return leaf[0];
  if (m['길'] !== undefined) return '길(그 밖)';
  if (m['결정'] !== undefined) return '결정 몸(안 감쌈)';
  return '걸음 몸(감싼 것 0)';
};
const isV8 = (s) => /^\[(bailout|marking|compiling|completed|optimizing|deoptimiz|manually|found optimized|not yet|evicting|aborted)/.test(s) || /^\s+;;;/.test(s);
function deopts(tag) {
  const dep = [];
  try {
    const lines = fs.readFileSync(path.join(DIR, `${tag}.log`), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('[T719W]')) continue;
      const f = new Set();
      for (let j = i - 1; j >= 0 && j > i - 400; j--) { const s = lines[j]; if (!isV8(s)) break; const k = s.match(/deoptimizing [^<]*<JSFunction (\S+)/); if (k) f.add(k[1]); }
      dep.push([...f]);
    }
  } catch (e) {}
  return dep;
}
function one(tag) {
  const L = fs.readFileSync(path.join(DIR, `${tag}.jsonl`), 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  const fin = L.find((x) => x.kind === 'fin'); if (!fin) return { tag, err: 'fin 없음' };
  const W = fin.decAll.t719.worst, GC = (fin.t734gc && fin.t734gc.w) || [], dep = deopts(tag);
  let TB = {}; try { TB = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.table.json`), 'utf8')); } catch (e) {}
  let PF = null; try { PF = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.perf.json`), 'utf8')); } catch (e) {}
  const rows = W.map((w, i) => {
    const wall = w[1], sc = w[10] || [0, 0, 0], cpu = w[11], wait = Math.max(0, sc[0]), lost = cpu == null ? null : Math.max(0, wall - cpu - wait), g = GC[i] || [0, 0];
    const cause = cpu == null ? '?' : cpu >= TH ? '셈' : lost >= TH ? '빼앗김' : wait >= TH ? '줄 섬' : '8 ms 아래';
    const sys = w[12] == null ? null : w[12], ru = w[13] || null;
    return { i, wall, cpu, sys, ru, wait: +wait.toFixed(2), lost: lost == null ? null : +lost.toFixed(2), cause, k: lab(w[8]), job: w[4], act: w[5], beh: w[6], night: w[2], gc: g[0], dep: dep[i] || [], acc: w[8] };
  });
  const st = fin.decAll.t719.stat;
  return { tag, rows, ticks: { p50: TB.p50, p99: TB.p99, max: TB.max, over30: TB.over30, over16: TB.over16 }, step: { avgD: +st.avgDUs.toFixed(2), avgN: +st.avgNUs.toFixed(2), maxD: +st.maxD.toFixed(1), maxN: +st.maxN.toFixed(1) },
    t678q: PF && PF.walk && PF.walk.t678 ? PF.walk.t678.q : null, spikes: L.flatMap((x) => x.spikes || []).filter((x) => x.cpu != null), gcN: fin.t734gc ? fin.t734gc.n : null };
}
function table(tags) {
  const R = tags.map(one), all = [];
  for (const r of R) {
    if (r.err) { console.log(r.tag, r.err); continue; }
    const c = {}; for (const x of r.rows) c[x.cause] = (c[x.cause] || 0) + 1;
    const n15 = r.rows.filter((x) => x.wall >= 15), c15 = {}; for (const x of n15) c15[x.cause] = (c15[x.cause] || 0) + 1;
    console.log(`${r.tag} · 틱 p50 ${r.ticks.p50} p99 ${r.ticks.p99} 최대 ${r.ticks.max} · 30+ ${r.ticks.over30} · 16+ ${r.ticks.over16} · 걸음 평균 낮 ${r.step.avgD} 밤 ${r.step.avgN} µs · 최대 ${r.step.maxD} · ${r.step.maxN} ms`);
    console.log(`   5 ms+ 걸음 ${r.rows.length} — ${JSON.stringify(c)} · 15 ms+ ${n15.length} — ${JSON.stringify(c15)} · 문 그래프 묻기 ${r.t678q ? r.t678q.calls : '?'} · 표 없음(칸 A*) ${r.t678q ? r.t678q.fallback : '?'}`);
    for (const x of r.rows) all.push(Object.assign({ tag: r.tag }, x));
    if (r.spikes && r.spikes.length) { const sp = r.spikes.map((x) => { const sc = x.sch || [0, 0, 0], lost = Math.max(0, x.ms - x.cpu - Math.max(0, sc[0])); return { ms: x.ms, cpu: x.cpu, sys: x.sys, wait: sc[0], lost: +lost.toFixed(1), ru: x.ru, seg: Object.entries(x.seg || {}).sort((a, b) => b[1] - a[1])[0], close: x.close, ph: x.ph }; });
      const cs = sp.filter((x) => x.cpu >= TH && x.cpu >= 0.5 * x.ms);
      console.log(`   30 ms+ 틱 ${sp.length} — 셈(cpu ≥ ${TH} · ≥ 절반) ${cs.length} · 빼앗김(≥ ${TH}) ${sp.filter((x) => x.lost >= TH).length}`);
      for (const x of sp.sort((a, b) => b.ms - a.ms)) console.log(`     틱 ${x.ms} · cpu ${x.cpu} · 커널 ${x.sys} · 줄 ${x.wait} · 빼앗김 ${x.lost} · ${x.seg ? x.seg[0] + ' ' + x.seg[1].toFixed(1) : ''} · 마감 ${x.close ? 1 : 0} · ph ${x.ph} · ${JSON.stringify(x.ru)}`); }
  }
  // 합 표 — 꼴마다 셈 한 방(cpu ≥ 8)
  const G = {};
  for (const x of all) {
    const g = G[x.k] || (G[x.k] = { n: 0, cause: {}, comp: 0, compMaxCpu: 0, compMaxWall: 0, by: {}, gcComp: 0, depComp: 0, jobs: {}, maxWall: 0 });
    g.n++; g.cause[x.cause] = (g.cause[x.cause] || 0) + 1; if (x.wall > g.maxWall) g.maxWall = x.wall; g.by[x.tag] = (g.by[x.tag] || 0) + 1;
    if (x.cause === '셈') { g.comp++; if (x.cpu > g.compMaxCpu) g.compMaxCpu = x.cpu; if (x.wall > g.compMaxWall) g.compMaxWall = x.wall; if (x.gc > 0.5 * x.cpu) g.gcComp++; if (x.dep.length) g.depComp++;
      const j = (x.job || '-') + '/' + (x.act || '-'); g.jobs[j] = (g.jobs[j] || 0) + 1; }
  }
  const out = Object.entries(G).sort((a, b) => b[1].comp - a[1].comp || b[1].n - a[1].n);
  console.log('\n꼴 | ' + tags.join(' ') + ' | 5 ms+ 합 | 셈(cpu ≥ ' + TH + ') | 셈 최대 cpu · 벽 ms | 빼앗김 | 줄 섬 | 8 ms 아래 | 셈 중 GC · 풀림 | 셈 갈래(직업/라벨)');
  for (const [k, g] of out) console.log([k, tags.map((t) => g.by[t] || 0).join(' '), g.n, g.comp, g.comp ? g.compMaxCpu.toFixed(1) + ' · ' + g.compMaxWall.toFixed(1) : '—', g.cause['빼앗김'] || 0, g.cause['줄 섬'] || 0, g.cause['8 ms 아래'] || 0,
    g.comp ? g.gcComp + ' · ' + g.depComp : '—', Object.entries(g.jobs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, b]) => a + ' ' + b).join(', ')].join(' | '));
  const comp = all.filter((x) => x.cause === '셈').sort((a, b) => b.cpu - a.cpu);
  console.log('\n셈 한 방 전부(cpu 차례):');
  for (const x of comp) console.log(`  ${x.tag} 벽 ${x.wall} · cpu ${x.cpu} · 줄 ${x.wait} · 빼앗김 ${x.lost} · ${x.k} · ${x.job}/${x.act}/${x.beh} · 커널 ${x.sys} · 폴트·전환 ${JSON.stringify(x.ru)} · GC ${x.gc} · 풀림 ${x.dep.join(',') || '-'} · ${JSON.stringify(x.acc.slice(0, 4))}`);
  if (process.env.T756_JSON) fs.writeFileSync(process.env.T756_JSON, JSON.stringify({ runs: R.map((r) => Object.assign({}, r, { rows: undefined })), groups: G, comp }, null, 1));
}
function verify(tag) {
  const V = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.t756.json`), 'utf8'));
  const q = (a, p) => { if (!a.length) return null; const t = a.slice().sort((x, y) => x - y); return t[Math.min(t.length - 1, Math.floor(t.length * p))]; };
  const rows = V.rows;
  console.log(`${tag} · 칸 A*(문 그래프 표 없음) ${V.n}번 · 꼴 ${JSON.stringify(V.cat)} · 견줌 실패 ${V.err} · 문 그래프 묻기 ${V.q && V.q.calls} · 표 없음 ${V.q && V.q.fallback}`);
  console.log(`  A* ms p50 ${q(V.aMs, 0.5)} p90 ${q(V.aMs, 0.9)} 최대 ${q(V.aMs, 1)} · 그림자 짓기 ms p50 ${q(V.shMs, 0.5)} 최대 ${q(V.shMs, 1)} · 그 자리에서 지은 청크 p50 ${q(V.shBuilt, 0.5)} 최대 ${q(V.shBuilt, 1)}`);
  const both = rows.filter((r) => r.cat === 'both');
  const ratio = both.map((r) => r.lg / Math.max(1, r.la)), dl = both.map((r) => r.lg - r.la);
  console.log(`  둘 다 닿음 ${both.length} — 걷는 길이 비(문/A*) p10 ${q(ratio, 0.1)?.toFixed(3)} p50 ${q(ratio, 0.5)?.toFixed(3)} p90 ${q(ratio, 0.9)?.toFixed(3)} 최대 ${q(ratio, 1)?.toFixed(3)} · 차 px p50 ${q(dl, 0.5)?.toFixed(1)} 최소 ${q(dl, 0)?.toFixed(1)} 최대 ${q(dl, 1)?.toFixed(1)} · 같은 길이(±1px) ${dl.filter((d) => Math.abs(d) <= 1).length}`);
  const arr = both.filter((r) => r.end === 'arrived' && r.dt > 0 && r.la > 0), v = arr.map((r) => r.la / r.dt);   // px/ms
  const vMed = q(v, 0.5);
  console.log(`  도착 ${arr.length}/${both.length}(그 밖 ${JSON.stringify(both.reduce((o, r) => { if (r.end !== 'arrived') o[r.end] = (o[r.end] || 0) + 1; return o; }, {}))}) · 실제 빠르기 p50 ${vMed ? (vMed * 1000).toFixed(1) : '?'} px/s`);
  const dts = arr.map((r) => (r.lg - r.la) / (r.la / r.dt) / 1000);
  console.log(`  도착 시간 차 어림(문 − A*) 초: p10 ${q(dts, 0.1)?.toFixed(2)} p50 ${q(dts, 0.5)?.toFixed(2)} p90 ${q(dts, 0.9)?.toFixed(2)} 최소 ${q(dts, 0)?.toFixed(2)} 최대 ${q(dts, 1)?.toFixed(2)} · 합 ${dts.reduce((a, b) => a + b, 0).toFixed(1)} 초 · |합| ${dts.reduce((a, b) => a + Math.abs(b), 0).toFixed(1)} 초`);
  for (const c of ['aOnly', 'gOnly', 'none', 'gUnknown']) {
    const rs = rows.filter((r) => r.cat === c); if (!rs.length) continue;
    console.log(`  ${c} ${rs.length}: ` + rs.slice(0, 12).map((r) => `${r.job}/${r.act} 직선 ${r.direct} · A* ${r.la} · 문 ${r.lg} · ${r.end} ${r.dt == null ? '' : (r.dt / 1000).toFixed(1) + '초'} 남은 ${r.rem}`).join(' ; '));
  }
  // 몸마다 그날 합(마을 하루 = 24분)
  const bod = {}; for (const r of both) { if (!(r.end === 'arrived' && r.dt > 0 && r.la > 0)) continue; const k = r.pid + '@' + r.d; const b = bod[k] || (bod[k] = { pid: r.pid, d: r.d, job: r.job, n: 0, s: 0, a: 0 }); b.n++; const x = (r.lg - r.la) / (r.la / r.dt) / 1000; b.s += x; b.a += Math.abs(x); }
  const B = Object.values(bod).sort((a, b) => b.a - a.a);
  console.log(`  몸 · 날 ${B.length}: |합| 최대 ${B[0] ? B[0].a.toFixed(1) : 0} 초(${B[0] ? B[0].job + ' · ' + B[0].n + '번' : ''}) · p50 ${q(B.map((b) => b.a), 0.5)?.toFixed(2)} 초 · 하루(1,440초) 대비 최대 ${B[0] ? (B[0].a / 1440 * 100).toFixed(2) : 0}%`);
  const jobs = {}; for (const r of rows) { const k = (r.job || '-') + '/' + (r.act || '-'); jobs[k] = (jobs[k] || 0) + 1; }
  console.log('  직업/라벨: ' + Object.entries(jobs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a, b]) => a + ' ' + b).join(', '));
  const days = {}; for (const r of rows) days[r.d] = (days[r.d] || 0) + 1; console.log('  날마다: ' + JSON.stringify(days));
  const mins = {}; for (const r of rows) { const m = Math.floor((r.at - rows[0].at) / 60000); mins[m] = (mins[m] || 0) + 1; } console.log('  분마다(첫 줄부터): ' + JSON.stringify(mins));
  if (process.env.T756_JSON) fs.writeFileSync(process.env.T756_JSON, JSON.stringify({ cat: V.cat, n: V.n, rows, bod: B }, null, 1));
}
function prof(tag) {   // t756-prof.js 표본 — 긴 걸음(cpu ≥ 문턱) · 30 ms+ 틱마다 잎 · 사슬
  const P = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.prof.json`), 'utf8'));
  console.log(`${tag} 표본 자 · 간격 ${P.iv} µs · 주기 ${P.cycles} · 놓친 창 ${P.miss} · 오류 ${JSON.stringify(P.err)}`);
  const sh = (x) => x.leaf.map(([k, n]) => `${k} ${n}`).join(' | ');
  console.log('긴 걸음(벽 ≥ 5 ms):');
  for (const x of P.steps.sort((a, b) => (b.cpu || 0) - (a.cpu || 0))) console.log(`  벽 ${x.ms.toFixed(1)} · cpu ${x.cpu} · ${x.job}/${x.act} · 표본 ${x.n} · 잎: ${sh(x)}\n      사슬: ${x.chain[0] ? x.chain[0][1] + '× ' + x.chain[0][0] : '-'}`);
  console.log('30 ms+ 틱:');
  for (const x of P.ticks.sort((a, b) => b.ms - a.ms)) console.log(`  틱 ${x.ms.toFixed(1)} · 표본 ${x.n} · 잎: ${sh(x)}\n      사슬: ${x.chain[0] ? x.chain[0][1] + '× ' + x.chain[0][0] : '-'}`);
}
const args = process.argv.slice(2);
if (args[0] === '--verify') verify(args[1] || 'V1');
else if (args[0] === '--prof') prof(args[1] || 'P1');
else table(args.length ? args : ['W1', 'W2', 'W3', 'W4']);
