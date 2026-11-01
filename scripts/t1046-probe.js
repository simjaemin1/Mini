'use strict';
// (@regress 없음 — 러너 밖 · T1046 탐침 · 값 무변 · 제품 파일 무접촉)
// === scripts/t1046-probe.js — 직업 고르기(`pickDeficitJob_rational`)가 **어느 return 줄**로 답했나 — 서버 판 자 · 랩 t17 곁 프리로드 ===
//
// ★[T1046 2026-11-01 · T1018 회부 1] 집 행위 층이 출생 배정의 나무꾼 몫을 낮춘다 — 그 줄을 짚으려면 출생 배정이 고른 **길**을 봐야 한다.
//   econ 에는 전환 진단 칸(`v._dbgSwitch`)만 있고 출생 쪽 칸이 없다. 이 탐침은 econ 모듈을 **읽어 들일 때만** 그 함수 몸통의
//   `return <식>` 을 `return __t1046(v, <줄>, (<식>), _t663Birth)` 로 감싼다 — 식은 한 번 그대로 평가되고 그 값이 그대로 돌아간다(값 무변).
//   파일은 안 바꾼다(이 프로세스 메모리의 모듈 글자만 · 줄 번호는 원래 파일 줄 그대로 — 줄을 더하지 않는다).
//   적는 것(마을 × 고른 횟수): 줄 · 낸 직업 · 출생 배정인가(`_t663Birth`) · 그때 마을 칸(곳간 식량 환산 ÷ N · 곳간 목재 ÷ N · 주거 ÷ N · 지은 침상 ÷ N ·
//     목재 소비 EMA `_consEMA.wood` ÷ N · 목재 그림자 가격 · 집 행위 마을인가) — 칸은 읽기만(`totalFoodEquivalent` · `world.priceFn`)
//   쓰는 법:
//     서버: NODE_OPTIONS="… -r $PWD/scripts/t1046-probe.js" node scripts/t577-server-run.js 800 1020,7,42   (판 JSON 곁 `<판>-<시드>.t1046.json`)
//     랩:   T1046_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1046-probe.js" node scripts/t17-metrics.js 800 1020
const path = require('path');
const fs = require('fs');
const Module = require('module');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T1046_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T1046_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1046.json' : '')) : process.env.T1046_OUT;
if (!OUT) return;
const ECON = path.join(__dirname, '..', 'sim', 'economy-sim.js');
const COLS = ['day', 'line', 'job', 'birth', 'N', 'fe', 'wood', 'housing', 'beds', 'cons', 'pW', 'live'];
const rec = { where: SERVER ? 'server' : path.basename(A1), cols: COLS, v: {}, wrapped: [], errs: 0, err0: null };
const r3 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 1000) / 1000;
let V1 = null;
global.__t1046 = function (v, line, val, birth) {
  try {
    const N = (v.npcs || []).length || 1;
    let fe = null; try { fe = V1 ? V1.totalFoodEquivalent(v) / N : null; } catch (e) { fe = null; }
    let pW = null; try { const W = v._world; if (W && typeof W.priceFn === 'function') { const t = W.priceFn(v); if (t) pW = t.wood; } } catch (e) { pW = null; }
    (rec.v[v.name] || (rec.v[v.name] = [])).push([(v._world && v._world.day) | 0, line, val == null ? null : String(val), birth ? 1 : 0, N, r3(fe), r3(((v.storage || {}).wood || 0) / N),
      r3(v.housing != null ? v.housing / N : null), r3(v._mapBeds != null ? v._mapBeds / N : null), r3(((v._consEMA || {}).wood || 0) / N), r3(pW), v._t400Live ? 1 : 0]);
  } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 400); }
  return val;
};
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename === ECON) {
    const lines = content.split('\n');
    const s = lines.findIndex((l) => l.startsWith('function pickDeficitJob_rational('));
    let e = lines.findIndex((l, i) => i > s && l.startsWith('function '));
    if (s >= 0 && e > s) {
      for (let i = s; i < e; i++) {
        const L = lines[i]; const ci = L.indexOf('//'); const code = ci >= 0 ? L.slice(0, ci) : L; const tail = ci >= 0 ? L.slice(ci) : '';
        //   한 줄 안 `return <식>;` 만 감싼다(식에 `;` 가 없는 꼴 — 이 함수의 return 은 다 그렇다)
        const m = code.match(/^(.*?\breturn\s+)([^;]+);(\s*)$/);
        if (m) { lines[i] = `${m[1]}__t1046(v, ${i + 1}, (${m[2]}), _t663Birth);${m[3]}${tail}`; rec.wrapped.push(i + 1); }
      }
      content = lines.join('\n');
    }
  }
  return _compile.call(this, content, filename);
};
V1 = require(ECON);
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
