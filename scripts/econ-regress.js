#!/usr/bin/env node
// === scripts/econ-regress.js — CLI 랩 5시드 회귀 ===
// ★결과 파일을 매번 지우고 실행 실패를 잡는다. 안 그러면 옛 덤프를 읽어 거짓 통과가 난다.
'use strict';
const {execFileSync}=require('child_process'); const fs=require('fs');
const rows=[];
for(const s of [42,7,19,101,256]){
  const f='/root/minirepo/sim/out/sim-'+s+'-800d.json';
  // ★★옛 결과 파일이 남아 있으면 실행이 죽어도 그걸 다시 읽어 **거짓 통과**가 난다.
  //   실제로 그렇게 당했다: RESERVE_PC TDZ 로 CLI 가 죽는데 회귀는 "비트 동일"을 냈다.
  //   ⇒ 매번 지우고, 실행 실패를 삼키지 않는다.
  try { fs.unlinkSync(f); } catch (e) {}
  try{ execFileSync('node',['sim/economy-sim.js','800',String(s),'6'],{cwd:'/root/minirepo',timeout:600000,stdio:'ignore'}); }
  catch(e){ rows.push({s,err:1,msg:String(e.message||e).slice(0,80)}); continue; }
  if(!fs.existsSync(f)){rows.push({s,err:1,msg:'덤프 없음'});continue;}
  const j=JSON.parse(fs.readFileSync(f,'utf8'));
  let pop=0,weap=0,cu=0,tin=0,iron=0,dead=0,smith=0,miner=0;
  for(const v of j.villages||[]){const n=v.finalPop||0;pop+=n;if(n<=0)dead++;
    const st=v.finalStorage||{},jb=v.jobs||{};
    weap+=st.weapon||0;cu+=st.copper||0;tin+=st.tin||0;iron+=st.iron||0;smith+=jb.smith||0;miner+=jb.miner||0;}
  rows.push({s,pop,weap:+weap.toFixed(0),cu:+cu.toFixed(0),tin:+tin.toFixed(1),iron:+iron.toFixed(0),smith,miner,dead});
}
console.log('시드   인구  무기   구리  주석    철  대장 광부 소멸');
for(const r of rows) console.log(r.err?('  '+r.s+' 실패 — '+(r.msg||'')):
 ('  '+String(r.s).padStart(3)+String(r.pop).padStart(6)+String(r.weap).padStart(6)+String(r.cu).padStart(7)
  +String(r.tin).padStart(7)+String(r.iron).padStart(6)+String(r.smith).padStart(5)+String(r.miner).padStart(5)+String(r.dead).padStart(5)));
const S=k=>rows.filter(r=>!r.err).reduce((a,r)=>a+r[k],0);
console.log('  합계'+String(S('pop')).padStart(6)+String(S('weap')).padStart(6)+String(S('cu')).padStart(7)
 +S('tin').toFixed(1).padStart(7)+String(S('iron')).padStart(6)+String(S('smith')).padStart(5)+String(S('miner')).padStart(5)+String(S('dead')).padStart(5));
