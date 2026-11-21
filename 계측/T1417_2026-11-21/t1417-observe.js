'use strict';
// === 계측/T1417_2026-11-21/t1417-observe.js — 서버 판 곁 관찰기(읽기만 · 세계 무변 · T1360 관찰기 꼴) ===
//   쓰는 법: T1417_OBS=<폴더> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   100날마다(100 · 200 · 300 · 400 · 그리고 판 끝 날): 인구 · 마을 수 · 빈 마을(사람 0) · 식량(하루치 = 식량등가 합 ÷ 사람) ·
//     떠난 사람 누계(econ `_emigTot`) · 죽음 누계(econ `_deadTot`) · 청동 누계(econ `_bronzeWeaponMade` — 주조 산출 × bronzeness 의 합 · 청동 근접무기 만든 양) · CPU 초/날(이 아이 프로세스 · 직전 칸 뒤)
//   econ `tickVillage` 를 감싸 날이 바뀌는 순간 앞 날을 적는다(인자 · 돌려주는 값 그대로 — 세계 무변).
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1417_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');   // 존이 도는 트리(작업 트리일 수 있다 — 관찰기 자리 말고 zone.js 자리에서 잡아야 같은 econ 모듈을 감싼다)
const OUT = path.join(DIR, `obs-${process.env.T1417_ARM || 'x'}-${process.env.T577_SEED}.json`);
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { seed: +process.env.T577_SEED, arm: process.env.T1417_ARM || '?', snaps: [], lastDay: 0, err: null };
let last = -1, cpu0 = process.cpuUsage(), cpuDay = 0;
function snap(day) {
  try {
    const VIL = require(path.join(ROOT, 'server', 'villages'));
    const P = VIL.__labProbe._t569Probe.setup();
    let pop = 0, vills = 0, empty = 0, fe = 0, emig = 0, dead = 0, bronze = 0;
    for (const vil of (P.villages || [])) {
      const e = vil.econ; if (!e) continue; vills++;
      const n = (e.npcs || []).length; pop += n; if (n === 0) empty++;
      try { fe += +V1.totalFoodEquivalent(e) || 0; } catch (err) {}
      emig += e._emigTot || 0; dead += e._deadTot || 0;
      bronze += +e._bronzeWeaponMade || 0;
    }
    const c = process.cpuUsage(cpu0), dd = Math.max(1, day - cpuDay);
    cpu0 = process.cpuUsage(); cpuDay = day;
    rec.snaps.push({ day, pop, vills, empty, foodDays: pop ? +(fe / pop).toFixed(2) : null, emig, dead, bronze: +bronze.toFixed(2),
      cpuPerDay: +((c.user + c.system) / 1e6 / dd).toFixed(3) });
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {}
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) { if (last > 0 && last % 100 === 0) snap(last); last = day; rec.lastDay = day; }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0 && !rec.snaps.some((s) => s.day === last)) snap(last); });
