// 서버 판 계측(세계 0 · 읽기만) — T1319: K 문 · 가을 문 · 받는 쪽 문 셈(판 끝 한 번)
//   판 끝에 서버 이주 문 셈(`t1306Stat`) · 무리 셈(`t1312Stat`) · K 문 셈(`t1319Stat`) · 받는 곳 고르기 셈(`t1147Stat` 의 수만) · 걷기 셈(bandits `stats` 의 이주 · 길 위 칸)을 적는다.
//   마을-날 줄(닿음 · 죽음 까닭 · K)은 T1312 훅(`계측/T1312_2026-11-14/t1312hook.js`)이 그대로 적는다 — 이 훅은 판 끝 셈만(사본 0).
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 셈 칸을 읽기만 한다(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1319_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const mod = (rel) => { const m = require.cache[path.join(ROOT, rel)]; return m && m.exports; };
  process.on('exit', () => { try {
    const V = mod('server/villages.js'), B = mod('server/bandits.js'), E = mod('sim/economy-sim.js');
    const st = (f) => (V && typeof V[f] === 'function') ? V[f]() : null;
    const t1147 = st('t1147Stat');
    const bs = (B && typeof B.stats === 'function') ? B.stats() : null;   // bandits 셈(`S.stats` — 읽기만)
    fs.writeFileSync(OUT + '.t1319.json', JSON.stringify({
      env: { T1297: process.env.T1297_BIRTH_FOOD || null, MIG: process.env.T1306_MIGRATE_FOOD || null, HERD: process.env.T1312_HERD || null,
        K: process.env.T1319_RECV_K || null, AUT: process.env.T1319_AUTUMN_LOOK || null, GATE: process.env.T1319X_GATE || process.env.T1319_RECV_GATE || null,
        T325: process.env.T325_WOOD_ACT || null, T1238: process.env.T1238_TERR_V2 || null, T1283: process.env.T1283_WOOD_DEMAND || null },
      econ: E ? { autumn: !!E.T1319_AUTUMN_LOOK, t1297: !!E.T1297_BIRTH_FOOD } : null,
      t1306Stat: st('t1306Stat'), t1312Stat: st('t1312Stat'), t1319Stat: st('t1319Stat'), t1319XStat: st('t1319XStat'),
      t1147: t1147 ? { pick: t1147.pick, nearest: t1147.nearest, other: t1147.other, none: t1147.none } : null,
      walk: bs ? { t1075Leave: bs.t1075Leave || 0, t765Arrive: bs.t765Arrive || 0, t1080Reroute: bs.t1080Reroute || 0, t1080Dead: bs.t1080Dead || 0, t1319Turn: bs.t1319Turn || 0, t1319Let: bs.t1319Let || 0 } : null }));
  } catch (e) { try { fs.writeFileSync(OUT + '.t1319.json', JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} } });
}
