#!/usr/bin/env node
const { program } = require('commander')
const chalk = require('chalk')
const inquirer = require('inquirer')
const ora = require('ora')
const figlet = require('figlet')
const fs = require('fs-extra')
const gitClone = require('git-clone')
const path = require('path')
const { spawn, exec } = require('child_process')
const handlebars = require('handlebars');

const projectList = {
    "administration": {
        'workflow': 'administration-workflow',
        "template": 'administration',
        "type": 'vue2',
        "start": 'npm run serve'
    },
    'PC': {
        'workflow': 'web-workflow',
        "template": 'web',
        "type": 'vue2',
        "start": 'npm run serve'
    },
    'H5': {
        'workflow': 'mobile-workflow',
        "template": 'mobile',
        "type": 'vue3+uniapp',
        "start": 'npm run dev:h5'
    },
}
console.log(figlet.textSync('Y S K J', {
    font: 'standard',
    horizontalLayout: 'default',
    verticalLayout: 'default',
    width: 80,
    height: 80,
    whitespaceBreak: true
}))
program.name('yskj-cli').usage('<command> [options]')
//版本号
program.version(`v${require('../package.json').version}`)



program
    .command('create <name>')
    .description('创建项目')
    .action((name) => {
        if (fs.existsSync(path.join(process.cwd(), name))) {
            inquirer.prompt([{
                type: 'confirm',
                name: 'overwrite',
                message: '文件已存在，是否覆盖',
                default: false
            }]).then(answer => {
                if (answer.overwrite) {
                    fs.removeSync(path.join(process.cwd(), name))
                    createProject(name)
                } else {
                    console.log(chalk.red('取消创建'))
                    return;
                }
            })
        } else {
            createProject(name)
        }


    })
let spinner
async function createProject(name) {
    const answer = await inquirer.prompt([
        {
            type: 'input',
            name: 'author',
            message: '作者',
            default: '岩石科技'
        },
        {
            type: 'input',
            name: 'description',
            message: '描述',
            default: ''
        },
        {
            type: 'list',
            name: 'project',
            message: '选择项目',
            choices: Object.keys(projectList)
        },
        {
            type: 'confirm',
            name: 'workflow',
            message: '是否使用流程',
            default: true
        }
    ])
    let checkout = projectList[answer.project]

    if (answer.workflow) {
        checkout = projectList[answer.project].workflow
    }
    spinner = ora({
        text: '正在创建项目',
        color: 'green'
    }).start()
    gitClone('http://114.115.155.107/root/rock-fe-frame', name, { checkout: checkout }, function (err) {
        if (err) {
            spinner.stop()
            console.log(chalk.red('创建失败'))
            return;
        } else {
            createSuccess(name, answer)
        }
    })

}
async function createSuccess(name, answer) {
    fs.remove(path.join(process.cwd(), name, '.git'))
    spinner.stop()
    await terminal(name, answer)
    console.log(figlet.textSync('Y S K J', {
        font: 'standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 80,
        height: 80,
        whitespaceBreak: true
    }))
    console.log('Done,bow run:')
    console.log(chalk.green(`项目创建成功！`))
    console.log(chalk.green(`开始工作吧！😝`));
    console.log(chalk.green(`\n cd ${name}`))
    console.log(chalk.green(`\n ${projectList[answer.project].start}`))
}

function terminal(name, answer) {
    return new Promise((resolve, reject) => {
        const packageAnswer = {
            name,
            ...answer
        }
        const packagePath = path.join(process.cwd(), name, 'package.json')
        const packageContent = fs.readFileSync(packagePath, 'utf8')
        const packageResult = handlebars.compile(packageContent)(packageAnswer);
        fs.writeFileSync(packagePath, packageResult)

        // const childProcess = spawn('npm', ['install'], {
        //     cwd: path.join(process.cwd(), name)
        // })
        // childProcess.stdout.pipe(process.stdout)
        // childProcess.stderr.pipe(process.stderr)
        // childProcess.stdout.on('close', (data) => {
        //     resolve()
        // })
        const command = `cd ${process.cwd()}/${name} && npm i`;
        const installSpinner = ora(`正在安装依赖, 请耐心等待...`).start();
        const child = exec(command, (err) => {
            if (err) {
                installSpinner.fail(chalk.red("安装项目依赖失败，请自行重新安装！"));
                resolve()
            } else {
                installSpinner.succeed(chalk.gray("安装成功"));
                resolve()
            }
        });
        child.stdout.on("data", (data) => {
            installSpinner.stop();
            console.log(data.replace(/\n$/, ""));
            installSpinner.start();
        });
        child.stderr.on("data", (data) => {
            console.log()
            console.log(data.replace(/\n$/, ""));
            installSpinner.start();
        });
    })
}



program.parse(process.argv)
