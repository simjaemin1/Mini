#!/usr/bin/env node
// ★[T354 ③] 빠진 소리 전수 — 문서/빠진소리_전수_*.md 를 만든 그 자. 손 목록 0(전부 코드에서 읽는다).
//   자를 **먼저 검증한다**: 이미 배선된 다섯이 O 로 안 잡히면 exit 1 이다(거짓 표를 안 낸다).
// T354 ③ — 소리가 붙을 수 있는 자리를 **전수로** 뽑는다. 지어내지 않는다: 전부 코드에서 읽는다.
const fs=require('fs'), path=require('path');
const ROOT='/root/minirepo';
const man=JSON.parse(fs.readFileSync(ROOT+'/public/assets/sfx/manifest.json','utf8'));
const KEYS=Object.keys(man.keys).filter(k=>!k.startsWith('_'));
const zone=fs.readFileSync(ROOT+'/server/zone.js','utf8');
const vil=fs.readFileSync(ROOT+'/server/villages.js','utf8');
const mod=fs.readFileSync(ROOT+'/public/client/48-a-audio.js','utf8');

// 층이 **지금 듣는** 메시지 종류 — recv 갈래에서 읽는다(사본 0)
const recv=mod.slice(mod.indexOf('recv: (msg, c)'), mod.indexOf('dbg: ()'));
const heard=new Set([...recv.matchAll(/t === '([a-z_]+)'/g)].map(m=>m[1]));
// ★[T387] 층이 **표로** 듣는 메시지 — `combat` 표(메시지 이름 → 키). 이름이 코드에 안 박혀 있어서
//   위 철자 긁기로는 안 보인다(철자로 부재를 재면 거짓 — 이 자가 T354 에 campfire 로 한 번 당했다).
const heardBy=new Map();
if(/_sfxMan\.combat/.test(recv)) for(const [k,v] of Object.entries(man.combat||{})) if(!k.startsWith('_')&&typeof v==='string'&&man.keys[v]){ heard.add(k); heardBy.set(k,'combat 표 → '+v); }
// 표가 잇는 낱말
const tblWords=new Set();
for(const t of Object.keys(man)) { const v=man[t];
  if(!v||typeof v!=='object'||t==='keys'||t==='sources'||t==='bus'||t==='bgm')continue;
  for(const [k,x] of Object.entries(v)) if(!k.startsWith('_')&&typeof x==='string'&&man.keys[x]) tblWords.add(t+':'+k); }

const rows=[];
const add=(축,자리,있음,근거)=>rows.push({축,자리,있음,근거});

