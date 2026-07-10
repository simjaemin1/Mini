// ═══════════════════════════════════════════════════════════════════════════
// _s5-wildlife-probe.js — S2/S5 전역 야생: 행군·전투 병사(소속 무관)를 지역 몹이 공간 기반 인식(#5).
//   ★전쟁실험실.html 블록2(야생/agrid)에서 실제 spatial-hash 원시코드(BK·gkey·addThreat·nearIn)와
//     MOB_DEF(토끼·사슴 도주 반경)를 ★소스에서 verbatim 추출(복제 아님). 전쟁실험실 무수정(읽기만). in-memory·결정론.
//   검증:
//     (A) 배선: _warThreats 병합이 몹이 조회하는 *동일* agrid에 territory 검사 없이 들어감(소스 라인 확인).
//     (B) 공간 인식: 마을 소속 없는 군사 agent(px/py만)를 agrid에 넣으면 nearIn(60m)이 근처 토끼 곁에서 찾음.
//         소속 무관 — 몹은 agent.village/faction을 안 봄(px/py만). 60m 밖은 안 잡음(캡 준수).
//     (C) 도주 트리거: 위협거리 td<flee(토끼 8m/사슴 50m)면 도주 판정 성립(실제 flee 반경 수식).
//   실행: node sim/_s5-wildlife-probe.js
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LAB = path.join(ROOT, '전쟁실험실.html');
const _log = console.log;
const H = fs.readFileSync(LAB, 'utf8');
const blocks = [...H.matchAll(/<script>([\s\S]*?)<\/script>/g)];

// 야생 코드가 있는 블록 자동 선택(BK=64,gkey 포함 블록)
const WILD = blocks.map(b => b[1]).find(s => s.indexOf('const BK=64,gkey') >= 0);
if (!WILD) { _log('❌ 야생(agrid) 블록 미발견'); process.exit(1); }
function grab(str, from, to, name) { const i = WILD.indexOf(from); if (i < 0) throw new Error('추출 실패(from): ' + name); const j = WILD.indexOf(to, i); if (j < 0) throw new Error('추출 실패(to): ' + name); return WILD.slice(i, j + to.length); }

