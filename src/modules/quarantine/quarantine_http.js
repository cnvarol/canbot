module.exports = class QuarantineHttp {
  constructor(quarantineRepository) {
    this.quarantineRepository = quarantineRepository;
  }

  async get() {
    return {};
    /* const quarantines = await this.quarantineRepository.get();
    return quarantines; */
  }

  async delete(exchange, symbol, side) {
    const result = await this.quarantineRepository.delete(exchange, symbol, side);

    return result;
  }
};
