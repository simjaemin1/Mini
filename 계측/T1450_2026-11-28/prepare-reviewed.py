#!/usr/bin/env python3
"""Render the partially reviewed T1450 inventory. Never launches a world."""
import csv, gzip, hashlib, json, subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent.parent
BASE = '0e2ae3916acdb7380b7eb615a0f3c85d2b41f61d'
assert subprocess.run(['git', 'diff', '--quiet', BASE, '--', 'sim/economy-sim.js', 'sim/economy-sim-v2.js', 'sim/war-core.js', 'server/villages.js'], cwd=ROOT).returncode == 0
CANDIDATES = json.loads(gzip.decompress((OUT/'decision-candidates.json.gz').read_bytes()))['rows']
PROV = json.loads(gzip.decompress((OUT/'line-provenance.json.gz').read_bytes()))
assert PROV['base'] == BASE
origins=json.loads((OUT/'name-origin-candidates.json').read_text()) if (OUT/'name-origin-candidates.json').exists() else None
if origins:
    assert origins['base']==BASE and not origins['shallow'] and not origins['missing']
ROWS = []
with (OUT/'named-policy-queue.tsv').open('w') as f:
    w=csv.writer(f,delimiter='\t'); w.writerow(['file','line','scope','kind','name','source'])
    for x in CANDIDATES:
        if x['namedPolicy'] and x['kind'] in ('constant','policy-map-entry','derived-bound-return'):
            w.writerow([x[k] for k in ('file','line','scope','kind','name')]+[x['source'].replace('\n',' ')])
E, V, W, S = 'sim/economy-sim.js', 'sim/economy-sim-v2.js', 'sim/war-core.js', 'server/villages.js'

def add(name, file, category, meaning, removal, state='기본 경로', note='', owner='GPT 1'):
    hits = [x for x in CANDIDATES if x['file'] == file and x['name'] == name and x['kind'] in ('constant', 'policy-map-entry', 'numeric-variable')]
    assert len(hits) == 1, (file, name, len(hits))
    x = hits[0]
    lines = (ROOT/file).read_text().splitlines()
    line = x['line']
    blame = PROV['files'][file][line-1]
    assert blame[0] == line
    ROWS.append(dict(id=('E' if file==E else 'V' if file==V else 'W' if file==W else 'S')+'.'+name,
        file=file, line=line, endLine=x['endLine'], name=name, expression=x['source'],
        sourceSha256=x['sourceSha256'], classification=category, meaning=meaning,
        proposedLift=removal, state=state, owner=owner, note=note,
        declarationLine=lines[line-1],
        lineAttribution=dict(commit=blame[1], dateUTC=blame[2], meaning='현행 줄의 귀속. 숫자 최초 도입 증거가 아님'),
        review='선언과 아래 의미를 읽음. 전 사용처·하네스·최초 도입 추적은 미완',
        measuredCurrentWorld=False, liftImplemented=False, experiment=None))
    if origins and file+'#'+name.split('.')[0] in origins['found']:
        ROWS[-1]['namedDeclarationFirstSeen']=origins['found'][file+'#'+name.split('.')[0]]
        ROWS[-1]['numberOriginStatus']='이 파일·이 이름의 첫 추가 줄. 이전 익명 숫자·다른 파일·비축 지도 개별 품목의 최초 수치는 별도 추적 필요.'

# Card seeds: weapons are listed but their lift experiments belong to S3.
for name, meaning in [
    ('MELEE_ARMORY_PC','식량이 넉넉한 마을의 근접 무기 비축을 인구×0.72로 정한다'),
    ('MELEE_ARMORY_SECF','식량 안전 계수가 0.45를 넘는 마을만 큰 병기고 목표를 쓴다'),
    ('MELEE_COV_BUFFER','전사 근접 무기 필요량에 1.2배 여유를 둔다'),
    ('BRONZE_ARMORY_FRAC','병기고 중 청동으로 채울 수 있는 몫을 0.45로 정한다'),
    ('BRONZE_TIN_MIN_PC','청동 생산 자격을 가르는 인당 주석 재고 문턱'),
    ('BRONZE_TIN_MIN_ABS','청동 생산 자격을 가르는 주석 재고 절대 하한'),
    ('IRON_WEAPON_MIN_PC','철 무기 생산 자격을 가르는 인당 철 재고 문턱'),
    ('IRON_WEAPON_MIN_ABS','철 무기 생산 자격을 가르는 철 재고 절대 하한'),
    ('WEAPON_RITE_KEEP','봉헌 전에 전사 수에 더해 남기는 무기 수'),
]:
    add(name,E,'ⓑ',meaning,'S3 T1449 소관이므로 이 카드 걷기 실험에서 제외',note='옛 생존 실측이라는 주석이 현재 세계에서의 재검증을 뜻하지 않음',owner='S3 T1449')

