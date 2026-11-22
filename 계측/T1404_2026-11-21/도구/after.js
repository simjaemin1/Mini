'use strict';
// node after.js <상태 JSON> <출력 로그> <명령> [인자…] — 상태 파일에 finished 가 서면 명령을 띄운다(분리 · 출력은 로그) · 30초마다 본다
const fs = require('fs'), { spawn } = require('child_process');
const [st, out, cmd, ...args] = process.argv.slice(2);
const tick = () => {
  let j = null; try { j = JSON.parse(fs.readFileSync(st, 'utf8')); } catch (e) {}
  if (j && j.finished) {
    const o = fs.openSync(out, 'a');
    const p = spawn(cmd, args, { detached: true, stdio: ['ignore', o, o] }); p.unref();
    fs.writeFileSync(out + '.pid', String(p.pid) + '\n');
    process.exit(0);
  }
  setTimeout(tick, 30000);
};
tick();
