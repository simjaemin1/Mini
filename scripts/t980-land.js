'use strict';
// (@regress 없음 — 러너 밖 · T980 곁 관찰기 · 읽기만) 마을 `land` 의 수 칸 · `_clearedFrac` · `_importEMA` 를 econ 날 1 · 30 · 200 틱 뒤에 적는다 — 서버 ↔ 랩 땅 입력 대조
//   서버: NODE_OPTIONS="-r scripts/t745-vclock.js -r scripts/t980-land.js" T745_VCLOCK=1 node scripts/t577-server-run.js 201 1020  (판 곁 `<판>-<시드>.ld.json`)
//   랩:   LD_OUT=<파일> NODE_OPTIONS="-r scripts/t980-land.js" node scripts/t17-metrics.js 201 1020
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.LD_OUT && /scripts[\/\\]t17-metrics\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? process.env.T577_OUT.replace(/\.json$/, '') + '.ld.json' : process.env.LD_OUT;
const V1 = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const rec = {};
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  const r = _t.apply(this, arguments);
  const d = day | 0;
  if (d === 1 || d === 30 || d === 200) { const L = {}; for (const k in (v.land || {})) { const x = v.land[k]; if (typeof x === 'number' || x === null) L[k] = x; }
    L._clearedFrac = v._clearedFrac; L._importEMA = v._importEMA; L.N = (v.npcs || []).length; (rec[d] || (rec[d] = {}))[v.name] = L; }
  return r;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
