// 달 합 표: node mon.js <t1374.json> [마을정규식]
const o=require(process.argv[2]);const re=process.argv[3]?new RegExp(process.argv[3]):null;const C=o.cols,I=c=>C.indexOf(c);
const by=new Map();for(const r of o.rows){if(re&&!re.test(r[1]))continue;const k=r[0];const m=by.get(k)||{};for(const c of C.slice(2)){const v=r[I(c)];if(typeof v==='number'&&isFinite(v))m[c]=(m[c]||0)+v;}m.n=(m.n||0)+1;if(r[I('pop')]===0)m.empty=(m.empty||0)+1;by.set(k,m);}
const K=['pop','sown','stand','harv','inF','byF','byIn','eatF','tfe','rotF','seedU','farm','bodyF','fd','nat','farmSet'];
console.log('ym   '+K.join(' ')+' empty');for(const [k,m] of by)console.log(k+' '+K.map(c=>Math.round(m[c]||0)).join(' ')+' '+(m.empty||0));
