// 도적 시스템 발생 시나리오 프로브 — regression-check.js 자식 하네스 미러 + 도적 이벤트 로그·스냅샷.
//   사용: node _bandit-probe.js --seed 8 [--frames 1500]
//   출력: 진행 스냅샷(즉시 flush — 45초 회수로 죽어도 부분 증거 남음) + 종료 시 _banditStats.log 전체 + tradeAud.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');           // /Mini
const LAB = process.env.LAB || path.join(ROOT, '마을실험실.html');            // 베이스라인 비교: LAB=/tmp/base-lab.html ENGINE=/tmp/base-engine.js
require(process.env.ENGINE || path.join(__dirname, 'sim/economy-engine.browser.js'));
const SEED = +(process.argv[process.argv.indexOf('--seed') + 1] || 8);
const FRAMES = +(process.argv.indexOf('--frames') >= 0 ? process.argv[process.argv.indexOf('--frames') + 1] : 1500);
{ let _s0 = SEED * 2654435761 >>> 0; Math.random = function () { _s0 = _s0 + 0x6D2B79F5 | 0; let t = Math.imul(_s0 ^ _s0 >>> 15, 1 | _s0); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let H = fs.readFileSync(LAB, 'utf8');
// BASELINE=1: 도적 일일 틱만 무력화 — 단이 0이면 econ 훅은 0을 돌려주고 RNG도 안 씀 → 도적 이전과 궤적 동일(정확한 인과 대조군)
if (process.env.BASELINE) { const A = 'banditDaily(VILS.length?VILS[0].day:0);'; if (!H.includes(A)) throw new Error('BASELINE 앵커 없음'); H = H.replace(A, 'if(0)banditDaily(0);'); }
const _log = console.log, out = s => { process.stdout.write(s + '\n'); };
global.N = 1600; global.idx = (x, y) => y * 1600 + x; global.inG = (x, y) => x >= 0 && y >= 0 && x < 1600 && y < 1600;
global.smt = t => t * t * (3 - 2 * t);
global.hash2 = (ix, iy, s) => { let h = ix * 374761393 + iy * 668265263 + s * 1274126177; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
global.vn = (x, y, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s); const u = smt(fx), v = smt(fy); return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
global.fbm = (x, y, s) => { let t = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { t += a * vn(x * f, y * f, s + i * 31); a *= .5; f *= 2; } return t; };
global.MAX_CELLS = Math.PI * 135 * 135;
const vals = { pop: '8', fertV: '0.55', waterV: '0.5', sizeMul: '1.5', compactW: '0', settType: 'nucleated', seed: String(SEED), terrMode: 'auto', simSpeed: '80000', nvil: '8' };
const els = {}; global.document = { getElementById: id => els[id] || (els[id] = { value: vals[id] != null ? vals[id] : '0', textContent: '', innerHTML: '', checked: false, addEventListener: () => {} }) };
global.draw = () => {}; global.V = null; global.TR = null; global.life = null; global.lifeOn = false; global.lifeGM = 0; global.lifeLast = 0; global.lifeSlow = false;
global.buildWalls = () => new Set(); global.nowMs = 0; global.performance = { now: () => global.nowMs }; global.rafCb = null; global.requestAnimationFrame = cb => { global.rafCb = cb; };
const grab = re => { const m = H.match(re); if (!m) throw new Error('패턴 못찾음: ' + re); return m[0]; };
const BT = grab(/function buildTerrain\(s,ov\)\{[\s\S]*?\n\}/), VL = grab(/const VillageLayout=\(function\(\)\{[\s\S]*?\}\)\(\);/),
  PC = grab(/function pickCenter\(\)\{[\s\S]*?\n\}/), BFS = grab(/function bfsPath\([\s\S]*?\n\}/), SP = grab(/function setPath\([\s\S]*?\n\}/),
  TP = grab(/let _tradePaths=\{\};[\s\S]*?return _tradePaths\[key\];\n\}/),
  LIFE = grab(/const L_YEAR=365[\s\S]*?(?=\ndocument\.getElementById\(.pop.\)\.addEventListener)/);
global.eval('global.buildTerrain=' + BT.replace(/^function buildTerrain/, 'function'));
global.eval(VL.replace('const VillageLayout=', 'global.VillageLayout='));
global.frame = function () { global.nowMs += 16; const cb = global.rafCb; global.rafCb = null; if (cb) cb(global.nowMs); };
global.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE +
  "\nglobal.run=function(seed,frames){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*1440;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;" +
  "var t0=Date.now(),tele=[],lastD=0;global.__tele=tele;for(var fr=0;fr<frames;fr++){global.frame();" +
  "if(global.__FG&&fr===700&&VILS.length){var big=VILS[0];for(var q9=1;q9<VILS.length;q9++)if(VILS[q9].econ.npcs.length>big.econ.npcs.length)big=VILS[q9];" +
  "var g9=bdtFormGang(big,5,big.day,'검증 강제(FORCEGANG — 토벌 경로 단위시험)');if(g9){big.econ._banditRisk=0.5;global.__snap('>>> 강제 결성: '+big.name+'('+big.econ.npcs.length+'명) 곁 단#'+g9.id+' — 위험 0.5 주입');}}" +
  "if(global.__FD&&fr>=500&&fr%25===0&&typeof DENS!=='undefined'){var dg=null;for(var q8=0;q8<BANDITS.length;q8++)if(BANDITS[q8].den!=null){dg=BANDITS[q8];break;}" +   // FORCEDEN: 소굴 단이 있는 동안 최근접 마을 위험 0.5 고정(+400m 밖이면 380m로 야영 이동) — 토벌→소굴 영구 철거 경로 단위시험
  "if(dg&&!dg._sup){var bv=null,bdd=1e18;for(var q5=0;q5<VILS.length;q5++){var d5=Math.hypot(VILS[q5].center.cx-dg.camp.cx,VILS[q5].center.cy-dg.camp.cy);if(d5<bdd){bdd=d5;bv=VILS[q5];}}" +
  "if(bv){if(bdd>380){dg.camp={cx:Math.round(bv.center.cx+(dg.camp.cx-bv.center.cx)*380/bdd),cy:Math.round(bv.center.cy+(dg.camp.cy-bv.center.cy)*380/bdd)};global.__snap('>>> FORCEDEN: 단#'+dg.id+'(소굴'+dg.den+') 야영을 '+bv.name+' 380m로 강제 이동(원거리 '+(bdd|0)+'m — 시험용)');bdd=380;}" +
  "bv.econ._banditRisk=0.5;if(global.__fdT!==dg.id){global.__fdT=dg.id;global.__snap('>>> FORCEDEN: '+bv.name+' 위험 0.5 고정 — 소굴 단#'+dg.id+'(den '+dg.den+') 거리 '+(bdd|0)+'m');}}}}" +
  "var D=Math.round(lifeGM/1440-120);" +
  "if(D!==lastD&&D>=350){lastD=D;for(var k2=0;k2<VILS.length;k2++){var e2=VILS[k2].econ,n2=e2.npcs.length;if(!n2)continue;var s2=e2.storage||{},fe2=(s2.food||0)+(s2.fish||0)+(s2.meat||0)+(s2.cooked_food||0);" +
  "if(fe2<n2*10&&tele.length<300&&D%5===0)tele.push('D'+D+' '+VILS[k2].name+' n'+n2+' 식량'+(fe2/n2).toFixed(1)+'일치 행복'+((e2.lastStats?e2.lastStats.happiness:0.5)).toFixed(2)+' 양동이'+((VILS[k2]._bdtCri||0)|0)+' 순감'+(VILS[k2]._bdtFall||0));}}" +
  "if(fr%150===0||fr===frames-1){var bs=(ECON_WORLD&&ECON_WORLD._banditStats)||{};var P=0;for(var k=0;k<VILS.length;k++)P+=VILS[k].econ.npcs.length;" +
  "global.__snap('D'+D+' 마을'+VILS.length+' 인구'+P+' | 단'+(bs.gangs||0)+'/'+(bs.members||0)+'명 전환'+(bs.conv||0)+' 이탈'+(bs.exo||0)+' 약탈'+(bs.loot||0)+' 토벌'+(bs.sup||0)+' 굶'+(bs.starve||0)+' 해산'+(bs.disband||0)+' ['+((Date.now()-t0)/1000).toFixed(0)+'s]');}}" +
  "console.log=global.__log;return {VILS:VILS,world:ECON_WORLD};};" +
  "\nglobal.__smokeSlow=function(){if(!VILS.length)return '마을 없음';console.log=function(){};" +   // 관찰 모드 경로(updateBandits) 헤드리스 스모크: 가짜 단 결성 → 500스텝 구동 — 예외·이동 검증
  "if(!BANDITS.length){var v0=VILS[0];if(v0.econ.npcs.length<9)return '표본 부족';bdtFormGang(v0,4,v0.day,'스모크');}" +
  "if(!BANDITS.length)return '결성 실패(은거지 없음)';var g=BANDITS[0],err=null,moved=0;" +
  "try{for(var t=0;t<500;t++){updateBandits(1);}var far=0;for(var mi=0;mi<g.members.length;mi++){var m=g.members[mi];if(Math.hypot(m.px-g.camp.cx,m.py-g.camp.cy)>0.5)moved++;if(Math.hypot(m.px-g.camp.cx,m.py-g.camp.cy)>40)far++;}" +
  "console.log=global.__log;return '단#'+g.id+' 대원 '+g.members.length+'명, 배회 이동 '+moved+'명(멀리 이탈 '+far+') — 예외 없음';}catch(e){console.log=global.__log;return '예외: '+e.message;}};" +
  "\nglobal.__dens=function(){if(typeof DENS==='undefined')return [];var o=[];for(var i=0;i<DENS.length;i++){var d=DENS[i];o.push({id:d.id,cx:d.cx,cy:d.cy,sc:d.sc,dv:d.dv,dr:d.dr,gen:d.gen,cleared:d.cleared});}return o;};");
global.__log = _log; console.log = _log;
global.__snap = out; global.__FG = !!process.env.FORCEGANG;   // FORCEGANG=1: D~620에 최대 마을 곁 단 5명 강제 결성+위험 0.5 주입 — 토벌 경로 단위시험
global.__FD = !!process.env.FORCEDEN;   // FORCEDEN=1: 소굴 단 존재 시 최근접 마을 위험 고정 → 토벌 격멸 → 소굴 영구 철거·재스폰 없음 검증
out('═══ 도적 프로브 seed=' + SEED + ' frames=' + FRAMES + ' ═══');
const r = global.run(SEED, FRAMES);
const bs = (r.world && r.world._banditStats) || null;
out('\n── 위기 텔레메트리(D350+, 식량<10일치인 마을·5일 간격) ──');
if (global.__tele && global.__tele.length) for (const l of global.__tele) out('  ' + l); else out('  (기록 없음 — 전 마을 식량 안정)');
out('\n── 도적 이벤트 로그 ──');
if (bs && bs.log.length) for (const l of bs.log) out('  ' + l); else out('  (이벤트 없음 — 도적 0)');
out('\n── 잔존 도적단 ──');
if (typeof BANDITS !== 'undefined' && global.BANDITS) {} // BANDITS는 eval 스코프 — world 스냅샷으로 대체
if (bs) out('  단 ' + (bs.gangs || 0) + ' · 총원 ' + (bs.members || 0) + ' · 峰 ' + (bs.peak || 0) + ' · 약탈액 ' + (bs.lootAmt || 0).toFixed(1) + ' · 고립습격 ' + (bs.amb || 0) + ' · 토벌전사 ' + (bs.supDead || 0));
out('\n── 상시 주둔지(원천③ 소굴) ──');
{ const dd = (global.__dens && global.__dens()) || [];
  if (!dd.length) out('  (소굴 없음)');
  for (const d of dd) out('  소굴#' + d.id + ' (' + d.cx + ',' + d.cy + ') 오지점수 ' + d.sc + '(마을거리 ' + d.dv + '·교역로거리 ' + d.dr + ') 세대 ' + d.gen + (d.cleared ? ' — 철거 D' + d.cleared + '(영구)' : ' — 존속'));
  if (bs) out('  결성 누계 ' + (bs.denForm || 0) + ' · 영구 정리 ' + (bs.denClear || 0) + ' · 현존 ' + (bs.dens || 0) + '곳/주둔 ' + (bs.denOcc || 0)); }
out('\n── 마을별 최종 ──');
for (const v of r.VILS) out('  ' + v.name + '(' + (v.role || '?') + ') 인구 ' + v.econ.npcs.length + ' 위험 ' + (((v.econ._banditRisk || 0) * 100) | 0) + '% 위기일 ' + (v._bdtCri || 0) + (v._banditized ? ' [해체됨→도적]' : ''));
if (r.world && r.world._tradeAudit) { const T = r.world._tradeAudit, rs = T.rs.slice().sort((a, b) => a - b), q = f => rs[Math.floor(f * (rs.length - 1))] || 0; out('\ntradeAud n=' + T.n + ' bail=' + T.bail + ' reroute=' + T.reroute + ' p10=' + q(0.1).toFixed(3) + ' p50=' + q(0.5).toFixed(3) + ' p90=' + q(0.9).toFixed(3)); }
{ let raided = 0, sent = 0; for (const v of r.VILS) if (v.econ.tradeStats) { raided += v.econ.tradeStats.caravansRaided || 0; sent += v.econ.tradeStats.caravansSent || 0; } out('교역: 파견 ' + sent + ' · 피약탈 ' + raided); }
if (process.env.SMOKESLOW) out('관찰 모드 스모크: ' + global.__smokeSlow());
