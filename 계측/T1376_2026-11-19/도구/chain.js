'use strict';
// T1376 판 사슬 — e2e-xzone-caravan(가상 시계)을 차례로(포트 고정 · 한 번에 하나) · 끝난 판은 건너뛴다 · pause/stop 파일.
//   node chain.js <목록 JSON 파일> — [{tag, wt, env}] · 출력 e2e/<tag>.txt · 존 로그 e2e/<tag>/ · 상태 status_<목록>.json
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const D = __dirname, LIST = path.resolve(process.argv[2]);
const RUNS = JSON.parse(fs.readFileSync(LIST, 'utf8'));
const STF = path.join(D, 'status_' + path.basename(LIST));
const PF = path.join(D, 'pause_' + path.basename(LIST)), SF = path.join(D, 'stop_' + path.basename(LIST));   // 목록마다 따로(일반 'stop' 은 안 본다)
const st = fs.existsSync(STF) ? JSON.parse(fs.readFileSync(STF, 'utf8')) : { done: [] };
const save = () => fs.writeFileSync(STF, JSON.stringify(st, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  st.pid = process.pid; st.list = RUNS.map((r) => r.tag); st.started = st.started || new Date().toISOString(); save();
  for (const r of RUNS) {
    if (st.done.some((x) => x.tag === r.tag)) continue;
    while (fs.existsSync(PF) && !fs.existsSync(SF)) { st.paused = new Date().toISOString(); save(); await sleep(10000); }
    if (fs.existsSync(SF)) { st.stopped = new Date().toISOString(); save(); process.exit(0); }
    st.paused = null;
    const ED = path.join(D, 'e2e'); fs.mkdirSync(ED, { recursive: true });
    st.cur = { tag: r.tag, start: new Date().toISOString(), env: r.env, wt: r.wt }; save();
    const t0 = Date.now();
    const o = fs.openSync(path.join(ED, `${r.tag}.txt`), 'w'), oe = fs.openSync(path.join(ED, `${r.tag}.err`), 'w');
    const env = Object.assign({}, process.env, { XZ_SHOTS: path.join(ED, r.tag) }, r.env || {});
    const p = spawn(process.execPath, [r.script || 'scripts/e2e-xzone-caravan.js'].concat(r.args || []), { cwd: r.wt, stdio: ['ignore', o, oe], env });
    const rc = await new Promise((res) => p.on('exit', (c) => res(c == null ? -1 : c)));
    st.done.push({ tag: r.tag, rc, wallS: Math.round((Date.now() - t0) / 1000), end: new Date().toISOString() });
    st.cur = null; save();
  }
  st.finished = new Date().toISOString(); save();
})();
