import pkgJson from '../../package.json'
import type { ReleaseType } from '../types'

export const VERSION = pkgJson.version

export const CLEAN_DIRS = ['dist', 'node_modules', '.turbo']

export const GLOB_VUE = '**/*.{vue,css,less.scss}'

export const PADDING = 13

export const EXCLUDE_DIRS: string[] = ['docs', 'playground']

export const PRERELEASE_TYPES: ReleaseType[] = ['premajor', 'preminor', 'prepatch', 'prerelease']

export const RELEASE_TYPES: ReleaseType[] = PRERELEASE_TYPES.concat(['major', 'minor', 'patch', 'next'])

export const DEP_TYPES = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

export const MAJOR_PACKAGES = [
  'vue',
  'ant-design-vue',
  '@ebdp-core/design-token',
  '@ebdp-core/icons',
  '@ebdp-core/common-ui',
  '@ebdp-core/layout-ui',
  '@ebdp-core/shared',
  '@ebdp/bdp-components',
]
