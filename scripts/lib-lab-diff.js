// === scripts/lib-lab-diff.js — 랩 ↔ 서버 손 사본 대조 줄 · 알려진 다름 줄 (T1395 · 전수표 `계측/T1395_2026-11-20/전수표.md`) ===
// (@regress 없음 — 자(尺)다. 부르는 곳 = `scripts/lab-wiring-check.js` [P] · 하네스 = `scripts/test-t1395-lab-diff.js`)
//
// ★왜: 재민 09-03 "랩에서 만든 것이 목표다". 랩(`lab/*.html`)과 서버가 **각자 손으로** 같은 수를 적어 둔 자리는
//   한쪽만 바뀌어도 아무도 모른다(T1395 — 영토 1,500 자르기를 PM 이 며칠 "집터가 모자란다"로 읽었다).
//   그래서 전수표의 "같음 · 손 사본" 줄을 여기 한 벌로 적고, 두 글자에서 **값을 뽑아** 맞댄다(값을 이 파일에 다시 적지 않는다).
//
// 줄의 꼴:
//   { id, what, lab: [파일, 정규식(값 = 첫 묶음)], srv: [파일, 정규식(값 = 첫 묶음)] }
//   값은 숫자면 수로, 아니면 빈칸을 지운 글자로 맞댄다.
// SAME  = 전수표 "같음 · 손" 줄 — 어긋나면 빨강(❌).
// DIFFS = 전수표 "다름" 줄 — 지금 두 값을 찍는다. `scripts/lab-diff-ok.txt`(PM 만 편집 · `id | 까닭 | 족보 번호`)에 없으면 경고 한 줄.
//         글자를 못 찾으면(정규식이 낡음) 빨강 — 다름 줄도 "어디가 다른지"를 계속 쥐고 있어야 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const WAR = 'lab/전쟁실험실.html', VIL = 'lab/마을실험실.html';

const SAME = [];
const DIFFS = [];

const B = 'lab/전쟁실험실.html#body';
// 이름 = 값 꼴(양쪽 같은 이름) — 정규식 하나로 두 글자를 다 읽는다
const NV = (n) => new RegExp('(?<![\\w.$])' + n + '\\s*=\\s*([\\d.]+)(?![\\d.])');
const same = (id, what, ref, srvFile, labRe, srvRe) => SAME.push({ id, what, ref, lab: [B, labRe], srv: [srvFile, srvRe || labRe] });
const byName = (pre, ref, srvFile, names) => names.forEach((n) => same(`${pre}${n}`, n, ref, srvFile, NV(n)));

