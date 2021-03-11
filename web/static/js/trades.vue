<template>
  <div class="vue-root">
    <template v-if="!!balances.info">
      <div class="row">
        <div class="col-md-4">
          <div class="card card-outline card-success">
            <div class="card-header border-bottom-0"><h3 class="card-title">Margin Risk Ratio</h3></div>
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
          <div class="card card-outline card-success">
            <div class="card-header border-bottom-0"><h3 class="card-title">Margin Status</h3></div>
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
          <div class="card card-outline card-success">
            <div class="card-header border-bottom-0"><h3 class="card-title">Assets</h3></div>
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
    <template>
      <div class="card card-outline card-success">
      <div class="card-header border-bottom-0">
        <h3 class="card-title">Positions ({{ positions.length }}) - <span class="text-success">Open Long: {{ totalLongPosition.toFixed(0) }} <small>USDT</small></span> - <span class="text-danger">Open Short: {{ totalShortPosition.toFixed(0) }} <small>USDT</small></span></h3> <span class="text-muted float-right"><transition name="slide-fade" mode="out-in"><div :key="positionsUpdatedAt">{{ positionsUpdatedAt }}</div></transition></span>
      </div>
      <div class="card-body">
      <div class="table-responsive">
      <vue-bootstrap4-table :rows="positions" :classes="classes" :columns="columns" :config="config" :total-rows="positions.length">
        <template slot="exchange" slot-scope="props"><img :src="`/img/exchanges/${props.cell_value}.png`" :alt="props.cell_value" :title="props.cell_value" width="16px" height="16px"></template>
        <template slot="symbol" slot-scope="props">
          <span v-if="props.row.position.side === 'short'" class="badge badge-danger">short</span>
          <span v-if="props.row.position.side === 'long'" class="badge badge-success">long</span>
          <a target="blank" :href="'/tradingview/' + props.row.exchange + ':' + props.cell_value">{{ props.cell_value }}</a> 
          <small class="text-warning">[{{ props.row.position.raw.leverage }}x]</small>
        </template>
        <template slot="size" slot-scope="props">{{ props.cell_value|filter_price }} <small>USDT</small></template>
        <template slot="entry_price" slot-scope="props">{{ props.cell_value|filter_price }} <small>USDT</small></template>
        <template slot="mark_price" slot-scope="props">{{ props.cell_value|filter_price }} <small>USDT</small></template>
        <template slot="margin" slot-scope="props">
          {{ (props.row.currency / props.row.position.raw.leverage) + (props.row.position.raw.unRealizedProfit / props.row.position.raw.leverage)|filter_price }}
          (<small>{{ props.cell_value }}</small>)
        </template>
        <template slot="pnl" slot-scope="props">
          <span v-if="typeof props.row.position.profit !== 'undefined'" v-bind:class="{ 'text-success': props.row.position.profit > 0, 'text-danger': props.row.position.profit < 0 }">
            {{ props.row.position.raw.unRealizedProfit|filter_price }}({{ props.row.position.profit|round(2) }}%)
          </span>
        </template>
        <template slot="actions" slot-scope="props">
          <form :action="'/pairs/' + props.row.exchange + '-' + props.row.position.symbol" method="post">
            <input type="hidden" name="positionSide" :value="props.row.position.side">
            <button name="action" value="close" data-toggle="tooltip"
                    title="Limit Close" class="btn btn-outline-primary btn-xs"><i class="fa fa-times"></i> Limit Close</button>
            <button name="action" value="close_market" data-toggle="tooltip" 
                    title="Market Close" class="btn btn-outline-danger btn-xs"><i class="fa fa-times"></i> Market Close</button>
          </form>
        </template>
        <template slot="sort-asc-icon"><i class="fas fa-sort-up"></i></template>
        <template slot="sort-desc-icon"><i class="fas fa-sort-down"></i></template>
        <template slot="no-sort-icon"><i class="fas fa-sort"></i></template>
        <template slot="empty-results">No open any position.</template>
      </vue-bootstrap4-table>
      </div>
      </div>
      </div>
    </template>

    <div class="card card-outline card-success">
      <div class="card-header border-bottom-0">
        <h3 class="card-title">Orders ({{ orders.length }})</h3> <span class="text-muted float-right"><transition name="slide-fade" mode="out-in"><div :key="positionsUpdatedAt">{{ ordersUpdatedAt }}</div></transition></span>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-sm table-hover">
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
                <a title="cancel" :href="'/order/' + order.exchange + '/' + order.order.id"><i class="fas fa-window-close"></i></a>
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
      ordersUpdatedAt: '',

      columns: [{
              label: "Ex",
              name: "exchange",
              slot_name: "exchange",
              sort: false,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left",
          },
          {
              label: "Symbol",
              name: "position.symbol",
              slot_name: "symbol",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Size",
              name: "currency",
              slot_name: "size",
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left",
              sort: true,
              initial_sort: true,
              initial_sort_order: "desc"
          },
          {
              label: "Entry Price",
              name: "position.entry",
              slot_name: "entry_price",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Mark Price",
              name: "position.raw.markPrice",
              slot_name: "mark_price",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Margin",
              name: "position.raw.marginType",
              slot_name: "margin",
              sort: false,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "PNL(ROE %)",
              name: "position.raw.unRealizedProfit",
              slot_name: "pnl",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Actions",
              slot_name: "actions",
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
      ],
      classes: {
          table : {
              "table table-sm table-hover" : true,
              "table table-sm table-hover" : function(rows) {
                  return true
              }
          },
      },
      config: {
          card_mode: false,
          global_search: {
              placeholder: "Search"
          },
          highlight_row_hover_color:"rgba(0, 0, 0, 0.075)",
          server_mode: false,
          per_page: 25,
          num_of_visibile_pagination_buttons: 5,
          per_page_options: [25, 50, 100],
          checkbox_rows: false,
          rows_selectable: false,
          show_refresh_button: false,
          show_reset_button: false,
          preservePageOnDataChange: false,
      }
    }
  },
  created: function() {
    this.fetchPageAsJson();
    this.timer = setInterval(this.fetchPageAsJson, 3000);
  },
  methods: {
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
        p.position.raw.unRealizedProfit = parseFloat(p.position.raw.unRealizedProfit);
        p.position.raw.markPrice = parseFloat(p.position.raw.markPrice);
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
