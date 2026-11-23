'use strict';
// 봇 판 한 눈(무리마다 · 날 끝 상태 · 판정 · 부숨) — node peek.js BOT_ON_1020
const fs = require('fs'), path = require('path');
const tag = process.argv[2] || 'BOT_ON_1020';
const b = JSON.parse(fs.readFileSync(path.join(__dirname, 'runs', tag, 'bot.json'), 'utf8'));
const last = b.days[b.days.length - 1] || {};
console.log(tag, 'days', b.days.length, 'placed', b.placed, 'placeCpu', b.placeCpu, 'err', b.err, 'iso', last.iso, 'vp', last.vp, 'z', JSON.stringify(last.z), 't', JSON.stringify(last.t));
for (const [k, g] of Object.entries(b.groups || {})) {
  const cl = (g.claims || []).concat(g.claimsB || [], g.claimsC || []);
  console.log('==', k, 'at', JSON.stringify(g.at), 'routes', g.routes, 'pairs', g.pairs, 'want', g.want, 'cpu', g.cpuMs, 'verdicts', JSON.stringify(g.verdicts), 'end', JSON.stringify(last.g && last.g[k]), g.vil || '');
  const heavy = cl.filter((c) => c.cpu > 500 || c.v === 'yield');
  for (const c of heavy) console.log('   claim', c.x, c.y, 'lvl', c.lvl, c.v, 'pass', c.pass ? 1 : 0, 'cpu', c.cpu, c.j ? JSON.stringify({ pairs: c.j.pairs, step: c.j.step, n: c.j.n, tm: c.j.tm }) : '');
  if (g.steps) console.log('   steps', g.steps.length, 'yieldAt', g.yieldAt, 'maxProt', g.maxProt, 'stop', g.stop, JSON.stringify(g.steps.slice(-2)));
  if (g.again && g.again.length) console.log('   again', g.again.length, JSON.stringify(g.again.slice(0, 6)), '... last vp', g.again[g.again.length - 1].vp);
}
console.log('viol', JSON.stringify(b.viol), 'passed', JSON.stringify(b.passed || []));
console.log('width', JSON.stringify(b.widthStat));
console.log('tick', JSON.stringify(b.tick), 'pre', JSON.stringify(b.tickPre));
const T = b.t1440 || {};
console.log('t1440', JSON.stringify({ flush: T.flush, drop: T.drop, keep: T.keep, reopen: T.reopen, reroute: T.reroute, rerouteFail: T.rerouteFail, stepHit: T.stepHit, markHit: T.markHit, claimStop: T.claimStop, noRoute: T.noRoute, vilJob: T.vilJob, route1: T.route1, route2: T.route2, judge: T.rr && T.rr.judge, step: T.rr && T.rr.step, cpu: T.cpu }));
console.log('zone', JSON.stringify(b.zone && Object.assign({}, b.zone, { gate: undefined, cls: undefined })));
console.log('vpBots', JSON.stringify((b.vpBots || []).slice(0, 12)));