// ── part 1 · 마을 배치(랩 손 사본 VillageLayout ↔ server/village-layout.js) · 처음 조건 · 곳간 ──
byName('P1-', '1-1~1-6', 'server/village-layout.js', ['HOUSE_CAP_PER_FLOOR', 'LAND_PER_HOUSE', 'HALL_YARD', 'LOT_R', 'FARM_GAP', 'ALLEY_R']);
same('P1-W_PEN_K', '집터 물가 페널티 W_PEN_K', '1-17', 'server/villages.js', NV('W_PEN_K'));
same('P1-TERR_FORMULA', '처음 영토 식 (1500 + ⌈pop/6⌉×400)×sizeMul', '1-24', 'server/village-layout.js', /\(1500\s*\+\s*Math\.ceil\(pop\s*\/\s*HOUSE_CAP_PER_FLOOR\)\s*\*\s*LAND_PER_HOUSE\)\s*\*\s*(sizeMul)/);
SAME.push({ id: 'P1-SIZEMUL', what: '영토 배율 sizeMul 기본(랩 슬라이더 ↔ 서버 generate 기본)', ref: '1-22', lab: ['lab/전쟁실험실.html', /id="sizeMul"[^>]*value="([\d.]+)"/], srv: ['server/village-layout.js', /opts\.sizeMul\s*:\s*([\d.]+)/] });
SAME.push({ id: 'P1-INIT_POP', what: '처음 인구', ref: '1-30', lab: [B, /Math\.max\((\d+),\+document\.getElementById\('pop'\)/], srv: ['server/villages.js', /INITIAL_POP\s*=[^;\n]*\|\|\s*(\d+)/] });
same('P1-NONG6', '집터 점수 논 잠식 ×6', '1-56', 'server/villages.js', /sc\+=nong\*(\d+)/, /sc \+= nong \* (\d+)/);
byName('P1-', '1-67', 'server/villages.js', ['G_CAP', 'G_MAX', 'G_BUILDD']);
same('P1-L_DEFOREST_H', '집 둘레 벌채 반경', '1-18 · 3-21', 'server/villages.js', NV('L_DEFOREST_H'));

// ── part 2 · 농사 · 개간 · 일과 · 길 · econ 세계 옵션 ──
same('P2-L_WEEDS', '김매기 차례 L_WEEDS', '2-10', 'server/villages.js', /L_WEEDS\s*=\s*\[([\d.,\s]+)\]/);
byName('P2-', '2-11 · 2-12', 'server/villages.js', ['L_WATERGAP', 'L_PESTP', 'L_QW', 'L_QP', 'L_QMIN', 'L_QREC']);
same('P2-CLEAR_GLUT', '개간 멈춤 — 곳간 사람×120일치', '2-29', 'server/villages.js', /s\.food>s\.pop\*(\d+)/, /> e\.npcs\.length \* (\d+)/);
same('P2-FARM_GRAN', '개간 금지 — 곳간 ±4(가로)', '2-33', 'server/villages.js', /Math\.abs\(g\.cx-x\)<=(\d)&&Math\.abs\(g\.cy-y\)<=\d/, /Math\.abs\(g2\.cx - x\) <= (\d) && Math\.abs\(g2\.cy - y\) <= \d/);
same('P2-HUNTRISK', '사냥 위험 EMA 바닥 0.03', '2-40', 'server/villages.js', /_huntRisk[^;\n]*\*0\.95\+Math\.max\(([\d.]+),Math\.min\(/, /_huntRisk[^;\n]*\* 0\.95 \+ Math\.max\(([\d.]+), Math\.min\(/);
same('P2-LON_SPREAD', '경도 하루 퍼짐(T720 끔 갈래 · 마을 만들 때)', '2-44', 'server/villages.js', /L_LON_SPREAD\s*=\s*([\d.]+)/, /_t720LonOff\(ccx\) : \+\(\(ccx \/ Math\.max\(1, _cw\)\) \* ([\d.]+)\)/);
same('P2-LON_SPREAD_BOOT', '경도 하루 퍼짐(T720 끔 갈래 · 부팅)', '2-44', 'server/villages.js', /L_LON_SPREAD\s*=\s*([\d.]+)/, /_t720LonOff\(vil\.ccx\) : \+\(\(vil\.ccx \/ _cw\) \* ([\d.]+)\)/);
same('P2-W_PICKER', 'econ 세계 picker', '2-53', 'server/villages.js', /createWorldV2\(\{[^}]*picker:\s*'(\w+)'/, /createWorldV2\(\{[\s\S]{0,300}?picker:\s*'(\w+)'/);
same('P2-W_INFORANGE', 'econ 세계 infoRange', '2-53', 'server/villages.js', /createWorldV2\(\{[^}]*infoRange:\s*(\d+)/, /createWorldV2\(\{[\s\S]{0,300}?infoRange:\s*(\d+)/);
same('P2-W_RAID', 'econ 세계 raidPer100', '2-53', 'server/villages.js', /createWorldV2\(\{[^}]*raidPer100:\s*([\d.]+)/, /createWorldV2\(\{[\s\S]{0,300}?raidPer100:\s*([\d.]+)/);
same('P2-ROAD_T1', '답압 길 1등급 문턱', '2-61', 'server/roads.js', /L_ROAD_T1\s*=\s*(\d+)/, /const T1 = (\d+), T2/);
same('P2-ROAD_T2', '답압 길 2등급 문턱', '2-61', 'server/roads.js', /L_ROAD_T2\s*=\s*(\d+)/, /T2 = (\d+), VMAX/);
same('P2-ROAD_MAX', '답압 상한', '2-61', 'server/roads.js', /L_ROAD_MAX\s*=\s*(\d+)/, /VMAX = (\d+), DK/);
same('P2-ROAD_DK', '답압 감쇠', '2-61', 'server/roads.js', /L_ROAD_DK\s*=\s*([\d.]+)/, /VMAX = \d+, DK = ([\d.]+)/);
same('P2-ROAD_SPD', '길 등급 걸음 배속', '2-61', 'server/roads.js', /L_ROAD_SPD\s*=\s*\[([\d.,\s]+)\]/, /SPD = \[([\d.,\s]+)\]/);
same('P2-ROAD_COST', '길 등급 길찾기 값', '2-61', 'server/roads.js', /L_ROAD_COST\s*=\s*\[([\d.,\s]+)\]/, /COST = \[([\d.,\s]+)\]/);

// ── part 3 · 자원 · 짐승 · 사냥 ──
byName('P3-', '3-1 · 3-3 · 3-4 · 3-14 · 3-17 · 3-18', 'server/sustain.js', ['L_WOODMAX', 'L_CHOP', 'L_WOODREGLOG', 'L_FISHR', 'FISH_ECON_PER_STOCK', 'L_FORAGER', 'L_FORAGEK_MIN', 'F_MAX']);
same('P3-ORE_K', '광맥 칸 재고 K', '3-6', 'server/specialty.js', /const L_OREMAX\s*=\s*(\d+)/, /const ORE_K = (\d+);/);
same('P3-MINE_PER', '재고 1 = 몇 타', '3-7', 'server/specialty.js', /L_MINE_PER\s*=\s*(\d+)/, /MINE_SWINGS_PER = (\d+)/);
same('P3-HAUL', '광석 지게 짐', '3-8', 'server/specialty.js', /(?<![\w])L_HAUL\s*=\s*(\d+)/, /MINE_HAUL = (\d+)/);
same('P3-HAUL_TRIP', '광석 왕복 분', '3-8', 'server/specialty.js', /L_HAUL_TRIP\s*=\s*(\d+)/, /MINE_HAUL_TRIP = (\d+)/);
same('P3-OREREG0', '광맥 재생 0', '3-10', 'server/specialty.js', /L_OREREG0\s*=\s*([\d.]+)/, /ORE_REG0 = ([\d.]+)/);
same('P3-OREREG1', '광맥 재생 1', '3-10', 'server/specialty.js', /L_OREREG1\s*=\s*([\d.]+)/, /ORE_REG1 = ([\d.]+)/);
same('P3-FISHBK', '어장 버킷 변', '3-13', 'server/fishing.js', /L_FISHBK\s*=\s*(\d+)/, /const FISH_BK = (\d+);/);
byName('P3-', '3-11', 'server/villages.js', ['L_GAMEMAX', 'L_GAMER', 'L_HUNT']);
same('P3-GAMEHALF', '사냥 포화 반값 = K×0.15', '3-12', 'server/villages.js', /L_GAMEHALF\s*=\s*L_GAMEMAX\s*\*\s*([\d.]+)/);
same('P3-CORPSE', '누운 몸 남는 시간(분)', '3-22', 'server/zone.js', /L_CORPSE\s*=\s*(\d+)\*\d+/, /CORPSE_DECAY_MS = (\d+) \* \d+ \* 1000/);
byName('P3-', '3-26~3-29', 'server/wildlife.js', ['MOB_CAP', 'MOB_DENS', 'MOB_SEP_R', 'MOB_SEP_F', 'MOB_COH', 'MOB_ALI', 'MOB_WPT', 'MOB_TURN', 'MOB_WILD_R', 'MOB_WILD_RICH', 'MOB_AV0', 'MOB_AV1', 'MOB_CATCH_R', 'MOB_HUNT_R', 'MOB_SNEAK_IN', 'MOB_STILL', 'MOB_ARROW_V', 'MOB_WOLF_P', 'MOB_TIG_P']);

// ── part 4 · 도적 · 전쟁 경제 층(랩 손 ↔ server/bandits.js · sim/war-core.js) ──
byName('P4-', '4-1~4-15', 'server/bandits.js', ['BDT_CONV', 'BDT_GMIN', 'BDT_GMAX', 'BDT_CRI_HAP', 'BDT_CRI_FOOD', 'BDT_DIS_FALL', 'BDT_DIS_FOOD', 'BDT_EXO_D', 'BDT_EXO_GAP', 'BDT_UPKEEP', 'BDT_STARVE', 'BDT_CAP', 'BDT_RT_R', 'BDT_RT_X', 'BDT_RAID_R', 'BDT_SUP_R', 'BDT_CAMP_BUF', 'BDT_FENCE_F', 'BDT_FENCE_G', 'BDT_RISK_UP', 'BDT_RISK_DK', 'BDT_SUP_TH', 'BDT_SUP_N', 'BDT_SUP_CD', 'BDT_DEN_SEP', 'BDT_DEN_DV', 'BDT_DEN_CD0', 'BDT_DEN_CD1', 'BDT_DEN_SZ0', 'BDT_DEN_SZ1', 'BDT_DEN_FOOD']);
same('P4-BDT_MIN_DAY', '도적 정착 보호기', '4-4', 'server/bandits.js', NV('BDT_MIN_DAY'), /BANDIT_MINDAY \|\| '', 10\) \|\| (\d+);/);
same('P4-WAR_MIN_DAY', '전쟁 보호기', '4-16', 'sim/war-core.js', NV('WAR_MIN_DAY'), /WAR_MINDAY \|\| '', 10\)\) \|\| (\d+);/);
same('P4-WAR_CAP_EU', '개전 기대 포로 가치(켬 값)', '4-36', 'sim/war-core.js', NV('WAR_CAP_EU'), /WAR_CAP_EU = WAR_CAP_ON \? (\d+) :/);
byName('P4-', '4-17~4-35', 'sim/war-core.js', ['WAR_GRUDGE_UP', 'WAR_GRUDGE_CAS', 'WAR_GRUDGE_DK', 'WAR_FEUD_TH', 'WAR_FAT_CAS', 'WAR_FAT_DK', 'WAR_FAT_GATE', 'WAR_CD', 'WAR_CAS_W', 'WAR_UTIL_TH', 'WAR_TRAUMA_UP', 'WAR_TRAUMA_DK', 'WAR_AUX_MULT', 'WAR_FOOD_CRISIS', 'WAR_FOOD_RICH', 'WAR_RANGE', 'WAR_LEVY', 'WAR_RAID_MIN', 'WAR_RATION', 'WAR_CAS_BASE', 'WAR_LOOT', 'WAR_LOOT_PREST', 'WAR_TRIB_YRS', 'WAR_TRIB_RATE', 'WAR_TRIB_INT', 'WAR_PAL_WOOD', 'WAR_PAL_MAX', 'WAR_J_LOOT0', 'WAR_J_LOOT1', 'WAR_J_PREST0', 'WAR_J_PREST1', 'WAR_J_BURN', 'WAR_J_FAT', 'WAR_REP_TH', 'WAR_REP_K', 'WAR_GRUDGE_BLOCK_TH', 'WAR_SALV_DEAD', 'WAR_SALV_DESERT', 'WAR_DESERT_P0', 'WAR_DESERT_PM', 'WAR_BRONZE_WEAPQ_TH', 'WAR_BRONZE_WEAPQ_CAP', 'WAR_MAX_ARMY', 'WAR_ENGAGE_MAX', 'WAR_DEF_ENGAGE_RATIO', 'WAR_DEF_ENGAGE_MIN', 'WAR_BATTLE_DT', 'WAR_BATTLE_MAXTICK', 'WAR_HOME_KEEP_FRAC', 'WAR_HOME_KEEP_WAR', 'WAR_SUPPLY_DIST_K', 'WAR_MOB_ODDS_MIN', 'WAR_WSKILL_MAX', 'WAR_WS_VET_GAIN', 'WAR_CAP_FRAC', 'WAR_CAP_ESCORT', 'WAR_CAP_ASSIM', 'WAR_CAP_ESC0', 'WAR_CAP_ESC1', 'WAR_CAP_ESC_D', 'WAR_CAP_RANSOM_INT', 'WAR_CAP_RANSOM_P', 'WAR_CAP_RANSOM_FOOD', 'WAR_CAP_RANSOM_FD', 'WAR_CAP_RANSOM_GR']);

// ── part 5 · 전쟁 몸 층(작전층 상수 ↔ sim/war-core.js · 교전 거리 · MU ↔ server/war-live.js) ──
byName('P5-', '5-10~5-20', 'sim/war-core.js', ['WAR_SIEGE_PACK', 'WAR_PACK_CRIT', 'WAR_ASSAULT_ODDS', 'WAR_GAMBLE_ODDS', 'WAR_HOLD_GAMBLE', 'WAR_SORTIE_ODDS', 'WAR_DEF_RESPOND_ODDS', 'WAR_SURR_FOODD', 'WAR_SURR_ODDS', 'WAR_DEF_HYST']);
same('P5-SURR_X', '항복 승산 곳간<2일 배수', '5-19', 'sim/war-core.js', /WAR_SURR_ODDS\s*\*\s*([\d.]+)/);
same('P5-WAR_ENGAGE_R', '교전 거리', '5-5', 'server/war-live.js', NV('WAR_ENGAGE_R'));
same('P5-WAR_ALERT_R', '경보 거리 = 교전×3.6', '5-6', 'server/war-live.js', /WAR_ALERT_R\s*=\s*WAR_ENGAGE_R\s*\*\s*([\d.]+)/);
same('P5-WAR_DEF_STANDOFF', '방어 포진 거리 = 교전×0.9', '5-7', 'server/war-live.js', /WAR_DEF_STANDOFF\s*=\s*WAR_ENGAGE_R\s*\*\s*([\d.]+)/);
same('P5-WAR_SCRAM_STANDOFF', '긴급 소집 포진 거리', '5-8', 'server/villages.js', NV('WAR_SCRAM_STANDOFF'));
for (const k of ['SCATTER', 'RALLY_OFF', 'ARRIVE_R', 'ARR_TGT_R', 'DEF_ADVANCE', 'DEF_ADVANCE_MAX', 'NPC_SAMPLE', 'FORM_R', 'SEP_STR'])
  same(`P5-MU.${k}`, `대형 MU.${k}`, '5-32', 'server/war-live.js', new RegExp('(?<![\\w])' + k + ':\\s*([\\d.]+)'));

// ── 다름 줄(전수표 "다름" 가운데 두 글자에서 값을 뽑을 수 있는 것) ──
const diff = (id, what, ref, labRe, srvFile, srvRe, knob) => DIFFS.push({ id, what, ref, lab: [B, labRe], srv: [srvFile, srvRe], knob });
diff('D1-TERR_START_CAP', '처음 영토 자르기(영토 v2 켬)', '1-31', /maxCells:(MAX_CELLS)/, 'server/villages.js', /T1238_TERR_V2 \? \{ maxCells: VillageLayout\.(TERR_CORE)/, 'T1238_TERR_V2 끔 기본 · 묶음 T1334_BUNDLE');
diff('D1-FERTW', '처음 영토 모양 — 비옥 가중 fertW', '1-20', /const fertW=opts\.fertW!=null\?opts\.fertW:([\d.]+)/, 'server/village-layout.js', /const fertW = opts\.fertW != null \? opts\.fertW : ([\d.]+)/);
diff('D1-FARM_HOUSE_RES', '논 존닝 집 예약 numHousesEst×', '1-26', /numHousesEst\s*\*\s*(\d+)/, 'server/village-layout.js', /numHousesEst\s*\*\s*(\d+)/);
diff('D1-WATER_D', '처음 물 접근 식(물거리 나눔수)', '1-36', /1\.25-d\/(\d+)/, 'server/village-layout.js', /1 - nd \/ (\d+)/);
diff('D1-TERR_GROW_DAY', '하루 영토 넓히기 상한', '1-46', /arguments\[1\]:(\d+)\);/, 'server/villages.js', /TERR_GROW_MAX_PER_DAY = (\d+);/);
diff('D3-HUNT_BAND0', '사냥터 띠 안쪽(회관에서)', '3-37', NV('MOB_AV0'), 'server/villages.js', /HUNT_BAND0 = (\d+)/);
diff('D3-HUNT_BAND1', '사냥터 띠 바깥', '3-37', NV('MOB_WILD_R'), 'server/villages.js', /HUNT_BAND1 = (\d+)/);
diff('D3-STONE_FLOOR', '돌 부존 바닥', '3-23', /L_STONE_FLOOR\s*=\s*([\d.]+)/, 'server/livelihood.js', /stone: ([\d.]+),\s*\/\/ 돌은 흔하다/);
diff('D3-STONE_GAIN', '돌 부존 기울기', '3-23', /L_STONE_GAIN\s*=\s*([\d.]+)/, 'server/livelihood.js', /stone: ([\d.]+),\s*\/\/ 바위비율/);
diff('D5-SLOT_GAP', '대형 옆 간격(m)', '5-29', /SLOT_GAP:\s*([\d.]+)/, 'server/war-live.js', /SLOT_GAP:\s*([\d.]+)/);
diff('D5-SLOT_DEPTH', '대형 앞뒤 간격(m)', '5-29', /SLOT_DEPTH:\s*([\d.]+)/, 'server/war-live.js', /SLOT_DEPTH:\s*([\d.]+)/);
diff('D5-FOLLOW_SNAP', '대형 슬롯 붙음 문턱', '5-30', /FOLLOW_SNAP:\s*([\d.]+)/, 'server/war-live.js', /FOLLOW_SNAP:\s*([\d.]+)/);
diff('D5-SEP_R', '대형 몸 떼기 반경', '5-30', /(?<![\w])SEP_R:\s*([\d.]+)/, 'server/war-live.js', /(?<![\w])SEP_R:\s*([\d.]+)/);
diff('D5-MARCH_JITTER', '행군 흔들림', '5-30', /MARCH_JITTER:\s*([\d.]+)/, 'server/war-live.js', /MARCH_JITTER:\s*([\d.]+)/);
diff('D5-WALL_GMUL', '방패벽 옆 간격 배수', '5-33', /form==='wall'\)\{ wSpear=8; wBack=8; gMul=([\d.]+)/, 'server/war-live.js', /form === 'wall'\) \{ wSpear = 8; wBack = 8; gMul = ([\d.]+)/);
diff('D5-SIEGE_RING_PAD', '포위 링 덧칸(랩 +15 · 서버 0)', '5-9', /WAR_SIEGE_R\s*=\s*WAR_DEF_STANDOFF\s*\+\s*WAR_ENGAGE_R\s*\+\s*(\d+)/, 'server/villages.js', /function _warCampBackCells\(\) \{ const WL = state\.warLive; return (WL\.WAR_ENGAGE_R \+ WL\.WAR_DEF_STANDOFF); \}/);


function norm(v) { if (v == null) return null; const s = String(v).replace(/\s+/g, ''); return /^-?\d+(\.\d+)?$/.test(s) ? String(+s) : s; }
function grab(src, re) { if (src == null) return { v: null, n: 0 }; const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); const all = [...src.matchAll(g)]; return { v: all.length ? norm(all[0][1]) : null, n: all.length }; }
// 파일 이름 끝 `#body` = 랩 HTML 의 **손 몸**(econ 번들 인라인 `<!-- ENGINE-BUNDLE-END -->` 뒤) — 번들 안의 서버 글자를 랩 글자로 잘못 읽지 않게.
const readRoot = (f) => {
  const [rel, part] = f.split('#');
  let s; try { s = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; }
  if (part === 'body') { const i = s.indexOf('<!-- ENGINE-BUNDLE-END -->'); return i < 0 ? null : s.slice(i); }
  return s;
};

// srcOf(파일) → 글자(하네스는 비튼 글자를 준다). 돌려주는 것 = 줄마다 { id, what, lab, srv, ok, why }
function checkSame(srcOf = readRoot, list = SAME) {
  const cache = new Map(); const S = (f) => { if (!cache.has(f)) cache.set(f, srcOf(f)); return cache.get(f); };
  return list.map((p) => {
    const a = grab(S(p.lab[0]), p.lab[1]), b = grab(S(p.srv[0]), p.srv[1]);
    let why = '';
    if (a.v == null) why = `랩 글자 못 찾음(${p.lab[0]} ${p.lab[1]})`;
    else if (b.v == null) why = `서버 글자 못 찾음(${p.srv[0]} ${p.srv[1]})`;
    else if (a.v !== b.v) why = `랩 ${a.v} ≠ 서버 ${b.v}`;
    return { id: p.id, what: p.what, lab: a.v, srv: b.v, ok: !why, why };
  });
}
function checkDiffs(srcOf = readRoot, list = DIFFS) {
  const cache = new Map(); const S = (f) => { if (!cache.has(f)) cache.set(f, srcOf(f)); return cache.get(f); };
  return list.map((p) => {
    const a = grab(S(p.lab[0]), p.lab[1]), b = grab(S(p.srv[0]), p.srv[1]);
    const found = a.v != null && b.v != null;
    return { id: p.id, what: p.what, lab: a.v, srv: b.v, found, same: found && a.v === b.v, knob: p.knob || '' };
  });
}
function okList(text) {
  const t = text == null ? readRoot('scripts/lab-diff-ok.txt') : text; const m = new Map();
  for (const l of String(t || '').split('\n')) { if (!l.trim() || l.startsWith('#')) continue; const c = l.split('|').map((x) => x.trim()); if (c[0]) m.set(c[0], { why: c[1] || '', jb: c[2] || '' }); }
  return m;
}

module.exports = { SAME, DIFFS, checkSame, checkDiffs, okList, grab, norm, readRoot, WAR, VIL };
