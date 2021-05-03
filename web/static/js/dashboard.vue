<style>
.dark-mode .highcharts-background {
    fill: var(--dark) !important;
}
.dark-mode .highcharts-container text {
    fill: var(--white) !important;
}
.dark-mode .highcharts-subtitle,
.dark-mode .highcharts-credits,
.dark-mode .highcharts-axis-title {
    fill-opacity: 0.7;
}
.dark-mode .highcharts-grid-line {
    stroke-opacity: 0.2;
}
.dark-mode .highcharts-tooltip-box {
    fill: var(--dark);
}
.dark-mode .highcharts-point {
    stroke: var(--dark);
}
.info-box-number text {
    animation-timing-function: steps(10);
    -webkit-animation-timing-function: steps(10);
}
</style>

<template>
    <div class="vue-root">
        <template>
            <div class="row">
                <div class="col-md-3">
                    <div class="info-box">
                        <div class="info-box-content">
                            <span class="info-box-text">Margin Risk Ratio</span>
                            <span class="info-box-number text-teal" style="font-size:30px; font-size:3vw;">
                                <svg width="100%" height="100%" viewBox="0 0 500 80" xmlns="http://www.w3.org/2000/svg">
                                    <text y="75" fill="rgb(32, 201, 151)" font-size="90">{{ riskRatio | round(2) }}%</text>
                                </svg>
                            </span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="info-box">
                        <div class="info-box-content">
                            <span class="info-box-text">Wallet Balance</span>
                            <span class="info-box-number text-teal" style="font-size:30px; font-size:3vw;">
                                <svg width="100%" height="100%" viewBox="0 0 500 80" xmlns="http://www.w3.org/2000/svg">
                                    <text y="75" fill="rgb(32, 201, 151)" font-size="65">{{ walletBalance | filter_price }} USDT</text>
                                </svg>
                            </span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="info-box">
                        <div class="info-box-content">
                            <span class="info-box-text">Today's PNL</span>
                            <span class="info-box-number text-teal" style="font-size:30px; font-size:3vw;">
                                <svg width="100%" height="100%" viewBox="0 0 500 80" xmlns="http://www.w3.org/2000/svg">
                                    <text y="75" fill="rgb(32, 201, 151)" font-size="65">{{ todaysPNL | filter_price }} USDT</text>
                                </svg>
                            </span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="info-box">
                        <div class="info-box-content">
                            <span class="info-box-text">Today's Net Transfer</span>
                            <span class="info-box-number text-teal" style="font-size:30px; font-size:3vw;">
                                <svg width="100%" height="100%" viewBox="0 0 500 80" xmlns="http://www.w3.org/2000/svg">
                                    <text y="75" fill="rgb(32, 201, 151)" font-size="65">{{ todaysChanges | filter_price }} USDT</text>
                                </svg>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </template>
        <template>
            <div class="row">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header border-bottom-0">
                            <h3 class="card-title">Historical Profit and Lost</h3>
                            <div class="card-tools">
                                <button type="button" class="btn btn-tool dropdown-toggle" data-toggle="dropdown">
                                    <i class="fas fa-clock"></i>
                                    <span>{{ chartDurationText }}</span>
                                </button>
                                <div class="dropdown-menu dropdown-menu-right" role="menu">
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-5m', '3s'); chartDurationText='Past 5m'">Past 5m</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-15m', '15s'); chartDurationText='Past 15m'">Past 15m</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-1h', '1m'); chartDurationText='Past 1h'">Past 1h</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-3h', '4m'); chartDurationText='Past 3h'">Past 3h</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-6h', '7m'); chartDurationText='Past 6h'">Past 6h</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-12h', '15m'); chartDurationText='Past 12h'">Past 12h</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-24h', '30m'); chartDurationText='Past 2h'">Past 24h</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-2d', '1h'); chartDurationText='Past 2d'">Past 2d</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-7d', '6h'); chartDurationText='Past 7d'">Past 7d</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-30d', '1d'); chartDurationText='Past 30d'">Past 30d</a>
                                    <a href="#" class="dropdown-item" v-on:click="fetchChartData('-90d', '3d'); chartDurationText='Past 90d'">Past 90d</a>
                                </div>
                                <button type="button" class="btn btn-tool" v-on:click="fetchChartData(chartDuration, chartEvery)">
                                    <i class="fas fa-sync-alt"></i>
                                    <span> Refresh</span>
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <highcharts :options="chartOptions"></highcharts>
                        </div>
                    </div>
                </div>
            </div>
        </template>
        <template>
            <div class="row">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header border-bottom-0">
                        </div>
                        <div class="card-body">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Daily Profit and Loss</th>
                                        <th>Net Transfer</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(data, time) in dailyData" :key="time">
                                        <td>{{ new Date(time).toLocaleString('tr-TR') }}</td>
                                        <td>{{ data.pnl | filter_price }} USDT</td>
                                        <td>{{ data.changes | filter_price }} USDT</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<script>
