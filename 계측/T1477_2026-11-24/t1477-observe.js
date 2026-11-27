'use strict';
// === 계측/T1477_2026-11-24/t1477-observe.js — 서버 판 곁 관찰기(읽기만 · 세계 무변 · T1472 관찰기 꼴 + 마을별 칸) ===
//   쓰는 법: T1477_OBS=<폴더> T1477_ARM=<팔> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   econ `tickVillage` 를 감싸 날이 바뀌는 순간 앞 날을 센다(인자 · 돌려주는 값 그대로 — 세계 무변).
//   ① 매 날: 마을마다(사람 > 0 인 마을-날) 나무꾼 0 날 · 땔감 모자란 날(`_fuelCov` < 1) · 생선(생선 + 말림 + 절임) ÷ 사람 · 통나무 ÷ 사람 · 어부 수 · 나무꾼 수를 쌓는다. 겨울(달력 계절)은 따로 한 벌 더.
//   ② 100날마다 · 365날 · 판 끝 날: 인구 · 빈 마을 · 굶어 죽음 누계 · 직업 수 · 마을별 칸 · 생선 · 통나무 곳간 ÷ 사람 가운데 · 가장 낮은 마을 · 이 아이 RSS · CPU 초/날.
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1477_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');   // 존이 도는 트리 — zone.js 자리에서 잡아야 같은 econ 모듈을 감싼다
const OUT = path.join(DIR, `obs-${process.env.T1477_ARM || 'x'}-${process.env.T577_SEED}.json`);
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const CAL = require(path.join(ROOT, 'server', 'calendar'));
const rec = { seed: +process.env.T577_SEED, arm: process.env.T1477_ARM || '?', snaps: [], lastDay: 0, err: null, maxRss: 0, vil: {}, land: {} };
let last = -1, cpu0 = process.cpuUsage(), cpuDay = 0, fishKeys = null;
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fishOf = (st) => { if (!fishKeys) fishKeys = Object.keys(st).filter((k) => k === 'fish' || /^dried_|^pickled_/.test(k)); let t = 0; for (const k of fishKeys) t += +st[k] || 0; return t; };
function vils() { const VIL = require(path.join(ROOT, 'server', 'villages')); return VIL.__labProbe._t569Probe.setup().villages || []; }
function perVil(vil) {
  const e = vil.econ; if (!e) return null;
  const n = (e.npcs || []).length, c = e.counts || {}, st = e.storage || {};
  return { e, n, lj: c.lumberjack || 0, fi: c.fisher || 0, fuel: e._fuelCov, fish: fishOf(st), wood: +st.wood || 0 };
}
function daily(day) {
  let win = false; try { win = CAL.seasonOf(day) === 'winter'; } catch (e) {}
  for (const vil of vils()) {
    const p = perVil(vil); if (!p) continue;
    const a = rec.vil[vil.name] || (rec.vil[vil.name] = { kind: vil._kindKo || '?', vd: 0, w0: 0, fs: 0, fpp: 0, wpp: 0, lj: 0, fi: 0, wvd: 0, ww0: 0, wfs: 0, wfpp: 0, wwpp: 0 });
    if (!rec.land[vil.name]) { const l = p.e.land || {}; rec.land[vil.name] = { wood: l.wood, water: l.water, fertility: l.fertility, coastal: !!l.coastal }; }
    if (p.n <= 0) continue;
    const z = p.lj === 0 ? 1 : 0, f = (p.fuel !== undefined && p.fuel < 0.999) ? 1 : 0, fp = p.fish / p.n, wp = p.wood / p.n;
    a.vd++; a.w0 += z; a.fs += f; a.fpp += fp; a.wpp += wp; a.lj += p.lj; a.fi += p.fi;
    if (win) { a.wvd++; a.ww0 += z; a.wfs += f; a.wfpp += fp; a.wwpp += wp; }
  }
}
function snap(day) {
  try {
    let pop = 0, vills = 0, empty = 0, emig = 0, dead = 0, fd = 0, wood = 0, fish = 0;
    const jobs = { farmer: 0, fisher: 0, lumberjack: 0, forager: 0, hunter: 0 }, vs = {}, fpp = [], wpp = [];
    for (const vil of vils()) {
      const p = perVil(vil); if (!p) continue; const e = p.e; vills++;
      pop += p.n; if (p.n === 0) empty++;
      emig += e._emigTot || 0; dead += e._deadTot || 0; fd += e._fdDeadTot || 0; wood += p.wood; fish += p.fish;
      const c = e.counts; if (c) { for (const k in jobs) jobs[k] += c[k] || 0; } else for (const q of (e.npcs || [])) if (q && q.job in jobs) jobs[q.job]++;
      vs[vil.name] = [p.n, +(p.fuel === undefined ? 1 : p.fuel).toFixed(3), +p.fish.toFixed(1), +p.wood.toFixed(1), p.lj, p.fi];
      if (p.n > 0) { fpp.push(p.fish / p.n); wpp.push(p.wood / p.n); }
    }
    const c = process.cpuUsage(cpu0), dd = Math.max(1, day - cpuDay), rss = process.memoryUsage().rss;
    cpu0 = process.cpuUsage(); cpuDay = day; rec.maxRss = Math.max(rec.maxRss, rss);
    rec.snaps.push({ day, pop, vills, empty, emig, dead, fd, jobs, wood: +wood.toFixed(1), fish: +fish.toFixed(1),
      fishPPmed: med(fpp), fishPPmin: fpp.length ? Math.min.apply(null, fpp) : null, woodPPmed: med(wpp), woodPPmin: wpp.length ? Math.min.apply(null, wpp) : null,
      vs, rss, cpuPerDay: +((c.user + c.system) / 1e6 / dd).toFixed(3) });
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  write();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) {
    if (last > 0) { try { daily(last); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); } if (last % 100 === 0 || last === 365) snap(last); }
    last = day; rec.lastDay = day;
  }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0 && !rec.snaps.some((s) => s.day === last)) snap(last); });
