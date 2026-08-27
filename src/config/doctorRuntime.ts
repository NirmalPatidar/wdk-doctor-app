import type { WdkConfigs } from '@tetherto/wdk-react-native-core'
// This static import requires doctor.runtime.json to exist on disk at bundle
// time — Metro resolves it once, like any other module. It's gitignored
// (personal, per-contributor), so `npm install` (via postinstall) copies it
// from doctor.runtime.example.json automatically if it's missing. See
// scripts/ensure-doctor-runtime-config.js.
import rawRuntimeConfig from '../../doctor.runtime.json'

interface DoctorRuntimeConfig {
  networks?: Record<string, unknown>
  protocols?: Record<string, unknown>
  modules?: Record<string, unknown>
}

/**
 * Recursively replaces any string value that's exactly "$VARNAME" with
 * process.env.VARNAME. Fails fast with a precise, actionable error if the
 * referenced variable isn't set — this is deliberate: the alternative is an
 * `undefined` silently reaching the worklet, which surfaces later as
 * "Cannot read properties of undefined (reading 'replace')" with no
 * indication of which config field or which .env entry was the problem.
 */
function interpolateEnv(value: unknown, path: string[] = []): unknown {
  if (typeof value === 'string') {
    const match = value.match(/^\$([A-Z0-9_]+)$/)
    if (!match) return value
    const varName = match[1]
    const resolved = process.env[varName]
    if (resolved === undefined || resolved === '') {
      throw new Error(
        `doctor.runtime.json references $${varName} at "${path.join('.')}", but it's not set ` +
        `(or is empty) in your .env. Check .env.example for the full list of required variables.`
      )
    }
    return resolved
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => interpolateEnv(v, [...path, String(i)]))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, interpolateEnv(v, [...path, k])])
    )
  }
  return value
}

const config = rawRuntimeConfig as DoctorRuntimeConfig

// WdkConfigs defaults its TNetwork/TProtocol generics to a permissive shape
// when no type args are given — appropriate here, since doctor.runtime.json
// is deliberately untyped so that adding a new package never requires a
// TypeScript change, only a JSON entry.
export const wdkConfigs: WdkConfigs = interpolateEnv({
  networks: config.networks ?? {},
  protocols: config.protocols ?? {},
  modules: config.modules ?? {}
}) as WdkConfigs

export default wdkConfigs