let title = document.title;

module.exports = {
  data: function() {
      return {
        dailyData: [],
        riskRatio: 0,
        walletBalance: 0,
        todaysPNL: 0,
        todaysChanges: 0,
        chartDurationText: 'Past 24h',
        chartDuration: '-24h',
        chartEvery: '30m',
        chartOptions: {
            title: false,
            chart: {
                height: 250,
                animation: false,
            },
            credits: {
                enabled: false
            },
            plotOptions: {
                line: {
                    color: '#20c997',
                    lineColor: '#20c997',
                    lineWidth: 3,
                    marker: {
                        lineWidth: 2
                    },
                }
            },
            xAxis: {
                type: 'datetime',
                
            },
            yAxis:[
                {
                    title: {
                        text: 'USDT'
                    }
                }
            ],
            series: [{
                name: 'Profit and Loss',
                tooltip: { pointFormat: '<span style="color:{point.color}">\u25CF</span>  {series.name}: <b>{point.y:.2f} USDT</b><br/>'},
                data: []
            }]
        }
      };
  },
  created: function() {
      this.fetchChartData(this.chartDuration, this.chartEvery);
      this.fetchDailyData();
      this.fetchLastRiskRatio();
      this.fetchLastWalletBalance();
      this.fetchTodaysPNL();
      this.fetchTodaysChanges();
      this.timer = setInterval(this.fetchAll, 30000);
  },
  methods: {
    async fetchAll() {
      this.fetchChartData(this.chartDuration, this.chartEvery);
      this.fetchDailyData();
      this.fetchLastRiskRatio();
      this.fetchLastWalletBalance();
      this.fetchTodaysPNL();
      this.fetchTodaysChanges();       
    },
    async fetchLastRiskRatio() {
      const res = await fetch(`/api/v1/chartData/account/riskratio?start=-2m&fn=last&createEmpty=false`);
      const data = await res.json();

      if (!data.length) {
          return
      }

      this.riskRatio = data[data.length-1]._value;
    },
    async fetchLastWalletBalance() {
      const res = await fetch(`/api/v1/chartData/account/balance?start=-2m&fn=last&createEmpty=false`);
      const data = await res.json();

      if (!data.length) {
          return
      }

      this.walletBalance = data[data.length-1]._value;
    },
    async fetchTodaysPNL() {
      const res = await fetch(`/api/v1/chartData/account/pnl?start=-1d&every=1d&fn=sum&createEmpty=true`);
      const data = await res.json();

      if (data.length !== 2) {
          return
      }

      this.todaysPNL = data[1]._value;

      document.title = `Today's PNL ${todaysPNL.toFixed(2)} | ${title}`;
    },
    async fetchTodaysChanges() {
      const res = await fetch(`/api/v1/chartData/account/changes?start=-1d&every=1d&fn=sum&createEmpty=true`);
      const data = await res.json();

      if (data.length !== 2) {
          return
      }

      this.todaysChanges = data[1]._value;
    },
    async fetchDailyData() {
      const res = await fetch(`/api/v1/chartData/account/pnl,changes?start=-30d&every=1d&fn=sum&createEmpty=false`);
      const data = await res.json();
      
      if (!data.length) {
        return;
      }

      const rows = {};
      data.forEach(d => {
          if (!rows[d['_time']]) {
            rows[d['_time']] = { changes: 0, pnl: 0 };
          } 

          rows[d['_time']][d['_field']] = d['_value'];
      });

      this.dailyData = {};

      Object.keys(rows).sort().reverse().forEach(key=> {
          this.dailyData[key] = rows[key];
      });
    },
    async fetchChartData(duration, every) {
      this.chartDuration = duration;
      this.chartEvery = every;

      const res = await fetch(`/api/v1/chartData/account/pnl?start=${duration}&every=${every}&fn=sum&createEmpty=true`);
      const data = await res.json();

      if (!data.length) {
        return;
      }

      this.chartOptions.series[0].data = [];

      data.forEach(d => {
          this.chartOptions.series[0].data.push([new Date(d['_time']).getTime(), d['_value']]);
      });
    }
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
}

Highcharts.setOptions({
    chart: {
        style: {
            fontFamily: ["Rubik", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif", "Segoe UI Emoji", "Segoe UI Symbol"]
        }
    },
    global: {
        timezoneOffset: -3 * 60,
    }
});
</script>