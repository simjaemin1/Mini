'use strict';
// T1440 판 결과 모으기 — pop · bot · tick 판 폴더에서 보고 표의 수를 뽑는다
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, 'runs');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };
const logCount = (dir, re) => { let n = 0; try { for (const f of fs.readdirSync(dir)) if (/\.log$/.test(f)) { const t = fs.readFileSync(path.join(dir, f), 'utf8'); const m = t.match(re); n += m ? m.length : 0; } } catch (e) {} return n; };
const out = { pop: {}, bot: {}, tick: {} };
for (const seed of [1020, 7, 42]) {
  const row = {};
  for (const arm of ['ON', 'OFF']) {
    const tag = ['g', 'f', ''].map((x) => `POP_${arm}_${seed}${x}`).find((t) => rd(path.join(R, t, `${t}-${seed}.json`))) || `POP_${arm}_${seed}`;   // 마지막 코드 판(g = 몸 길 잇기 고친 뒤 · f)이 있으면 그것
    const dir = path.join(R, tag), J = rd(path.join(dir, `${tag}-${seed}.json`)), B = rd(path.join(dir, 'bot.json'));
    if (!J) continue;
    const T = B && B.t1440;
    row[arm] = { tag, pop: J.eight && J.eight.pop, dead: J.deadTot, war: J.bodyExit && J.bodyExit.died && J.bodyExit.died.war, move: J.bodyExit && J.bodyExit.walk && J.bodyExit.walk.move, empty: J.empty,
      fd: (rd(path.join(dir, `${tag}-${seed}.fd-deaths.json`)) || {}).fdDeadTot, iso: logCount(dir, /보존 귀환/g), tick: B && B.tick,
      t: T ? { flush: T.flush, drop: T.drop, keep: T.keep, reopen: T.reopen, reroute: T.reroute, rerouteFail: T.rerouteFail, stepHit: T.stepHit, siteClose: T.siteClose, siteProt: T.siteProt, route1: T.route1, route2: T.route2, judgeCpu: Math.round(T.judgeCpu || 0), cpu: T.cpu, pairs: T.pairs, noRoute: T.noRoute, claimStop: T.claimStop, applied: T.applied, tempUnclear: T.tempUnclear, walkRedo: T.walkRedo | 0, chainRedo: T.chainRedo | 0, claimThru: T.claimThru | 0 } : null };
  }
  row.ratio = row.ON && row.OFF ? +(row.ON.pop / row.OFF.pop).toFixed(3) : null;
  out.pop[seed] = row;
}
for (const seed of [1020, 7, 42]) {
  const row = {};
  for (const arm of ['ON', 'OFF', 'CTL']) {
    const tag = [`BOT_${arm}_${seed}g`, `BOT_${arm}_${seed}`].find((t) => rd(path.join(R, t, `${t}-${seed}.json`))) || `BOT_${arm}_${seed}`, dir = path.join(R, tag), B = rd(path.join(dir, 'bot.json')), J = rd(path.join(dir, `${tag}-${seed}.json`));
    if (!B) continue;
    const last = B.days[B.days.length - 1] || {};
    const G = {};
    for (const [k, g] of Object.entries(B.groups || {})) {
      const claims = (g.claims || []).concat(g.claimsB || [], g.claimsC || []);
      const cl = claims.map((c) => c.cpu || 0);
      G[k] = { at: g.at, routes: g.routes, want: g.want, verdicts: g.verdicts, cpuMs: g.cpuMs, claimCpuMax: cl.length ? Math.max(...cl) : null, pieces: (g.pieces || []).length, claims: claims.length,
        passN: claims.filter((c) => c.pass).length, last: last.g && last.g[k], yieldAt: g.yieldAt, maxProt: g.maxProt, steps: g.steps ? g.steps.length : null, stop: g.stop, again: g.again ? g.again.map((a) => [a.d, a.ok ? 1 : 0, a.vp]) : null,
        j: claims.filter((c) => c.j && c.j.pairs).map((c) => [c.x, c.y, c.v, c.j.pairs, c.j.cpu, c.j.step, c.j.n && c.j.n.full]) };
    }
    const allClaims = Object.values(B.groups || {}).flatMap((g) => (g.claims || []).concat(g.claimsB || [], g.claimsC || []));
    const cpus = allClaims.filter((c) => c.ok).map((c) => c.cpu || 0);
    row[arm] = { tag, pop: J && J.eight && J.eight.pop, iso: last.iso, isoLog: logCount(dir, /보존 귀환/g), z: B.zone ? { breaks: B.zone.breaks, breakU: B.zone.breakU, breakMark: B.zone.breakMark, breakPass: B.zone.breakPass, vilBreak: B.zone.vilBreak, vpOff: B.zone.vpOff, vpOn: B.zone.vpOn, pend: B.zone.pend, roadNote: B.zone.roadNote, close: B.zone.close, closeVil: B.zone.closeVil, passOther: B.zone.passOther, passVil: B.zone.passVil, vilJob: B.zone.vilJob, freeBreak: B.zone.freeBreak, ask: B.zone.ask } : null,
      viol: (B.viol || []).length, passed: (B.passed || []).length, claimCpu: { n: cpus.length, p50: q(cpus, 0.5), p90: q(cpus, 0.9), p99: q(cpus, 0.99), max: cpus.length ? Math.max(...cpus) : null }, placeCpu: B.placeCpu, pickCpu: B.pickCpu,
      vp: last.vp, width: B.widthStat, tick: B.tick, tickPre: B.tickPre, groups: G, err: B.err, t1440: B.t1440 ? { route1: B.t1440.route1, route2: B.t1440.route2, reroute: B.t1440.reroute, rerouteFail: B.t1440.rerouteFail, claimStop: B.t1440.claimStop, claimThru: B.t1440.claimThru | 0, walkRedo: B.t1440.walkRedo | 0, chainRedo: B.t1440.chainRedo | 0, noRoute: B.t1440.noRoute, vilJob: B.t1440.vilJob, markHit: B.t1440.markHit, stepHit: B.t1440.stepHit, cpu: B.t1440.cpu, drop: B.t1440.drop, keep: B.t1440.keep, tTemp: B.t1440.tTemp } : null };
  }
  out.bot[seed] = row;
}
for (const arm of ['ON', 'OFF']) { const B = rd(path.join(R, `TICK_${arm}_1020`, 'bot.json')); if (B) out.tick[arm] = { tick: B.tick, tickPre: B.tickPre, err: B.err, placeCpu: B.placeCpu, width: B.widthStat }; }
const f = process.argv[2] || path.join(__dirname, 'analysis.json');
fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.pop), '\n', JSON.stringify(Object.fromEntries(Object.entries(out.bot).map(([s, r]) => [s, Object.fromEntries(Object.entries(r).map(([a, x]) => [a, { pop: x.pop, iso: x.iso, isoLog: x.isoLog, viol: x.viol, z: x.z, claimCpu: x.claimCpu }]))]))));