for name, meaning, removal, note in [
    ('LEATHER_GOODS_TARGET','가죽 생활품 생산을 사람당 0.8개에서 멈춘다','생산 _lgGap의 목표만 ∞. _lgCov의 정규화 분모 0.8은 유지','같은 상수를 생산 상한과 충족률 분모가 함께 읽음. 상수 전체 치환 금지'),
    ('RAMIE_BOOT_PC','소비 기록이 없는 모시도 사람당 0.1개까지 비축한다','부트스트랩 바닥만 0. 소비 EMA×30 흐름 목표는 유지','초기 재봉 수요가 영원히 생기지 않는지 관찰'),
    ('TAN_TRADE_PC','교역용 무두질 전환을 하루 사람당 0.06으로 제한한다','전환량의 인구 비례 상한만 ∞. 재료 여분·식량 문 유지','물리 일손 한계인지 정책 배분 한계인지 현재 일손 모델과 추가 대조 필요'),
    ('TAN_HIDE_MIN','가죽 제품·무두질에 쓰기 전에 생가죽 사람당 3장을 남긴다','두 변환의 여분 계산에서 보존 바닥만 0','갑옷 투입·수출 자본을 대신 지킨다는 주석. 물리로 분류하지 않음'),
    ('RAMIE_MIN_POP','가죽 생활품 생산을 인구 40명부터 허용한다','성숙 인구 문만 제거. 원재료·마모·수율은 유지','모시 이름이지만 가죽 생활품 블록도 이 문을 공유함'),
    ('CLOTH_TARGET_PC','재봉 노동을 사람당 옷 1.2벌 목표로 배치한다','목표의 여벌 부분을 걷을지 생산 중단 상한을 걷을지 사용처별 정의 미결','v2 CAP_TARGET의 N×1.2와 연결됨. 일괄 ∞는 노동 목표도 ∞로 만듦'),
    ('RITE_KEEP_PC','봉헌 전에 귀한 재료를 사람당 0.15개 남긴다','_avail 보존 바닥만 0. 봉헌 소모율·식량 여유 문 유지','물리 소모율 RITE_PC와 분리'),
    ('ORE_STOCK_PC','원석이 사람당 0.5보다 적으면 옛 피커가 광부를 고른다','이 광부 우선 충원 문만 제거','합리적 피커와 옛 피커의 실제 호출 범위를 구분. 미호출을 실험 없이 죽은 수로 확정하지 않음'),
    ('SMELT_LABOR_CAP_PC','제련 노동 목표를 인구 5% 안에 묶는다','smelterTarget 반환의 인구 비례 상한만 제거. 필요량·재료·가치 판정 유지','SMELT_CAP 환경값도 기록. 필요량 자체에 수기 30날·최소 1명이 남음'),
    ('EXPAND_PAYBACK_DAYS','확장 편익이 365날 안에 비용을 회수해야 한다','편익·비용 비교 ⓐ와 수기 회수기한 ⓑ를 분리. 양의 편익 전제에서 기한 조건을 우회','0×∞ NaN 방지. 가치 비교가 있다는 이유로 365를 물리로 분류하지 않음'),
    ('PRESTIGE_MOD_CAP','위신이 인구 증가에 더하는 몫을 0.25에서 자른다','위신 항의 Math.min 상한만 제거','위신 자체·기본 출생률은 유지'),
    ('PROD_STAT_CAP','지난 생산 성과의 생산 보너스를 15%에서 자른다','생산 성과 항의 Math.min 상한만 제거','생산 수율 원표와 분리'),
    ('POP_MAX_DELTA_PCT','출생·사망 및 이주 속도에 하루 인구 6% 한계를 둔다','출생 변화·이주·T1205 파생 계수 사용처를 별도 행으로 나눈 뒤 각각 해제','상수 전체 치환 금지. T1205 K2도 이 수에서 파생됨'),
    ('POP_MAX','마을 인구를 1000명에서 막고 이주 목적지도 거른다','출생 상한과 목적지 상한을 별도 행으로 나눈 뒤 각각 제거','계산량 방어 주석은 물리 근거가 아님. 시간 초과는 안 끝남으로 기록'),
    ('HOUSE_BUFFER','집 수용 목표를 인구의 1.15배로 둔다','목표 사용처를 나눈 뒤 상한만 제거. 목재·석재·시공 노동은 유지','houseDayBuild·실제 집 증축·v2 목표의 별도 사용처 확인 필요'),
    ('HOUSE_BUILD_MAX','하루 집 증축을 인구의 6% 노동량으로 제한한다','하루 인구 비례 건축 한도만 제거. 결손·재료 한도는 유지','실제 크루 행위가 켜진 경로는 별도 실제 세계 확인 필요'),
    ('EXPAND_CELLS_PER_DAY','금고로 영토를 하루 네 칸까지만 산다','루프 횟수 상한 제거. 매 칸 편익·비용·재료 검사는 유지','자연 종료를 검증. 루프 운영 감시 시간을 세계 규칙 상수로 넣지 않음'),
    ('TOOL_GLUT_X','도구가 사용자 대비 2.5배 쌓이면 생산을 줄인다','도구 과잉 감산 항만 우회. 도구 마모·원재료는 유지','이와 별개인 masonTarget·craftLaborTarget 목표가 남음'),
    ('TOOL_GLUT_RAMP','도구 과잉 감산을 한 배 폭에 걸쳐 올린다','TOOL_GLUT_X 행과 동일한 항. 독립 해제의 의미를 먼저 분리','같은 식을 두 번 걷었다고 중복 실험 수를 세지 않음'),
    ('JOB_SWITCH_COOLDOWN','한 사람의 자율 전직·촌장 지정을 30날 간격으로 막는다','자율 전환의 개인 간격만 제거. 수동 지정 정책은 별도 검토','하루 전직 인원 제한과 다른 문. 징발·포로·자리 제약 유지'),
    ('STONE_NET_STOCK','도구가 무너지지 않도록 돌 0.2를 남기는 안전망을 둔다','돌 바닥 보호 사용처별 해제. 원재료 존재·지질 조건은 유지','STONE_NET 기본 켬. 수출도 정본을 읽음. 이 절대량과 인당 목표를 혼동하지 않음'),
]: add(name,E,'ⓑ',meaning,removal,note=note)

