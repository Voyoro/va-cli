import { clean, coerce, gt, valid } from 'semver'

export function cleanSpec(spec: string): string | null {
  const cleanSpec = clean(spec)
  const version = valid(cleanSpec)
  if (version)
    return version
  const coerced = coerce(spec)
  if (coerced)
    return coerced.version
  return null
}

export function isGreaterThan(version1: string, version2?: string): boolean {
  if (!version2)
    return false
  const v1 = cleanSpec(version1)
  const v2 = cleanSpec(version2)
  if (!v1 || !v2)
    return false
  return gt(v1, v2)
}
