'use strict';
// rest2 사슬 — FS_1020 이 돌기 시작하면 멈춤 파일(그 뒤 LR · L 은 안 띄운다) · 사슬이 끝나면 rest3(LR · L 첫 해 365날)를 띄운다
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const D = __dirname;
const tick = () => {
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(D, 'status_rest2.json'), 'utf8')); } catch (e) {}
  if (j && j.cur && j.cur.FS_1020 && !fs.existsSync(path.join(D, 'stop_rest2.json'))) fs.writeFileSync(path.join(D, 'stop_rest2.json'), 'FS_1020 뒤 멈춤 — LR · L 은 rest3(365날)\n');
  if (j && j.finished) {
    const o = fs.openSync(path.join(D, 'chain_rest3.out'), 'a');
    const p = spawn('node', [path.join(D, 'chain.js'), path.join(D, 'rest3.json'), '1'], { detached: true, stdio: ['ignore', o, o] }); p.unref();
    fs.writeFileSync(path.join(D, 'chain_rest3.pid'), String(p.pid) + '\n');
    process.exit(0);
  }
  setTimeout(tick, 15000);
};
tick();
