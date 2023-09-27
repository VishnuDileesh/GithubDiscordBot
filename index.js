'use strict'

import 'dotenv/config'
import pino from 'pino-http'
import rfs from 'rotating-file-stream'
import { Octokit } from 'octokit'
import fetch from 'node-fetch'
import './keep_alive.js'

// Discord initialization

import { Client, GatewayIntentBits } from 'discord.js'

// Create a rotating write stream for log files

const accessLogStream = rfs.createStream('access.log', {
  interval: '1d', // Rotate daily
  path: './logs', // Specify the directory for log files
  size: '10M', // Maximum log file size before rotation (optional)
  compress: 'gzip' // Compress old log files (optional)
})

//

// Pino logger initialization

const logger = pino(
  {
    level: process.env.ENV === 'PROD' ? 'info' : 'debug'
  },
  accessLogStream
)

//

// Discord initialization

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

//

// Github initialization

const octokit = new Octokit({
  auth: process.env.GITHUB_AUTH_TOKEN,
  request: {
    fetch
  }
})

//

// Discord bot code

client.on('ready', () => {
  logger.logger.info(`Logged in as ${client.user.tag}!`)
})

const prefix = '!'

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return
  if (!msg.content.startsWith(prefix)) return

  const commandBody = msg.content.slice(prefix.length)

  const commands = commandBody.split(' ')

  const command = commands[0].toLocaleLowerCase()

  const args = commands.slice(1)

  logger.logger.info('Args::: ', args)

  // !pgb <repo name> <issue name>

  if (command === 'gdbot') {
    await octokit.rest.issues
      .create({
        owner: process.env.GITHUB_USERNAME,
        repo: args[0],
        title: args[1],
        body: 'Issue created using gdbot!'
      })
      .then(async ({ data }) => {
        logger.logger.info(`Issue created in ${args[0]} repository with title ${args[1]}
        Issue URL: ${data.html_url}`)
        await msg.channel.send(
          `Issue created in ${args[0]} repository with title ${args[1]}
          Issue URL: ${data.html_url}
          `
        )
      })
      .catch((err) => {
        logger.logger.warn(err)
      })
  }
})

client.login(process.env.BOT_TOKEN)
