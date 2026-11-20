'use strict';
// 앞 사슬(status_<a>.json finished)이 끝나면 다음 사슬(<b>)을 띄운다 — 포트를 한 번에 하나만 쥔다.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const [A, B] = process.argv.slice(2), D = __dirname;
const t = setInterval(() => {
  let s = null; try { s = JSON.parse(fs.readFileSync(path.join(D, 'status_' + A), 'utf8')); } catch (e) {}
  if (s && (s.finished || s.stopped)) { clearInterval(t); const o = fs.openSync(path.join(D, 'chain_' + B + '.log'), 'a'); const p = spawn(process.execPath, [path.join(D, 'chain.js'), path.join(D, B)], { detached: true, stdio: ['ignore', o, o] }); p.unref(); fs.writeFileSync(path.join(D, 'after_' + B + '.txt'), 'started ' + p.pid + ' ' + new Date().toISOString()); process.exit(0); }
}, 15000);
