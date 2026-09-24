# BGM R&D-04 — 전체 국립국악원 원본 재발견과 대금 V4

## R&D-03의 source inventory 정정

R&D-03은 `Mini` 안의 `bk_*` 백업만 보고 실제 녹음 재료를 셌다. 그 백업에는
대금·가야금·향피리·단소·거문고·장구 6계열만 들어 있었지만, 사용자의 Downloads에
원본 corpus가 따로 있었다. 정본 source root는 개인 경로를 코드에 박지 않고 아래처럼
명시적으로 전달한다.

```text
$GUGAK_MONOTONE_ROOT/monotone, monotone-2, ..., monotone-48
```

- 악기 collection **48개**, 실제 audio **352개**, 약 **3.90 GiB**
  (WAV 340 / MP3 12; 44.1·48·96 kHz, 실제 녹음).
- 같은 family가 두 collection인 경우를 합치면 최소 45 family이고, 아직 추출하지
  않은 대피리 archive까지 포함하면 최소 46 family다.
- `monotone-49`~`56`에는 별도의 추임새 vocal 165개가 있다.
- `Mini` backup과 Downloads audio가 byte-identical이라고 단정하지 않는다. 일부는
  같은 악기/주법의 별 판본·인코딩·절편이다. 이후의 source authority는
  **Downloads의 direct WAVE collection**으로 둔다.

따라서 이전의 “로컬에 6종뿐”은 `Mini import`에 대해서만 맞았고, 사용자의 실제
보유 corpus에 대한 답으로는 틀렸다.

## V4가 고친 것

R&D-03 candidate는 복원 mini-bank의 70·72·74·77을 섞어 썼다. 특히 77은 source
MIDI 약 75.16에서 목표 77로 **+184 cents**를 옮겨야 했다. 이는 대금의 배음·청공
질감을 손상시킬 수 있다.

V4는 direct `monotone-6/sanjo_deageum_scale_chung_34.wav` 한 take의 사람 감식
interval을 사용한다. FLAC 감식본의 시간표는 direct WAVE와 길이/무음 구조가 달라
그대로 쓰지 않는다.

| 목표 MIDI | direct WAVE usable interval | 측정 MIDI | 정적 보정 |
|---:|---:|---:|---:|
| 70 | 27.780–31.380 s | 69.97 | +3c |
| 72 | 42.630–46.435 s | 72.35 | −35c |
| 74 | 49.835–53.600 s | 74.97 | −97c |
| 77 | 56.765–61.000 s | 76.82 | +18c |

9마디 반복 77의 re-attack만 별도 direct raw
`sanjo_deageum_stacatto_60.wav` 10.740–11.035초를 쓴다. 이때도 “같은 호흡의
쌍둥이 녹음”이라고 주장하지 않고, **recorded tongue onset proxy**로 provenance에
남긴다.

새 renderer:

```sh
PYTHONPATH=public/assets/audio/bgm /path/to/python \
  public/assets/audio/bgm/render_village_day_ari_native_pitch_audition.py \
  --raw-daegeum-dir "$GUGAK_MONOTONE_ROOT/monotone-6" \
  --output-dir /tmp/village-day-ari-native-pitch
```

출력은 R&D-03과 똑같이 세 가지다.

| 파일 | 역할 |
|---|---|
| `01_all_sustain_heads.wav` | 모든 음의 full head — 너무 끊기는 대조군 |
| `02_all_steady_crossfades.wav` | 쉼 뒤만 head, 나머지 steady — 너무 붙는 대조군 |
| `03_score_articulated_native_pitch.wav` | 새 숨=head, 재발음=실제 tongue+body, 명시 slur=steady crossfade |

직접 raw 대금의 자연 breath는 첫 30ms가 조용하고 70–120ms에 안정적으로 올라온다.
그래서 V4 gate는 이를 hard attack으로 고치지 않는다. click은 계속 2.5ms de-click
gate로 막되, breath 유효성은 70–120ms RMS로 검사한다.

## 여전히 해결하지 않은 것

V4는 **더 적은 pitch shift와 같은 session의 timbre**를 확보했을 뿐이다.
`77 → 74 → 72`를 한 호흡으로 운지한 raw triple은 현재 direct 대금 9개에서 발견하지
못했다. 따라서 그 경계는 아직 score가 명시한 steady-body crossfade다.

그러므로 V4도 확정·제품 승격·`bgm.js` 교체가 아니다. R&D-03과 마찬가지로 수동
performance annotation이며 기존 browser runtime의 시간 기반 legato 로직과 parity를
주장하지 않는다.

## 진짜로 다듬는 다음 순서

1. 48 collection을 무작정 sample bank로 넣지 않는다. direct WAVE마다 악기·주법·음역·
   onset/head/body/native-transition 여부를 담은 **읽기 전용 source catalog**를 먼저 만든다.
2. 대금부터 target 음역의 breath / tongue / stable body / 실제 two-note, three-note
   transition을 사람이 label한다. `77→74→72`가 없다는 사실도 label의 결과여야 한다.
3. V4와 같은 native-pitch retrieval을 기본으로 하고, 없는 transition만 expression
   curve + residual renderer 후보로 분리한다. generic text-to-music 또는 무표기
   crossfade를 정답으로 취급하지 않는다.
4. 충분한 paired transition 데이터와 ABX 청취 결과가 쌓인 뒤에만 대금 전용
   DDSP/NSF 계열 offline renderer를 학습한다. 결과는 실시간 조립 대신 loop-locked
   stem으로 구워서 게임에 넣는다.

사람 청취 때에는 V3 candidate와 V4 candidate를 먼저 비교한다. V4가 source tone에는
나아도 slur가 여전히 인공적으로 들리면, 다음 카드는 “더 많은 crossfade tuning”이
아니라 해당 음쌍의 실제 transition 녹음/획득이다.
