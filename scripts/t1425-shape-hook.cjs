// (@regress 없음 — 계측 훅 · 러너 밖 · T1425 · 판정 0)
// === scripts/t1425-shape-hook.cjs — 몸 객체 모양(숨은 클래스) 셈 — 켬 셋이 몸에 칸을 붙여 모양이 갈리는가(인라인 캐시가 여러 모양을 보면 모든 덩이가 느려진다) ===
//   쓰는 법: T1294_PRELOAD=$PWD/scripts/t1425-shape-hook.cjs T1425_SHAPE_OUT=/tmp/s-%p.json node scripts/t1294/run.cjs <out> 2
//   · 생활층 글자 끝에 표본기를 붙인다(읽기만). 생활층 틱 600 번마다 players 의 NPC 몸을 훑어
//     ⓐ 숨은 클래스 갈래 수(`%HaveSameMap` 대표 견줌) ⓑ 사전 모드 몸 수(`%HasFastProperties` 거짓) ⓒ 칸 이름 차례 갈래(Object.keys) — 셈과 갈래마다 몸 수 · 다른 칸
'use strict';
const OUT = process.env.T1425_SHAPE_OUT;
if (OUT && /zone\.js$/.test(process.argv[1] || '')) {
  require('v8').setFlagsFromString('--allow-natives-syntax');
  const same = new Function('a', 'b', 'return %HaveSameMap(a, b)'), fast = new Function('a', 'return %HasFastProperties(a)');
  global.__t1425 = { same, fast };
  const Module = require('module'), _c = Module.prototype._compile, VP = require('path').join('server', 'villages.js');
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VP) && content.indexOf('\nmodule.exports = {') >= 0) {
      content += `
;(function () {   // [T1425 모양 훅 · 계측기가 박았다]
  const fs = require('fs'), f = ${JSON.stringify(OUT)}.replace('%p', String(process.pid)), H = global.__t1425;
  const R = { samples: [] }; let n = 0;
  const take = () => {
    const P = state.deps && state.deps.players; if (!P) return;
    const reps = [], cnt = [], keyC = new Map(); let slow = 0, tot = 0;
    for (const p of P.values()) { if (!p || !p.isNpc) continue; tot++;
      if (!H.fast(p)) slow++;
      let j = 0; for (; j < reps.length; j++) if (H.same(reps[j], p)) break;
      if (j === reps.length) { reps.push(p); cnt.push(0); } cnt[j]++;
      const k = Object.keys(p).join(','); keyC.set(k, (keyC.get(k) || 0) + 1); }
    const base = reps.length ? Object.keys(reps[cnt.indexOf(Math.max(...cnt))]) : [];
    const maps = reps.map((r, i) => { const ks = Object.keys(r); return { n: cnt[i], fast: H.fast(r), extra: ks.filter((k) => !base.includes(k)).slice(0, 12), miss: base.filter((k) => !ks.includes(k)).slice(0, 12), len: ks.length }; }).sort((a, b) => b.n - a.n);
    R.samples.push({ day: state.world ? state.world.day : 0, tot, slow, maps: maps.length, keyOrders: keyC.size, top: maps.slice(0, 8) });
  };
  const ogt = module.exports.onGameTick;
  module.exports.onGameTick = function () { const r = ogt.apply(this, arguments); if (++n % 600 === 0) { try { take(); } catch (e) { R.err = String(e); } } return r; };
  const put = () => { try { fs.writeFileSync(f, JSON.stringify(R)); } catch (e) {} };
  process.on('exit', put); setInterval(put, 60000).unref();
})();
`;
      console.log('[T1425 모양 훅] 끼움');
    }
    return _c.call(this, content, filename);
  };
}
