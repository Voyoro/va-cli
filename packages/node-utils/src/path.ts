import { posix } from 'node:path'

export function toPosixPath(pathname: string) {
  return pathname.split('\\').join(posix.sep)
}
