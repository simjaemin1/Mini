'use strict';
// (@regress 없음 — 러너 밖 · T1224 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1224-observe.js — 서버 판 자 아이 존 안에서 날마다: econ 인구 · econ 농부(`counts.farmer`) · 몸(`npcPids`) · 몸 농부(`simJob`) · 켬 명부(마을마다 max(몸 농부, econ 농부)) 합 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1224-observe.js" node scripts/t577-server-run.js 400 1020   (판 JSON 곁 `<판>-<시드>.t1224.json` · 끝에 `_t1224Stat` · `_t1212Rest`)
if (!process.env.T577_SEED) return;
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.T1224_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1224.json' : '');
const rows = [];
let SV = null, lastDay = -1;
setTimeout(function poll() {
  try {
    if (!SV) SV = require.cache[require.resolve(path.join(ROOT, 'server', 'villages.js'))] ? require(path.join(ROOT, 'server', 'villages.js')) : null;
    if (SV && SV.clientVillages) {
      const st = SV.__p3Bind ? SV.__p3Bind({}).state : null, pl = st && st.deps && st.deps.players;
      const vs = (SV.clientVillages() || []).map((c) => SV.villageByDbId(c.id)).filter((v) => v && v.econ);
      const day = vs.length && vs[0].econ._world ? vs[0].econ._world.day | 0 : -1;
      if (day >= 0 && day !== lastDay && pl) {
        lastDay = day;
        let pop = 0, ef = 0, bod = 0, bf = 0, nv = 0, vmax = 0, ros = 0;
        for (const v of vs) {
          const n = (v.econ.npcs || []).length; if (!n) continue; nv++;
          pop += n; ef += (v.econ.counts && v.econ.counts.farmer) | 0;
          let b = 0, f = 0; for (const pid of (v.npcPids || [])) { const p = pl.get(pid); if (!p) continue; b++; if (p.simJob === 'farmer') f++; }
          bod += b; bf += f; vmax = Math.max(vmax, b); ros += Math.max(f, (v.econ.counts && v.econ.counts.farmer) | 0);
        }
        rows.push([day, nv, pop, ef, bod, bf, vmax, ros]);
      }
    }
  } catch (e) { /* 관찰 실패는 세계에 0 */ }
  setTimeout(poll, 100);
}, 2000).unref();
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify({ cols: ['day', 'villages', 'econPop', 'econFarmer', 'bodies', 'bodyFarmer', 'bodiesMaxPerVil', 'rosterIfOn'], rows, t1224: (SV && SV.__p3Bind) ? Object.assign({}, SV.__p3Bind({})._t1224Stat) : null, t1212: (SV && SV.__p3Bind) ? Object.assign({}, SV.__p3Bind({})._t1212Rest) : null, t1229: (SV && SV.__p3Bind && SV.__p3Bind({})._t1229Stat) ? Object.assign({}, SV.__p3Bind({})._t1229Stat) : null })); } catch (e) {} });
