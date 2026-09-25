# BGM R&D — source-led feature contour scaffold

`tools/daegeum-transitions/source_led_contour.py`는 이미 검증된 **한 원본 source의
연속 native frame span**을 반주·stem 설계에 참고할 수 있는 작은 feature-proxy
scaffold로 내린다. 음을 잘라 붙이거나 목표 score에 맞춰 원음을 고치는 도구가 아니다.

입력은 다음 둘 중 하나다.

1. direct trajectory retrieval report와 명시한 `priority_rank`
2. phrase-boundary triage report와 명시한 `priority_rank`, 또는 그것이 만든
   `source`와 `native_source_span.frame_range`를 가진 선택 row

두 경우 모두 source ID/SHA-256/relative path/native frame span을 R&D-06
`source_catalog.json`과 다시 대조한다. feature sidecar와 NPZ의 SHA-256, source
identity, native frame center, time ordering도 다시 검증한다. direct trajectory
report라면 report가 선언한 source catalog SHA-256도 현재 bundle과 정확히 같아야 한다.

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/source_led_contour.py \
  --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \
  --input-json _bgm_rnd/daegeum-direct-trajectory-YYYYMMDD/direct_trajectory_retrieval.json \
  --priority-rank 1 \
  --output-dir _bgm_rnd/source-led-contour-YYYYMMDD
```

출력은 fresh R&D directory의 다음 두 파일이다.

- `source_led_contour.json`: source/frame/time provenance, 원본 input truth label,
  coarse F0/RMS/voicing/onset feature-proxy summaries, 선택적 low-variation suggestion
- `source_led_contour.tsv`: 같은 contour와 suggestion을 시간순으로 펼친 표

## 해석 경계

이 도구는 WAV를 열지 않는다. feature cache만 읽으며 F0 보간, pitch correction,
time stretch, gain, synthesis, rendering을 하지 않는다. invalid/unvoiced F0는 채우지
않고 해당 coarse bin에 `null`로 남긴다.

따라서 output은 다음 어느 것도 아니다.

- 전문가 채보 또는 score annotation
- breath, rearticulate, slur, natural legato, 운지, 시김새의 label
- 연주 품질 판정, approved transition, transition bank item
- 학습 재료 또는 게임 asset

`low_variation_feature_proxy_region_suggestions`는 설정한 voicing/pitch-span/RMS-range
안에서 cache proxy가 덜 흔들린 연속 feature row를 표시할 뿐이다. 이는 실제 phrase
boundary나 stable performance region을 판정하지 않는다. 나중 반주를 source의 실제
pitch centre·강세·밀도에 맞춰 쓰기 위한 **보수적 출발점**이다.

기본 `bgm.js`, 공개 audio asset, runtime renderer는 이 R&D helper가 변경하지 않는다.

## 검증

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/test_source_led_contour.py
python3 tools/daegeum-transitions/source_led_contour.py --dry-run
```