add('COPPER_DERIV_DAYS',E,'ⓑ','구리 파생수요를 대장장이 30날 조업 재고로 환산한다',
    '이미 꺼진 COPPER_DERIV 경로는 해제 실험 제외',state='COPPER_DERIV=1에서만; 기본 끔',note='사용처의 catchup 분모까지 0·∞로 바꾸지 않음')

for name, meaning, removal, note in [
    ('WAR_FOOD_CRISIS','식량 18날 미만인 마을에 교역 약탈 명분을 허용한다','공격 명분의 식량 부족 경계만 제거하는 실험 뜻을 분리','상대 45날 부유 경계와 결합. 식량 소모율 아님'),
    ('WAR_FOOD_RICH','식량 45날로 약탈 상대·위신전·조공 거절의 여유를 가른다','세 사용처를 나눠 각각 해제','1354·1356·1289줄을 같은 수 전체 치환으로 섞지 않음'),
    ('WAR_RANGE','개전 상대 후보를 중심 거리 520 안에서만 고른다','상대 선택 거리 문만 ∞. 실제 행군 거리·군량·길은 유지','행군 속도 WAR_MARCH와 다름. 실제 서버 길 범위도 대조 필요'),
    ('WAR_LEVY','기본 원정 전력 계산에서 비전사 인원의 35%를 민병으로 본다','원정 계획 주입 여부와 기본 계산 사용처를 가른 뒤 정의','NPC의 새 _warNpcMobPlan과 옛 기본 전력 추정이 다름'),
    ('WAR_MAX_ARMY','옛 군대 최대 60이라는 선언·수출을 남긴다','실사용 참조를 전수 확인한 뒤 해제','현행 war-core 내부는 선언·export만 검색됨. 외부 참조·랩 사본 대조 전 가) 죽은 수 확정 금지'),
    ('WAR_ENGAGE_MAX','원정 동원·교전 편성을 최대 44명으로 자른다','동원 한도와 전투 편성 한도를 나눈 뒤 해제','battle-core 편성 규격의 물리·계산량 제약 여부는 추가 대조. 실제 인구·군량 존재 문과 분리'),
    ('WAR_HOME_KEEP_FRAC','원정 뒤 자유 성인의 25%를 집에 남긴다','maxByHome에서 성인 잔류 몫만 0. 다른 잔류·군량 조건 유지','전사 절반 잔류와 max로 결합'),
    ('WAR_HOME_KEEP_WAR','원정 뒤 전사 절반을 집에 남긴다','maxByHome에서 전사 잔류 몫만 0. 다른 조건 유지','성인 25% 잔류와 별도 해제'),
    ('WAR_SUPPLY_DIST_K','행군 날마다 0.06을 더한 분모로 동원 인원을 줄인다','거리당 추가 동원 감산만 0. 실제 왕복 군량은 유지','maxByFood의 실제 식량 제약과 별도'),
    ('WAR_MOB_ODDS_MIN','승산 0.42 기준으로 원정·축소 습격을 가른다','기본·0.9배·0.8배 문을 나눠 해제 정의','실제 전투 승리율 계산과 출정 판단 문턱은 다름'),
    ('WAR_UTIL_TH','최선 원정 기대효용이 1.5를 넘어야 출정한다','기대효용 비교의 수기 양의 문턱만 0. 기대효용 계산 유지','원정 이익·사상 위험을 계산한다는 것과 문턱 1.5의 출처를 구분'),
]: add(name,W,'ⓑ',meaning,removal,note=note)
add('WAR_RATION',W,'ⓓ','군대 한 사람이 하루 식량 환산 한 단위를 먹는다','물리 소모율. 해제 실험 없음',note='실제 왕복 군량 cap과 장부 적재가 읽는다')
for name in ('_warBRONZE_TIN_MIN_PC','_warBRONZE_TIN_MIN_ABS'):
    add(name,W,'ⓑ','전쟁 편성의 청동 자격에 econ과 같은 주석 재고 문턱을 따로 둔다',
        'S3 T1449 소관. 중복 선언 표에 두고 걷기 실험 제외',owner='S3 T1449',
        note='econ BRONZE_TIN_MIN_PC=0.95·ABS=13과 별도 이름의 사본. 한쪽만 걷고 전부 걷었다고 할 수 없음')

