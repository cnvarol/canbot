module.exports = class SignalHttp {
  constructor(signalRepository) {
    this.signalRepository = signalRepository;
  }

  async getSignals(since) {
    const signals = await this.signalRepository.getSignals(since);

    return signals;
  }
};
