<template>
  <div class="vue-root">
    <template v-if="!!balances.info">
      <div class="row">
        <div class="col-md-4">
          <div class="card card-success">
            <div class="card-header"><h3 class="card-title">Margin Risk Ratio</h3></div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-12">
                  <h1 class="text-success" style="font-size:50px">%{{ Math.round((balances.info.totalMaintMargin/balances.info.totalMarginBalance) * 100 * 100)/100 }}</h1>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card card-success">
            <div class="card-header"><h3 class="card-title">Margin Status</h3></div>
            <div class="card-body">
              <div class="row justify-content-md-center">
                <div class="col-md-4 border-right text-center">
                  <h4 class="text-success">Maint.</h4>
                  <h5>{{ balances.info.totalMaintMargin|round }} <small>USDT</small></h5>
                </div>
                <div class="col-md-4 border-right text-center">
                  <h4 class="text-success">Balance</h4>
                  <h5>{{ balances.info.totalMarginBalance|round }} <small>USDT</small></h5>
                </div>
                <div class="col-md-4 text-center">
                  <h4 class="text-success">Initial</h4>
                  <h5>{{ balances.info.totalOpenOrderInitialMargin|round }} <small>USDT</small></h5>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card card-success">
            <div class="card-header"><h3 class="card-title">Assets</h3></div>
            <div class="card-body" id="memory">
              <div class="row justify-content-md-center">
                <div class="col-md-4 border-right text-center">
                  <h4 class="text-success">Wallet</h4>
                  <h5>{{ balances.info.totalWalletBalance|round }} <small>USDT</small></h5>
                </div>
                <div class="col-md-4 border-right text-center">
                  <h4 class="text-success">Curr PNL</h4>
                  <h5>{{ balances.info.totalUnrealizedProfit|round }} <small>USDT</small></h5>
                </div>
                <div class="col-md-4 text-center">
                  <h4 class="text-success">BNB</h4>
                  <h5>{{ balances.BNB.total|filter_price }} <small>BNB</small><br></h5>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Positions ({{ positions.length }}) - <span class="text-success">Open Long: {{ totalLongPosition.toFixed(0) }} <small>USDT</small></span> - <span class="text-danger">Open Short: {{ totalShortPosition.toFixed(0) }} <small>USDT</small></span></h3> <span class="text-muted float-right"><transition name="slide-fade" mode="out-in"><div :key="positionsUpdatedAt">{{ positionsUpdatedAt }}</div></transition></span>
      </div>
      <!-- /.card-header -->
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-bordered table-sm table-hover" id="positionsTable">
            <thead>
            <tr>
              <th scope="col" title="Exchange" style="width:30px">Ex</th>
              <th scope="col">Symbol</th>
              <th scope="col">Size</th>
              <th scope="col">Entry Price</th>
              <th scope="col">Mark Price</th>
              <th scope="col">Margin</th>
              <th scope="col" style="width:15%">PNL(ROE %)</th>
              <th scope="col" title="Close">Close</th>
            </tr>

            </thead>
            <tbody>
            <tr v-for='position in positions' :key="`${position.exchange}-${position.position.symbol}-${position.position.side}`">
              <td><img :src="`/img/exchanges/${position.exchange}.png`" :alt="position.exchange" :title="position.exchange" width="16px" height="16px"></td>
              <td>
                <span v-if="position.position.side === 'short'" class="badge badge-danger">short</span>
                <span v-if="position.position.side === 'long'" class="badge badge-success">long</span>
                <a target="blank" :href="'/tradingview/' + position.exchange + ':' + position.position.symbol">{{ position.position.symbol }}</a> 
                <small class="text-warning">[{{ position.position.raw.leverage }}x]</small>
              </td>
              <!-- td v-bind:class="{ 'text-success': position.position.amount > 0, 'text-danger': position.position.amount < 0 }">
                {{ position.position.amount }}
              </td -->
              <td>
                <template v-if="!!position.currency">
                  {{ position.currency|filter_price }}
                </template>
                <small>USDT</small>
              </td>
              <td>
                <template v-if="!!position.position.entry">
                  {{ position.position.entry|filter_price }}
                </template>
                <small>USDT</small>
              </td>
              <td>
                <template v-if="!!position.position.raw.markPrice">
                  {{ position.position.raw.markPrice|filter_price }}
                </template>
                <small>USDT</small>
              </td>
              <td>
                <template v-if="!!position.position.raw.unRealizedProfit">
                  {{ (position.currency / position.position.raw.leverage) + (position.position.raw.unRealizedProfit / position.position.raw.leverage)|filter_price }}
                  (<small>{{ position.position.raw.marginType }}</small>)
                </template>           
              </td>            
              <td>
              <span v-if="typeof position.position.profit !== 'undefined'" v-bind:class="{ 'text-success': position.position.profit >= 0, 'text-danger': position.position.profit < 0 }">
                {{ position.position.raw.unRealizedProfit|filter_price }}({{ position.position.profit|round(2) }}%)
              </span>
              </td>
              <td style="width:200px">
                <form :action="'/pairs/' + position.exchange + '-' + position.position.symbol" method="post">
                  <input type="hidden" name="positionSide" :value="position.position.side">
                  <button name="action" value="close" data-toggle="tooltip"
                          title="Limit Close" class="btn btn-outline-primary btn-xs"><i class="fa fa-times"></i> Limit Close</button>
                  <button name="action" value="close_market" data-toggle="tooltip" 
                          title="Market Close" class="btn btn-outline-danger btn-xs"><i class="fa fa-times"></i> Market Close</button>
                </form>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Orders ({{ orders.length }})</h3> <span class="text-muted float-right"><transition name="slide-fade" mode="out-in"><div :key="positionsUpdatedAt">{{ ordersUpdatedAt }}</div></transition></span>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-bordered table-sm table-hover">
            <thead>
            <tr>
              <th scope="col" title="Exchange" style="width:30px">Ex</th>
              <th scope="col">Symbol</th>
              <th scope="col">Type</th>
              <th scope="col">Price</th>
              <th scope="col">Amount</th>
              <th scope="col">Retry</th>
              <th scope="col">Created</th>
              <th scope="col">Updated</th>
              <th scope="col">Status</th>
              <th scope="col" title="Side">S</th>
              <th scope="col" title="Action">A</th>
            </tr>

            </thead>
            <tbody>
            <tr v-for='order in orders' :key="`${order.exchange}-${order.order.symbol}-${order.order.id}`">
              <td><img :src="`/img/exchanges/${order.exchange}.png`" :alt="order.exchange" :title="order.exchange" width="16px" height="16px"></td>
              <td><a target="blank" :href="'/tradingview/' + order.exchange + ':' + order.order.symbol">{{ order.order.symbol }}</a></td>
              <td>{{ order.order.type }}</td>
              <td>{{ order.order.price }}<span class="text-muted" v-if="order.percent_to_price" title="Percent to current price"> {{ order.percent_to_price|round(1) }} %</span></td>
              <td v-bind:class="{ 'text-success': order.order.amount > 0, 'text-danger': order.order.amount < 0 }">{{ order.order.amount }}</td>
              <td>{{ order.order.retry }}</td>
              <td>{{ order.order.createdAt|date('d.m.y H:i') }}</td>
              <td>{{ order.order.updatedAt|date('d.m.y H:i') }}</td>
              <td>{{ order.order.status }}</td>
              <td>
                <i v-if="order.order.side === 'sell'" class="fas fa-chevron-circle-down text-danger" title="short"></i>
                <i v-if="order.order.side === 'buy'" class="fas fa-chevron-circle-up text-success" title="long"></i>
              </td>
              <td>
                <a title="cancel" :href="'/order/' + order.exchange + '/' + order.order.id"><i class="fas fa-window-close text-dark"></i></a>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
