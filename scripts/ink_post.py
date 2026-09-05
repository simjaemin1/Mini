#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ink_post — 캐릭터 시트 **후처리** 둘: 먹선 1px · 셀 셰이딩 N단.  [T96]

★씬 값은 한 톨도 안 건드린다(Cycles·조명·카메라·재질·형상 무변). 여기서 하는 일은
  **다 구운 시트의 화소를 고치는 것**뿐이라, 되돌림이 스위치 하나다(`INK_PX=0`·`CEL_BANDS=0`).

★시트 화소 공간 = PNG 8bit ÷ 255 (선형). 실측으로 확인했다:
  `bpy` 이미지에 0.0·0.1·0.5·0.78·1.0 을 넣고 저장하면 PNG 가 0·26·128·199·255 로 나온다
  — 감마가 안 끼어 있다. 그래서 아래 상수는 **그냥 sRGB 8bit ÷ 255** 로 적는다.

★`char_render.py` 의 `edge_darken`(EDGE_K 0.78)과의 관계: 그건 테두리 RGB 를 **곱해서** 낮췄다
  (색이 화소마다 다르다 = 선이 아니라 그늘). 이 모듈의 `ink_outline` 은 같은 자리를 **한 색**으로
  덮는다 — 그래서 비로소 '선'이다. 둘은 배타적이다(`char_render` 가 하나만 부른다).

★계약 둘은 그대로 물려받는다(`test-charsheet ④` 가 지킨다):
  ⓐ **반투명(안티에일리어싱) 화소 무접촉** — 거기를 어둡게 하면 그게 검은 프린지다.
  ⓑ **1겹** — 읽기용 사본을 먼저 뜬다. 제자리로 고치면 방금 먹인 화소가 다음 화소의 이웃 판정에
     끼어들어 선이 안쪽으로 번진다.
