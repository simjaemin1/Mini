# 대금 요성 참조 곡선 추출기 (R&D-only)

`reference_yoseong.py`는 이미 만들어진 R&D-06 대금 feature cache의 `F0`,
`voicing confidence`, `RMS`, `onset flux`만 읽는다. 원 WAV는 열지 않는다. 연속 voiced
run의 양 끝을 제외하고 여러 길이의 창을 훑은 다음, 다음 보수적 조건을 모두 통과한
창만 순위를 매긴다.

- F0 estimator 상·하한에 닿지 않음
- 높은 voicing confidence와 충분한 RMS
- 지속음이라고 보기 어려운 급격한 음정 step·큰 중심음 drift가 없음
- 2.3–8 Hz 구간의 autocorrelation과 FFT가 모두 주기성을 지지함
- 최소 2.2회 주기, 8–180 cent의 F0-proxy 반폭

통과 결과도 음악학적 요성 판정은 아니다. 자동 검출에는 다음을 알 수 있는 정보가 없다.

- 경기민요/토리/악구 역할에 대한 사람의 라벨
- 호흡·운지·슬러·재어택 판정
- 원 프레이즈 전체와 목표 score의 적합성
- 학습·배포·게임 사용 권리

따라서 shape가 나와도 상태는 오직 `reference_shape_unreviewed`다. 실패하면 contour를
만들지 않고 `blocked`와 차단 사유를 쓴다. 출력은 `not_training_item`, `not_game_asset`,
`rights_cleared: false`를 명시한다. source bundle 내부 출력과 기존 결과 덮어쓰기도
거부한다.

## 실제 192개 phrase cache 실행

```sh
/tmp/durango-bgm-rnd-venv/bin/python \
  tools/daegeum-vibrato-reference/reference_yoseong.py \
  --bundle _bgm_rnd/daegeum-transition-bank-ngc-20260924-205600 \
  --output /tmp/daegeum-reference-shape-unreviewed.json
```

JSON에는 절대 경로를 저장하지 않는다. 선택 후보에는 다음 provenance가 들어간다.

- source ID, catalog-declared raw-source SHA-256, bundle-relative source name
- feature metadata/NPZ의 실제 SHA-256
- `[start, end)` feature index와 time/native-frame-center 범위
- F0 proxy 방식, hop/window 크기
- rate/depth/주기성/RMS/voicing proxy
- 0–1 시간축의 pitch-cent residual과 상대 RMS contour

pitch residual은 5-frame 대칭 smoothing 뒤 선형 centerline을 제거하고 중앙값을 0으로
맞춘 값이다. 진폭은 cents 단위 그대로 남는다. B2 오프라인 청취 실험이 이를 읽을 수는
있지만, 반드시 `reference_shape_unreviewed` 표지를 유지해야 한다.

## 검증

```sh
/tmp/durango-bgm-rnd-venv/bin/python \
  tools/daegeum-vibrato-reference/test_reference_yoseong.py
```

합성 테스트는 4 Hz 연속 주기 곡선의 통과, 평음의 차단, 음표 step을 요성으로 오인하지
않는 차단, source identity mismatch·bundle 내부 쓰기·덮어쓰기 거부, 절대 경로 비기록을
검증한다.
