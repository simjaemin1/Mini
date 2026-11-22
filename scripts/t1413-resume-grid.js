#!/usr/bin/env node
'use strict';
// Resume the inherited measured grid. `skip` placeholders never count as data.
// At most two child simulations, disjoint cell outputs, append-only completed rows.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{spawn}=require('child_process');
const argv=process.argv.slice(2),opt=(n,d)=>{const i=argv.indexOf('--'+n);return i<0?d:argv[i+1];};
const root=path.join(__dirname,'..'),inDir=opt('in'),outDir=opt('out');if(!inDir||!outDir)throw Error('--in <inherited dir> --out <result dir> required');
let workers=Number(opt('workers',2));if(![1,2].includes(workers))throw Error('only one or two simultaneous simulations');
fs.mkdirSync(outDir,{recursive:true});
const model=path.join(__dirname,'t1413-hunt-year.js'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),modelHash=sha(model);
const key=r=>[r.sp,r.exch,r.nh,r.share,r.seed,r.cap,r.r,r.days].join('|');
const read=f=>fs.existsSync(f)?fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l)):[];
const data=new Map(),rejected=[],sources=[];
for(const name of fs.readdirSync(inDir).filter(f=>f.endsWith('.jsonl')).sort()){
  const file=path.join(inDir,name);let used=0,skips=0,invalid=0;
  read(file).forEach((r,i)=>{
    if(r.skip){skips++;return;}
    // The inherited ruler failed to refill a completely dead roster. A row
    // with fewer deaths than original hunters cannot have reached that branch.
    if(r.hDead>=r.nh||Math.abs(r.end-0.9)<=0.0001){rejected.push({file,line:i+1,key:key(r),reason:'empty-roster risk or rounded threshold ambiguity'});invalid++;return;}
    const old=data.get(key(r));if(old&&JSON.stringify({...old,_origin:undefined})!==JSON.stringify(r))throw Error('conflicting inherited row '+key(r));
    data.set(key(r),{...r,_origin:{kind:'inherited',file,line:i+1}});used++;
  });sources.push({file,sha256:sha(file),used,skips,invalid});
}
const ownFile=path.join(outDir,'추가실측.jsonl');
for(const r of read(ownFile)){
  if(r._origin?.modelHash!==modelHash){rejected.push({key:key(r),reason:'different ruler source hash'});continue;}
  data.set(key(r),r);
}
const expected=[];
// Main cap comparison at the original rate; historical rate comparison at
// the default cap, as in the inherited jobs.txt experiment protocol.
for(const [cap,r] of [['lab',0.002],['free',0.002],['lab',0.0004],['lab',0.0006]])
  for(const sp of ['🦌','🐗','🐇'])for(const exch of [500,5000,50000,187000])for(const share of ['1','0.25','0.1','5d'])for(const nh of [1,3,17])for(const seed of [7,1020])expected.push({sp,exch,nh,share,seed,cap,r,days:365});
const expectedSet=new Set(expected.map(key));for(const k of data.keys())if(!expectedSet.has(k))throw Error('unexpected inherited cell '+k);
const pending=expected.filter(r=>!data.has(key(r)));
// Finish the small populations first; the dense unbounded cells go last.
pending.sort((a,b)=>(a.cap==='free'&&a.exch===500)-(b.cap==='free'&&b.exch===500)||b.exch-a.exch||a.nh-b.nh);
const progress=()=>({expected:expected.length,complete:data.size,pending:expected.length-data.size,modelHash,sources,rejected,peakSimultaneous:peak});
let peak=0;
function snapshot(){fs.writeFileSync(path.join(outDir,'진행.json'),JSON.stringify(progress(),null,2)+'\n');fs.writeFileSync(path.join(outDir,'전체.jsonl'),expected.filter(r=>data.has(key(r))).map(r=>JSON.stringify(data.get(key(r)))).join('\n')+'\n');}
snapshot();console.log('grid',data.size,'/',expected.length,'pending',pending.length,'workers',workers);
if(argv.includes('--list'))process.exit(0);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'t1413-grid-')),active=new Map(),failures=[];let cursor=0,stopping=false;
fs.writeFileSync(path.join(outDir,'runner.pid'),String(process.pid));
function validate(r,probe){if(key(r)!==key(probe)||r.skip||r.days!==365||!Number.isFinite(r.end)||r.end<0||r.end>1||!Number.isInteger(r.harv)||r.harv<0||r.kg!==r.harv*({'🦌':33,'🐗':4,'🐇':1}[r.sp])||!Number.isInteger(r.empty)||r.empty<1||r.empty>365)throw Error('invalid measured row '+key(probe));}
function launch(){
  while(!stopping&&!failures.length&&active.size<workers&&cursor<pending.length){
    if(sha(model)!==modelHash){failures.push('ruler source changed while running');break;}
    const i=cursor++,p=pending[i],file=path.join(tmp,i+'.jsonl'),log=path.join(tmp,i+'.txt'),fd=fs.openSync(log,'w'),started=performance.now();
    const args=[model,'--sp',p.sp,'--exch',String(p.exch),'--hunters',String(p.nh),'--share',p.share,'--seeds',String(p.seed),'--cap',p.cap,'--r',String(p.r),'--days','365','--out',file];
    const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore',fd,fd]});fs.closeSync(fd);active.set(child.pid,child);peak=Math.max(peak,active.size);
    child.on('error',e=>failures.push(String(e)));
    child.on('close',(code,signal)=>{
      active.delete(child.pid);
      try{
        if(stopping)return;
        if(code!==0)throw Error('cell '+key(p)+' RC='+code+' '+(signal||'')+' '+fs.readFileSync(log,'utf8').slice(-2500));
        const rows=read(file);if(rows.length!==1)throw Error('expected exactly one result');const r=rows[0];validate(r,p);
        r._origin={kind:'measured',modelHash,elapsedSeconds:+((performance.now()-started)/1000).toFixed(3)};
        data.set(key(r),r);fs.appendFileSync(ownFile,JSON.stringify(r)+'\n');
        console.log(data.size+'/'+expected.length,key(r),'empty',r.emptied?r.empty:'365+','end',r.end,'kg',r.kg,'seconds',r._origin.elapsedSeconds);
      }catch(e){failures.push(String(e));fs.appendFileSync(path.join(outDir,'오류.txt'),String(e)+'\n');}
      finally{fs.rmSync(file,{force:true});fs.rmSync(log,{force:true});snapshot();launch();}
    });
  }
  if(!active.size&&(stopping||failures.length||cursor===pending.length)){
    snapshot();fs.rmSync(tmp,{recursive:true,force:true});fs.rmSync(path.join(outDir,'runner.pid'),{force:true});console.log('finished',data.size+'/'+expected.length,'peak',peak,'failures',failures.length);process.exitCode=failures.length||stopping?1:0;
  }
}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopping=true;for(const child of active.values())child.kill('SIGTERM');if(!active.size)launch();});
process.on('SIGUSR2',()=>{workers=2;console.log('worker limit increased to two after the other verification lane finished');launch();});
launch();
