#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T571 점검 자용 **재현 대용** · 라이브 DB 사본 위 · 제품 무변 · 디렉터리 = 환경변수 T568_DIR)
# === scripts/t571-live-cost.py — T568 개울 미리보기의 "높이 대용"을 다시 굽는다(PM 원 식은 레포에 없다) ======================
#   ★왜: `t568-streams.py` 는 `acc.u32`(+ T571 점검 자는 `down.i32`)를, `t568-flow.js` 는 `cost.f32` 를 읽는데,
#     그 높이 대용(물까지 거리 + 산 기슭 오름 + 잔물결)을 굽는 식이 T568 커밋에 안 들어왔다(`t568-live-map.py` 는 kind·terr·road 만 쓴다).
#   ★그래서 같은 세 항으로 다시 짓고, 계수는 **PM 이 카드(T571)에 적은 숫자에 맞췄다** — 집수 1,500 에서
#     뭍의 0.9~1.1% · 물까지 거리 중앙값 75 → 25~28 · 물에서 100셀 넘는 뭍 37% → 2~3% · 끊긴 조각 34.
#     이 판: 0.99% · 75.4 → 26.4 · 37.4% → 2.59% · 끊긴 조각 36(T571 보고 §④). 게임 값이 아니다(점검 자를 라이브 사본에 대 보는 고정물).
#   식: cost = Dw + 0.5·max(0, 60 − Dr) + 4·잔물결(16셀 격자 값 노이즈 · 시드 568)
#     Dw = 물(바다 띠·민물) 까지 유클리드 거리(= PM 의 Dw.npy — 중앙값 75.4 · 100 넘는 뭍 37.4% 로 PM 수와 같다) · Dr = 바위(산)까지 유클리드 거리
#   출력: kind.u8 · cost.f32 · Dw.npy → 다음: node scripts/t568-flow.js NX NY kind.u8 cost.f32 acc.u32 down.i32 → python3 scripts/t568-streams.py 1500
import os
import numpy as np
from scipy import ndimage
D = os.environ.get('T568_DIR', '/tmp/out/live')
kind = np.load(f'{D}/kind.npy'); NY, NX = kind.shape
water = (kind == 2) | (kind == 3); rock = kind == 4
Dw = ndimage.distance_transform_edt(~water)
Dr = ndimage.distance_transform_edt(~rock)
rng = np.random.default_rng(568); sc = 16
g = rng.random((NY // sc + 2, NX // sc + 2))
rip = ndimage.zoom(g, (sc, sc), order=1)[:NY, :NX] * 2 - 1
cost = Dw + 0.5 * np.maximum(0, 60 - Dr) + 4 * rip
kind.astype(np.uint8).tofile(f'{D}/kind.u8')
cost.astype(np.float32).tofile(f'{D}/cost.f32')
np.save(f'{D}/Dw.npy', Dw.astype(np.float32))
print('ok', NX, NY, '— 다음: node scripts/t568-flow.js', NX, NY, f'{D}/kind.u8 {D}/cost.f32 {D}/acc.u32 {D}/down.i32')
