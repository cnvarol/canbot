const extra = require('telegraf/extra');

module.exports = class Telegram {
  constructor(telegraf, config, logger) {
    this.telegraf = telegraf;
    this.config = config;
    this.logger = logger;
    this.markup = extra.markdown();
  }

  name() {
    return 'telegram';
  }

  send(message) {
    const chatId = this.config.chat_id;
    if (!chatId) {
      console.log('Telegram: No chat id given');
      this.logger.error('Telegram: No chat id given');
      return;
    }
    this.telegraf.telegram.sendMessage(chatId, message, this.markup).catch(err => {
      this.logger.error(`Mailer: ${JSON.stringify(err)}`);
      console.log(err);
    });
  }
};
