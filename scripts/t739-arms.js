// === scripts/t739-arms.js — T739 자리 갈래 문(계측 · 제품 무접촉) =====================================
//
// ★왜 [T739 ② · T726 §5] `T726_ONE_TARGET` 은 손잡이 하나로 문 넷(정산 · 부패 · 출발 직후 두 줄)을 같이 켠다.
//   어느 자리가 인구를 깎는지 보려면 자리를 따로 켜야 한다 — 그런데 제품에 손잡이를 늘리면 안 된다(카드: 코드 0).
//   ⇒ `economy-sim-v2.js` 를 **적재할 때 메모리 사본만** 고친다(디스크 무변 · test-wood-flow 미끼 문법 · `Module._extensions`).
//     문 줄의 `T726_ONE_TARGET` 을 자리마다 `true`/`false` 글자로 바꾼다 — 그 밖의 글자는 한 자도 안 바꾼다.
//
// 쓰는 법: NODE_OPTIONS="--require <레포>/scripts/t739-arms.js" T739_SITES=D,S node scripts/t17-metrics.js 800 1020
//   T739_SITES — 'S'(정산 문 `_priceParamsV2` 첫 줄) · 'D'(부패 문 `tickDecay` 문맥 줄) · 'P'(출발 직후 두 줄)를 쉼표로.
//                'none' = 셋 다 끔(= 손잡이 끔과 같아야 한다 · 검산) · 'D,S,P' = 셋 다 켬(= `T726_ONE_TARGET=1` 과 같아야 한다).
//   미설정이면 이 문은 아무것도 안 한다(적재기를 안 건드린다).
//   T739_DGOODS / T739_DEXCEPT — 부패 문(D)을 품목 몇에만 / 몇만 빼고(아래). D 가 켜진 판에서만 뜻이 있다.
// 결정론 — 바꾸는 것은 문 넷(+ 부패 목표 한 줄)의 조건 글자뿐(새 수 0).
'use strict';
const RAW = process.env.T739_SITES;
if (RAW != null && RAW !== '') {
  const Module = require('module'), fs = require('fs'), path = require('path');
  const on = RAW === 'none' ? [] : RAW.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const s of on) if (!['S', 'D', 'P'].includes(s)) throw new Error('T739_SITES: 모르는 자리 ' + s);
  const B = (k) => (on.includes(k) ? 'true' : 'false');
  const DOORS = [
    ['S', '  if (T726_ONE_TARGET) return _settleParamsV2(v, r);', `  if (${B('S')}) return _settleParamsV2(v, r);`],
    ['D', '  const _t726 = T726_ONE_TARGET ? _targetCtxV2(v) : null;', `  const _t726 = ${B('D')} ? _targetCtxV2(v) : null;`],
    ['P', '      if (T726_ONE_TARGET) a.prices[cand.res] = _priceNowV2(a.v, cand.res);', `      if (${B('P')}) a.prices[cand.res] = _priceNowV2(a.v, cand.res);`],
    ['P', '        if (T726_ONE_TARGET) a.prices[_res2] = _priceNowV2(a.v, _res2);', `        if (${B('P')}) a.prices[_res2] = _priceNowV2(a.v, _res2);`],
  ];
  // ★부패 문을 품목별로(③ — 어느 품목의 부패가 깎나): T739_DGOODS=fish,meat → 부패 문은 그 품목에만 결정층 목표 ·
  //   T739_DEXCEPT=fish,meat → 그 품목만 빼고. 둘 다 없으면 부패 문은 전 품목(카드의 D).
  const DG = (process.env.T739_DGOODS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const DX = (process.env.T739_DEXCEPT || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (DG.length && DX.length) throw new Error('T739_DGOODS 와 T739_DEXCEPT 는 하나만');
  if (DG.length || DX.length) DOORS.push(['D품목', '    if (_t726) target = _targetV2(v, r, _t726).target;',
    `    if (_t726 && ${DG.length ? '' : '!'}${JSON.stringify(DG.length ? DG : DX)}.includes(r)) target = _targetV2(v, r, _t726).target;`]);
  const _load = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, f) {
    if (path.basename(f) === 'economy-sim-v2.js' && path.basename(path.dirname(f)) === 'sim') {
      let c = fs.readFileSync(f, 'utf8');
      for (const [k, a, b] of DOORS) {
        const n = c.split(a).length - 1;
        if (n !== 1) throw new Error(`T739_SITES: 문 줄(${k})이 ${n}개 — 하나여야 한다(제품이 바뀌었다 · 이 문을 고칠 것)`);
        c = c.replace(a, b);
      }
      m._compile(c, f);
      if (process.env.T739_ARMS_QUIET !== '1') process.stderr.write(`[t739-arms] 자리 켬: ${on.join(',') || '없음'}${DG.length ? ' · 부패 품목 ' + DG.join(',') : ''}${DX.length ? ' · 부패 빼는 품목 ' + DX.join(',') : ''}\n`);
      return;
    }
    return _load(m, f);
  };
}
