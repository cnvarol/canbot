/* eslint-disable no-underscore-dangle */
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

module.exports = class InfluxRepository {
  constructor(host, token, org, bucket, logger) {
    this.host = host;
    this.token = token;
    this.org = org;
    this.bucket = bucket;
    this.logger = logger;

    this.client = new InfluxDB({ url: host, token: token });

    this.writeApi = this.client.getWriteApi(org, bucket, 'ns');
    this.writeApi.useDefaultTags({ host: org });

    this.queryApi = this.client.getQueryApi(org);
  }

  async writeFloat(measurement, field, value) {
    const point = new Point(measurement).floatField(field, value);
    this.writeApi.writePoint(point);
  }

  async queryAggr(
    measurement,
    fieldName,
    rangeStart,
    rangeStop = 'now()',
    every = '1m',
    fn = 'sum',
    createEmpty = true
  ) {
    const fields = fieldName.split(',');

    let fluxFields;
    for (let i = 0; i < fields.length; i++) {
      if (i === 0) {
        fluxFields = `r["_field"] == "${fields[i]}"`;
      } else {
        fluxFields += ` or r["_field"] == "${fields[i]}"`;
      }
    }

    const query = `from(bucket: "${this.bucket}")
    |> range(start: ${rangeStart}, stop: ${rangeStop})
    |> filter(fn: (r) => r["_measurement"] == "${measurement}")
    |> filter(fn: (r) => ${fluxFields})
    |> aggregateWindow(every: ${every}, fn: ${fn}, createEmpty: ${createEmpty})
    |> fill(value: 0.0)
    |> yield(name: "${fn}")`;

    try {
      const data = await this.queryApi.collectRows(query);
      return data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
};