for x in [x for x in CANDIDATES if x['file']==E and x['kind']=='policy-map-entry' and x['name'].startswith('RESERVE_PC.')]:
    resource=x['name'].split('.',1)[1]
    add(x['name'],E,'ⓑ',f'{resource} 기본 비축량을 인구에 곱한다',
        '비축 목표의 이 품목 바닥만 0. 소비 흐름·재료·값 비교 유지',
        note='RESERVE_PC[id] || 0.1 대체값도 고려해야 완전 해제. 식량 30날은 T1419 46줄 표를 인용하고 재계수하지 않음',
        owner='S3 T1449' if resource in ('weapon','armor') else 'GPT 1')

for name, meaning, removal, owner in [
    ('TIN_EXPORT_KEEP_PC','주석을 사람당 1.2개 남긴 뒤 수출한다','수출 후보의 보존 바닥만 0','S3 T1449'),
    ('TIN_EXPORT_SURPLUS_PC','주석 수출 후보에 사람당 0.3 여분을 요구한다','수출 여분 문턱만 0','S3 T1449'),
    ('WEAPON_RETURN_GLUT_MULT','귀환 재고가 목표 1.3배를 넘으면 물건을 안 싣는다','무기 사용처는 S3 제외. 일반재 사용처의 상한만 우회','공동: 무기 S3 / 일반재 GPT 1'),
    ('VARIETY_TARGET_PC','스스로 생산 못 하는 식품군을 사람당 0.6개 수입한다','수입 바닥만 0. 실제 소비 흐름은 유지','GPT 1'),
    ('LUX_TARGET_PC','사치재에 사람당 0.08개 보유 수요를 부여한다','인구 비례 사치 비축 항만 0. 실제 소비 흐름·상대값 유지','GPT 1'),
    ('CRISIS_TRADE_PC','적자 마을의 동원 허용량을 최소 ceil(인구×0.015)까지 늘린다','위기 가산 몫만 0. 기존 여유 노동 기반 허용량·기회비용 문은 유지','GPT 1'),
    ('PRICE_ADJ_MIN','그림자가격의 조정배수 하한을 0.01로 자른다','수치 안정성·실제 값 문 영향 대조 후 정의','GPT 1'),
    ('PRICE_ADJ_MAX','그림자가격의 조정배수 상한을 1000으로 자른다','상한 제거 때 0재고·비유한 값 처리부터 정의','GPT 1'),
]: add(name,V,'ⓑ',meaning,removal,owner=owner,note='v1과 v2가 같은 품목에 같은 목표를 쓰는지 별도 교차표 필요')

for name, meaning, removal in [
    ('TERR_GROW_MAX_PER_DAY','몸 세계의 영토 획득을 하루 60칸으로 막는다','실제 서버 확장 문에서 일일 상한만 제거'),
    ('G_MAX','곳간 수를 8로 제한한다','건설 후보의 개수 제한만 제거. 자리·재료·일손 유지'),
]: add(name,S,'ⓑ',meaning,removal,state='서버 생활층; 랩 800날에서 호출되지 않는 경로',note='랩 무변화를 가) 죽은 수로 판정하지 않는다. 서버에서 실제 문을 지난 검증 필요')

