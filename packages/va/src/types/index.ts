import type { ReleaseType as SemverReleaseType } from 'semver'

export type ReleaseType = SemverReleaseType | 'next'
