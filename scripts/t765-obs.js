'use strict';
// === scripts/t765-obs.js — T765 켬 판 관측 프리로드(읽기만 · 러너 밖 · `@regress` 없음) ===================================
//
// ★무엇 [T765 · 추상 가2 F8 — `T577_CAND_WALK` · `T521_GANG_ARMS` 켜 본 기록]
//   서버 판 자(`t577-server-run.js` · `server-baseline-check.js` 가 띄우는 아이 존)에 덧 프리로드로 싣는다:
//     NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js <기준선.json>
//   아이 존의 `T577_OUT` 옆에 `<T577_OUT>.t765.json` 을 쓴다(없으면 `T765_OUT`).
//   ① 교역 장부(`world.tradeLog`) — 날마다 새 줄만 센다: 품목별 캐러밴 · 무기류(무기 · 갑옷 · 도구 셋) 실은 캐러밴 · 털린 캐러밴.
//   ② 도적 층 — `bandits.stats()`(전환 · 이탈 · 약탈 · 실물 약탈 `armsLoot` · 후보 걷기 `t577Walk`) · 끝 날 단의 무기 짐 · 손(`armsHeld`).
//   ③ 해체 · 후보 걷기 줄(도적 로그에서 — 마을 · 날 · 사람 수 · 받는 마을 · 거리 셀).
//   ④ 몸 층 — `bodyExitStats()`(까닭별 걸어 나감 · 도착 · 걷는 중) · ★[T765] 걷는 후보 증인(`t765Stat` — 있을 때만).
//   ⚠세계에 아무것도 안 쓴다 — 장부 `scanDay` 앞에 서서 읽고, 끝(`exit`)에 파일 하나를 쓴다.
const path = require('path');
const fs = require('fs');
const ROOT = process.cwd();
const OUT = process.env.T765_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t765.json' : '');
if (OUT) {
  const ARMS = new Set(['weapon', 'armor', 'tool', 'iron_tool', 'bronze_tool']);
  const seen = new WeakSet();
  const T = { rows: 0, byRes: {}, armsRows: 0, armsSent: 0, armsBought: 0, raided: 0, armsRaided: 0, armsRaidedRes: {} };
  const daily = [];   // [날 · 단 수 · 단 인원 · 무기 짐 합 · 손 합 · 후보 걷기 누계 · 걷는 몸]
  let lastDay = -1, lastWorld = null;
  const add = (o, k, v) => { o[k] = +((o[k] || 0) + v).toFixed(6); };
  function scan(world, day) {
    const TL = world.tradeLog || [];
    for (let i = TL.length - 1; i >= 0; i--) {
      const t = TL[i];
      if (!t || typeof t !== 'object') continue;
      if (seen.has(t)) break;   // 장부는 뒤에 붙는다 — 본 줄을 만나면 그 앞은 다 봤다
      seen.add(t);
      T.rows++;
      const s = t.sent && t.sent.res, b = t.bought && t.bought.res;
      if (s) add(T.byRes, s, 1);
      const arm = (s && ARMS.has(s)) || (b && ARMS.has(b));
      if (arm) { T.armsRows++; if (s && ARMS.has(s)) T.armsSent++; if (b && ARMS.has(b)) T.armsBought++; }
      if (t.raided) { T.raided++; if (s && ARMS.has(s)) { T.armsRaided++; add(T.armsRaidedRes, s, 1); } }
    }
    let B = null, V = null;
    try { B = require(path.join(ROOT, 'server', 'bandits')); } catch (e) { B = null; }
    try { V = require(path.join(ROOT, 'server', 'villages')); } catch (e) { V = null; }
    const G = B && B.gangs ? B.gangs() : [];
    const st = B && B.stats ? B.stats() : {};
    const bx = V && V.bodyExitStats ? V.bodyExitStats() : null;
    daily.push([day, G.length, G.reduce((a, g) => a + (g.n | 0), 0), +G.reduce((a, g) => a + ((g.arms && g.arms.weapon) || 0), 0).toFixed(3),
      +G.reduce((a, g) => a + (B.armsHeld ? B.armsHeld(g) : 0), 0).toFixed(3), st.t577Walk || 0, bx ? bx.walking : null]);
  }
  try {
    const Ev = require(path.join(ROOT, 'server', 'events'));
    const mk = Ev.createLedger;
    Ev.createLedger = function () {
      const L = mk.apply(this, arguments);
      const sd = L.scanDay;
      L.scanDay = function (world, day) {
        try { if ((day | 0) !== lastDay) { lastDay = day | 0; lastWorld = world; scan(world, day | 0); } } catch (e) { /* 관측 실패는 세계에 아무것도 안 한다 */ }
        return sd.apply(this, arguments);
      };
      return L;
    };
  } catch (e) {}
  process.on('exit', () => {
    try {
      let B = null, V = null;
      try { B = require(path.join(ROOT, 'server', 'bandits')); } catch (e) { B = null; }
      try { V = require(path.join(ROOT, 'server', 'villages')); } catch (e) { V = null; }
      const st = B && B.stats ? B.stats() : {};
      const G = B && B.gangs ? B.gangs() : [];
      const log = (st.log || []);
      const walks = log.filter((m) => /\[T577 ⓐ\]/.test(m)).map((m) => {
        const r = /^D(\d+) (\S+) 해체 뒤 남은 (\d+)명 → (\S+)\((\d+)셀\)/.exec(m);
        return r ? { day: +r[1], from: r[2], n: +r[3], to: r[4], cells: +r[5] } : { raw: m };
      });
      const forms = log.filter((m) => /해체\(순감/.test(m) && /결성/.test(m)).map((m) => {
        const r = /^D(\d+) (\S+) 해체.*도적단#(\d+) (\d+)명 결성/.exec(m);
        return r ? { day: +r[1], vil: r[2], gang: +r[3], size: +r[4] } : { raw: m };
      });
      const out = {
        knobs: { T577_CAND_WALK: process.env.T577_CAND_WALK || null, T521_GANG_ARMS: process.env.T521_GANG_ARMS || null },
        lastDay,
        trades: T,
        bandit: { conv: st.conv, exo: st.exo, loot: st.loot, lootAmt: st.lootAmt != null ? +(+st.lootAmt).toFixed(3) : null, armsLoot: st.armsLoot != null ? +(+st.armsLoot).toFixed(3) : 0,
          t577Walk: st.t577Walk || 0, t765Arrive: st.t765Arrive || 0, t765Joined: st.t765Joined || 0, t765IntoDis: st.t765IntoDis || 0, starve: st.starve, disband: st.disband, sup: st.sup, supDead: st.supDead, gangs: G.length, members: G.reduce((a, g) => a + (g.n | 0), 0),
          armsHeld: +G.reduce((a, g) => a + (B.armsHeld ? B.armsHeld(g) : 0), 0).toFixed(3),
          armsStore: G.reduce((o, g) => { for (const [k, v] of Object.entries(g.arms || {})) o[k] = +((o[k] || 0) + v).toFixed(3); return o; }, {}),
          logN: log.length },
        forms, walks,
        bodyExit: V && V.bodyExitStats ? V.bodyExitStats() : null,
        t765: V && V.t765Stat ? V.t765Stat() : null,
        t765Ledger: B && B.t765 ? B.t765() : null,
        daily,
      };
      fs.writeFileSync(OUT, JSON.stringify(out));
    } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} }
  });
}
