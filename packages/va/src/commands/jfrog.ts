import * as p from '@clack/prompts'
import type { Package } from '@ebdp-script/node-va-utils'
import { getPackages } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_JFROG_URL = 'https://artifactory.e-byte.cn'
const DEFAULT_JFROG_REPO = 'bdp-docker-dev'
const CONFIG_PATH = path.join(os.homedir(), '.va', 'jfrog.json')

type DockerConfig = {
  name: string
  path?: string
}

type DockerPackage = {
  imagePath: string
  packageName: string
  packageDir: string
}

type DockerTagsResponse = {
  name?: string
  tags?: string[]
}

type JfrogConfig = {
  url: string
  repo: string
  username: string
  password: string
}

export function defineJfrogCommand(cac: CAC) {
  cac.command('jfrog [action]', 'Manage JFrog docker image tags')
    .action(async (action) => {
      if (action === 'login') {
        await runJfrogLogin()
        return
      }

      if (!action || action === 'tags') {
        await runJfrogTags()
        return
      }

      console.error(`Unknown jfrog action: ${action}`)
      console.error('Available actions: login, tags')
      process.exit(1)
    })
}

async function runJfrogLogin() {
  const existing = readJfrogConfig()
  const url = await p.text({
    message: 'JFrog URL:',
    placeholder: DEFAULT_JFROG_URL,
    defaultValue: existing?.url || DEFAULT_JFROG_URL,
  })
  if (p.isCancel(url) || !url) {
    process.exit(1)
  }

  const repo = await p.text({
    message: 'Docker repo:',
    placeholder: DEFAULT_JFROG_REPO,
    defaultValue: existing?.repo || DEFAULT_JFROG_REPO,
  })
  if (p.isCancel(repo) || !repo) {
    process.exit(1)
  }

  const username = await p.text({
    message: 'Username:',
    ...withDefaultValue(existing?.username),
  })
  if (p.isCancel(username) || !username) {
    process.exit(1)
  }

  const password = await p.password({
    message: 'Password:',
  })
  if (p.isCancel(password) || !password) {
    process.exit(1)
  }

  writeJfrogConfig({
    url: String(url),
    repo: String(repo),
    username: String(username),
    password: String(password),
  })

  console.log(`JFrog config saved to ${CONFIG_PATH}`)
}

async function runJfrogTags() {
  const config = getJfrogConfig()
  if (!config) {
    console.error('Missing JFrog config. Run: va jfrog login')
    return
  }

  const dockerPackages = await findDockerPackages()
  if (dockerPackages.length === 0) {
    console.log('No Docker.json found in workspace packages.')
    return
  }

  const selected = await p.select({
    message: 'Select docker image:',
    options: dockerPackages.map(item => ({
      label: `${item.packageName}`,
      value: item.imagePath,
    })),
  })

  if (p.isCancel(selected) || !selected) {
    process.exit(1)
  }

  const tags = await fetchDockerTags(String(selected), config)
  const sortedTags = sortSemverTags(tags)

  console.log(`\n${selected}`)
  if (sortedTags.length === 0) {
    console.log('No tags found.')
    return
  }

  for (const tag of sortedTags) {
    console.log(tag)
  }
}

export async function findDockerPackages(): Promise<DockerPackage[]> {
  const { packages } = await getPackages()
  const result: DockerPackage[] = []

  for (const pkg of packages) {
    const dockerConfigPath = path.join(pkg.dir, 'Docker.json')
    if (!fs.existsSync(dockerConfigPath)) {
      continue
    }

    const dockerConfig = JSON.parse(fs.readFileSync(dockerConfigPath, 'utf8')) as DockerConfig
    if (!dockerConfig.name) {
      continue
    }

    result.push({
      imagePath: buildImagePath(dockerConfig),
      packageName: getPackageName(pkg),
      packageDir: pkg.dir,
    })
  }

  return result.sort((a, b) => a.packageName.localeCompare(b.packageName))
}

export function buildImagePath(dockerConfig: DockerConfig) {
  return [dockerConfig.path || '', dockerConfig.name]
    .join('/')
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
}

export function sortSemverTags(tags: string[]) {
  return [...tags].sort(compareTagsDesc)
}

async function fetchDockerTags(imagePath: string, config: JfrogConfig) {
  const url = buildDockerTagsUrl(imagePath, config)
  const basic = Buffer.from(`${config.username}:${config.password}`, 'utf8').toString('base64')
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
    },
  })

  if (!response.ok) {
    throw new Error(`JFrog request failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as DockerTagsResponse
  return data.tags || []
}

function buildDockerTagsUrl(imagePath: string, config: JfrogConfig) {
  const normalizedImagePath = imagePath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
  return `${config.url}/artifactory/api/docker/${encodeURIComponent(config.repo)}/v2/${normalizedImagePath}/tags/list`
}

function getJfrogConfig(): JfrogConfig | undefined {
  const url = process.env.JFROG_URL
  const repo = process.env.JFROG_REPO
  const username = process.env.JFROG_USERNAME
  const password = process.env.JFROG_PASSWORD
  if (url && repo && username && password) {
    return { url, repo, username, password }
  }

  return readJfrogConfig()
}

function readJfrogConfig(): JfrogConfig | undefined {
  if (!fs.existsSync(CONFIG_PATH)) {
    return undefined
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as JfrogConfig
}

function writeJfrogConfig(config: JfrogConfig) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

function withDefaultValue(value: string | undefined) {
  return value ? { defaultValue: value } : {}
}

function getPackageName(pkg: Package) {
  return pkg.packageJson.name || path.basename(pkg.dir)
}

function compareTagsDesc(a: string, b: string) {
  const parsedA = parseSemverTag(a)
  const parsedB = parseSemverTag(b)

  if (parsedA && parsedB) {
    return compareParsedSemverDesc(parsedA, parsedB)
  }

  if (parsedA) {
    return -1
  }

  if (parsedB) {
    return 1
  }

  return b.localeCompare(a)
}

function compareParsedSemverDesc(a: ReturnType<typeof parseSemverTag>, b: ReturnType<typeof parseSemverTag>) {
  if (!a || !b) {
    return 0
  }

  const versionDiff = b.major - a.major || b.minor - a.minor || b.patch - a.patch
  if (versionDiff !== 0) {
    return versionDiff
  }

  if (a.prerelease && !b.prerelease) {
    return 1
  }

  if (!a.prerelease && b.prerelease) {
    return -1
  }

  return (b.prerelease || '').localeCompare(a.prerelease || '')
}

function parseSemverTag(tag: string) {
  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+.]?(.+))?$/)
  if (!match) {
    return undefined
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  }
}
