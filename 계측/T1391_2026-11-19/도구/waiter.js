'use strict';
// 전쟁 판 둘씩 — OFF_W 사슬(wW · 멈춤 파일)이 끝나면 ALL_W(wALL)를 띄운다(NH_W 는 손으로 먼저 띄웠다)
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const D = __dirname, ROOT = path.join(D, 'wt');
const st = (n) => { try { return JSON.parse(fs.readFileSync(path.join(D, 'status_' + n + '.json'), 'utf8')); } catch (e) { return null; } };
let done = false;
const tick = () => {
  const w = st('wW');
  if (!done && w && w.finished) {
    done = true;
    const o = fs.openSync(path.join(D, 'chain_wALL.out'), 'a');
    const p = spawn(process.execPath, [path.join(D, 'chain.js'), path.join(D, 'wALL.json'), '1'], { detached: true, stdio: ['ignore', o, o], env: Object.assign({}, process.env, { T1391_ROOT: ROOT }) });
    p.unref(); fs.appendFileSync(path.join(D, 'waiter.log'), `${new Date().toISOString()} start wALL pid ${p.pid}\n`);
    clearInterval(T);
  }
};
const T = setInterval(tick, 30000); tick();
