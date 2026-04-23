import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function readJSON(filePath: string) {
  try {
    const data = await readFile(filePath, 'utf8')
    return JSON.parse(data)
  }
  catch (error) {
    console.error('Error reading JSON file:', error)
    throw error
  }
}

export async function outputJSON(filepath: string, data: any, spaces: number = 2) {
  try {
    const dir = dirname(filepath)
    await mkdir(dir, { recursive: true })
    await writeFile(filepath, JSON.stringify(data, null, spaces), 'utf8')
  }
  catch (error) {
    console.error('Error writing JSON file:', error)
    throw error
  }
}

export async function ensureFile(filePath: string) {
  try {
    const dir = dirname(filePath)
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, '', { flag: 'a' })
  }
  catch (error) {
    console.error('Error ensuring file:', error)
    throw error
  }
}
