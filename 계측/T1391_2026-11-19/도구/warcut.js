'use strict';
// 전쟁 판 자르기 — 관찰기 줄이 CUT 날에 닿으면 그 판 존을 멈춘다(365날 뒤 전쟁 날이 느려 800날은 한 판 ~9시간 — T1349 §4 와 같은 꼴)
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const D = __dirname, CUT = parseInt(process.argv[2] || '390', 10);
const tags = { OFF_W: 'wW', NH_W: 'wNH', ALL_W: 'wALL' };
const cut = {};
const tick = () => {
  for (const [tag, list] of Object.entries(tags)) {
    if (cut[tag]) continue;
    let n = 0; try { n = JSON.parse(fs.readFileSync(path.join(D, 'runs', tag, `${tag}-1020.json.t1391.json`), 'utf8')).w.length; } catch (e) { continue; }
    if (n < CUT) continue;
    let st = null; try { st = JSON.parse(fs.readFileSync(path.join(D, `status_${list}.json`), 'utf8')); } catch (e) { continue; }
    const c = st.cur && st.cur[tag]; if (!c) continue;
    const ps = execSync('ps -eo pid,ppid,args').toString().split('\n').map((l) => l.trim().split(/\s+/)).filter((a) => a.length > 2 && +a[1] === c.pid && /zone\.js/.test(a.slice(2).join(' ')));
    for (const a of ps) { try { process.kill(+a[0], 'SIGKILL'); } catch (e) {} }
    cut[tag] = 1; fs.appendFileSync(path.join(D, 'waiter.log'), `${new Date().toISOString()} cut ${tag} at ${n} days (zone ${ps.map((a) => a[0]).join(',')})\n`);
  }
  if (Object.keys(cut).length === 3) clearInterval(T);
};
const T = setInterval(tick, 20000); tick();
