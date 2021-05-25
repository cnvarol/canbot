module.exports = class QuarantineHttp {
  constructor(quarantineRepository) {
    this.quarantineRepository = quarantineRepository;
  }

  async getAll() {
    const quarantines = await this.quarantineRepository.getAll();
    return quarantines;
  }

  async insert(exchange, symbol, side) {
    const result = await this.quarantineRepository.insert(exchange, symbol, side, 'Client requested', true);
    return result;
  }

  async delete(exchange, symbol, side) {
    const result = await this.quarantineRepository.delete(exchange, symbol, side, true);
    return result;
  }

  async count() {
    const result = await this.quarantineRepository.count();
    return result;
  }
};