add('G_STOCK_CAP',S,'ⓓ','곳간 한 동의 물리 저장 수용 칸을 60으로 둔다','물리 공간 수용. 해제 실험 제외',state='서버 생활층',note='18952줄에서 저장 가능한 곳간을 고름. 곳간 최대 개수 G_MAX와 분리')
add('G_CAP',S,'ⓓ','곳간 한 동의 식량 수용을 2500으로 환산한다','물리 수용으로 분류. 개수 상한 G_MAX와 분리',state='서버 생활층',note='20156줄에서 식량량을 건물 수요로 환산. 랩 사본과 대조 필요')

for name, meaning in [
    ('CLOTH_WEAR_PC','하루 사람당 옷 0.004벌이 닳는다'),
    ('HERB_DAILY_PC','하루 사람당 약재 0.01을 소비한다'),
    ('SALT_DAILY_PC','하루 사람당 소금 0.01을 소비한다'),
    ('FIREWOOD_PC','하루 사람당 땔감 0.085를 소비한다'),
    ('HOUSE_WOOD','집 수용 한 사람분에 목재 1.5를 쓴다'),
    ('HOUSE_STONE','집 수용 한 사람분에 석재 2.5를 쓴다'),
    ('HOUSE_DECAY','집이 하루 0.0015 비율로 낡는다'),
]: add(name,E,'ⓓ',meaning,'물리로 분류. 해제 실험 없음',note='물리량의 수치 타당성을 이 카드가 새로 채택하는 것은 아님')

GATES = []
def gate(id, file, scope, line, kind, category, meaning, removal, note=''):
    hits=[x for x in CANDIDATES if (x['file'],x['scope'],x['line'],x['kind'])==(file,scope,line,kind)]
    assert len(hits)==1, (id,len(hits))
    x=hits[0]; p=PROV['files'][file][line-1]
    GATES.append(dict(id=id,file=file,line=line,scope=scope,expression=x['source'],
        sourceSha256=x['sourceSha256'],classification=category,meaning=meaning,proposedLift=removal,note=note,
        lineAttribution=dict(commit=p[1],dateUTC=p[2]),liftImplemented=False,experiment=None))

gate('house.food-slack',E,'houseDayBuild',2258,'numeric-variable','ⓑ',
    '집 증축 노동을 식량 40/25날 경계로 1/0.5/0.15배로 나눈다',
    '식량 여유 배수만 1. 결손·재료·크루 제약은 유지',
    '40/25의 두 경계를 한 여유 노동 함수로 분류. T1437·T1452 대체 경로는 기본 끔이며 별도 행으로 대조 중')
gate('house.daily-bound',E,'houseDayBuild',2261,'clamp','ⓑ',
    '집 결손과 인구 비례 일일 증축 한도 중 작은 쪽만 짓는다',
    '일일 한도만 ∞. 유한 집 결손은 유지','HOUSE_BUILD_MAX의 사용처. 선언 행과 문 수를 중복하지 않음')
gate('craft.buffer',E,'craftLaborTarget',6670,'numeric-variable','ⓑ',
    '별도 버퍼를 안 주면 사용자 수의 1.15배를 장인 비축 목표로 둔다',
    '각 호출 품목에서 재고 목표와 보충 흐름을 분리한 후 정의','옷은 1.2처럼 호출자가 덮어쓴다. 기본값만 바꾸고 모두 걷었다고 할 수 없음')
gate('craft.catchup',E,'craftLaborTarget',6671,'numeric-variable','ⓑ',
    '부족 재고를 기본 50날에 채울 장인 수로 환산한다',
    '재고 따라잡기 항을 0으로 걷고 마모 보충 흐름만 남기는 후보',
    '목표를 무한대로 올리는 실험과 뜻이 다름. 실제 호출자의 60날 등도 별도 기록')
gate('craft.output-floor',E,'craftLaborTarget',6676,'clamp','ⓑ',
    '노동 필요량의 산출 분모를 최소 0.05로 간주한다',
    '0 산출에서 나눗셈을 정의한 뒤 실험 의미 확정','계산 안정화 의도라도 실제 충원량을 바꾸므로 물리 수율로 숨기지 않음')
gate('craft.one-worker',E,'craftLaborTarget',6678,'numeric-return','ⓑ',
    '목표 재고가 모자라면 계산 필요량이 작아도 장인을 최소 한 명 둔다',
    '최소 한 명만 제거. Math.round(need)·마모 보충은 유지')