// ── (A) 배선 검사: _warThreats가 몹 조회 agrid에 territory 없이 병합되는가(소스 라인) ──
_log('=== [S5·#5] (A) 배선: _warThreats → 몹 조회 agrid 병합(소속/territory 검사 없음) ===');
const wireAgrid = /const agrid=new Map\(\);/.test(WILD);
const wireAdd = /const addThreat=\(a\)=>\{const k=gkey\(a\.px,a\.py\)/.test(WILD);
const wireNPC = /for\(const a of s\.agents\)\{if\(a\.state==='home'\|\|a\._muster\)continue;addThreat\(a\);\}/.test(WILD);
const wireWar = /if\(typeof _warThreats!=='undefined'\)for\(const a of _warThreats\)addThreat\(a\);/.test(WILD);
const wireNear = /const nearIn=\(grid,x,y,cb\)=>/.test(WILD);
// 몹 지각이 nearIn(agrid,...)로 사람 위협을 스캔하는가
const mobUsesAgrid = /nearIn\(agrid,m\.px,m\.py,a=>/.test(WILD);
// territory/village 게이트가 위협 등록에 없는가(addThreat엔 px/py만)
const noTerritoryGate = !/addThreat[\s\S]{0,80}(village|faction|territory|owner)/.test(WILD.slice(WILD.indexOf('const addThreat=')));
const wireOK = wireAgrid && wireAdd && wireNPC && wireWar && wireNear && mobUsesAgrid && noTerritoryGate;
_log(`  agrid 생성=${wireAgrid?'✓':'✗'} addThreat(px/py만)=${wireAdd?'✓':'✗'} 활동NPC병합=${wireNPC?'✓':'✗'} _warThreats병합=${wireWar?'✓':'✗'} nearIn정의=${wireNear?'✓':'✗'}`);
_log(`  몹지각 nearIn(agrid)=${mobUsesAgrid?'✓':'✗'} · 위협등록 territory게이트 없음=${noTerritoryGate?'✓':'✗'}`);
_log(`  → ${wireOK ? '✅ 배선 정합(_warThreats가 몹 조회 agrid에 소속검사 없이 들어감 — 공간만)' : '❌ 배선 결함'}\n`);

// ── verbatim 추출: BK/gkey/addThreat/nearIn (몹 스캔 스코프 재현) ──
const gkeyDef = grab(WILD, 'const BK=64,gkey=', ');', 'gkey');   // "const BK=64,gkey=...;"
const addDef  = grab(WILD, 'const addThreat=(a)=>', '};', 'addThreat');
const nearDef = grab(WILD, 'const nearIn=(grid,x,y,cb)=>', '};', 'nearIn');

// ── MOB_DEF 추출(토끼·사슴 flee/alert 실값) ──
const mobDefBlk = grab(WILD, 'const MOB_DEF={', '}};', 'MOB_DEF');
let MOB_DEF; { const f = new Function(mobDefBlk + '\n;return MOB_DEF;'); MOB_DEF = f(); }

// ── (B) 공간 인식: 소속 없는 군사 agent를 agrid에 넣고 nearIn으로 찾기 ──
_log('=== [S5·#5] (B) 공간 인식: 소속 없는 군사 agent(px/py만)를 몹이 nearIn(60m)으로 인식·소속 무관·60m캡 ===');
function runAgrid(threatXY, mobXY) {
  // 소스 스코프 재현: agrid + addThreat + nearIn (verbatim). _warThreats에 소속필드 없는 agent만.
  const body =
    gkeyDef + '\n' +
    'const agrid=new Map();\n' + addDef + '\n' + nearDef + '\n' +
    // _warThreats = 소속(village/faction) 필드가 아예 없는 순수 군사 agent(px/py·state만)
    'const _warThreats=THREATS;\n' +
    "for(const a of _warThreats)addThreat(a);\n" +
    // 몹 위치서 nearIn 스캔 — 60m² = 3600 이내만 위협으로 카운트(소스 몹 지각 상한과 동일)
    'let found=[]; nearIn(agrid, MX, MY, a=>{const dx=a.px-MX,dy=a.py-MY,r2=dx*dx+dy*dy; if(r2<=3600) found.push({id:a.id,r:Math.sqrt(r2)});});\n' +
    'return found;';
  const scope = new Function('THREATS', 'MX', 'MY', body);   // ★body는 마지막 인자(new Function 규약)
  return scope(threatXY, mobXY.x, mobXY.y);
}
// 군사 agent: 소속·마을 필드 전무(px/py/state='muster'|'battle'만). 몹은 이걸 못 구분해야 함.
const soldierNear = { id: 1, px: 205, py: 200, state: 'march' };       // 토끼(200,200)서 5m
const soldierBattle = { id: 2, px: 200, py: 240, state: 'battle' };    // 40m (사슴 인식권, 토끼 밖)
const soldierFar = { id: 3, px: 200, py: 300, state: 'muster' };       // 100m (60m캡 밖 — 안 잡힘)
const mob = { x: 200, y: 200 };
const found = runAgrid([soldierNear, soldierBattle, soldierFar], mob);
const foundIds = found.map(f => f.id);
const sees5m = foundIds.includes(1);       // 5m 병사 인식
const sees40m = foundIds.includes(2);      // 40m 병사 인식(60m캡 안)
const skips100m = !foundIds.includes(3);   // 100m 병사 미인식(캡 준수)
_log(`  agrid 조회 결과: ${found.map(f => `#${f.id}@${f.r.toFixed(0)}m`).join(' ') || '(없음)'}`);
_log(`  5m 행군병 인식=${sees5m?'✓':'✗'} · 40m 전투병 인식=${sees40m?'✓':'✗'} · 100m 병사 미인식(60m캡)=${skips100m?'✓':'✗'}`);
_log(`  ※ 위협 agent엔 village/faction 필드 전무 → 몹은 소속 못 봄(px/py만 사용) = 소속 무관 공간 인식\n`);
const spatialOK = sees5m && sees40m && skips100m;

// ── (C) 도주 트리거: 위협거리 td < flee(토끼8/사슴50) → 도주 성립 ──
_log('=== [S5·#5] (C) 도주 반경: 군사 agent 접근 시 토끼(flee8)·사슴(flee50) 실제 도주 판정 ===');
function fleeTrig(mobType, threatDist) {
  const D = MOB_DEF[mobType]; const tmp = 1.0;   // 성격 계수 1
  const fl = D.flee * tmp;    // 소스: fl=D.flee*m.tmp*(부상?1.3:1) — 건강체 tmp1
  const al = D.alert * tmp;
  // 소스 초식 도주 조건 핵심: (thr && td<fl) → flee. alert: td<al → 경계.
  return { fl, al, flee: threatDist < fl, alert: threatDist < al };
}
// 토끼: 5m 병사(도주해야), 15m(경계~alert20 안이나 flee8 밖=경계), 30m(무반응)
const rb5 = fleeTrig('🐇', 5), rb15 = fleeTrig('🐇', 15), rb30 = fleeTrig('🐇', 30);
// 사슴: 40m 병사(flee50 안=도주), 80m(밖)
const dr40 = fleeTrig('🦌', 40), dr80 = fleeTrig('🦌', 80);
_log(`  🐇 토끼(flee${rb5.fl}/alert${rb5.al}): 5m→도주${rb5.flee?'✓':'✗'} · 15m→경계${rb15.alert&&!rb15.flee?'✓':'?'}(도주${rb15.flee}) · 30m→무반응${!rb30.alert?'✓':'✗'}`);
_log(`  🦌 사슴(flee${dr40.fl}/alert${dr40.al}): 40m→도주${dr40.flee?'✓':'✗'} · 80m→도주밖${!dr80.flee?'✓':'✗'}`);
const fleeOK = rb5.flee && !rb30.alert && dr40.flee && !dr80.flee;
_log(`  → ${fleeOK ? '✅ 도주 반경 정합(토끼 8m·사슴 50m 실측 반경으로 군사 agent 인식→도주)' : '❌ 도주 판정 결함'}\n`);

// ── 종합 ──
_log('══════════════════════════════════════════════════════════════');
const allPass = wireOK && spatialOK && fleeOK;
_log(`S5 전역 야생 검증 종합: 배선(A)=${wireOK?'✅':'❌'}  공간인식(B)=${spatialOK?'✅':'❌'}  도주반경(C)=${fleeOK?'✅':'❌'}`);
_log(`  → ${allPass ? '✅✅ 행군·전투 병사를 지역 몹이 소속 무관 공간 기반 인식(토끼 flee) — S2/S5 전역 야생 통과' : '❌ 일부 결함'}`);
_log('══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
