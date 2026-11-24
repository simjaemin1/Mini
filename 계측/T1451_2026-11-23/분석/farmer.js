// node farmer.js <arm-seed>... — 농부 낮(취침 뺌) 철 × 갈래 %(여러 판 합)
const G={밭:['파종','김매기','모내기','논매기','수확','방제','물대기','저장'],순찰:['경작'],쉼:['휴식'],걷기:['귀가','출근','운반'],부업:['개간','건축','벌목','인출']};
const S=['봄','여름','가을','겨울']; const tot={};
for (const n of process.argv.slice(2)) { let r; try { r=require('/tmp/t1451/srv/'+n+'/'+n+'.t1422.json'); } catch(e){ continue; }
  for (const s of S) { const f=(r.T[s]||{}).farmer||{}; const o=tot[s]||(tot[s]={}); for (const [k,v] of Object.entries(f)) { if (k==='취침') continue; let g='그 밖'; for (const [gg,L] of Object.entries(G)) if (L.includes(k)) g=gg; o[g]=(o[g]||0)+v; o._=(o._||0)+v; } } }
for (const s of S) { const o=tot[s]; if(!o) continue; console.log(s, ['밭','순찰','부업','걷기','쉼','그 밖'].map(g=>g+' '+(((o[g]||0)/o._)*100).toFixed(1)).join(' · ')); }
