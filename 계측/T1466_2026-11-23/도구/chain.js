'use strict';
// T1466 판 사슬 — T1440 도구 chain.js 꼴 + 판정 재기 프리로드(scripts/t1466-judge-probe.js) · 목록 항목 pre: 더 실을 프리로드(트리 안 상대 경로)
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const D = __dirname, LIST = path.resolve(process.argv[2]), PAR = parseInt(process.argv[3] || '1', 10) || 1;
const ROOT = process.env.T1466_ROOT || path.join(D, 'wt');
const RUNS = JSON.parse(fs.readFileSync(LIST, 'utf8'));
const STF = path.join(D, 'status_' + path.basename(LIST)), SF = path.join(D, 'stop_' + path.basename(LIST));
const st = fs.existsSync(STF) ? JSON.parse(fs.readFileSync(STF, 'utf8')) : { done: [] };
st.cur = {};
const save = () => fs.writeFileSync(STF, JSON.stringify(st, null, 1));
const COND = { VILLAGE_CARAVAN_MAX: '0', T745_VCLOCK: '1', T699_ROUTE_CACHE: '/tmp/durango-route-cache' };
function runOne(r) {
  return new Promise((resolve) => {
    const dir = path.join(D, 'runs', r.tag); fs.mkdirSync(dir, { recursive: true });
    const pre = [`--require ${path.join(ROOT, 'scripts', 't745-vclock.js')}`, `--require ${path.join(ROOT, 'scripts', 't1440-bot-probe.js')}`];
    if (r.jp !== false) pre.push(`--require ${path.join(ROOT, 'scripts', 't1466-judge-probe.js')}`);
    for (const p of r.pre || []) pre.push(`--require ${path.join(ROOT, p)}`);
    const env = Object.assign({}, process.env, COND, r.env || {}, { T577_DIR: dir, T577_TAG: r.tag, T577_PAR: '1', NODE_OPTIONS: pre.join(' '), T1440_BOT_OUT: path.join(dir, 'bot.json'), T1466_JP_OUT: path.join(dir, 'jp.json') });
    if (r.bot != null) env.T1440_BOT_DAY = String(r.bot); else delete env.T1440_BOT_DAY;
    const o = fs.openSync(path.join(dir, 'run.out'), 'w');
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), String(r.days), String(r.seed)], { cwd: ROOT, env, stdio: ['ignore', o, o] });
    st.cur[r.tag] = { start: new Date().toISOString(), pid: p.pid }; save();
    p.on('exit', (c) => {
      let freed = 0; try { for (const f of fs.readdirSync(dir)) if (/\.db(-wal|-shm)?$/.test(f)) { freed += fs.statSync(path.join(dir, f)).size; fs.unlinkSync(path.join(dir, f)); } } catch (e) {}
      delete st.cur[r.tag]; st.done.push({ tag: r.tag, rc: c == null ? -1 : c, wallS: Math.round((Date.now() - t0) / 1000), end: new Date().toISOString(), freedMB: Math.round(freed / 1e6) }); save(); resolve();
    });
  });
}
(async () => {
  st.pid = process.pid; st.list = RUNS.map((r) => r.tag); st.started = st.started || new Date().toISOString(); save();
  const q = RUNS.filter((r) => !st.done.some((x) => x.tag === r.tag && x.rc === 0));
  await Promise.all(Array.from({ length: Math.min(PAR, q.length) }, async () => {
    while (q.length) { if (fs.existsSync(SF)) return; await runOne(q.shift()); }
  }));
  st.finished = new Date().toISOString(); save();
})();
