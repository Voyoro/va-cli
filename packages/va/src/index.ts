import cac from "cac"
import { installCommands } from "./commands"

const cli = cac('va')

try {
  installCommands(cli)

  cli.on('command:*', (args) => {
    console.log(`\n[Error] Command not found: ${args.join(' ')}`)
    console.log('Use --help to see available commands\n')
    process.exit(1)
  })

  cli.usage('va')
  cli.help()
  cli.version(require('../package.json').version)

  cli.parse()

} catch (error) {
  console.error('\n[Critical Error]:', error)
  console.error('Please check your command syntax\n')
  process.exit(1)
}
