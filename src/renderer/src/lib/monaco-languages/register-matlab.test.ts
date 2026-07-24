import { describe, expect, it, vi } from 'vitest'
import {
  MATLAB_LANGUAGE_ID,
  loadMatlabTextMateGrammar,
  matlabLanguageConfiguration,
  registerMatlabLanguage
} from './register-matlab'

function createMonacoMock() {
  return {
    languages: {
      getLanguages: vi.fn(() => []),
      register: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      registerTokensProviderFactory: vi.fn()
    }
  }
}

describe('registerMatlabLanguage', () => {
  it('maps .m to the TextMate-backed matlab language', () => {
    const monaco = createMonacoMock()

    registerMatlabLanguage(monaco as never)

    expect(monaco.languages.register).toHaveBeenCalledWith({
      id: MATLAB_LANGUAGE_ID,
      extensions: ['.m'],
      aliases: ['MATLAB', 'matlab']
    })
    expect(monaco.languages.setLanguageConfiguration).toHaveBeenCalledWith(
      MATLAB_LANGUAGE_ID,
      matlabLanguageConfiguration
    )
    expect(monaco.languages.registerTokensProviderFactory).toHaveBeenCalledWith(
      MATLAB_LANGUAGE_ID,
      expect.objectContaining({ create: expect.any(Function) })
    )
  })
})

describe('loadMatlabTextMateGrammar', () => {
  it('loads the vendored MATLAB TextMate grammar', async () => {
    const grammar = await loadMatlabTextMateGrammar()

    expect(grammar).toMatchObject({
      name: MATLAB_LANGUAGE_ID,
      scopeName: 'source.matlab',
      fileTypes: ['m']
    })
  })
})
