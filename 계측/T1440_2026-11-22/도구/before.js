'use strict';
// 고치기 전(몸 길 잇기가 구조물 표를 안 보던 켬 판) ↔ 끈 판 — 로그에서 센다
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, 'runs');
const cnt = (dir, re) => { let n = 0; try { for (const f of fs.readdirSync(dir)) if (/\.log$/.test(f)) { const m = fs.readFileSync(path.join(dir, f), 'utf8').match(re); n += m ? m.length : 0; } } catch (e) {} return n; };
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const out = {};
for (const tag of process.argv.slice(2)) {
  const dir = path.join(R, tag); const seed = tag.match(/_(\d+)[a-z]?$/)[1];
  const J = rd(path.join(dir, `${tag}-${seed}.json`)), B = rd(path.join(dir, 'bot.json')), FD = rd(path.join(dir, `${tag}-${seed}.fd-deaths.json`));
  out[tag] = { block: cnt(dir, /차단 감지/g), delay: cnt(dir, /econ 도착 \+\d+일/g), t1440re: cnt(dir, /\[T1440\] 국소 재경로 실패/g), iso: cnt(dir, /완전 고립/g), pop: J && J.eight && J.eight.pop,
    fd: FD && FD.fdDeadTot, war: J && J.bodyExit && J.bodyExit.died && J.bodyExit.died.war, move: J && J.bodyExit && J.bodyExit.walk && J.bodyExit.walk.move, dead: J && J.deadTot,
    stepHit: B && B.t1440 && B.t1440.stepHit, reroute: B && B.t1440 && B.t1440.reroute };
}
console.log(JSON.stringify(out, null, 0).replace(/\},/g, '},\n'));
fs.writeFileSync(path.join(__dirname, process.env.OUT || 'before.json'), JSON.stringify(out, null, 1));
