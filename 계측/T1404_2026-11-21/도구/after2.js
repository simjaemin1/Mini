'use strict';
// rest 사슬이 끝나면 — L_1020 이 죽었으면(rc ≠ 0) 판 폴더를 옮기고 rest2 목록 끝에 큰 힙으로 더한 뒤 rest2 사슬을 띄운다
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const D = __dirname;
const tick = () => {
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(D, 'status_rest.json'), 'utf8')); } catch (e) {}
  if (j && j.finished) {
    const L = (j.done || []).find((x) => x.tag === 'L_1020');
    if (!L || L.rc !== 0) {
      try { fs.renameSync(path.join(D, 'runs', 'L_1020'), path.join(D, 'runs_dead_L_1020_heap2g')); } catch (e) {}
      const R = JSON.parse(fs.readFileSync(path.join(D, 'rest2.json'), 'utf8'));
      const M = JSON.parse(fs.readFileSync(path.join(D, 'main.json'), 'utf8')).find((r) => r.tag === 'L_1020');
      if (M && !R.some((r) => r.tag === 'L_1020')) { R.push(Object.assign({}, M, { heap: 4608 })); fs.writeFileSync(path.join(D, 'rest2.json'), JSON.stringify(R, null, 1)); }
    }
    const o = fs.openSync(path.join(D, 'chain_rest2.out'), 'a');
    const p = spawn('node', [path.join(D, 'chain.js'), path.join(D, 'rest2.json'), '1'], { detached: true, stdio: ['ignore', o, o] }); p.unref();
    fs.writeFileSync(path.join(D, 'chain_rest2.pid'), String(p.pid) + '\n');
    process.exit(0);
  }
  setTimeout(tick, 15000);
};
tick();
