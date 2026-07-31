# 두랑고 BGM — 실제 산조가야금 판

## 무엇이 들어 있나
12곡 × (.ogg + .m4a). 사파리는 ogg 를 못 열기 때문에 m4a 가 반드시 함께 있어야 한다.

    village_day_trad / village_day_amb / village_day_ari
    village_night_trad / village_night_amb / village_night_ari
    battle_trad / battle_amb / battle_ari
    journey_trad / journey_amb / journey_ari

`_ari` 는 아리랑 선율이 들어간 판이다.

## 가야금 소리의 출처
국립국악원 **산조가야금** 실제 녹음(공공누리 제1유형).
원본 21파일 → 조각 262개(주법 8종 × 세기 3층 × 12현).
12곡에서 가야금 음 1574개가 쓰였고 합성음으로 대체된 것은 0개.

주법: 지속음 · 얕은 농현 · 깊은 농현 · 꺾는 농현 · 추성 · 퇴김 · 굴림 · 글리산도.
농현은 사인파로 흉내내지 않는다 — 연주자가 실제로 흔든 녹음을 그대로 쓴다.

### 게임에 반드시 표기할 것
    국악기 음원 제공 — 국립국악원 (공공누리 제1유형)

## 조(調)를 왜 바꿨나
산조가야금 12현은 `G2 C3 D3 G3 A3 C4 D4 E4 G4 A4 C5 D5` — C 평조다.
곡이 다른 조로 쓰여 있으면 다섯 음 중 셋이 줄에 없어 매번 음을 늘려 써야 하고,
현악기는 음을 늘리면 통 울림까지 같이 늘어나 다른 악기 소리가 된다.
그래서 평조 곡은 으뜸음 G, 계면조 곡은 으뜸음 A 로 옮겼다(그때 12현과 정확히 일치한다).
결과: 음정 이동 최대 2.32반음 → 0.52반음(평균율 보정분뿐).

## 아직 합성음인 악기
거문고 · 대금 · 단소 · 피리 · 장구 · 징 · 꽹과리 · 박.
전투 계열 두 곡(battle_trad, battle_amb)은 가야금 편성이 아니라 전부 합성음이다.

## 다시 만들려면
    python3 sampler.py scan samples_gaya   # 음원 색인
    python3 check_use.py samples_gaya      # 어떤 녹음이 쓰였는지 확인
    python3 render_samples.py samples_gaya # 12곡 렌더 → out_samples/
