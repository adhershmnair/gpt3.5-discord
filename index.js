import dotenv from "dotenv";
dotenv.config({ silent: process.env.NODE_ENV === 'production' });
import { Client, IntentsBitField, AttachmentBuilder } from 'discord.js';
import { Configuration, OpenAIApi } from 'openai';
import context from './context.js';

const discordClient = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});
const msgLengthLimit = 2000;

const config = new Configuration({
  organization: process.env.OPENAI_ORGANIZATION,
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

// EVENTS
discordClient.on('ready', (c) => {
  console.log(`Logged in as ${c.user.tag}!`);
});

discordClient.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.id !== process.env.CHAT_BOT_CHANNEL) return;
    if (message.content.startsWith('!')) return;

    await message.channel.sendTyping();

    if (message.content.length > msgLengthLimit) {
      message.reply("That's a lot to read. Can you summarize?");
      return;
    }

    let prevMessages = await message.channel.messages.fetch({ limit: 15 });
    prevMessages = prevMessages.sort((a, b) => a - b);

    let conversationLog = [{ role: 'system', content: context }];

    prevMessages.forEach((msg) => {
      if (msg.content.startsWith('!')) return;
      if (msg.content.length > msgLengthLimit) return;
      if (msg.author.id !== discordClient.user.id && message.author.bot) return;

      // If msg is from the bot (discordClient) itself
      if (msg.author.id === discordClient.user.id) {
        conversationLog.push({
          role: 'assistant',
          content: `${msg.content}`,
        });
      }

      // If msg is from a regular user
      else {
        if (msg.author.id !== message.author.id) return;

        conversationLog.push({
          role: 'user',
          content: `${msg.content}`,
        });
      }
    });

    const res = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: conversationLog,
    });

    let reply = res.data.choices[0].message?.content;

    if (reply?.length > 2000) {
      // If the reply length is over 2000 characters, send a txt file.
      const buffer = Buffer.from(reply, 'utf8');
      const txtFile = new AttachmentBuilder(buffer, { name: `${message.author.tag}_response.txt` });

      message.reply({ files: [txtFile] }).catch(() => {
        message.channel.send({ content: `${message.author}`, files: [txtFile] });
      });
    } else {
      message.reply(reply).catch(() => {
        message.channel.send(`${message.author} ${reply}`);
      });
    }
  } catch (error) {
    message.reply(`Something went wrong. Try again later.`).then((msg) => {
      setTimeout(async () => {
        await msg.delete().catch(() => null);
      }, 5000);
    });

    console.log(`Error: ${error}`);
  }
});

discordClient.login(process.env.TOKEN);
