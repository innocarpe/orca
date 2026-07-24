import type * as Monaco from 'monaco-editor'
import type { LanguageRegistration } from 'shiki/core'
import { registerTextMateLanguage } from './textmate-language-registration'

type MonacoModule = typeof Monaco

export const MATLAB_LANGUAGE_ID = 'matlab'

export const matlabLanguageConfiguration: Monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '%'
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' }
  ]
}

export async function loadMatlabTextMateGrammar(): Promise<LanguageRegistration> {
  // Why: MathWorks MATLAB TextMate grammar (BSD-style; see matlab-LICENSE.txt).
  const grammarModule = await import('./textmate-grammars/matlab.tmLanguage.json')
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: TextMate injects the $self/$base repository entries a registration's type requires; real tokenization tests validate this vendored JSON.
  const grammar = grammarModule.default as unknown as LanguageRegistration
  return { ...grammar, name: MATLAB_LANGUAGE_ID }
}

export function registerMatlabLanguage(monaco: MonacoModule): void {
  registerTextMateLanguage(monaco, {
    language: {
      id: MATLAB_LANGUAGE_ID,
      // Why: #10363 — prefer MATLAB over Monaco's objective-c association for .m.
      extensions: ['.m'],
      aliases: ['MATLAB', 'matlab']
    },
    configuration: matlabLanguageConfiguration,
    loadGrammar: loadMatlabTextMateGrammar
  })
}
