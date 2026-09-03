#!/usr/bin/env python3
# === scripts/build-crops.py — 한국작물 카탈로그(xlsx) → server/crops.json ===========
#
# ★[재민 확정 2026-08-31] 작물 층의 원천은 재민이 작성한 `~/Mini/한국작물_카탈로그.xlsx` 다.
#   34종 × 18필드(성장일·수확량·관리난이도·물요구·병충해취약·저장성·파종철·생존/건강/기호/위세).
#
# ★★**월드 데이터는 빌드 스크립트 경유**(캐논 · 손편집 금지). 이 스크립트가 유일한 통로다.
#   xlsx 를 손으로 옮겨 적으면 그게 사본이고, 재민이 표를 고쳐도 게임은 모른다.
#
# ★★**이 스크립트는 전사(轉寫)만 한다 — 파생은 `server/crops.js` 가 한다.**
#   보관일·성장 ms·포만감·수확 배율 같은 건 여기서 계산하지 않는다. 그걸 여기서 하면
#   "게임 규칙이 빌드 산출물에 굳어" 손잡이를 못 돌린다(env 로 못 연다).
#   여기서 하는 일: 한글 열 이름 → 안정된 키 · 작물 → 안정된 아이디 · 숫자 정규화. 그뿐이다.
#
# 실행:  python3 scripts/build-crops.py [xlsx경로]
#        기본 경로 ~/Mini/한국작물_카탈로그.xlsx · 컨테이너에선 스테이징 경로도 자동 탐색

import json, os, sys, unicodedata

CANDIDATES = [
    os.path.expanduser('~/Mini/한국작물_카탈로그.xlsx'),
    '/mnt/user-data/uploads/Mini/한국작물_카탈로그.xlsx',
    os.path.join(os.path.dirname(__file__), '..', '한국작물_카탈로그.xlsx'),
]

# ── 작물 → 안정된 아이디 ────────────────────────────────────────────────────
#   ★12종은 `server/specialty.js` 에 **이미 있다** — 그 키를 그대로 쓴다(무게가 거기서 온다).
#     새 키를 만들면 같은 쌀이 두 개가 된다.
#   ★나머지 22종만 새 아이디를 준다. 로마자는 통용 표기를 따랐다.
ID = {
    # specialty 에 이미 있는 것 — 키를 물려받는다(무게 정본이 그쪽이다)
    '쌀(벼)': 'rice', '보리': 'barley', '밀': 'wheat', '기장': 'millet', '수수': 'sorghum',
    '메밀': 'buckwheat', '콩(대두)': 'soybean', '마(참마)': 'yam', '배추': 'cabbage',
    '마늘': 'garlic', '생강': 'ginger', '차(茶)': 'tea',
    # specialty 에 없는 것 — 새 아이디
    '조': 'foxtail_millet', '율무': 'adlay', '피': 'barnyard_millet', '팥': 'azuki',
    '녹두': 'mungbean', '참깨': 'sesame', '들깨': 'perilla', '토란': 'taro',
    '무': 'radish', '오이': 'cucumber', '가지': 'eggplant', '상추': 'lettuce',
    '아욱': 'curled_mallow', '순무': 'turnip', '부추': 'chive', '미나리': 'water_dropwort',
    '대파': 'scallion', '참외': 'korean_melon', '박': 'gourd',
    '삼(대마)': 'hemp_plant', '뽕(잎)': 'mulberry_leaf', '쪽': 'indigo_plant',
}

COL = {
    '작물': 'ko', '분류': 'group', '재배지': 'field', '재배유형': 'lifecycle',
    '파종철': 'sowSeasons', '파종월': 'sowMonths', '성장일(활동)': 'growDays',
    '수확량(1-10)': 'yield', '관리난이도(1-5)': 'care', '물요구(1-5)': 'water',
    '병충해취약(1-5)': 'pest', '저장성(1-5)': 'keep',
    '생존': 'subsistence', '건강': 'health', '기호': 'taste', '위세': 'prestige',
    '총효용': 'utility', '비고': 'note',
    # ★★[T59 2026-09-03 재민 확정] **식량의 단위는 열량이다.** 이 열 하나가 포만감 표를 대체한다 —
    #   `crops.js` 가 `kcalOf(id)` 로 내주고 `server/kcal.js` 가 kg × kcal/kg 로 포만감을 유도한다.
    #   ⇒ 작물의 포만감을 손으로 적는 자리는 이제 **없다**(옛 "생존 × 1.4" 는 베리 시절 앵커였다).
    '열량(kcal/kg)': 'kcal',
}
NUM = {'growDays', 'yield', 'care', 'water', 'pest', 'keep', 'subsistence', 'health', 'taste', 'prestige', 'utility', 'kcal'}

