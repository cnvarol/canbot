module.exports = class Notify {
  constructor(notifier) {
    this.notifier = notifier;
  }

  send(message) {
    this.notifier.forEach(notify => notify.send(message));
  }

  get(notifier) {
    let notifyType;

    this.notifier.forEach(notify => {
      if (notify.name() === notifier) {
        notifyType = notify;
      }
    });

    return notifyType;
  }
};
