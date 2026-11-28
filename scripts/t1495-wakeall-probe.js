// (@regress 없음 — 러너 밖 · T1495 판 계측기 · 제품 무변 · 프리로드로만 실린다 · ⚠세계를 바꾸는 반사실 판 — 회부 4 잴 때만)
// === scripts/t1495-wakeall-probe.js — "마을 밖 몸도 보는 사람처럼 모든 종을 깨우면"(T1461 ⓐ · 값 문 둘 없음) 반사실 판 ==========
//   쓰는 법: `T1495_WAKEALL=1 NODE_OPTIONS="--require $PWD/scripts/t1495-wakeall-probe.js" node scripts/t1331-run.js … --env …,T1461_BEAST_UNSEEN=1`
//   읽어 들일 때 `wildlife.js` 원문에서 T1461 값 문 두 줄만 뺀다(메모리에서만 · 파일 손 0):
//     ① 둘레(깨움 반경)에 사람을 칠 수 있는 짐승 몸이 없으면 판에 안 드는 줄 ② 마을 밖 몸이 사람을 칠 수 있는 종만 깨우는 줄
//   → 사슴 · 토끼도 마을 밖 몸 때문에 깬다(보는 사람 곁과 같은 깨움) — 사냥 몫 · 짐승 분포가 달라지나(회부 4).
'use strict';
const path = require('path'), Module = require('module');
if (process.env.T1495_WAKEALL !== '1' || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const WF = path.join(__dirname, '..', 'server', 'wildlife.js');
const CUT = [
  '    if (out && !_t1461Near(p.x / 32, p.y / 32)) { out = false; _t1461St.farSkip++; }',
  '          if (T1461 && pr._t1461 && !(MOB_DEF[em] && MOB_DEF[em].brave > 0)) continue;',
];
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === WF) {
    const _c = m._compile;
    m._compile = function (src, fn) { for (const a of CUT) { const n = src.split(a).length - 1; if (n !== 1) throw new Error('t1495-wakeall: 자리 ' + n + ' — ' + a.trim().slice(0, 40)); src = src.replace(a, () => '/*T1495_WAKEALL 뺌*/'); } return _c.call(this, src, fn); };
  }
  return _p(m, filename);
};
