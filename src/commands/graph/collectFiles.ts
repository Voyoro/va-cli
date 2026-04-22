import fg from 'fast-glob'

export async function collectSourceFiles(root: string): Promise<string[]> {
  return fg(['**/*.{vue,ts,tsx,js,jsx}'], {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/.turbo/**',
      '**/.cache/**',
      '**/coverage/**',
    ],
  })
}