gate('mason.village-floor',E,'masonTarget',6718,'numeric-return','ⓑ',
    '도구 사용자 네 명 이상인 마을에 석공 한 명을 보장한다',
    '도구 사용자 수에 따른 한 명 바닥만 제거. 기존 base 계산 유지')
gate('expand.entry',E,'tryExpandTerritory',4263,'if','ⓑ',
    '인구가 식량 자리의 85%에 차기 전에는 금고 영토 확장을 안 한다',
    '85% 진입 문만 우회. 매 칸 비용·편익·재료 검사는 유지')
gate('expand.frequency',E,'tryExpandTerritory',4268,'symbolic-loop','ⓑ',
    '금고 영토 구매를 하루 EXPAND_CELLS_PER_DAY번만 검사한다',
    '반복 횟수만 해제. 유한 재료·불리한 수익에서 종료 검증','숫자 리터럴이 없는 반복 조건도 수집해야 포착됨')
gate('expand.payback',E,'tryExpandTerritory',4285,'if','ⓐ+ⓑ',
    '일일 한계 편익×365날이 확장 비용을 넘는지 견준다',
    'ⓐ 값 견줌과 ⓑ 회수기한을 분리해 실험','고정 정적 환산값과 T1426의 동적 값 경로도 구분')
gate('expand.materials',E,'tryExpandTerritory',4289,'if','ⓒ',
    '그 칸의 식량·목재·석재가 금고에 있는지 확인한다',
    '재료 존재 문은 유지. 걷기 대상 아님','부족하면 _treasuryTopUp의 별도 구매 문으로 간다')
gate('mine.famine-six',E,'pickDeficitJob_rational',7470,'if','ⓑ',
    '농사가 안 되는 마을도 먹을 것이 6날 넘을 때만 기근 블록에서 광부를 고른다',
    '기본 경로의 6날 문만 우회. 광맥·자리·농사 불가 조건 유지',
    'T1437·T1452를 켠 대체 경로는 별도 기록. 식량 30날 T1419 전수와 구분')
gate('mine.famine-eighteen',E,'pickDeficitJob_rational',7477,'if','ⓑ',
    '풍부한 광맥도 먹을 것 18날 초과·광부 4% 미만일 때만 기근 중 광부를 고른다',
    '18날 경계와 4% 노동 몫을 별도 해제 행으로 분할 예정',
    '둘을 동시에 걷은 결과를 각 수의 단독 효과로 보고하지 않음')
gate('territory.population-cap',S,'_terrCap',7733,'derived-bound-return','ⓑ',
    '인구가 요구하는 집 수×600+1500칸을 NPC 영토 천장으로 둔다',
    '천장 비교만 우회. 땅 소유·물리 자리·구매 비용·노동은 유지',
    '6명 집 정원과 단층은 물리 정본. 토지 할당 600/1500과 분리. 랩 미호출을 죽은 문으로 판정하지 않음')
gate('territory.player-exception',S,'_terrCapBound',7740,'if','ⓒ',
    '촌장이 세운 마을은 NPC 인구 기반 영토 천장 대상에서 뺀다',
    '촌장 예외 유지. 걷기 대상 아님','유효 객체 검사도 같은 조기 반환문에 있으므로 정책 예외와 기술 검사를 최종 표에서 구분')
gate('price.holding-buffer',V,'_targetV2',914,'numeric-variable','ⓑ',
    '결정 가격의 사치재 보유 목표만 인구×0.08로 더하고 일반재 기본 버퍼는 0으로 둔다',
    '사치재 보유 항만 0. 실제 소비·파생수요·재료 사용은 유지',
    'LUX_TARGET_PC의 사용처. 정산 경로의 일반재 버퍼와 같다고 가정하지 않음')
gate('settlement.holding-buffer',V,'_priceParamsV2',1170,'numeric-variable','ⓑ',
    'T726 끔 정산은 사치재 외 일반재에도 인구×효용가중치×1.2 보유 목표를 둔다',
    '정산의 일반재 보유 항만 0. 사치재·소비·파생수요는 유지',
    '결정 경로에서 이미 0인 버퍼와 다름. T726 켬은 다른 함수로 우회. 출발 직후·부패 사본도 추가 대조')

# Render only evidence already read. No completion totals or grades are invented.
result=dict(status='진행 중: 씨앗 선언 부분 검토. 전수·사용처 분할·초기 출처·실험 미완',
    base=BASE, worldsLaunched=0, productFilesChanged=0,
    provenanceCaution='커밋·날은 현행 줄 귀속. 숫자 최초 도입·현재 세계에서의 측정 근거는 별도 추적 중.', rows=ROWS, gates=GATES)
