'use strict'

import 'dotenv/config'
import pino from 'pino-http'
import rfs from 'rotating-file-stream'
import { Octokit } from 'octokit'
import fetch from 'node-fetch'
import './keep_alive.js'

// Discord initialization

import { Client, GatewayIntentBits } from 'discord.js'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v10'
import { SlashCommandBuilder } from '@discordjs/builders'

// Create a rotating write stream for log files

const accessLogStream = rfs.createStream('access.log', {
  interval: '1d', // Rotate daily
  path: './logs', // Specify the directory for log files
  size: '10M', // Maximum log file size before rotation (optional)
  compress: 'gzip' // Compress old log files (optional)
})

// Pino logger initialization

const logger = pino(
  {
    level: process.env.ENV === 'PROD' ? 'info' : 'debug'
  },
  accessLogStream
)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN)

const commands = [
  new SlashCommandBuilder()
    .setName('issue')
    .setDescription('To deal with github issues')
    .addSubcommand(subcommand =>
      subcommand.setName('create')
        .setDescription('Create a new issue')
        .addStringOption(option =>
          option
            .setName('project')
            .setDescription('Project name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Issue title')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('Issue description')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('get')
        .setDescription('Get all issues from project')
        .addStringOption(option =>
          option
            .setName('project')
            .setDescription('Project name')
            .setRequired(true)
        )
    )
    .toJSON()
];

(async () => {
  try {
    console.log('Started refreshing application (/) commands.')

    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    )

    console.log('Successfully reloaded application (/) commands.')
  } catch (error) {
    console.error(error)
  }
})()

// Github initialization

const octokit = new Octokit({
  auth: process.env.GITHUB_AUTH_TOKEN,
  request: {
    fetch
  }
})

// Discord bot code

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
})

// Creating github issues by listening for slash commands

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return

  const { commandName, options } = interaction

  if (commandName === 'issue') {
    const subcommand = options.getSubcommand()

    if (subcommand === 'create') {
      const projectName = options.getString('project')
      const issueTitle = options.getString('title')
      const issueDescription = options.getString('description')

      await octokit.rest.issues
        .create({
          owner: process.env.GITHUB_USERNAME,
          repo: projectName,
          title: issueTitle,
          body: issueDescription
        })
        .then(async ({ data }) => {
          logger.logger.info(`Issue created in ${projectName} repository with title ${issueTitle}
        Issue URL: ${data.html_url}`)
          await interaction.reply(
          `Issue created in ${projectName} repository with title ${issueTitle}
          Issue URL: ${data.html_url}
          `
          )
        })
        .catch((err) => {
          console.log('err::: ', err)
          logger.logger.warn(err)
        })
    } else if (subcommand === 'get') {
      const projectName = options.getString('project')

      await octokit.rest.issues.listForRepo({
        owner: process.env.GITHUB_USERNAME,
        repo: projectName
      })
        .then(async ({ data }) => {
          console.log('data::: ', data)

          const issues = data.map((issue) => issue.html_url)

          await interaction.reply(
          `Fetching issues from ${projectName} repository:
          Done:
          ${issues.join('\n')}
          `
          )
        })
        .catch((err) => {
          console.log('err::: ', err)
          logger.logger.warn(err)
        })
    }
  }
})

// Creating github issues by listening to chat message

const prefix = '!'

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return
  if (!msg.content.startsWith(prefix)) return

  const commandBody = msg.content.slice(prefix.length)

  const commands = commandBody.split(' ')

  const command = commands[0].toLocaleLowerCase()

  const args = commands.slice(1)

  logger.logger.info('args::: ', args)

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
