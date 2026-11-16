// 서버 판 계측(세계 0 · 읽기만) — T1334: 두 해 판 아이(판에서 난 사람 중 오늘 마을 명부에 산 사람) · 날마다 한 줄
//   날 줄: 아래 `COLS` 차례 —
//     날 · 달력(해 · 달 · 날 — `server/calendar.js` 정본) · 명부 사람(마을 명부 합 — 여덟 수 인구와 같은 자 · 길 위 몸은 안 든다) · 마을 수 · 빈 마을 ·
//     판에서 난 사람 중 오늘 명부에 산 사람(`bornAlive`) · 그 가운데 365날 안에 난 사람(`born365` — 돌 안 된 아이) ·
//     난 철로 가른 산 사람(봄 3 ~ 5월 · 여름 6 ~ 8월 · 가을 9 ~ 11월 · 겨울 12 ~ 2월) · 판에서 난 사람 누계(`everBorn`) · 오늘 처음 본 얼굴(`firstSeen`)
//   "난 날" = 그 id 를 처음 본 날(첫 장부 날 명부에 있던 사람은 시딩 · 난 사람 아님). id 는 판 전체에서 하나(`n<마을>.<번호>`)라
//     옮겨 다녀도 다시 안 센다 · 나 그날 바로 걸어 나가 길 위에 있다 닿은 아이는 닿은 날에 처음 본다(그날 철로 센다 — 드묾).
//   ⚠econ 은 아이를 열여섯 ~ 서른다섯 살 사람으로 세운다(`createNPC` 나이) — 나이 칸은 아이를 못 가른다. 그래서 "판에서 난 날"로 센다.
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 명부 id 만 읽는다(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1334_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const Cal = require(path.join(ROOT, 'server', 'calendar'));
  const COLS = ['day', 'year', 'month', 'dom', 'N', 'vils', 'empty', 'bornAlive', 'born365', 'bornSpr', 'bornSum', 'bornAut', 'bornWin', 'everBorn', 'firstSeen'];
  const rows = [];
  const bornDay = new Map();   // id → 처음 본 날(판에서 난 사람만)
  const seen = new Set();
  let first = true, lastDay = -1, everBorn = 0;
  const seasonOf = (m) => (m >= 3 && m <= 5) ? 0 : (m >= 6 && m <= 8) ? 1 : (m >= 9 && m <= 11) ? 2 : 3;
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const dayRow = (day) => {
    const vils = sv().filter((v) => v && v.econ && !v.econ.founder);
    let N = 0, empty = 0, firstSeen = 0, alive = 0, a365 = 0;
    const bySeason = [0, 0, 0, 0];
    for (const v of vils) {
      const ps = v.econ.npcs || []; N += ps.length; if (!ps.length) empty++;
      for (const n of ps) {
        if (!seen.has(n.id)) { seen.add(n.id); if (!first) { bornDay.set(n.id, day); everBorn++; firstSeen++; } }
        const b = bornDay.get(n.id);
        if (b !== undefined) { alive++; if (day - b < 365) a365++; bySeason[seasonOf(Cal.dateOf(b).month)]++; }
      }
    }
    first = false;
    const t = Cal.dateOf(day);
    return [day, t.year, t.month, t.dom, N, vils.length, empty, alive, a365, bySeason[0], bySeason[1], bySeason[2], bySeason[3], everBorn, firstSeen];
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try { if ((day | 0) !== lastDay) { lastDay = day | 0; rows.push(dayRow(lastDay)); } } catch (e) {}
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { try {
    const env = {}; for (const k of ['T1334_BUNDLE', 'T325_WOOD_ACT', 'T1207_TERR_REAL', 'T1238_TERR_V2', 'T1283_WOOD_DEMAND', 'T1297_BIRTH_FOOD', 'T1306_MIGRATE_FOOD', 'T1312_HERD', 'T1319_RECV_K', 'T1319_AUTUMN_LOOK', 'T1302_TERR_BODY']) env[k] = process.env[k] == null ? null : process.env[k];
    fs.writeFileSync(OUT + '.t1334.json', JSON.stringify({ env, cols: COLS, rows }));
  } catch (e) {} });
}
