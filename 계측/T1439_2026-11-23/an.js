// node an.js <arm-seed>... — 사냥 고기 kg/날 · 둔 몫 · 썩음 · 헛걸음 · 불린 몸-시간 · 인구 · 굶음
for (const n of process.argv.slice(2)) { const D='/tmp/t1439/srv/'+n;
 const L=require('fs').readFileSync(D+'.p16.jsonl','utf8').trim().split('\n').map(JSON.parse); const last=L[L.length-1];
 const o=require(D+'.t1439.json'); const j=require(D+'.json');
 const t16=last.t16||{}, t29=last.t29||o.t1429||{};
 const kgDay=(last.carryKg/last.d).toFixed(0);
 const v=o.v1439||{}, w=o.t1439||{};
 // 불린 몸-시간: 생활층 판 ms → 날 (판 하루 = dayMs × 낮 몫 — 몸 시계)
 console.log(n,'날',last.d,'인구',last.pop,'| 곳간에 진 고기·짐 kg/날',kgDay,'· 실은',t16.loadKg,'둔',t16.cacheKg,'가져옴',t16.fetchKg,'두고 온(썩음)',t16.leftKg,'· 사체 잃음',t16.lostCarc,
  '| 몰이 잡음',w.coKills+'/'+w.kills,'몰이 나눔',w.coShare,w.coShareKg+'kg','진',w.coLoadKg,'헛',w.coMiss,
  '| 부름',v.calls,'원함',v.want,'옴',v.got,'모자람',v.short,'넣음',v.deliverKg,'kg 헛걸음',v.miss,'몸ms',Math.round(v.bodyMs||0),'걸음ms',Math.round(v.walkMs||0),JSON.stringify(v.byJob||{}),
  '| 생애 다',t29.lifeDone,'썩',t29.lifeRot,t29.lifeRotKg,'| 굶어죽음',(j.bodyExit&&j.bodyExit.died)?j.bodyExit.died.starve:'-','eight',JSON.stringify(j.eight));}
