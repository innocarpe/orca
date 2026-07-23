import { describe, expect, it } from 'vitest'
import { getCatalogModel, isLocalSpeechModel, SPEECH_MODEL_CATALOG } from './model-catalog'

describe('SPEECH_MODEL_CATALOG', () => {
  it('includes a Korean offline transducer with download integrity metadata', () => {
    const korean = getCatalogModel('zipformer-korean-2024-06-24')
    expect(korean).toMatchObject({
      language: 'ko',
      type: 'transducer',
      provider: 'local',
      streaming: false,
      sampleRate: 16000,
      archiveFormat: 'tar.bz2',
      sizeBytes: 329_740_690,
      archiveSha256: '24bd409318f389cd2de0e295eb1acf91f4e8dfcc0d650490dd2a01f5b50d2c77'
    })
    expect(korean?.downloadUrl).toContain('sherpa-onnx-zipformer-korean-2024-06-24.tar.bz2')
    expect(korean?.files).toEqual([
      'encoder-epoch-99-avg-1.int8.onnx',
      'decoder-epoch-99-avg-1.int8.onnx',
      'joiner-epoch-99-avg-1.int8.onnx',
      'tokens.txt'
    ])
    expect(korean && isLocalSpeechModel(korean)).toBe(true)
  })

  it('includes a Korean streaming transducer for low-latency dictation', () => {
    const streaming = getCatalogModel('zipformer-streaming-korean-2024-06-16')
    expect(streaming).toMatchObject({
      language: 'ko',
      type: 'transducer',
      streaming: true,
      sizeBytes: 418_218_652,
      archiveSha256: 'e346a5882a409650472be17326237e24df7bf409db6b4a8a52e1a61422bf2500'
    })
    expect(streaming?.downloadUrl).toContain(
      'sherpa-onnx-streaming-zipformer-korean-2024-06-16.tar.bz2'
    )
  })

  it('keeps catalog ids unique', () => {
    const ids = SPEECH_MODEL_CATALOG.map((model) => model.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
