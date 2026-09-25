# BGM R&D — 16마디 아리랑 대금 요성 B0/B1/B2-R

작성일: 2026-09-25  
작업 브랜치: `codex/bgm-rnd-01`  
상태: 전체 길이 R&D 청취본·검증 패키지 완성, 게임 적용 전

## 결론

16마디·34.8초짜리 동일 악보를 세 가지 표현으로 끝까지 렌더했다.

- B0는 모든 음이 평음인 기준안이다.
- B1은 문맥 규칙으로 고른 b08 국소 종지와 b16 전체 종지에만 3.45 Hz,
  18 cents의 후반 요성을 건 보수적 규칙형이다.
- B2-R은 b08을 B1과 그대로 유지하고, b16만 국립국악원 대금 산조 자료에서
  자동 추출한 65점 F0 윤곽으로 교체한 참조형이다.

B2-R은 구현·검증에는 성공했지만 최종안으로 확정하지 않는다. 마른 DDSP 출력의
음량은 B1과 사실상 같고 새 클릭도 없지만, 체크포인트 리버브 뒤의 100 ms 음량
변동은 B1보다 커졌다. 따라서 현재 청취 후보의 우선순위는 **B1이 보수적 기준안,
B2-R은 실제 자료 모양을 시험하는 비교안**이다. 실제 자료를 썼다는 이유만으로
B2-R을 더 정통이거나 더 좋은 연주라고 부르지 않는다.

기본 게임 BGM과 원본 `Mini` 작업 폴더는 변경하지 않았다.

## 최종 청취 파일

모든 파일은 mono PCM16, 16 kHz, 556,800 samples, 34.8초다. B0에서 산출한 동일한
상수 게인 `1.7179897666470925`와 동일한 체크포인트 리버브를 사용했으며, 후보별
정규화·압축·리미팅은 하지 않았다.

| 후보 | 파일 | SHA-256 | `[0, 34.56)` RMS |
|---|---|---|---:|
| B0 평음 | `_bgm_rnd/full-ari-yoseong-audition-pack-r1-20260925-231000/B0_full_ari_hard_step_no_explicit_yoseong.wav` | `9bd113f568f0180b296549629d5630c930c991f7943750e13c24090003c12259` | -24.0003 dBFS |
| B1 문맥 규칙형 | `_bgm_rnd/full-ari-reference-contour-audition-pack-r1-20260925-175200/B1_full_ari_contextual_sine_yoseong.wav` | `11fd57ccea7a9d65306e335e48a7f0d7caea5b3d5ec82c4bd1dc8b835d723906` | -24.0019 dBFS |
| B2-R 미검수 참조형 | `_bgm_rnd/full-ari-reference-contour-audition-pack-r1-20260925-175200/B2R_full_ari_reference_shape_unreviewed.wav` | `d71f27efe9af1575ad8c83a6cdf104287b77a303be45a9140930035876430943` | -24.0100 dBFS |

B1/B2-R 패키지 manifest는
`_bgm_rnd/full-ari-reference-contour-audition-pack-r1-20260925-175200/full_ari_reference_contour_audition_manifest.json`이며,
SHA-256은 `ee5d4c46ee88d441adf89c8e564f7dbc7d48c2a78dbf8636a658851be6a573af`다.

## B2-R 표현 계약

참조 윤곽은 `b16_e0_rearticulate` 한 곳에만 허용된다.

- b16 길이: 2.16초
- 평음 선행: 0.66초
- 참조 윤곽: 정확히 1.5초, 시간 압축·끝점 재매핑 없음
- 보간: 원본 65점을 250 Hz 제어행에 piecewise-linear 보간
- 경계: 시작·끝 0.12초 linear-depth fade
- 활성 제어: frame 8265–8639, 총 375행
- 비영 편차: 내부 373행
- 범위: 약 -33.9692–+27.0578 cents
- 첫 행과 마지막 행: 정확히 0 cents
- 마지막 음 및 60행 릴리스: 정확히 466.163762 Hz, 0 cents

원본 artifact SHA-256은
`e584ff8c9142ed51223681d30ba5aa3236f29a7c808bcb5b40b208cb0f886bd2`,
정규화된 contour payload SHA-256은
`3ecbf6f2e7a40118b47d28550ddbec75af9b56df3a8098550ea2d21c702eab0f`다.
런타임은 artifact 신원, 후보·source ID, 권리 상태, 65점 배열, 두 해시와 모든
부정적 claim flag를 다시 검사하고 하나라도 달라지면 렌더를 거부한다.

참조 자료에 들어 있는 RMS 윤곽은 보존만 했고 이번 음원에는 적용하지 않았다.
음정 모양의 효과를 분리하려는 비교이자, 원본 RMS 범위가 약 -4.39–+1.91 dB라
검토 없이 적용하면 사용자가 지적한 음량 요동을 오히려 키울 수 있기 때문이다.