(OUT/'reviewed-policy-rows.json').write_text(json.dumps(result,ensure_ascii=False,indent=1)+'\n')
lines=['# 손으로 적은 목표·상한 조사 — T1450 (진행 중)', '',
    '> 전수 완료 보고가 아니다. T1411 장기 판이 먼저이며, 현재는 읽기만 하는 준비 조사다. 제품 변경·걷기 손잡이·실험 세계는 0.', '',
    f'조사 바탕: `origin/main@{BASE[:9]}`. T1411의 고정 베이스와 분리했다. 숫자의 현행 줄 귀속은 아래에 적었지만, 최초 도입과 지금 세계의 생존 측정 증명은 아직 추적 중이다.', '',
    '## 읽은 선언의 부분 목록', '',
    'ⓐ 값 견줌 · ⓑ 손 수 · ⓒ 재료·손만 · ⓓ 물리. 같은 상수라도 사용처의 역할이 다르면 최종 표에서 별도 행으로 나눈다. 아래 선언 행 수를 문 수로 보고하지 않는다.', '',
    '| 행 | 줄 | 분류 | 무엇을 정하나 | 현행 식 | 현행 줄 귀속(UTC) | 현재 경로 | 걷을 자리·주의 |',
    '|---|---|---|---|---|---|---|---|']
for r in ROWS:
    p=r['lineAttribution']; expr=r['expression'].replace('\n',' ')
    if len(expr)>130: expr=expr[:127]+'…'
    cells=[r['id'],f"`{r['file']}:{r['line']}`",r['classification'],r['meaning'],f'`{expr}`',f"`{p['commit'][:9]}` {p['dateUTC']}",r['state'],f"{r['proposedLift']} / {r['owner']}. {r['note']}"]
    lines.append('| '+' | '.join(c.replace('|','\\|') for c in cells)+' |')
lines+=['','## 이름 없는 사용처의 부분 검토','','선언과 중복되는 사용처가 있다. 아래 역시 최종 문 총계가 아니다.','',
    '| 행 | 사용처 | 분류 | 무엇을 정하나 | 걷는 뜻·범위 |','|---|---|---|---|---|']
for r in GATES:
    p=r['lineAttribution']
    cells=[r['id'],f"`{r['file']}:{r['line']}` `{r['scope']}` / `{p['commit'][:9]}` {p['dateUTC']}",r['classification'],r['meaning'],r['proposedLift']+' / '+r['note']]
    lines.append('| '+' | '.join(c.replace('|','\\|') for c in cells)+' |')
cross=json.loads((OUT/'recipe-crosswalk-draft.json').read_text())
assert len(cross['rows'])==83
lines+=['','## T718 원래 83줄의 현재 대조 — 부분 검토','',
    '플레이어 직접 제작 진입 50줄은 읽었고, 비용 C·쓰임 V의 직접 생산 손익 문이 없다. 사람이 고른 레시피의 재료 개수·도구·시설·수율·대기열 검사다. 이를 NPC 값 문 누락 50건으로 해석하지 않는다. 전이 호출 전수와 NPC 자동 경로를 대신 검증한 것도 아니다. 경제층 28줄·혼합/미검토 서버 4줄·랩 1줄은 아직 판정 중이다.','',
    '| T718 ID | 레시피 | 현재 읽은 경로 | 비용 C / 쓰임 V 직접 문 | 판정 범위 |','|---|---|---|---|---|']
for r in cross['rows']:
    checked=r['currentStatus']=='manual-entry-reviewed'
    source=' · '.join(f"`{s['name']}:{s['line']}`" for s in r['currentSource']) or '미검토'
    cells=[r['id'],r['recipe'],source,'없음 / 없음(플레이어 수동 선택)' if checked else '미검토',r.get('reviewNote','현재 경로·손잡이·비용과 쓰임을 대조 중')]
    lines.append('| '+' | '.join(c.replace('|','\\|') for c in cells)+' |')
