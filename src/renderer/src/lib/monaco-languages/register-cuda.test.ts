// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { CUDA_LANGUAGE_ID, cudaMonarchLanguage, registerCudaLanguage } from './register-cuda'

function createMonacoMock(existingLanguageIds: string[] = []) {
  return {
    languages: {
      getLanguages: vi.fn(() => existingLanguageIds.map((id) => ({ id }))),
      register: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      setMonarchTokensProvider: vi.fn()
    }
  }
}

describe('registerCudaLanguage', () => {
  it('registers CUDA extensions with the C++ grammar and CUDA keywords', () => {
    const monaco = createMonacoMock()

    registerCudaLanguage(monaco as never)

    expect(monaco.languages.register).toHaveBeenCalledWith({
      id: CUDA_LANGUAGE_ID,
      extensions: ['.cu', '.cuh'],
      aliases: ['CUDA C/C++', 'CUDA']
    })
    expect(cudaMonarchLanguage.keywords).toEqual(
      expect.arrayContaining(['class', '__global__', 'threadIdx', 'cudaStream_t'])
    )
    expect(monaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      CUDA_LANGUAGE_ID,
      cudaMonarchLanguage
    )
  })

  it('does not register the language twice', () => {
    const monaco = createMonacoMock([CUDA_LANGUAGE_ID])

    registerCudaLanguage(monaco as never)

    expect(monaco.languages.register).not.toHaveBeenCalled()
    expect(monaco.languages.setMonarchTokensProvider).not.toHaveBeenCalled()
  })
})