var title = document.title;

module.exports = {
  data: function() {
    return {
      positions: [],
      orders: [],
      balances: {},
      totalLongPosition: 0.00,
      totalShortPosition: 0.00,
      positionsUpdatedAt: '',
      ordersUpdatedAt: ''
    }
  },
  created: function() {
    this.fetchPageAsJson();
    this.timer = setInterval(this.fetchPageAsJson, 3000);
    this.dataTable = setTimeout(this.fillDataTable, 5000);
  },
  methods: {
    async fillDataTable() {
      $(function () {
        $('#positionsTable').DataTable({
          "paging": false,
          "lengthChange": false,
          "searching": false,
          "ordering": true,
          "info": true,
          "autoWidth": false,
          "responsive": true,
        });
     });
    },
    async fetchPageAsJson() {
      const res = await fetch('/trades.json');
      const data = await res.json();

      if (!('positions' in data && 'orders' in data)) {
        return;
      }

      this.positions = data.positions || [];
      this.orders = data.orders || [];
      this.balances = data.balances || {};
      if (this.balances.info) {
        document.title = `PNL ${parseFloat(this.balances.info.totalUnrealizedProfit).toFixed(2)} USDT | ${title}`;
      }

      this.totalLongPosition = 0;
      this.totalShortPosition = 0;

      this.positions.forEach(p => {
        if (p.position.side === 'long') {
          this.totalLongPosition += parseFloat(p.currency);
        } else if (p.position.side === 'short') {
          this.totalShortPosition += parseFloat(p.currency);
        }
      });

      this.positionsUpdatedAt = new Date().toLocaleTimeString();
      this.ordersUpdatedAt = new Date().toLocaleTimeString();

    },
    cancelAutoUpdate() {
      clearInterval(this.timer);
    }
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
}

</script>

<style>
.slide-fade-enter-active {
  transition: all .3s ease;
}
.slide-fade-leave-active {
  transition: all .6s cubic-bezier(1.0, 0.5, 0.8, 1.0);
}
.slide-fade-enter, .slide-fade-leave-to {
  opacity: 0.3;
}
</style>
