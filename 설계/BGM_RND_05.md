# BGM R&D-05 — 대금 V4의 음량 splice 수리

## 왜 V4가 여전히 어색했는가

V4의 문제는 마스터 볼륨이나 clipping이 아니었다. 공통 post-mix gain은 `1.0`, peak는
약 `0.294`였다. 문제는 **실제 녹음 조각을 어떻게 만났는가**였다.

| 경계 | V4에서 측정된 현상 | 원인 |
|---|---|---|
| b09_e1: 77 재발음 | 직전 약 `-17.5 dB`에서 경계 직후 `-44.2 dB`, overlap 중 약 8 dB 골 | 별도 tongue/steady body가 반대 위상으로 equal-power overlap 됨 |
| b10_e0: 77→77 slur | `-18.2 → -16.8 → -20.0 dB` bump | 같은 음인데 새 77 body를 다시 겹침 |
| b10_e1: 77→74 | 안정 전 `0.1283 RMS`, 안정 후 `0.1031 RMS` (약 `-1.9 dB`) | source-wide RMS 보정은 실제 splice 시점의 envelope를 보장하지 않음 |

즉 “모든 sample을 같은 RMS로 만든다”가 답이 아니다. 관악기의 breath/tongue 자체는
남기되, **원래 연주에는 없던 splice pump만** 없애야 한다.

## V5의 범위

새 renderer는 V4를 덮어쓰지 않는다. V4 candidate와 아래 수리 candidate를 하나의
common-gain 청취 bundle에 함께 굽는다.

```sh
PYTHONPATH=public/assets/audio/bgm /path/to/python \
  public/assets/audio/bgm/render_village_day_ari_level_matched_audition.py \
  --raw-daegeum-dir "$GUGAK_MONOTONE_ROOT/monotone-6" \
  --output-dir /tmp/village-day-ari-level-matched
```

| 파일 | 용도 |
|---|---|
| `01_v4_score_articulated_native_pitch_reference.wav` | 같은 direct source로 다시 만든 V4 기준음 |
| `02_phase_level_matched_score_articulated_native_pitch.wav` | V5 수리 candidate |

게임 default BGM, `bgm.js`, raw source, asset manifest는 변경하지 않는다.

## 수리한 세 지점

### 1. b09_e1의 tongue → 77 body

새 tongue은 그대로 실제 `sanjo_deageum_stacatto_60.wav`이고, body도 그대로
`sanjo_deageum_scale_chung_34.wav`의 human-audited 77 steady span 안에서만 고른다.

- body 시작점을 그 span 안에서 탐색하되, tongue tail과의 **positive waveform
  correlation이 최소 `0.70`**이 아니면 render 자체를 실패시킨다.
- 이 실제 bundle에서는 correlation `0.906`의 recorded body를 골랐다.
- 같은 음의 coherent signal이므로 기존 equal-power가 아니라 **보완적 linear-amplitude
  fade**를 쓴다.
- 첫 50ms의 실제 tongue attack은 인위적으로 키우지 않는다. 그 뒤 20ms RMS frame이
  120–220ms median보다 3dB 이상 꺼지면 실패한다. V5 실제 결과는 `-2.20 dB`로 pass다.

이는 paired natural gesture를 찾았다는 뜻이 아니다. 여전히 별 take의 tongue proxy이며,
그 사실과 선택한 source 시점은 `provenance.json`에 기록된다.

### 2. b10_e0의 77→77

새 sample을 겹치지 않는다. b09_e1의 selected recorded body를 b10_e0 끝까지 계속
재생한다. 필요한 raw range도 original steady audit 안에 들어간다. 이 경계의 실제
20ms RMS 차이는 `-0.04 dB`이고, 허용 gate는 `±1 dB`다.

### 3. 77→74 및 74→72의 실제 경계 레벨

이 둘은 natural fingering 녹음을 찾았다는 주장을 하지 않는다. 여전히 labelled
recorded-body crossfade다. 단, source tag의 RMS가 아니라 outgoing `[-100,-30]ms`와
incoming `[+90,+150]ms`를 직접 비교한다.

b09_e1 body는 녹음 자체가 1.37초 동안 커져서, 그대로 두면 다음 74 body를 안전
한계보다 큰 약 `+3.9 dB`만큼 밀어 올려야 했다. 그래서 V5는 이 **한 score-visible
hold**에만 tongue/body overlap 직후인 **score onset +0.115초**
(= body-local +0.045초)부터 시작해 다음 74가 들어오기 전 끝나는 `-3.90 dB`의
gentle linear-in-dB taper를 기록한다. 이러면 b10_e1에 hard make-up gain이 필요 없고,
세 slur의 초기 경계 레벨 차이는 각각 `-0.20`, `+0.26`, `-0.40 dB`로 모두 `±1.5 dB`
gate 안이다.

이 taper는 compressor/mastering이 아니라 source 교체에 의해 생긴 장기 drift를 score의
표현 곡선으로 명시한 것이다. source WAV는 바꾸지 않으며, curve와 목표 event도
provenance에 남긴다.

## 아직 수리하지 않은 것

- V4의 77 fresh breath head는 첫 120ms가 느리게 올라오는 실제 recorded breath다.
  V5는 사용자가 지적한 “첫 음은 다르다”를 존중해 이를 hard attack으로 바꾸지 않았다.
- `scale_sus_04.wav`에는 더 빠른 실제 77 onset 후보가 있지만, 0.5초 동안 약 5.5dB
  자연 감쇠한다. 따라서 drop-in 교체하면 새 pump를 만들 수 있다. 별도 head/body
  performance 설계와 청취 gate 없이는 채택하지 않는다.
- `77→74→72`의 실제 한 호흡 운지 recording은 아직 source에서 확인되지 않았다.
  이를 genuine transition이라고 부르지 않는다.

## 검증

```sh
/path/to/python scripts/test-village-day-ari-level-matched-audition.py
PYTHONPATH=public/assets/audio/bgm /path/to/python \
  scripts/test-village-day-ari-level-matched-audition-render.py \
  --raw-daegeum-dir "$GUGAK_MONOTONE_ROOT/monotone-6"
```

계약 8/8, direct-source integration 15/15을 통과해야 한다. 통합 gate는 실제 WAV
hash/무clip, source provenance redaction, positive phase correlation, same-pitch
continuation, taper bound, 세 slur level gate, 재발음 trough gate를 검사한다.