lines+=['', '## 이름 없는 문·공유 사용처: 확인한 범위', '',
    '- `houseDayBuild`(econ:2254–2261): 집 결손과 인구×증축률의 최소값. 식량 40/25날로 여유 노동을 1/0.5/0.15배 한다. T1437·T1452는 대체 읽기 손잡이이며 원래 40/25 경로를 별도로 기록한다.',
    '- `craftLaborTarget`(econ:6668–6680): 버퍼 1.15, 따라잡기 50날, 산출 분모 최소 0.05, 목표 미달 최소 한 명. 물리 마모와 수기 충원 기간을 같은 행으로 묶지 않는다.',
    '- `toolDesiredStock`·`masonTarget`(econ:6688–6726): 도구 의존 인원×1.15, 결손 50날 보충, 도구 사용자 4명 이상이면 석공 한 명. 병기고 관련 사용처는 S3로 남긴다.',
    '- `tryExpandTerritory`(econ:4259–4295): 식량 자리 85% 진입 문, 하루 네 번, 365날 편익/비용, 실제 금고 재료 문을 각각 구분한다. 비용을 읽는다는 이유로 365날을 ⓐ로 숨기지 않는다.',
    '- `_terrCap`(villages:7731–7737): 기본 `T579_CAP_HOUSE=2`에서 `ceil(pop/(HOUSE_CAP_PER_FLOOR*HOUSE_MAX_FLOORS))*TERR_PER_LOT+TERR_CORE`. 수 6·1·600·1500은 네 조사 파일 밖 `server/village-layout.js:25,36,46` 정본을 읽는다. 숫자 리터럴만 찾으면 이 문을 놓친다. 플레이어 촌장 마을은 `_terrCapBound`가 예외로 둔다.',
    '- `_lgGap`와 `_lgCov`(econ:6003,6027)는 같은 0.8을 각각 생산 목표와 충족률 분모로 읽는다. 전체 상수의 ∞ 치환은 허용하지 않는다.',
    '- `POP_MAX_DELTA_PCT`는 변화 제한·이탈 제한·T1205 K2 세 고리를 공유한다. 최종 해제 행은 사용처별로 쪼갠다.',
    '- v2 `_targetCtxV2`(861–866)는 도구 최소 1·사용자 수, 무기 최소 2·전사×1.2, 옷 최소 2·인구×1.2를 따로 갖는다. v1 옷 목표와 같은 수라도 현재는 자동 공유되지 않는다.', '',
    '## 실험 전에 남은 검토', '',
    '- AST 후보는 전부 `unreviewed`이며 기술적 경계·캐시·초기값도 섞였다. `decision-candidates.json.gz`의 수를 정책 전수 수로 내지 않는다.',
    '- 이름 없는 분기·루프·함수 반환, 새 인당 상수, 수동 촌장 입력 경로, 네 파일 바깥 정본·랩 인라인 세 사본·하네스 핀을 대조한다.',
    '- T1419의 식량 30날 46줄은 그 보고의 표를 인용한다. 이 조사에서 다시 세지 않는다.',
    '- T718 원본 레시피 83줄 가운데 플레이어 직접 진입 50줄을 읽었다. 남은 33줄의 비용 C·쓰임 V를 판정하기 전에는 전체 완료 수를 쓰지 않는다. 수동 제작과 직업 간접 가치 비교를 분리한다.',
    '- 사용처 해제 정의·초기 출처·현재 손잡이 경로를 확정한 후에 `T1450_LIFT`를 구현한다. 이미 끔·물리·S3 무기는 해제에서 제외한다.',
    '- 서버 전용 문을 랩이 부르지 않았다는 이유로 가) 죽은 수로 판정하지 않는다. 실제 문을 지난 증거 없이는 미검증이다.',
    '- 실제 라이브 환경변수는 이 조사에서 읽지 않았다. 기본값이나 배포 문서를 라이브 실측으로 쓰지 않는다.', '',
    '이름 첫 선언도 Git에서 추적했다(`name-origin-candidates.json`). 0.72는 `120158ca3`(UTC 2026-07-10)의 시드19 교역 생존 하한이라는 주석을 찾았지만, 현행 밭·몸·달력에서의 생존 하한으로 재검증한 것은 아니다. 돌 0.2는 T180의 2026-09-12 이름 붙이기보다 먼저 존재했다는 소스 설명이 있어, 이름 첫 추가를 숫자 최초 도입으로 보고하지 않는다. 비축 지도 개별 품목도 지도 이름의 최초 선언과 구분한다.', '',
    '경제층 직접 문과 ⓪~⑤의 부분 대조 메모는 `계측/T1450_2026-11-28/economic-reading-notes.md`다. 배합 score의 순위와 손해 생산 차단을 구분한다.', '',
    '재현 자료: `계측/T1450_2026-11-28/README.md`. 모든 초안은 조사 시점 소스에만 대응하며 착수 때 main 변화를 다시 대조한다.', '']
(ROOT/'설계/조사_손으로적은목표_T1450.md').write_text('\n'.join(lines))
print(json.dumps(dict(status='partial-review-only',declarations=len(ROWS),worldsLaunched=0,productFilesChanged=0)))