## 동일성·음향 QA

- B1/B2-R의 8,700개 제어행에서 frame/time/loudness/voicing/articulation/event ID는
  모두 정확히 같다.
- b08의 360행은 F0와 요성까지 완전히 동일하다.
- 수치상 표현 차이는 b16 내부 373행의 F0/요성뿐이다. 릴리스 CSV의 `-0.0`과
  `0.0` 표기 차이는 수치적으로 같은 0이며 비교기는 float로 판정한다.
- B2-R dry WAV의 첫 차이는 33.0646875초의 1 LSB다. wet WAV에서 33.06초 이전에
  보이는 차이는 528,960 samples 중 378개의 1-LSB FFT/양자화 반올림뿐이며
  차이 RMS는 -121.8 dBFS다. 1 LSB를 넘는 첫 차이는 33.0651875초로, 실질
  차이는 의도한 참조 진입 뒤에 난다.
- dry b16 RMS는 B1 -53.6934, B2-R -53.6927 dBFS로 차이가 0.001 dB 미만이다.
- wet b16 RMS는 B1 -23.1823, B2-R -23.2899 dBFS다.
- 참조 시작 뒤 100 ms wet envelope의 range/std는 B0 0.264/0.083 dB,
  B1 1.309/0.289 dB, B2-R 2.099/0.610 dB다. B2-R은 음정 윤곽과 학습 리버브의
  상호작용으로 청감상 음량 요동이 더 커질 가능성이 있다.
- 각 핵심 경계의 sample-jump click proxy는 해당 후보 b16의 99.9 percentile보다
  작아 새 click outlier가 없다.
- 두 wet 후보의 최고 peak는 0.214996(-13.35 dBFS)이며 clipping, limiter,
  compressor가 없다.
- 표기된 쉼 b08 `[16.56, 17.28)`과 연주용 호흡 틈 두 곳은 제어에서 정확히 0이다.
- score-length wet의 마지막 10 ms는 약 -69.7 dBFS의 작은 잔향을 자른다. 최종
  비루프 자산에는 37.799875초 full-tail 또는 명시적 tail fade를 써야 한다.

## 검증

- BGM R&D Python 테스트 35개 묶음, 총 206개 테스트 통과
- score/compiler 21개, DDSP runtime 26개, B1/B2-R 패커 7개 포함
- 실제 B2-R full render `succeeded`
- 실제 B1/B2-R fail-closed pack 생성 `succeeded`
- 독립 QA에서 plan/report/control/audio SHA와 실제 bytes 재검증
- 기본 BGM 무변경 guard 통과

기본 BGM guard:

```sh
test -z "$(git diff --name-only 03a54f5c..HEAD -- \
  public/assets/audio/bgm/bgm.js \
  public/assets/audio/bgm/bgm-loops.js \
  public/assets/audio/bgm/render-meta.json \
  'public/assets/audio/bgm/*.ogg' \
  'public/assets/audio/bgm/*.m4a')"
```

## 관련 커밋

- `044c6295` — 전체 곡 공통 청취 게인 지원
- `3b73a80d` — 16마디 B0/B1 표현 계획
- `75d25b0f` — 전체 곡 게인 CLI 회귀 테스트
- `16bd0132` — B0/B1 전체 곡 패커
- `b6a1b43d` — 미검수 참조 윤곽 B2-R 계획·컴파일러
- `c3030d6b` — B2-R selection provenance 범위 수정
- `fc173c98` — 65점 참조 윤곽 DDSP 런타임
- `0f68be0e` — B1/B2-R fail-closed 청취 패커

## 해석 한계와 다음 실험 기준

B2-R의 원본은 자동 F0 proxy 후보다. 사람 검수, 요성 판정, 경기민요 문맥 정렬,
전체 프레이즈/호흡 적합도, 학습 이용권 및 게임 배포권이 모두 확인되지 않았다.
그러므로 `reference_shape_unreviewed`, offline R&D-only 상태를 유지한다. 이 결과는
학습된 경기민요 표현 모델도 아니고 게임 자산도 아니다.

다음 순서는 먼저 참조 shape의 깊이만 B1의 ±18 cents에 맞춘 `B2-Rd`다. 현재
B2-R의 약 -33.97–+27.06 cents와 B1의 약 ±17.99 cents가 달라 shape와 depth가
동시에 바뀌었기 때문이다. 그 다음 음량 실험 `B2-RA`에서만 원본 RMS 윤곽에
저역통과, mean-zero, 최대 ±1 dB 제한을 걸고 동일 B0-derived 상수 게인으로 비교한다.
동시에 checkpoint-native reverb의 wet 비율 또는 더 안정적인 공간계가 요성에 따른
envelope 변동을 얼마나 만드는지 분리해야 한다. 사람 청취 전에는 어느 후보도 기본
BGM으로 승격하지 않는다.
