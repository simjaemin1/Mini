'use strict';
// === 계측/T1434_2026-11-22/t1434-prof.js — 도는 존 프로세스 CPU 프로파일(읽기만 · 세계 무변) ===
//   잡기: kill -USR1 <존 pid>(검사기 켬) → node t1434-prof.js <ws url> <초> <out.cpuprofile>(CDP Profiler · 1 ms 표본)
//   다시 읽기: node t1434-prof.js --file <out.cpuprofile>
//   찍는 것: 자기 시간 상위 20 · 포함 시간 상위 30(함수 · 파일:줄)
const FILE = process.argv[2] === '--file' ? process.argv[3] : null;
const url = process.argv[2], secs = +(process.argv[3] || 90), out = process.argv[4];
function report(p) {
  const cnt = {}; for (const s of p.samples) cnt[s] = (cnt[s] || 0) + 1;
  const self = {}; let tot = 0;
  const K = (f) => `${f.functionName || '(anon)'} ${f.url.replace(/.*t1434wt\//, '')}:${f.lineNumber + 1}`;
  for (const n of p.nodes) { const c = cnt[n.id] || 0; tot += c; const k = K(n.callFrame); self[k] = (self[k] || 0) + c; }
  const byId = new Map(p.nodes.map((n) => [n.id, n])); const par = new Map(); for (const n of p.nodes) for (const c of n.children || []) par.set(c, n.id);
  const incl = {}; for (const n of p.nodes) { const c = cnt[n.id] || 0; if (!c) continue; const seen = new Set(); let x = n.id; while (x != null) { const k = K(byId.get(x).callFrame); if (!seen.has(k)) { incl[k] = (incl[k] || 0) + c; seen.add(k); } x = par.get(x); } }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(100 * v / tot).toFixed(1)}%  ${k}`).join('\n');
  console.log(`samples ${tot}\n-- self --\n${top(self, 20)}\n-- inclusive --\n${top(incl, 30)}`);
}
if (FILE) { report(JSON.parse(require('fs').readFileSync(FILE, 'utf8'))); process.exit(0); }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
ws.onopen = async () => {
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 1000 });
  await send('Profiler.start'); await new Promise((r) => setTimeout(r, secs * 1000));
  const r = await send('Profiler.stop'); const p = r.result.profile;
  require('fs').writeFileSync(out, JSON.stringify(p));
  const dt = {}; const ts = p.timeDeltas; const cnt = {}; for (const s of p.samples) cnt[s] = (cnt[s] || 0) + 1;
  const self = {}; let tot = 0;
  for (const n of p.nodes) { const c = cnt[n.id] || 0; tot += c; const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.replace(/.*t1434wt\//, '')}:${f.lineNumber + 1}`; self[k] = (self[k] || 0) + c; }
  // 포함 시간(자식 포함)
  const byId = new Map(p.nodes.map((n) => [n.id, n])); const par = new Map(); for (const n of p.nodes) for (const c of n.children || []) par.set(c, n.id);
  const incl = {}; for (const n of p.nodes) { const c = cnt[n.id] || 0; if (!c) continue; const seen = new Set(); let x = n.id; while (x != null) { const f = byId.get(x).callFrame; const k = `${f.functionName || '(anon)'} ${f.url.replace(/.*t1434wt\//, '')}:${f.lineNumber + 1}`; if (!seen.has(k)) { incl[k] = (incl[k] || 0) + c; seen.add(k); } x = par.get(x); } }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(100 * v / tot).toFixed(1)}%  ${k}`).join('\n');
  console.log(`samples ${tot}\n-- self --\n${top(self, 20)}\n-- inclusive --\n${top(incl, 30)}`);
  await send('Profiler.disable'); ws.close(); process.exit(0);
};