"""

# ── 먹색 [T96 §0-ⓐ 실측에서 유도 · 눈대중 아님] ──────────────────────────────
#   `public/assets/char/body_walk.png` 실측: 실루엣 안 휘도 1% = 39.3 · 중앙 102.5 · 99% 180.1.
#   선이 몸에 묻히지 않으려면 몸의 바닥보다 확실히 아래여야 한다 ⇒ **1% 의 절반**(19.7)을 잡는다.
#   색비는 시트가 이미 가진 가장 어두운 테두리 색 (34,31,27) = 1 : 0.91 : 0.79 (따뜻한 흑갈).
#   ⇒ 휘도 19.7 · 그 비율 → (21, 19, 17). 순검정(0,0,0)이 아니다 — 검정은 화면에서 **구멍**이 된다.
INK_RGB = (21 / 255.0, 19 / 255.0, 17 / 255.0)

# ── 먹이 닿아도 되는 알파 문턱 [실측이 정했다 · 눈대중 아님] ──────────────────
#   ⚠1차는 `char_render.py` 의 `EDGE_A`(0.60 = 153/255)를 그대로 썼다가 **`test-charsheet ④` 를
#     빨갛게 만들었다**(반투명 화소 중 검은 것 0.0% → **23.0%**). 한 변수씩 갈라 보면 범인이 명확하다:
#       raw 0.0% · 옛 edge_darken 0.0% · **셀만 0.0%** · **먹선만 23.0%**
#     `edge_darken` 은 RGB 를 0.78 **곱했으니** 합이 90 밑으로 안 내려갔고, 먹선은 **덮으니** 내려간다.
#   ⇒ 문턱은 ④ 가 이미 쓰는 숫자에서 가져온다(족보 74): ④ 는 `a < 200` 을 **반투명**으로 친다.
#     그러니 먹은 `a >= 200` 에만 닿는다 — 그래야 이 모듈이 적어 둔 "반투명 무접촉"이 참말이 된다.
#   ★셀은 `EDGE_A` 로 둔다: 밝기를 **비율로** 옮길 뿐이라 검은 화소를 안 만든다(위 실측 0.0%).
#     문턱을 올리면 테두리 한 겹이 계단을 안 타 옆 화소와 어긋난다.
INK_A = 200 / 255.0

# ── 셀 단수의 밝기 범위 — **시트 제 것을 쓴다** [T96 §0-ⓑ 실측이 시켰다] ────────
#   ⓐ 처음엔 범위를 한 번 재서 못박았다(몸 시트의 1~99% = 39.3~180.1). 그러면 층·클립이
#     같은 계단을 쓰니 '한 사람'이 된다고 봤다. **그런데 그게 재질을 지운다.**
#     실측: 옷 여섯의 평균 휘도 15쌍 중 문턱(14.7 · T81 이 통과시킨 최소 간격) 미만이
#     원본 2쌍 → 고정범위 3단에서도 2쌍이지만, 갖옷↔가죽의 **색거리가 11.7 → 3.5 로 무너졌다**
#     (둘은 색이 거의 같고 밝기로만 갈리는 짝이라, 공통 계단이 그 밝기 차를 통째로 삼킨다).
#   ⓑ 고치는 자리는 계단 수가 아니라 **범위**다. 셀 셰이딩이 계단 지어야 하는 것은
#     '재질의 밝기'가 아니라 '그 재질에 진 그늘'이다 ⇒ 범위를 **시트 제 실루엣의 1~99%** 로 잡는다.
#     재질의 평균은 그대로 남고 그늘만 계단이 된다.
#   ⓒ 그래도 층·클립이 안 흔들리는가? 쟀다 — 같은 층의 다섯 클립에서 1% 는 0.1 이내,
#     99% 는 최대 4 이내로 같다(`clothes_fur` 43.6~43.7 / 118.4~122.5). 계단이 거의 안 움직인다.
CEL_P_LO = 0.01
CEL_P_HI = 0.99

_LUMA = (0.2126, 0.7152, 0.0722)


def _luma(r, g, b):
    return _LUMA[0] * r + _LUMA[1] * g + _LUMA[2] * b


def cel_range(sheet, w, h, athr):
    """이 시트 실루엣 안 휘도의 1%~99%. 정렬이라 결정적이다."""
    L = [ _luma(sheet[i * 4], sheet[i * 4 + 1], sheet[i * 4 + 2])
          for i in range(w * h) if sheet[i * 4 + 3] >= athr ]
    if len(L) < 8:
        return None
    L.sort()
    lo = L[int(len(L) * CEL_P_LO)]
    hi = L[min(len(L) - 1, int(len(L) * CEL_P_HI))]
    return (lo, hi) if hi - lo > 1e-4 else None


def cel_quantize(sheet, w, h, bands, athr, mask=None):
    """실루엣 안 화소의 **밝기만** bands 단으로 계단 짓는다(색조 유지 · 알파 무접촉).

       ★색조를 지키는 법: 휘도만 목표값으로 옮기고 RGB 를 그 비율로 곱한다.
         (RGB 를 각각 양자화하면 색이 튄다 — 살빛이 자주색으로 돈다.)
       ★반투명 화소는 안 건드린다(먹선과 같은 계약 · 프린지 금지).
       ★구간은 **이 시트의** [1%, 99%] 를 bands 등분하고 값은 각 칸의 한가운데.
         범위 밖은 가장자리 칸으로 잘린다(가장 어두운 그늘·가장 밝은 하이라이트가 안 사라진다)."""
    if not bands or bands < 2:
        return sheet
    rng = cel_range(sheet, w, h, athr)
    if rng is None:
        return sheet
    lo, hi = rng
    a = mask if mask is not None else None
    span = (hi - lo) / bands
    levels = [lo + span * (k + 0.5) for k in range(bands)]
    for i in range(w * h):
        if sheet[i * 4 + 3] < athr:
            continue
        if a is not None and a[i] < athr:
            continue
        o = i * 4
        r, g, b = sheet[o], sheet[o + 1], sheet[o + 2]
        L = _luma(r, g, b)
        if L <= 1e-6:
            continue
        k = int((L - lo) / span)
        if k < 0:
            k = 0
        elif k >= bands:
            k = bands - 1
        s = levels[k] / L
        sheet[o] = r * s
        sheet[o + 1] = g * s
        sheet[o + 2] = b * s
    return sheet


def ink_outline(sheet, w, h, athr=INK_A, mask=None, rgb=INK_RGB):
    """실루엣 안쪽 **한 겹**을 먹색으로 덮는다.

       mask 를 주면 그 알파를 실루엣으로 삼는다 — 몸·옷은 **합집합**을 준다.
       안 그러면 살↔옷 경계에 없는 선이 하나 더 생긴다(겹선).
       도구·등짐은 제 실루엣을 쓴다(손에 든 것은 손과 갈려 보여야 한다)."""
    a = mask if mask is not None else [sheet[i * 4 + 3] for i in range(w * h)]
    hits = []
    for y in range(h):
        base = y * w
        for x in range(w):
            i = base + x
            if a[i] < athr or sheet[i * 4 + 3] < athr:
                continue
            if (x == 0 or a[i - 1] < athr or x == w - 1 or a[i + 1] < athr
                    or y == 0 or a[i - w] < athr or y == h - 1 or a[i + w] < athr):
                hits.append(i)
    for i in hits:
        o = i * 4
        sheet[o], sheet[o + 1], sheet[o + 2] = rgb
    return sheet

# ═══════════════ [T107] 굽기와 후처리를 가른다 ═══════════════
#
# ★왜 [카드 T107 ②] T96 이 남긴 회부: 8bit raw 에 후처리를 다시 걸면 양자화 칸 경계가 반올림에
#   옮겨 가 배포 PNG 와 **바이트가 다르다**(실측 화소 14,255곳 · 최대 채널차 160). 그래서 먹선·셀
#   세기를 한 칸 바꾸려면 1시간 27분을 다시 구워야 했다.
#   ⇒ 굽기가 **후처리 전 float 시트**를 EXR 로 한 번 남기고, 여기서 그걸 읽어 같은 함수를 태우면
#     굽기 없이 배포 PNG 와 **바이트가 같은** 결과가 나온다. 그게 아래 `post_all` 이 한 자리에 있는 이유다:
#     굽기와 되굽기가 **같은 코드**를 부르지 않으면 '같은 바이트'는 우연이 된다.

def edge_darken(sheet, w, h, k, athr, mask=None):
    """실루엣 안쪽 한 겹의 RGB 를 k 배로 낮춘다 — 옛 자체 아웃라인(`T96_INK=0` 되돌림 경로).
       ★[T107] `char_render.py` 에서 **여기로 옮겼다** — 되굽기(`ink_repost.py`)도 같은 함수를
         타야 '바이트 동일'이 우연이 아니게 된다. `char_render` 는 이 이름을 그대로 부른다."""
    if k >= 0.999:
        return sheet
    a = mask if mask is not None else [sheet[i * 4 + 3] for i in range(w * h)]
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if a[i] < athr or sheet[i * 4 + 3] < athr:
                continue
            edge = (x == 0 or a[i - 1] < athr or x == w - 1 or a[i + 1] < athr
                    or y == 0 or a[i - w] < athr or y == h - 1 or a[i + w] < athr)
            if edge:
                o = i * 4
                sheet[o] *= k; sheet[o + 1] *= k; sheet[o + 2] *= k
    return sheet


def post_all(built, w, h, *, silhouette, partner_of, alpha_of, ink_px, cel_bands, edge_a, edge_k):
    """한 클립의 층 전부에 후처리를 건다 — **굽기와 되굽기가 같이 부르는 자리**.

       built      : [(층이름, sheet), ...]  (제자리 수정)
       silhouette : 합집합 실루엣을 쓰는 층 이름 집합(몸·옷)
       partner_of : 층이름 → 짝 층이름 (몸의 짝은 기본 한 벌 · 옷의 짝은 몸)
       alpha_of   : 층이름 → 알파 리스트를 내는 함수(없으면 None — 짝이 이 판에 없다는 뜻)
       ★순서가 규약이다: **셀 먼저, 먹선 나중.** 반대로 하면 방금 그은 먹선이 양자화에 끌려
         올라가 선이 흐려지고, 먹색이 휘도 분포에 섞여 칸 경계까지 움직인다."""
    if not (ink_px or cel_bands >= 2 or edge_k < 0.999):
        return
    for lname, sheet in built:
        if cel_bands >= 2:
            cel_quantize(sheet, w, h, cel_bands, edge_a, mask=None)
        if lname in silhouette:
            uni = list(alpha_of(lname))
            other = alpha_of(partner_of.get(lname))
            if other:
                for i in range(w * h):
                    if other[i] > uni[i]:
                        uni[i] = other[i]
            mask = uni
        else:
            # 도구·등짐은 **제 실루엣**이다 — 손에 든 것이 손과 갈려 보여야 한다.
            mask = None
        if ink_px:
            ink_outline(sheet, w, h, INK_A, mask=mask)
        elif edge_k < 0.999:
            edge_darken(sheet, w, h, edge_k, edge_a, mask=mask)


# ── float 시트 입출력 (bpy 는 **부를 때** 들여온다 — 이 모듈은 Blender 없이도 import 된다) ──
def load_exr(path):
    """EXR(float32 · 무손실 ZIP) → (sheet, w, h). 굽기가 남긴 **후처리 전** 값 그대로."""
    import bpy
    img = bpy.data.images.load(path)
    w, h = img.size
    sheet = list(img.pixels[:])
    bpy.data.images.remove(img)
    return sheet, w, h


def save_png(sheet, w, h, path):
    """`char_render.save_sheet` 와 **같은 경로**로 PNG 를 쓴다 — 인코더가 같아야 바이트가 같다."""
    import bpy
    img = bpy.data.images.new("sheet", width=w, height=h, alpha=True)
    img.pixels = sheet
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def save_exr(sheet, w, h, path):
    """후처리 **전** float 시트를 EXR 로 남긴다(float32 · ZIP = 무손실).
       ★half(16bit)로 줄이면 용량이 절반이지만 **바이트 동일을 보장 못 한다**:
         8bit 한 칸이 1/255 = 0.0039 인데 half 의 1.0 근처 간격이 0.001 이라 네 배밖에 안 곱다 —
         반올림 경계에 걸린 값 하나면 갈린다. 증명이 목적이므로 float32 를 쓴다."""
    import bpy
    img = bpy.data.images.new("raw", width=w, height=h, alpha=True, float_buffer=True)
    img.pixels = sheet
    st = bpy.context.scene.render.image_settings
    keep = (st.file_format, st.color_mode, getattr(st, "color_depth", None), getattr(st, "exr_codec", None))
    st.file_format = 'OPEN_EXR'; st.color_mode = 'RGBA'
    st.color_depth = '32'; st.exr_codec = 'ZIP'
    img.save_render(path)
    st.file_format, st.color_mode = keep[0], keep[1]
    if keep[2] is not None:
        st.color_depth = keep[2]
    if keep[3] is not None:
        st.exr_codec = keep[3]
    bpy.data.images.remove(img)
