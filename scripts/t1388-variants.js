'use strict';
// (@regress 없음 — 러너 밖 · T1388 사다리 사본 · 제품 무변 — 메모리에서만 econ 글자 한 곳씩을 바꾼다)
// === scripts/t1388-variants.js — 끔 세계 수식 산출을 걷는 사다리의 손잡이 없는 계단(T1388 할 일 2) ==========================
//   NODE_OPTIONS="-r $PWD/scripts/t1388-variants.js -r <관찰기> …" · `T1388_VAR=anchor1,nobygrain` · 바꾼 자리 수를 `T1388_VAR_N`(파일)에 JSON 으로 적는다.
//   ★관찰기(econ 을 먼저 읽는 걸이)보다 **앞에** 실어야 한다. 바꾼 자리가 1 이 아니면 그 계단은 안 바뀐다(하네스 `test-t1388-farm-gap` ③ 이 센다).
//   계단:
//     anchor1   — 앵커 몫 걷음: `T100_ANCHOR_N` 1.33(Clark 앵커 — 농부 1인 = 1.33 사람 몫) → 1(농부는 제 몫만 · 수확 한 번 `T100_K` 가 같이 준다)
//     nobygrain — 부산물 곡식 걷음: T1374 ① 줄(밭 세계 손잡이 `T1374_NO_BYGRAIN`)의 손잡이 갈래를 끔 세계에도(농부의 밀 · 쌀 · 보리 부산물 = 0)
//   손잡이가 있는 계단은 env 로(텃밭 하한 = `T100_GARDEN=0` · 밭 수확 = `T100_FIELD_YIELD=1` · 밭 세계 = `T1243_FARM_ON=1`).
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1)) && !process.env.T1388_INPROC) return;
const ES = path.join(__dirname, '..', 'sim', 'economy-sim.js');
const VARS = {
  anchor1: ['const T100_ANCHOR_N = 1.33;', 'const T100_ANCHOR_N = 1;'],
  nobygrain: ["if (T1374_NO_BYGRAIN && npc.currentJob === 'farmer' && _t1374FieldCrop(r)) continue;", "if (npc.currentJob === 'farmer' && _t1374FieldCrop(r)) continue;"],
};
const want = String(process.env.T1388_VAR || '').split(',').map((x) => x.trim()).filter(Boolean);
const Module = require('module'), _c = Module.prototype._compile;
const N = {};
Module.prototype._compile = function (c, f) {
  if (f === ES) {
    for (const k of want) { const v = VARS[k]; if (!v) { N[k] = -1; continue; } const n = c.split(v[0]).length - 1; N[k] = n; if (n === 1) c = c.replace(v[0], v[1]); }
    if (process.env.T1388_VAR_N) try { fs.writeFileSync(process.env.T1388_VAR_N, JSON.stringify(N)); } catch (_) {}
  }
  return _c.call(this, c, f);
};
module.exports = { VARS, N };
