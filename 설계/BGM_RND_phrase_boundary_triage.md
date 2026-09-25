# BGM R&D — source-led 대금 악구 경계 triage

## 목적

R&D-07의 direct F0 trajectory는 한 source에서 연속된 feature row를 찾는다. 그러나
그 span의 앞뒤를 sustain 중간에서 자르면 첫 숨·마침을 다시 만들어야 한다.
`phrase_boundary_triage.py`는 선택 trajectory의 전후 한정 범위에서 lower-energy,
onset, release **proxy**를 측정해, trajectory 전체를 감싸는 하나의 native-frame raw
span 좌표를 우선순위화한다. 후속 source-led arranger가 실제 source의 head/tail을
보존하는 출발점으로만 쓴다.

이것은 musical phrase, breath, release, slur, legato detector가 아니다. 모든 결과는
unreviewed automatic measurement이고, approved transition, training item, game asset으로
승격되지 않는다.

## 엄격한 입력 gate

도구는 raw WAV를 변형하지 않지만 다음을 다시 검증한다.

1. direct trajectory report의 bundle name과 `source_catalog.json` SHA-256.
2. 선택 row의 source SHA/native frame timeline, feature NPZ/sidecar SHA, feature/native
   enclosure.
3. 명시 raw WAV root의 SHA와 native descriptor를 catalog와 대조.
4. NGC exact 대금산조 manifest/extendSeq mapping, research-only/no-game/no-legato-claim,
   no-training/no-game-clearance 및 entry `approved_transition: false`.

하나라도 다르면 output directory를 만들지 않는다. 성공해도 source audio는
hash/descriptor 검증 외에 decode/copy/render/write하지 않고, JSON/TSV metadata만 쓴다.

## 실행

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/phrase_boundary_triage.py \
  --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \
  --raw-daegeum-dir _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/audio \
  --ngc-extended-manifest _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/ngc-extended-daegeum-sanjo.manifest.json \
  --ngc-first-65-3-4-84 \
  --trajectory-retrieval _bgm_rnd/daegeum-direct-trajectory-YYYYMMDD/direct_trajectory_retrieval.json \
  --priority-rank 1 \
  --output-dir _bgm_rnd/daegeum-boundary-triage-YYYYMMDD
```

`--priority-rank`와 `--trajectory-id` 중 하나만 준다. 다른 official range는 manifest와
exact `--ngc-extend-seq-range START:END`를 함께 준다. broad title match나 manifest 없는
range selection은 없다.

출력은 새 directory의 다음 두 metadata 파일뿐이다.

| 파일 | 역할 |
|---|---|
| `phrase_boundary_triage.json` | provenance, source/native frame range, head/tail RMS/onset proxy, conservative status |
| `phrase_boundary_triage.tsv` | 같은 ranking의 spreadsheet-safe 요약 |

## 측정·ranking의 한계

head에는 앞/뒤 `context_seconds` window의 RMS dBFS median, full source feature track
안의 lower-energy percentile, pre→post energy change, onset-flux proxy를 기록한다.
tail에는 같은 방식으로 post-side lower-energy percentile과 energy-change proxy를
기록한다. 결과 span은 head pre-context부터 tail post-context까지의 한 native
`[start,end)` frame range이고, trajectory의 original enclosure를 반드시 포함한다.

ranking은 양 끝 lower-energy percentile, percentile 합, 기록된 energy-change proxy,
head onset-flux percentile, span length 순의 lexicographic triage다. loudness quality,
연주 의도, phrase quality의 판정은 아니다.

양쪽 lower-energy context를 `--maximum-low-energy-percentile` 내에서 못 찾으면 결과는
0 candidate다. tool은 대신 sustain 중간 crop을 내지 않는다.

각 row는 최소한 다음을 강제한다.

```text
unreviewed_automatic_boundary_candidate: true
automatic_measurement_is_not_a_musical_phrase_label: true
not_a_verified_musical_phrase: true
not_an_approved_transition_or_phrase: true
not_evidence_of_same_breath/slur/natural_legato: true
not_a_training_item: true
not_a_game_asset: true
```

검증:

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/test_phrase_boundary_triage.py
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/phrase_boundary_triage.py --dry-run
```
