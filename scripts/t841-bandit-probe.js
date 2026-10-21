// (@regress 없음 — 러너 밖 · T841 계측기 · 제품 무변 · 읽기만)
// === scripts/t841-bandit-probe.js — 도적 몸 주사위 신원 관찰자: 판 끝 도적 몸마다 [단 번호 · 몸 번호 · 존 결정 문이 볼 신원 · 칸 선 여부] ==========
//   쓰는 법: NODE_OPTIONS="--require <이 파일>" … node scripts/t577-server-run.js <날> <시드>(아이 존 · 판 JSON 옆 `.t841.json`)
//   신원 = 존 `_shOf` 그 식(`_sh` 가 있으면 그것 · 없으면 `pidHash(playerId)`) — 같은 씨 두 판의 몸 주사위 씨 재료가 같은지 본다.
'use strict';
const OUT = process.env.T841_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t841.json' : '');
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN) {
  const fs = require('fs'), path = require('path'), Module = require('module');
  const SR = require(path.join(__dirname, '..', 'server', 'seed-rand.js'));
  let VIL = null, BDT = null;
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function') VIL = m;
      if (m && !BDT && typeof m.gangs === 'function' && m._t765Probe) BDT = m;
    } catch (e) {}
    return m;
  };
  process.on('exit', () => {
    try {
      const S = VIL && VIL.__p3Bind ? VIL.__p3Bind({}).state : null; const P = S && S.deps && S.deps.players;
      const rows = []; const B = BDT && BDT._t765Probe && BDT._t765Probe.bodies ? BDT._t765Probe.bodies() : null;
      if (B && P) for (const [gid, pids] of B) for (const k of pids) { const p = P.get(k); if (!p) continue; rows.push([gid, k, p._sh !== undefined ? p._sh : SR.pidHash(p.playerId || p.pid || ''), p._sh !== undefined ? 1 : 0]); }
      rows.sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1])));
      fs.writeFileSync(OUT, JSON.stringify({ knob: process.env.T822_BODY_SEED || null, gangs: BDT ? BDT.gangs().length : null, bodies: rows }));
    } catch (e) {}
  });
}
