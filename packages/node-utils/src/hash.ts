import { createHash } from 'node:crypto'

export function generateContentHash(content: string, size?: number) {
  const hash = createHash('md5').update(content, 'utf8').digest('hex')
  if (size)
    return hash.slice(0, size)
  return hash
}
