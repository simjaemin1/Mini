'use strict';
// T1438 판 사슬 — 서버 판 자(`t577-server-run.js`)를 판 목록대로 · 동시 PAR 개(기본 1) · 끝난 판은 건너뛴다 · stop_<목록> 파일이면 새 판을 안 띄운다.
//   node chain.js <목록 JSON> [PAR]   — [{tag, seed, days, env, probe?(T1423_PROBE_DAY), kinds?}] · 조건 = 서버 기준선(가상 시계)
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const D = __dirname, LIST = path.resolve(process.argv[2]), PAR = parseInt(process.argv[3] || '1', 10) || 1;
const ROOT = process.env.T1438_ROOT || '/home/claude/mini';
const RUNS = JSON.parse(fs.readFileSync(LIST, 'utf8'));
const STF = path.join(D, 'status_' + path.basename(LIST)), SF = path.join(D, 'stop_' + path.basename(LIST));
const st = fs.existsSync(STF) ? JSON.parse(fs.readFileSync(STF, 'utf8')) : { done: [] };
st.cur = {};
const save = () => fs.writeFileSync(STF, JSON.stringify(st, null, 1));
const COND = { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0', T745_VCLOCK: '1', T699_ROUTE_CACHE: '/tmp/durango-route-cache' };
function runOne(r) {
  return new Promise((resolve) => {
    const dir = path.join(D, 'runs', r.tag); fs.mkdirSync(dir, { recursive: true });
    const pre = [`--require ${path.join(ROOT, 'scripts', 't745-vclock.js')}`];
    if (r.probe != null) pre.push(`--require ${path.join(ROOT, 'scripts', 't1438-decay-probe.js')}`);
    if (r.ablate) pre.push(`--require ${path.join(D, 't1438-ablate.js')}`);   // 갈래 판(가름용 · 제품 무변)
    if (r.heap) pre.unshift('--max-old-space-size=' + r.heap);
    const env = Object.assign({}, process.env, COND, r.env || {}, { T577_DIR: dir, T577_TAG: r.tag, T577_PAR: '1', NODE_OPTIONS: pre.join(' ') });
    if (r.ablate) env.T1438_ABLATE = r.ablate;
    if (r.probe != null) { env.T1438_PROBE_OUT = path.join(dir, 'probe.json'); }
    const o = fs.openSync(path.join(dir, 'run.out'), 'w');
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), String(r.days), String(r.seed)], { cwd: ROOT, env, stdio: ['ignore', o, o] });
    st.cur[r.tag] = { start: new Date().toISOString(), pid: p.pid }; save();
    p.on('exit', (c) => { let freed = 0; try { for (const f of fs.readdirSync(dir)) if (/\.db(-wal|-shm)?$/.test(f) && !r.keepDb) { freed += fs.statSync(path.join(dir, f)).size; fs.unlinkSync(path.join(dir, f)); } } catch (e) {}
      delete st.cur[r.tag]; st.done.push({ tag: r.tag, rc: c == null ? -1 : c, wallS: Math.round((Date.now() - t0) / 1000), end: new Date().toISOString(), freedMB: Math.round(freed / 1e6) }); save(); resolve(); });
  });
}
(async () => {
  st.pid = process.pid; st.list = RUNS.map((r) => r.tag); st.started = st.started || new Date().toISOString(); save();
  const q = RUNS.filter((r) => !st.done.some((x) => x.tag === r.tag));
  await Promise.all(Array.from({ length: Math.min(PAR, q.length) }, async () => {
    while (q.length) { if (fs.existsSync(SF)) return; await runOne(q.shift()); }
  }));
  st.finished = new Date().toISOString(); save();
})();
