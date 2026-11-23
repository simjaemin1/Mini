'use strict';
// T1404 판 사슬 — 서버 판 자(`t577-server-run.js`)를 판 목록대로 · 동시 PAR 개(기본 1) · 끝난 판은 건너뛴다 · stop_<목록> 파일이면 새 판을 안 띄운다.
//   node chain.js <목록 JSON> [PAR]   — [{tag, seed, days, env, kind?}] · kind 'sbc'(기본 — 서버 기준선 조건 · 가상 시계) | 'war'(전쟁 기준선 조건 · 벽시계) | 'body'(몸 세계 `T577_BODY=1`)
//   판마다 폴더 runs/<tag>/ — 판 JSON · 로그 · t1404 훅 줄(`<tag>-<seed>.json.t1404.json`) · 상태 status_<목록>.json
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const D = __dirname, LIST = path.resolve(process.argv[2]), PAR = parseInt(process.argv[3] || '1', 10) || 1;
const ROOT0 = process.env.T1404_ROOT || path.join(__dirname, '../../..');
const RUNS = JSON.parse(fs.readFileSync(LIST, 'utf8'));
const STF = path.join(D, 'status_' + path.basename(LIST)), SF = path.join(D, 'stop_' + path.basename(LIST));
const st = fs.existsSync(STF) ? JSON.parse(fs.readFileSync(STF, 'utf8')) : { done: [] };
st.cur = {};
const save = () => fs.writeFileSync(STF, JSON.stringify(st, null, 1));
const COND = {
  sbc: { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0', T745_VCLOCK: '1', T699_ROUTE_CACHE: path.join(D, '..', 'route-cache') },
  war: { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0', VILLAGE_NPC_CAP: 'Infinity', T699_ROUTE_CACHE: path.join(D, '..', 'route-cache') },
  body: { T577_BODY: '1', T699_ROUTE_CACHE: path.join(D, '..', 'route-cache') },
};
function runOne(r) {
  const ROOT = r.root || ROOT0;
  return new Promise((resolve) => {
    const dir = path.join(D, 'runs', r.tag); fs.mkdirSync(dir, { recursive: true });
    const kind = r.kind || 'sbc';
    const pre = [];
    if (kind === 'sbc' || (kind === 'body')) pre.push(`--require ${path.join(ROOT, 'scripts', 't745-vclock.js')}`);
    pre.push(`--require ${path.join(D, 't1460hook.js')}`);
    if (kind === 'war' || r.heap) pre.unshift('--max-old-space-size=' + (r.heap || 4608));   // ★판 42 넷 다 — 기본 힙(≈ 2 GB) 한도에서 날 382 에 죽었다 → 힙만 넓힌다(가상 시계 · 판 값 무변)
    const env = Object.assign({}, process.env, COND[kind], r.env || {}, { T577_DIR: dir, T577_TAG: r.tag, T577_PAR: '1', T1404_ROOT: ROOT, NODE_OPTIONS: pre.join(' ') });
    if (kind === 'body') env.T745_VCLOCK = '1';
    const o = fs.openSync(path.join(dir, 'run.out'), 'w');
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), String(r.days), String(r.seed)], { cwd: ROOT, env, stdio: ['ignore', o, o] });
    st.cur[r.tag] = { start: new Date().toISOString(), pid: p.pid }; save();
    p.on('exit', (c) => { let freed = 0; try { for (const f of fs.readdirSync(dir)) if (/\.db(-wal|-shm)?$/.test(f)) { freed += fs.statSync(path.join(dir, f)).size; fs.unlinkSync(path.join(dir, f)); } } catch (e) {}   // 존 DB(판마다 수백 MB)는 판 JSON · 훅 줄을 쓴 뒤 지운다
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
