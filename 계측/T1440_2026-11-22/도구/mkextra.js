'use strict';
// extra.json — 보고 표의 모은 수(봇 판 3시드 · 인구 판 · 틱 판)
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, 'runs'), S = [1020, 7, 42];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };
const fin = (t) => { const m = /_(\d+)[a-z]?$/.exec(t); return !!m && fs.existsSync(path.join(R, t, `${t}-${m[1]}.json`)); };
const B = (tag) => rd(path.join(R, fin(tag + 'g') ? tag + 'g' : tag, 'bot.json'));   // 몸 길 잇기 고친 뒤 판(g)이 끝났으면 그것
const st = (s) => rd(path.join(__dirname, s)) || { done: [] };
const wall = {}; for (const f of ['status_pop.json', 'status_pop2.json', 'status_pop3.json', 'status_bot.json', 'status_bot2.json', 'status_bot3.json', 'status_tick.json']) for (const d of st(f).done) if (d.rc === 0) wall[d.tag] = d.wallS;
const X = { refer: 0 };
//   봇 판 켬 — 선포 CPU · 폭 · 손짓 · 길이 지나는 칸
const cc = [], heavy = []; let acts = 0, passed = 0, passCells = 0, wEsc = 0, wM = 0, wOff = 0, wEscCells = 0, wEscP99 = 0, wEscMax = 0, wMMax = 0;
const ex = {};
for (const s of S) {
  const b = B(`BOT_ON_${s}`), o = B(`BOT_OFF_${s}`), c = B(`BOT_CTL_${s}`); if (!b) continue;
  acts += b.acts || 0; passed += (b.passed || []).length;
  if (b.widthStat) { wEsc += b.widthStat.esc; wM += b.widthStat.bodies; wOff += b.widthStat.offCell; wEscCells += b.widthStat.cells; const d = b.widthStat.d || {}, m = b.widthStat.m || {}; wEscP99 = Math.max(wEscP99, d.p99 || 0); wEscMax = Math.max(wEscMax, d.max || 0); wMMax = Math.max(wMMax, m.max || 0); }
  const last = b.days[b.days.length - 1] || {}, lo = o ? o.days[o.days.length - 1] || {} : {}, lc = c ? c.days[c.days.length - 1] || {} : {};
  for (const [k, g] of Object.entries(b.groups || {})) {
    const cl = (g.claims || []).concat(g.claimsB || [], g.claimsC || []);
    for (const x of cl) { if (x.ok) cc.push(x.cpu || 0); if (x.pass) passCells++; if (x.j && x.j.cpu > 5000) heavy.push([s, k, x.x, x.y, x.lvl, x.v, x.j.pairs, x.j.cpu, x.j.n && x.j.n.full, JSON.stringify(x.j.step)]); }
    const e = ex[k] || (ex[k] = { on: [], off: [], ctl: [] });
    const end = (last.g || {})[k] || [], eo = (lo.g || {})[k] || [], ec = (lc.g || {})[k] || [];
    e.on.push({ s, at: g.at, routes: g.routes, want: g.want, v: g.verdicts, end, pieces: (g.pieces || []).length, claims: cl.length, passN: cl.filter((x) => x.pass).length, yieldAt: g.yieldAt, maxProt: g.maxProt, steps: g.steps ? g.steps.length : null, stop: g.stop, again: g.again ? g.again.length : 0, againVp: g.again && g.again.length ? g.again[g.again.length - 1].vp : 0, cpu: g.cpuMs, vil: g.vil,
      offAt: g.offAt, stepsArr: g.steps, adj0: g.adj0, adj1: g.adj1, d0: g.d0, d1: g.d1, thru0: g.thru0, thru1: g.thru1, shopAt: g.shopAt, stopWhy: g.stop, keepB: g.claimsB && g.claimsB[0] ? { v: g.claimsB[0].v, pass: g.claimsB[0].pass } : null });
    const og = o && o.groups && o.groups[k]; e.off.push({ s, end: eo, pieces: og ? (og.pieces || []).length : null });
    const cg = c && c.groups && c.groups[k]; e.ctl.push({ s, end: ec, pieces: cg ? (cg.pieces || []).length : null });
  }
  if (s === 1020) { const g = b.groups.neck; const j = (g.claims || []).find((x) => x.v === 'yield'); X.neckJ = j && j.j ? { cpu: j.j.cpu, pairs: j.j.pairs, full: j.j.n.full } : { cpu: 0, pairs: 0, full: 0 }; X.again1020 = g.again ? g.again.length : 0; X.againVp1020 = g.again && g.again.length ? g.again[g.again.length - 1].vp : 0; }
}
X.road = { ask: 0, avoid: 0, keep: 0, keepCells: 0 }; for (const s of S) { const b = B(`BOT_ON_${s}`); const r = b && b.zone && b.zone.road; if (r) for (const k of Object.keys(X.road)) X.road[k] += r[k] || 0; }
X.claimCpu = { n: cc.length, p50: q(cc, 0.5), p90: q(cc, 0.9), p99: q(cc, 0.99), max: cc.length ? Math.max(...cc) : null };
X.acts = acts; X.passedLower = passed; X.passCells = passCells; X.widthEsc = wEsc; X.widthM = wM; X.widthOff = `${wOff}/${wEscCells}`; X.widthEscP99 = wEscP99; X.widthEscMax = wEscMax; X.widthMMax = wMMax;
X.ex = ex; X.heavy = heavy;
//   인구 판 켬 — NPC 터 판정 · 버림 · 다시 열림 · 선 걸음
const site = { n: 0, p50: [], p90: [], p99: [], max: 0, close: 0, prot: 0 }; let reopen = 0, stepHit = 0, reroute = 0, rerouteFail = 0, walkRedo = 0, chainRedo = 0;
const A = rd(path.join(__dirname, 'analysis.json'));
X.popWall = {}; let slowOn = 0, slowOff = 0;
for (const s of S) {
  const on = A.pop[s] && A.pop[s].ON, off = A.pop[s] && A.pop[s].OFF; if (!on || !on.t) continue;
  const c = on.t.cpu || {}; site.n += c.n || 0; if (c.p50 != null) site.p50.push(c.p50); if (c.p90 != null) site.p90.push(c.p90); if (c.p99 != null) site.p99.push(c.p99); site.max = Math.max(site.max, c.max || 0);
  site.close += on.t.siteClose || 0; site.prot += on.t.siteProt || 0; reopen += on.t.reopen || 0; stepHit += on.t.stepHit || 0; reroute += on.t.reroute || 0; rerouteFail += on.t.rerouteFail || 0; walkRedo += on.t.walkRedo || 0; chainRedo += on.t.chainRedo || 0;
  const wo = wall[on.tag], wf = off && wall[off.tag]; X.popWall[s] = `${wo || '—'}초(끔 ${wf || '—'}초)`; if (wo && wf) { slowOn += wo; slowOff += wf; }
}
X.siteN = site.n; X.siteP50 = Math.max(...site.p50, 0); X.siteP90 = Math.max(...site.p90, 0); X.siteP99 = Math.max(...site.p99, 0); X.siteMax = site.max; X.siteClose = site.close; X.siteProt = site.prot;
X.reopen = reopen; X.stepHit = stepHit; X.reroute = reroute; X.rerouteFail = rerouteFail; X.walkRedo = walkRedo; X.chainRedo = chainRedo;
X.botT = { claimStop: 0, claimThru: 0, reroute: 0, rerouteFail: 0, stepHit: 0, walkRedo: 0 }; for (const s of S) { const b = B(`BOT_ON_${s}`); const T = b && b.t1440; if (T) for (const k of Object.keys(X.botT)) X.botT[k] += T[k] || 0; } X.popSlow = slowOff ? (slowOn / slowOff).toFixed(2) : '—';
//   틱
const T = {}; for (const a of ['ON', 'OFF']) { const b = B(`TICK_${a}_1020`); if (b) T[a] = b.tick; }
X.tickOn = T.ON ? T.ON.p99 : '—'; X.tickOff = T.OFF ? T.OFF.p99 : '—';
X.tickRows = ['ON', 'OFF'].map((a) => { const t = T[a]; return t ? `| ${a === 'ON' ? '켬' : '끔'} | ${t.n.toLocaleString('en-US')} | ${t.p50} ms | ${t.p90} ms | ${t.p99} ms | ${t.p999} ms | ${t.max} ms |` : `| ${a === 'ON' ? '켬' : '끔'} | — | — | — | — | — | — |`; }).join('\n');
fs.writeFileSync(path.join(__dirname, 'extra_auto.json'), JSON.stringify(X, null, 1));
console.log(JSON.stringify({ claimCpu: X.claimCpu, acts, passed, passCells, width: [wM, wEsc, X.widthOff], site: [X.siteN, X.siteP50, X.siteP99, X.siteMax, X.siteClose, X.siteProt], reopen, stepHit, reroute, rerouteFail, popWall: X.popWall, popSlow: X.popSlow, tick: [X.tickOn, X.tickOff], heavy: heavy.length }));
for (const [k, e] of Object.entries(ex)) console.log(k, JSON.stringify(e.on.map((x) => [x.s, x.routes, x.v, x.end, x.passN, x.again, x.yieldAt, x.maxProt])), 'off', JSON.stringify(e.off.map((x) => x.end)), 'ctl', JSON.stringify(e.ctl.map((x) => x.end)));
for (const h of heavy) console.log('heavy', JSON.stringify(h));
