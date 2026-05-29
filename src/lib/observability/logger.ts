/**
 * logger.ts — Logger minimalista para reemplazar console.* en código de producción.
 *
 * En producción, `debug` queda silenciado. El resto (info/warn/error) sale al stdout
 * estándar de Node/Edge. Si en el futuro se quiere mandar a Datadog/Sentry, se cambia
 * la implementación acá y se propaga sin tocar los call sites.
 */

type LogArgs = readonly unknown[]

const isProd = process.env.NODE_ENV === 'production'

export const logger = {
  debug: (...args: LogArgs) => {
    if (!isProd) console.debug(...args)
  },
  info: (...args: LogArgs) => {
    console.info(...args)
  },
  warn: (...args: LogArgs) => {
    console.warn(...args)
  },
  error: (...args: LogArgs) => {
    console.error(...args)
  },
}

export type Logger = typeof logger