// ① 서버 메시지 종류 전수
const types=[...new Set([...zone.matchAll(/type:\s*'([a-z_]+)'/g)].map(m=>m[1]))].sort();
for(const t of types) add('서버 메시지', t, heard.has(t)?'O':'-', heard.has(t)?(heardBy.get(t)||'층 recv 갈래'):'');
// ② act 낱말 전수
const acts=[...new Set([...vil.matchAll(/_lifeAct\(npc, '([^']+)'\)/g)].map(m=>m[1]))].sort();
for(const a of acts) add('생활 낱말(act)', a, (man.npcAct&&man.npcAct[a])?'O':'-', (man.npcAct&&man.npcAct[a])||'');
// ③ inventory where 낱말 전수
const wheres=[...new Set([...zone.matchAll(/sendInventory\([^,)]+,\s*'([^']+)'\)/g)].map(m=>m[1]))].sort();
for(const w of wheres) add('인벤 낱말(where)', w, (man.inventoryWhere&&man.inventoryWhere[w])?'O':'-', (man.inventoryWhere&&man.inventoryWhere[w])||'');
// ④ 건물 종류 전수 — 클라가 **그리며 가르는** 이름이 정본이다(`b.type === '…'`).
//    ⚠첫 판은 `zone.js` 의 `type:'…'` 을 긁었다가 `campfire` 를 놓치고 "건물 2자리·있음 0" 을 냈다 —
//      `campfire` 는 멀쩡히 배선돼 있는데. **자가 틀리면 없는 결함을 보고한다**(이 집 족보).
const cli = fs.readdirSync(ROOT+'/public/client').filter(f=>f.endsWith('.js'))
  .map(f=>fs.readFileSync(ROOT+'/public/client/'+f,'utf8')).join('\n');
const blds=[...new Set([...cli.matchAll(/b\.type === '([a-z_]+)'/g)].map(m=>m[1]))]
  .concat(Object.keys(man.buildings||{}).filter(k=>!k.startsWith('_')));
// ★[T397] 표면 타일(밭·바닥·마당)은 **밟는** 건물이다 — `buildings`(우는 건물) 표가 아니라 `surface` 표가 잇는다.
const bKey=(b)=>(man.buildings&&man.buildings[b])||(man.surface&&man.surface[b]&&('밟음 → '+man.surface[b]))||'';
for(const b of [...new Set(blds)].sort()) add('건물', b, bKey(b)?'O':'-', bKey(b));
// ⑤ 개체 종류 전수 — animals.js 정본
try{ const an=fs.readFileSync(ROOT+'/public/animals.js','utf8');
  const sp=[...new Set([...an.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map(m=>m[1]))].sort();
  for(const a of sp) add('개체', a, (man.mobs&&man.mobs[a])?'O':'-', (man.mobs&&man.mobs[a])||'');
}catch(e){ add('개체','(animals.js 를 못 읽었다)','-',String(e.message).slice(0,40)); }
// ⑥ 자원 종류 전수 — 매니페스트가 스스로 가리키는 그 자리(`34-m-renderloop` 1513~1526)가 정본이다.
//   ★★[T397 ④] 첫 판은 **줄 번호**(1513~1526)로 잘랐다 — 그 파일 위쪽에 두 줄이 늘자 `ore`·`meteorite` 가
//     창 밖으로 밀려 "소리 있음" 이 30 → 28 로 **조용히** 줄었다(자리는 그대로였다 · 자가 움직였다).
//     ⇒ 줄 번호 대신 **그리기 갈래의 꼴**(`item.r.type === '…'`)을 파일 전체에서 긁는다.
const rl = fs.readFileSync(ROOT+'/public/client/34-m-renderloop.js','utf8');
const res=[...new Set([...rl.matchAll(/item\.r\.type === '([a-z_]+)'/g)].map(m=>m[1]))].sort();
for(const r of res) add('자원', r, (man.resourceHit&&man.resourceHit[r])?'O':'-', (man.resourceHit&&man.resourceHit[r])||'');
// ⑦ 날씨 칸
for(const w of ['wind','precip','indoor','thunder','snow']) {
  const inWx=new RegExp('_sfxWx[^\\n]*'+w).test(mod)||new RegExp("'"+w+"'").test(mod);
  add('날씨 칸', w, inWx?'O':'-', inWx?'층이 읽는다':(w==='thunder'?'세계가 안 보낸다(서버·클라 날씨에 칸 0)':'층에 칸이 없다')); }
// ⑧ 지면 종류 — ground 표
for(const g of ['rock','grass','_기본']) add('지면', g, (man.ground&&man.ground[g])?'O':'-', (man.ground&&man.ground[g])||'');

// ★★자를 먼저 검증한다 — **이미 배선된 것이 O 로 잡히는가**. 안 잡히면 이 표는 거짓말이다.
const mustBeO=[['건물','campfire'],['자원','tree'],['개체','wolf'],['생활 낱말(act)','낚음'],['인벤 낱말(where)','harvest'],['서버 메시지','arrow_spawn'],['자원','ore'],['자원','meteorite'],['건물','farmland']];
const ruler=mustBeO.map(([ax,nm])=>{const r=rows.find(x=>x.축===ax&&x.자리===nm);return `${ax}/${nm}=${r?r.있음:'없다'}`;});
const rulerOk=mustBeO.every(([ax,nm])=>{const r=rows.find(x=>x.축===ax&&x.자리===nm);return r&&r.있음==='O';});
console.log(`자 검증: ${rulerOk?'성하다':'★고장났다'} — ${ruler.join(' · ')}`);
if(!rulerOk) process.exitCode=1;
const have=rows.filter(r=>r.있음==='O').length;
console.log(`자리 ${rows.length} · 소리 있음 ${have} · 없음 ${rows.length-have}`);
const byAxis={};
for(const r of rows){ (byAxis[r.축]=byAxis[r.축]||[]).push(r); }
for(const ax of Object.keys(byAxis)){
  const g=byAxis[ax], h=g.filter(r=>r.있음==='O').length;
  console.log(`\n### ${ax} — ${g.length}자리 · 있음 ${h} · 없음 ${g.length-h}`);
  console.log(g.map(r=>`  ${r.있음} ${r.자리}${r.근거?' → '+r.근거:''}`).join('\n'));
}
fs.writeFileSync('/tmp/sfx/census.json', JSON.stringify(rows,null,1));
