import type { zhCN } from './locales/zh-CN'

export type Locale = 'zh-CN' | 'en-US'
export type LocaleSetting = Locale | 'auto'
export type TranslationValue = string | number | boolean | null | undefined
export type TranslationParams = Record<string, TranslationValue>

export type DeepWiden<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepWiden<T[K]>
}

type JoinPath<Prefix extends string, Key extends string> =
  Prefix extends '' ? Key : `${Prefix}.${Key}`

export type MessageKey<T = typeof zhCN, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? JoinPath<Prefix, K>
    : MessageKey<T[K], JoinPath<Prefix, K>>
}[keyof T & string]

export type Messages = DeepWiden<typeof zhCN>

export type Translator = (
  key: MessageKey,
  params?: TranslationParams,
) => string