# 파종철 한글 → econ `seasonOf` 가 쓰는 키. **새 계절 이름을 만들지 않는다.**
SEASON = {'봄': 'spring', '여름': 'summer', '가을': 'autumn', '겨울': 'winter'}


def find_src(argv):
    if len(argv) > 1:
        return argv[1]
    for p in CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit('카탈로그 xlsx 를 못 찾았다. 경로를 인자로 줘라.')


def main():
    try:
        import openpyxl
    except ImportError:
        raise SystemExit('openpyxl 필요:  pip install openpyxl --break-system-packages')
    src = find_src(sys.argv)
    wb = openpyxl.load_workbook(src, data_only=True)
    ws = wb['작물 카탈로그']
    rows = list(ws.iter_rows(values_only=True))
    head = [unicodedata.normalize('NFC', str(c)).strip() if c else '' for c in rows[0]]

    unknown_cols = [h for h in head if h and h not in COL]
    if unknown_cols:
        # ★조용히 버리지 않는다 — 재민이 열을 늘리면 여기서 말한다.
        print(f'  ⚠ 모르는 열 {unknown_cols} — COL 에 추가하고 crops.js 에서 쓸지 정해라')

    crops, missing_id, seen = {}, [], set()
    for r in rows[1:]:
        if not r or not r[0]:
            continue
        ko = unicodedata.normalize('NFC', str(r[0])).strip()
        cid = ID.get(ko)
        if not cid:
            missing_id.append(ko)
            continue
        if cid in seen:
            raise SystemExit(f'아이디 충돌: {cid} ({ko})')
        seen.add(cid)
        rec = {'id': cid}
        for h, v in zip(head, r):
            key = COL.get(h)
            if not key or v is None:
                continue
            if key in NUM:
                rec[key] = float(v) if isinstance(v, float) and not v.is_integer() else int(v)
            else:
                rec[key] = unicodedata.normalize('NFC', str(v)).strip()
        # 파종철 → 계절 키 배열(전사일 뿐 — 판정은 crops.js 가 한다)
        raw = rec.pop('sowSeasons', '') or ''
        seasons = []
        for tok in raw.replace('(', '·').replace(')', '').split('·'):
            t = tok.strip()
            for ko_s, en in SEASON.items():
                if t.startswith(ko_s) and en not in seasons:
                    seasons.append(en)
        rec['sow'] = seasons
        rec['winterCrop'] = (rec.get('lifecycle') == '월동')
        crops[cid] = rec

    if missing_id:
        raise SystemExit(f'ID 표에 없는 작물: {missing_id} — 스크립트 ID 에 추가해라(조용히 버리지 않는다)')

    out = {
        '_source': os.path.basename(src),
        '_note': '생성물 — 손으로 고치지 마라. 원천은 재민의 xlsx, 통로는 scripts/build-crops.py.',
        '_axes': {k: v for k, v in COL.items()},
        'crops': crops,
    }
    dst = os.path.join(os.path.dirname(__file__), '..', 'server', 'crops.json')
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')

    # 요약 — 굽고 나서 눈으로 한 번 본다
    bysow = {}
    for c in crops.values():
        for s in c['sow']:
            bysow.setdefault(s, []).append(c['ko'])
    print(f'  ✓ {len(crops)}종 → server/crops.json  (원천 {os.path.basename(src)})')
    for s in ['spring', 'summer', 'autumn', 'winter']:
        n = bysow.get(s, [])
        print(f'    {s:7} 파종 {len(n):2}종  {" ".join(n[:10])}{" …" if len(n) > 10 else ""}')
    wc = [c['ko'] for c in crops.values() if c['winterCrop']]
    print(f'    월동 {len(wc)}종: {" ".join(wc)}')


if __name__ == '__main__':
    main()
