// 진단 표: node an1.js <file>
const r=require(process.argv[2]);const C=r.cols,I=c=>C.indexOf(c);
console.log('hooks',r.hooks,'err',r.err);
// 세계 달 줄
const by={};for(const x of r.rows){const ym=x[0];const o=by[ym]||(by[ym]={n:0,pop:0,K:0,slot:0,prod:0,fuel:0,g74:0,days:0,born:0,fd:0,nat:0,gateBorn:0,farm:0,fish:0,hunt:0,forage:0,lj:0,fdays:0,need:0,vd:0,logi:0});
 const d=x[I('days')];o.n++;o.pop+=x[I('pop')];o.K+=x[I('K')]/d;o.slot+=x[I('slot')]/d;o.prod+=x[I('prod')]/d;o.fuel+=x[I('fuel')]/d;o.g74+=x[I('g74')];o.vd+=d;o.born+=x[I('born')];o.fd+=x[I('fd')];o.nat+=x[I('nat')];o.gateBorn+=x[I('gateBorn')];
 o.farm+=x[I('j_farmer')]/d;o.fish+=x[I('j_fisher')]/d;o.hunt+=x[I('j_hunter')]/d;o.forage+=x[I('j_forager')]/d;o.lj+=x[I('j_lumberjack')]/d;o.fdays+=x[I('fdays')]/d;o.need+=x[I('need')]/d;o.logi+=x[I('logi')]/d;}
console.log('ym     pop   K    slot  prod  fuel  g74%  born  gateBorn fd nat  farm fish hunt forage lj  fdays need logi');
for(const ym of Object.keys(by).sort()){const o=by[ym];console.log(ym,String(o.pop).padStart(5),o.K.toFixed(0).padStart(5),o.slot.toFixed(0).padStart(5),o.prod.toFixed(0).padStart(5),o.fuel.toFixed(0).padStart(5),(o.g74/o.vd*100).toFixed(0).padStart(4),String(o.born).padStart(5),o.gateBorn.toFixed(0).padStart(7),String(o.fd).padStart(4),String(o.nat).padStart(3),o.farm.toFixed(0).padStart(5),o.fish.toFixed(0).padStart(4),o.hunt.toFixed(0).padStart(4),o.forage.toFixed(0).padStart(5),o.lj.toFixed(0).padStart(4),(o.fdays/o.n).toFixed(0).padStart(5),(o.need/o.n).toFixed(0).padStart(4),o.logi.toFixed(1));}
