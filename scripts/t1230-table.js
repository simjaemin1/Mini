// (@regress 없음 — 러너 밖 · T1230 표 기계 · t1230 관찰기 JSON 을 창(기본 100날)으로 접는다 · 산수뿐 · 판정 0)
// 쓰는 법: node scripts/t1230-table.js <판>-<시드>.t1230.json [창 날 수]
// T1230 표 — t1230 관찰기 JSON 을 100날 창으로(사람 가중 h · 출생 0 까닭 몫)
const fs = require('fs');
const f = process.argv[2], step = +(process.argv[3] || 100);
const d = JSON.parse(fs.readFileSync(f)); const I = Object.fromEntries(d.cols.map((c, i) => [c, i]));
const out = [];
const maxDay = d.rows.length ? d.rows[d.rows.length - 1][0] : 0;
for (let w = 0; w < maxDay; w += step) {
  const R = d.rows.filter((r) => r[0] > w && r[0] <= w + step); if (!R.length) continue;
  const s = (k) => R.reduce((a, r) => a + r[I[k]], 0), P = s('pop'), last = R[R.length - 1];
  const z = s('zHouse') + s('zGran') + s('zK') + s('zH') + s('zOther');
  out.push({ win: `${w + 1}-${w + step}`, popEnd: last[I.pop], born: s('born'), dead: s('dead'), emig: s('emig'),
    h: +(s('hW') / P).toFixed(3), G: +(s('GW') / P).toFixed(3), lux: +(s('luxW') / P).toFixed(3), E: +(s('EW') / P).toFixed(3), B: +(s('BW') / P).toFixed(3),
    zero: z, zHouse: +(s('zHouse') / Math.max(1, z)).toFixed(2), zGran: +(s('zGran') / Math.max(1, z)).toFixed(2), zK: +(s('zK') / Math.max(1, z)).toFixed(2), zH: +(s('zH') / Math.max(1, z)).toFixed(2), zOther: +(s('zOther') / Math.max(1, z)).toFixed(2),
    floorShare: +(s('floor') / P).toFixed(4), logi: +(s('logi') / R.length).toFixed(1), happy: +(s('happy') / R.length).toFixed(1) });
}
console.log(JSON.stringify({ file: f.split('/').pop(), err: d.err, days: maxDay, jobs: d.jobs.slice(-1), out }));
