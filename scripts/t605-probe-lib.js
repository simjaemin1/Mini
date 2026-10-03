'use strict';
// === scripts/t605-probe-lib.js — T605 탐침 사본 만들기 (T356 문법: git worktree 사본에만 박는다 · 제품 무접촉) ===========
//
// makeProbeTree(dir, ref) — `ref`(기본 HEAD) 를 `dir` 에 worktree 로 뜨고, 아래 글자를 박는다. 앵커는 **한 번만** 나오는 줄이어야 한다
//   (박기 전에 센다 — 0 이나 둘이면 멈춘다: 앵커가 움직였는데 조용히 안 박히는 자는 없는 값을 낸다).
// 박는 것은 전부 `globalThis.__T605` 를 부르는 한 줄이다 — 런타임(`t605-probe-rt.js` · `-r`)이 없으면 아무 일도 안 한다.
//   zone.js   : 부팅 표식(단계 경계) · 틱 본문 소요(`_tickMs` 고리와 같은 값)
//   villages  : 함수 몫(이름 바인딩을 감싼다 — 모듈 안의 부름이 감싼 쪽으로 간다 · 내보낸 것은 exports 쪽을 감싼다)
//   streams   : 개울 술어(`isStreamCell`) · 래스터 적재(`load`)
//   bandits   : 도적 교역로 표본(`routePts`) · 소굴 스캔(`denScan`) · 일 훅
//   roads     : 일 훅
// ⚠감싼 함수끼리 안에서 서로 부르면(예: `walkFor` 안의 경로) 몫이 **포함**으로 겹친다 — 표는 포함 값이라고 적는다.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const G = 'globalThis.__T605';
const M = (k) => `${G} && ${G}.mark(${JSON.stringify(k)});`;
const ZONE_PATCHES = [
  { find: "const _SEED = require('./seed-rand');", repl: (s) => `${s}\n${M('zoneTop')}` },
  { find: 'Roads.init({ zoneId: ZONE_ID,', repl: (s) => `${M('roads0')}\n${s}` },
  { find: 'SimVillages.init({ spawnNpc,', repl: (s) => `${M('villages0')}\n${s}` },
  { find: 'console.log(`[${ZONE_ID}] 🏰 환호 콜라이더: ${refreshDitchCells()}셀 적재`);', repl: (s) => `${M('villages1')}\n${s}` },
  { find: '\nBandits.init();\n', repl: () => `\n${M('bandits0')}\nBandits.init();\n${M('bandits1')}\n` },
  { find: '\nWildlife.init({\n', repl: (s) => `\n${M('wildlife0')}${s}` },
  { find: 'server.listen(PORT, () => {', repl: (s) => `${M('listen0')}\n${s}\n  ${M('listen')}` },
  { find: '_tickMs.ring[_tickMs.i++ % _tickMs.ring.length] = _h[0] * 1e3 + _h[1] / 1e6; _tickMs.n++;',
    repl: (s) => `${s} ${G} && ${G}.tick(_h[0] * 1e3 + _h[1] / 1e6);` },
];
const W = (n, f) => `try { ${f} = ${G}.wrap(${JSON.stringify(n)}, ${f}); } catch (e) {}`;
const TAILS = {
  'server/villages.js': `
;(function () { if (!${G}) return;   // [T605 탐침 · 계측기가 박았다 · 제품엔 없다]
  ${W('caravanTick', 'tickCaravanBodies')} ${W('bodyExitTick', 'tickBodyExits')}
  ${W('walkResume', '_walkResume')} ${W('walkFor', '_walkFor')} ${W('spawnCaravanBody', 'spawnCaravanBody')} ${W('startReturnLeg', 'startReturnLeg')}
  ${W('routeWarm', '_routeWarmStep')} ${W('routeRedig', '_routeRedigStep')} ${W('getRoute', 'getRoute')}
  ${W('terrGrow', '_terrGrow')}
  ${W('vilGameTick', 'module.exports.onGameTick')} ${W('npcLife', 'module.exports.npcLifeTick')}
  ${G}.sample = () => { let pop = 0, terr = 0, cars = 0; for (const v of (state.villages || [])) { try { pop += v.econ.npcs.length; } catch (e) {} try { terr += (v._terrSet && v._terrSet.size) || 0; } catch (e) {} }
    try { cars = state.caravanBodies ? state.caravanBodies.size : 0; } catch (e) {}
    return { day: state.world ? state.world.day : null, vils: (state.villages || []).length, pop, terr, cars, routes: state.routeCache ? state.routeCache.size : 0,
      routeCold: _probe.routeCold, routeMs: _probe.routeMs, warmLeft: state.routeWarmQ ? state.routeWarmQ.length : -1, redigLeft: state.routeRedigQ ? state.routeRedigQ.length : -1 }; };
})();
`,
  'server/streams.js': `
;(function () { if (!${G}) return;
  ${W('isStream', 'isStreamCell')} ${W('streamsLoad', 'module.exports.load')}
})();
`,
  'server/bandits.js': `
;(function () { if (!${G}) return;
  ${W('bdtRoutePts', 'routePts')} ${W('bdtDenScan', 'denScan')} ${W('bdtGameTick', 'module.exports.onGameTick')}
})();
`,
  'server/roads.js': `
;(function () { if (!${G}) return;
  ${W('roadsTick', 'module.exports.onGameTick')}
  // 길 코스 지도가 처음 바뀐 순간(교역로 A* 의 비용이 부팅 판과 달라지는 첫 순간 — ② 의 경주 증인)
  { const _o = module.exports.onGameTick; let _seen = false; module.exports.onGameTick = function () { const r = _o.apply(this, arguments);
      if (!_seen && S.coarseGen > 0) { _seen = true; ${G}.mark('coarse1', { coarse: S.coarse.size, gen: S.coarseGen }); } return r; }; }
})();
`,
};

function count(s, sub) { let n = 0, i = 0; while ((i = s.indexOf(sub, i)) >= 0) { n++; i += sub.length; } return n; }

function makeProbeTree(dir, ref) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  fs.rmSync(dir, { recursive: true, force: true });
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, ref || 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  const zf = path.join(dir, 'server', 'zone.js');
  let z = fs.readFileSync(zf, 'utf8');
  for (const p of ZONE_PATCHES) {
    const c = count(z, p.find);
    if (c !== 1) throw new Error(`[t605] zone.js 앵커 ${c}회(1 이어야): ${p.find.slice(0, 60)}`);
    z = z.replace(p.find, () => p.repl(p.find));
  }
  fs.writeFileSync(zf, z);
  for (const [f, tail] of Object.entries(TAILS)) {
    const fp = path.join(dir, f);
    fs.appendFileSync(fp, tail);
  }
  return dir;
}
function removeProbeTree(dir) { try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {} }

module.exports = { makeProbeTree, removeProbeTree, RT: path.join(__dirname, 't605-probe-rt.js') };
