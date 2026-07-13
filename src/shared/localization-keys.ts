import type sourceMessages from '../../config/localization-extraction/en.json'

type Join<Prefix extends string, Key extends string> = Prefix extends '' ? Key : `${Prefix}.${Key}`
type CatalogKey<T, Prefix extends string = ''> = {
  [Key in Extract<keyof T, string>]: T[Key] extends string
    ? Join<Prefix, Key>
    : T[Key] extends Record<string, unknown>
      ? CatalogKey<T[Key], Join<Prefix, Key>>
      : never
}[Extract<keyof T, string>]

// Why: deriving from the committed extractor output keeps key types generated without unchecked .d.ts files.
export type LocalizationKey = CatalogKey<typeof sourceMessages>
