import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as parser from 'github-action-input-parser'
import * as temp from 'temp'

async function run(): Promise<void> {
  try {
    const inputs = parser.getInputs({
      server: {
        required: true
      },
      port: {
        required: true,
        default: 22
      },
      user: {
        required: true
      },
      privateKey: {
        input: 'user_private_key',
        required: true
      },
      publicKey: {
        input: 'host_public_key'
      },
      local: {
        required: true,
        default: '.'
      },
      remote: {
        required: true,
        default: '.'
      },
      inputSshOptions: {
        input: 'ssh_options'
      },
      rsyncOptions: {
        input: 'rsync_options',
        default: '--exclude=.git*/'
      }
    })

    core.debug(`Starting upload with inputs: ${JSON.stringify(inputs)}`)

    const {
      server,
      port,
      user,
      privateKey,
      publicKey,
      local,
      remote,
      inputSshOptions,
      rsyncOptions
    } = inputs

    temp.open('key', async (errKey, infoKey) => {
      core.debug(`Trying to write private key to ${infoKey.path}`)
      if (errKey)
        throw Error(`Failed to open temporary private key file: ${errKey}`)

      temp.open('known_hosts', async (errKnownHosts, infoKnownHosts) => {
        core.debug(`Trying to write known hosts to ${infoKnownHosts.path}`)
        if (errKnownHosts)
          throw Error(
            `Failed to open temporary known hosts file: ${errKnownHosts}`
          )

        try {
          fs.writeSync(infoKey.fd, privateKey)
        } catch (err) {
          throw Error(`Failed to write private key to temporary file: ${err}`)
        }

        const sshOptions = ['-o GlobalKnownHostsFile=/dev/null']

        if (publicKey) {
          try {
            fs.writeSync(infoKnownHosts.fd, `${server} ${publicKey}`)
          } catch (err) {
            throw Error(`Failed writing known hosts file: ${err}`)
          }
          sshOptions.push(
            '-o StrictHostKeyChecking=yes',
            `-o UserKnownHostsFile="${infoKnownHosts.path}"`
          )
        } else {
          sshOptions.push(
            '-o StrictHostKeyChecking=no',
            '-o UserKnownHostsFile=/dev/null'
          )
        }

        if (inputSshOptions) {
          sshOptions.push(inputSshOptions.replace(/'/g, "\\'"))
        }

        await exec.exec(
          'rsync',
          [
            core.isDebug() ? '-avc' : '-ac',
            '--del',
            '--force',
            `-e ssh -ax${core.isDebug() ? 'v' : ''}p "${port}" -i "${infoKey.path
            }" ${sshOptions.join(' ')}`,
            rsyncOptions,
            local,
            `${user}@${server}:${remote}`
          ].filter(param => param)
        )
      })
    })
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
