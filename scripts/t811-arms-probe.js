// (@regress 없음 — 러너 밖 · T811 계측기 · 제품 무변 · 읽기만 · `t764-arms-probe` 의 꼴)
// === scripts/t811-arms-probe.js — **무기 몸 짐(T811) 관찰자**: 몸 짐 합 = 장부(= 거울) 불변식 · 몸 손 무기 · 낙하 셈 ==========
//   쓰는 법: NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js 50 <시드>(아이 존 · `T577_OUT` 이 선 쪽 · 판 JSON 옆 `.t811.json`)
//   ★잰다 — 1초마다 · econ 날마다(하루 마감 장부 `scanDay` 앞):
//     · 전쟁 몸(`state.warBodies`)마다 원정 무기 장부(`w._arms.weapon` · 끝났으면 0) · 몸 짐 표 합(`w._armsPack`) · 짐꾼 수 · 짐꾼 손 무기 합(`inventory.weapon`)
//     · 차 = |몸 짐 합 − 장부| 최대(표가 선 원정만) · 마을 거울(`_warArmsOut`) − 그 마을 원정 장부 합 최대
//   ★판 끝: `state._warStat.t811`(싣기 · 맞춤 · 땅 · 사라짐 · 포로 · 거둠 · 차) · 전쟁 셈 · war-core 로그의 무기 줄
//   ★관찰만 한다 — 세계에 아무것도 안 쓴다.
'use strict';
const OUT = process.env.T811_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t811.json' : '');
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs');
  const Module = require('module');
  let EV = null, VIL = null;
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  const st = () => { try { return VIL && VIL.__p3Bind ? VIL.__p3Bind({}).state : null; } catch (e) { return null; } };
  const R = { samples: 0, packed: 0, gapMax: 0, gapAt: null, mirrorGapMax: 0, handMax: 0, wars: {} };
  const sample = (tag) => {
    const S = st(); if (!S || !S.warBodies) return;
    const P = S.deps && S.deps.players;
    for (const [id, b] of S.warBodies) {
      const w = b.w; if (!w || !w._arms) continue;
      R.samples++;
      const ledger = w._arms.done ? 0 : Math.max(0, w._arms.weapon || 0);
      const o = R.wars[id] || (R.wars[id] = { id, atk: w.atk && w.atk.name, def: w.def && w.def.name, out: w._arms.out, first: tag, packedSamples: 0, gapMax: 0, handMax: 0, bearersMax: 0, phases: {} });
      o.phases[b.phase || '-'] = (o.phases[b.phase || '-'] || 0) + 1; o.last = tag; o.ledgerLast = r3(ledger);
      const M = w._armsPack; if (!M) continue;
      R.packed++; o.packedSamples++;
      let pack = 0, hand = 0, n = 0; for (const [pid, q] of M) { pack += q || 0; const p = P && P.get(pid); if (p) { n++; hand += (p.inventory && p.inventory.weapon) || 0; } }
      const gap = Math.abs(pack - ledger);
      o.gapMax = Math.max(o.gapMax, gap); o.handMax = Math.max(o.handMax, hand); o.bearersMax = Math.max(o.bearersMax, n);
      if (gap > R.gapMax) { R.gapMax = gap; R.gapAt = [tag, id, r3(pack), r3(ledger)]; }
      R.handMax = Math.max(R.handMax, hand);
    }
    //   마을 거울 = 그 마을 원정 장부 합(T764 — 몸 짐은 그 아래 층)
    try { const WARS = (S.war && S.war.WARS) || []; for (const v of S.villages || []) { const e = v.econ; if (!e) continue; let s = 0; for (const w of WARS) if (w.atk === v && w._arms && !w._arms.done) s += Math.max(0, w._arms.weapon || 0); R.mirrorGapMax = Math.max(R.mirrorGapMax, Math.abs((e._warArmsOut || 0) - s)); } } catch (e) {}
  };
  const dump = () => {
    try {
      const S = st();
      const log = (() => { try { return ((S && S.world && S.world._warStats && S.world._warStats.log) || []).filter((m) => /무기|몸 짐/.test(m)); } catch (e) { return null; } })();
      const ws = S && S.world && S.world._warStats;
      fs.writeFileSync(OUT, JSON.stringify({ knobs: { T811_ARMS_BODY: process.env.T811_ARMS_BODY || null, T403_ARMS_LEDGER: process.env.T403_ARMS_LEDGER || null, WAR_FIXTURE: process.env.WAR_FIXTURE || null },
        t811: (S && S._warStat && S._warStat.t811) || null, ws: ws ? { decl: ws.decl, battle: ws.battle, atkWin: ws.atkWin, defWin: ws.defWin, weaponLoot: ws.weaponLoot } : null,
        samples: R.samples, packed: R.packed, gapMax: R.gapMax, gapAt: R.gapAt, mirrorGapMax: R.mirrorGapMax, handMax: r3(R.handMax), wars: Object.values(R.wars).map((o) => Object.assign({}, o, { gapMax: r3(o.gapMax), handMax: r3(o.handMax) })), log }));
    } catch (e) {}
  };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !EV && typeof m.createLedger === 'function') {
        EV = m; const mk = m.createLedger;
        m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { try { sample('d' + (world && world.day)); } catch (e) {} return sd.apply(this, arguments); }; return L; };
      }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m;
    } catch (e) {}
    return m;
  };
  const t1 = setInterval(() => { try { sample('t' + Math.round(Date.now() / 1000)); } catch (e) {} }, +process.env.T811_SAMPLE_MS || 1000); if (t1.unref) t1.unref();
  process.on('exit', dump);
}
