module.exports = class QuarantineHttp {
  constructor(quarantineRepository) {
    this.quarantineRepository = quarantineRepository;
  }

  async getAll() {
    const quarantines = await this.quarantineRepository.getAll();
    return quarantines;
  }

  async delete(exchange, symbol, side) {
    const result = await this.quarantineRepository.delete(exchange, symbol, side);
    return result;
  }

  async count() {
    const result = await this.quarantineRepository.count();
    return result;
  }
};
