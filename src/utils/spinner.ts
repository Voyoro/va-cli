import c from 'ansis'
import Spinner from 'yocto-spinner'
import { UNICODE } from './constants'
interface SpinnerOptions {
  failedText?: string
  successText?: string
  title: string
}


export async function spinner<T>({ failedText, successText, title }: SpinnerOptions, callback: () => Promise<T>): Promise<T> {
  const spinner = Spinner({
    text: title
  }).start()

  try {
    const result = await callback()
    spinner.stop(c.green(`${UNICODE.SUCCESS} ${successText || 'Success'}`))
    return result
  } catch (error) {
    spinner.stop(c.red(`${UNICODE.FAILURE} ${failedText || 'Failed'}`))
    throw error
  }
}
