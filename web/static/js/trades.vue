<style>
  .table th, .table td {
    border-top: 0 !important;
  }
  .bar {
    width: 4px;
    flex-shrink: 0;
    margin-top: -6px;
    margin-bottom: -6px;
    margin-right: 1px;
    font-size: 18px;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  .fade-enter-active {
    animation-name: fadeIn;
  }
  .fade-leave-active {
    animation-name: fadeOut;
  }
  .fade-move {
    transition: all 0.1s 0s ease;
  }
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
<template>
  <div class="vue-root">
    <template v-if="!!balances.info">
      <div class="row">
        <div class="col-md-4">
          <div class="card card-outline card-teal">
            <div class="card-header border-bottom-0"><h3 class="card-title">Margin Risk Ratio</h3></div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-12">
                  <h1 class="text-teal" style="font-size:50px">{{ Math.round((balances.info.totalMaintMargin/balances.info.totalMarginBalance) * 100 * 100)/100 }}%</h1>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card card-outline card-teal">
            <div class="card-header border-bottom-0"><h3 class="card-title">Margin Status</h3></div>
            <div class="card-body">
              <div class="row justify-content-md-center">
                <div class="col-md-4 border-right text-center">
                  <h5 class="text-teal">Maint.</h5>
                  <h5>{{ balances.info.totalMaintMargin|filter_price }}</h5>
                </div>
                <div class="col-md-4 border-right text-center">
                  <h5 class="text-teal">Balance</h5>
                  <h5>{{ balances.info.totalMarginBalance|filter_price }}</h5>
                </div>
                <div class="col-md-4 text-center">
                  <h5 class="text-teal">Available</h5>
                  <h5>{{ balances.info.availableBalance|filter_price }}</h5>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card card-outline card-teal">
            <div class="card-header border-bottom-0"><h3 class="card-title">Assets</h3></div>
            <div class="card-body" id="memory">
              <div class="row justify-content-md-center">
                <div class="col-md-4 border-right text-center">
                  <h5 class="text-teal">Wallet</h5>
                  <h5>{{ balances.info.totalWalletBalance|filter_price }}</h5>
                </div>
                <div class="col-md-4 border-right text-center">
                  <h5 class="text-teal">Curr PNL</h5>
                  <h5>{{ balances.info.totalUnrealizedProfit|filter_price }}</h5>
                </div>
                <div class="col-md-4 text-center">
                  <h5 class="text-teal">BNB</h5>
                  <h5>{{ balances.BNB.total|round(2) }} <small>BNB</small><br></h5>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template>
      <div class="card card-outline card-teal">
      <div class="card-header border-bottom-0">
        <h3 class="card-title">Positions ({{ positions.length }}) - <span class="text-teal">Open long: {{ totalLongPosition.toFixed(0) }}</span> - <span class="text-danger">Open short: {{ totalShortPosition.toFixed(0) }}</span></h3> <span class="text-muted float-right"><transition name="slide-fade" mode="out-in"><div :key="positionsUpdatedAt">{{ positionsUpdatedAt }}</div></transition></span>
      </div>
      <div class="card-body">
      <div class="table-responsive">
      <vue-bootstrap4-table :rows="positions" :classes="dataTableClasses" :columns="positionsColumns" :config="dataTableConfig" :total-rows="positions.length">
        <template slot="exchange" slot-scope="props"><img :src="`/img/exchanges/${props.cell_value}.png`" :alt="props.cell_value" :title="props.cell_value" width="16px" height="16px"></template>
        <template slot="symbol" slot-scope="props">
          <span v-if="props.row.position.side === 'short'" class="bar bg-danger">&nbsp;</span>
          <span v-if="props.row.position.side === 'long'" class="bar bg-teal">&nbsp;</span>
          <!-- <span v-if="props.row.position.side === 'short'" class="badge badge-danger">short</span>
          <span v-if="props.row.position.side === 'long'" class="badge badge-success">long</span> -->
          <a target="blank" :href="'/tradingview/' + props.row.exchange + ':' + props.cell_value">{{ props.cell_value }}</a> 
          <small class="text-warning">[{{ props.row.position.raw.leverage }}x]</small>
        </template>
        <template slot="size" slot-scope="props">{{ props.cell_value|filter_price }}</template>
        <template slot="entry_price" slot-scope="props">{{ props.cell_value|filter_price }}</template>
        <template slot="mark_price" slot-scope="props">{{ props.cell_value|filter_price }}</template>
        <template slot="liq_price" slot-scope="props">
          <span class="text-warning" v-if="props.cell_value !== '0'">{{ props.cell_value|filter_price }}</span>
          <span v-if="props.cell_value === '0'">-</span>
        </template>
        <template slot="margin" slot-scope="props">
          {{ (props.row.currency / props.row.position.raw.leverage) + (props.row.position.raw.unRealizedProfit / props.row.position.raw.leverage)|filter_price }}
          (<small>{{ props.cell_value }}</small>)
        </template>
        <template slot="pnl" slot-scope="props">
          <span v-if="typeof props.row.position.profit !== 'undefined'" v-bind:class="{ 'text-teal': props.row.position.profit > 0, 'text-danger': props.row.position.profit < 0 }">
            {{ props.row.position.raw.unRealizedProfit|filter_price }}({{ props.row.position.profit|round(2) }}%)
          </span>
        </template>
        <template slot="actions" slot-scope="props">
          <form v-on:submit.prevent>
            <button name="action" value="close" data-toggle="tooltip"
                    title="Limit Close" class="btn btn-outline-primary btn-xs" v-on:click="closePosition(props.row.exchange, props.row.position.symbol, 'close', props.row.position.side)"><i class="fa fa-times"></i> Limit Close</button>
            <button name="action" value="close_market" data-toggle="tooltip" 
                    title="Market Close" class="btn btn-outline-danger btn-xs" v-on:click="closePosition(props.row.exchange, props.row.position.symbol, 'close_market', props.row.position.side)"><i class="fa fa-times"></i> Market Close</button>
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

    <div class="card card-outline card-teal">
      <div class="card-header border-bottom-0">
        <h3 class="card-title">Orders ({{ orders.length }})</h3> <span class="text-muted float-right"><transition name="slide-fade" mode="out-in"><div :key="positionsUpdatedAt">{{ ordersUpdatedAt }}</div></transition></span>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <vue-bootstrap4-table :rows="orders" :classes="dataTableClasses" :columns="ordersColumns" :config="dataTableConfig" :total-rows="orders.length" :actions="ordersActions" @on-cancelall="onCancelAll">
            <template slot="exchange" slot-scope="props"><img :src="`/img/exchanges/${props.cell_value}.png`" :alt="props.cell_value" :title="props.cell_value" width="16px" height="16px"></template>
            <template slot="updatedAt" slot-scope="props">{{ new Date(props.cell_value).toLocaleString('tr-TR') }}</template>
            <template slot="symbol" slot-scope="props">
              <a target="blank" :href="'/tradingview/' + props.row.exchange + ':' + props.cell_value">{{ props.cell_value }}</a> 
            </template>
            <template slot="status" slot-scope="props">{{ capitalizeFirstLetter(props.cell_value) }}</template>
            <template slot="type" slot-scope="props">{{ capitalizeFirstLetter(props.cell_value) }}</template>
            <template slot="side" slot-scope="props">
              <span class="badge" v-bind:class="{'badge-danger': props.row.sideStatus.includes('Short'), 'badge-success': props.row.sideStatus.includes('Long')}">{{props.row.sideStatus}}</span>
            </template>
            <template slot="currency" slot-scope="props">{{ props.cell_value|filter_price }}</template>
            <template slot="price" slot-scope="props">
              {{ props.cell_value|filter_price }} 
              <span v-if="props.row.percent_to_price" title="Percent to current price" v-bind:class="{ 'text-teal': props.row.percent_to_price > 0, 'text-danger': props.row.percent_to_price < 0 }">({{ props.row.percent_to_price|round(2) }}%)</span>
            </template>
            <template slot="retry" slot-scope="props">
              {{ props.cell_value === true ? 'Yes' : 'No' }}
            </template>
            <template slot="actions" slot-scope="props">
              <button name="cancel" class="btn btn-outline-danger btn-xs" v-on:click="cancelOrder(props.row.exchange, props.row.order.symbol, props.row.order.type, props.row.order.side, props.row.order.id)"><i class="fa fa-times"></i> Cancel</button>
            </template>
            <template slot="sort-asc-icon"><i class="fas fa-sort-up"></i></template>
            <template slot="sort-desc-icon"><i class="fas fa-sort-down"></i></template>
            <template slot="no-sort-icon"><i class="fas fa-sort"></i></template>
            <template slot="empty-results">No open any order.</template>
          </vue-bootstrap4-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
let title = document.title;

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
      toastOptions: {
        position: "top-right",
        timeout: 3000,
        closeOnClick: true,
        pauseOnFocusLoss: true,
        pauseOnHover: true,
        draggable: true,
        draggablePercent: 0.6,
        showCloseButtonOnHover: false,
        hideProgressBar: true,
        closeButton: "button",
        icon: true,
        rtl: false
      },
      messageOptions: {
        position: "bottom-right",
        timeout: 1500,
        closeOnClick: true,
        pauseOnFocusLoss: true,
        pauseOnHover: true,
        draggable: false,
        draggablePercent: 0.6,
        showCloseButtonOnHover: false,
        hideProgressBar: true,
        closeButton: "button",
        icon: false,
        rtl: false
      },      
      ordersActions: [{
              btn_text: "Cancel All",
              event_name: "on-cancelall",
              class: "btn btn-danger btn-sm"
          }
      ],
      ordersColumns: [
          {
              label: "Ex",
              name: "exchange",
              slot_name: "exchange",
              sort: false,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left",
          },
          {
              label: "Date",
              name: "order.updatedAt",
              slot_name: "updatedAt",
              sort: true,
              initial_sort: true,
              initial_sort_order: "desc",
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Symbol",
              name: "order.symbol",
              slot_name: "symbol",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Type",
              name: "order.type",
              slot_name: "type",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Side",
              name: "sideStatus",
              slot_name: "side",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Price",
              name: "order.price",
              slot_name: "price",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Amount",
              name: "order.amount",
              slot_name: "amount",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Size",
              name: "currency",
              slot_name: "currency",
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left",
              sort: true,
          },
          {
              label: "Status",
              name: "order.status",
              slot_name: "status",
              sort: true,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Retry",
              name: "order.retry",
              slot_name: "retry",
              sort: false,
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          },
          {
              label: "Actions",
              slot_name: "actions",
              row_text_alignment:  "text-left",
              column_text_alignment:  "text-left"
          }
      ],
      positionsColumns: [{
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
              label: "Liq. Price",
              name: "position.raw.liquidationPrice",
              slot_name: "liq_price",
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
      dataTableClasses: {
          table : {
              "table-sm table-hover" : true,
              "table-sm table-hover" : function(rows) {
                  return true
              }
          },
      },
      dataTableConfig: {
          card_mode: false,
          global_search: {
              placeholder: "Search"
          },
          highlight_row_hover_color:"rgba(0, 0, 0, 0.075)",
          server_mode: false,
          per_page: 50,
          num_of_visibile_pagination_buttons: 5,
          per_page_options: [25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500],
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
    this.toast = VueToastification.createToastInterface({
        transition: "fade",
        newestOnTop: false,
        maxToasts: 10,
        filterBeforeCreate: (toast, toasts) => {
          if (toasts.filter(t => t.type === toast.type).length >= 5) {
            return false;
          }
          return toast;
        },
        filterToasts: toasts => {
          // Keep track of existing types
          const types = {};
          return toasts.reduce((aggToasts, toast) => {
            // Check if type was not seen before
            if (!types[toast.type]) {
              aggToasts.push(toast);
              types[toast.type] = true;
            }
            return aggToasts;
          }, []);
        }
    });
    this.connectToWebSocket();
  },
  methods: {
    webSocketPing() {
      this.ws.send(JSON.stringify({type: 'SocketStateChangedEvent', state: 'alive'}));
      setTimeout(this.webSocketPing, 1000);
    },
    connectToWebSocket() {
      const ws = new WebSocket(`wss://${location.hostname}/ws`);
      this.ws = ws;

      ws.onmessage = async ({data}) => {
        await this.onMessage(data);
      };

      ws.onopen = (e) => {
        setTimeout(this.webSocketPing, 5000);
      }

      ws.onclose = (e) => {
        console.log('WebSocket is closed. Reconnect will be attempted in 2 second.', e.reason);
        setTimeout(this.connectToWebSocket, 2000);
      };

      ws.onerror = (e) => {
        console.error('WebSocket encountered error: ', e.message, 'Closing socket');
        ws.close();
      };

      return ws;
    },
    async onMessage(event) {
      const data = JSON.parse(event);

      // console.log(event);
      
      switch(data.type) {
        case 'SocketStateChangedEvent':
          if (data.state === 'connected') {
            this.ws.send(JSON.stringify({type: 'AuthEvent', key: 'ddca32ea-5154-40b8-a829-b6cc8d62aee'}));
          }
          break;
        case 'ExchangeOrderEvent':
          let status = data.event.order.status.toLowerCase();
          if (status === 'new') {
            status = 'created';
          } else if (status === 'partially_filled') {
            return;
          } else if (status === 'canceled') {
            return;
          }

          if (['MARKET', 'LIMIT'].includes(data.event.order.type.toUpperCase())) {
            this.toast.info(`${data.event.order.symbol} ${this.sideShortOrLong(data.event.order, false).toLowerCase()} ${this.capitalizeFirstLetter(data.event.order.type).toLowerCase()} order ${status}`, this.messageOptions);
          } else if (['STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET'].includes(data.event.order.type.toUpperCase())) {
            this.toast.error(`${data.event.order.symbol} ${this.sideShortOrLong(data.event.order, false).toLowerCase()} ${this.capitalizeFirstLetter(data.event.order.type).toLowerCase()} order ${status}`, this.messageOptions);
          }
          break;
        case 'ExchangePositionEvent':
          if (data.event.state === 'opened') {
            this.toast.info(`${data.event.position.symbol} ${data.event.position.side} position ${data.event.state} size ${(data.event.position.amount * data.event.position.entry).toFixed(2)} USDT`, this.messageOptions);
          } else if (data.event.state === 'updated') {
            // this.toast.warning(`${data.event.position.symbol} ${data.event.position.side} position ${data.event.state} size ${(data.event.position.amount * data.event.position.entry).toFixed(2)} USDT`, this.messageOptions);
          } else {
            this.toast.error(`${data.event.position.symbol} ${data.event.position.side} position ${data.event.state} size ${(data.event.position.amount * data.event.position.entry).toFixed(2)} USDT`, this.messageOptions);
          }

          break;
      }
    },
    capitalizeFirstLetter(string) {
      const words = string.split('_');
      for (let i = 0; i < words.length; i++) {
        words[i] = words[i][0].toUpperCase() + words[i].substr(1);
      }

      return words.join(" ");
    },
    sideShortOrLong(order, addPrefix = true) {
      let prefix = '';
      if (addPrefix && order.reduceOnly !== undefined) {
        switch(order.reduceOnly) {
          case true:
            prefix = 'Close ';
            break;
          case false:
            prefix = 'Open ';
            break;
        }
      }

      if (order.positionSide) {
        return prefix+this.capitalizeFirstLetter(order.positionSide.toLowerCase());
      }

      return order.side === 'buy' ? `${prefix}Long` : `${prefix}Short`;
    },
    createExchangeName(name) {
      const split = name.split('_');
      if (split.length !== 2) {
        return '';
      }

      return `${this.capitalizeFirstLetter(split[0])} ${this.capitalizeFirstLetter(split[1])}`;
    },
    async onCancelAll() {
      if (!confirm(`Do you really want to cancel all orders?`)) {
        return;
      }

      const exchange = 'binance_futures';
      const exchangeName = this.createExchangeName(exchange);

      const res = await fetch(`/order/${exchange}/cancel/all`);
      const data = await res.json();

      if ('status' in data && data.status === 'success') {
        this.toast.success(`Successfuly cancelled all orders on ${exchangeName}`, this.toastOptions);
      } else if ('status' in data && data.status === 'error') {
        this.toast.error(`Error occurred while cancelling all orders on ${exchangeName}. Error: ${data.error}`, this.toastOptions);
      } else {
        this.toast.error(`Error occurred while cancelling all orders on ${exchangeName}`, this.toastOptions);
      }
    },
    async fetchPageAsJson() {
      const res = await fetch('/trades.json');
      if (res.status === 403) {
        window.location.href = '/login?return=/trades';
        return;
      }

      const data = await res.json();


      if (!('positions' in data && 'orders' in data)) {
        return;
      }

      this.positions = data.positions || [];
      this.orders = data.orders || [];
      this.balances = data.balances || {};
      if (this.balances.info) {
        document.title = `Unrealized PNL ${parseFloat(this.balances.info.totalUnrealizedProfit).toFixed(2)} | ${title}`;
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

      this.orders.forEach(o => {
        o.currency = parseFloat(o.order.price) * parseFloat(o.order.amount);
        o.sideStatus = this.sideShortOrLong(o.order);
      });

      this.positionsUpdatedAt = new Date().toLocaleTimeString();
      this.ordersUpdatedAt = new Date().toLocaleTimeString();

    },
    cancelAutoUpdate() {
      clearInterval(this.timer);
    },
    async cancelOrder(exchange, symbol, type, side, id) {
      const res = await fetch(`/order/${exchange}/${id}`);
      const data = await res.json();

      if ('status' in data && data.status === 'success') {
        this.toast.success(`Successfuly cancelled ${symbol} ${side} ${this.capitalizeFirstLetter(type).toLowerCase()} order`, this.toastOptions);
      } else if ('status' in data && data.status === 'error') {
        this.toast.error(`Error occurred while cancelling ${symbol} ${side} ${this.capitalizeFirstLetter(type).toLowerCase()} order Error: ${data.error}`, this.toastOptions);
      } else {
        this.toast.error(`Error occurred while cancelling ${symbol} ${side} ${this.capitalizeFirstLetter(type).toLowerCase()} order`, this.toastOptions);
      }
    },
    async closePosition(exchange, symbol, action, side) {
      if (!confirm(`Do you really want to close ${side} position for ${symbol}?`)) {
        return;
      }

      const requestOptions = {
        method: "POST",
        headers: { 'Content-Type': 'application/x-www-form-urlencoded'},
        body: `positionSide=${side}&action=${action}`
      };

      const res = await fetch(`/pairs/${exchange}-${symbol}`, requestOptions);
      const data = await res.json();

      if ('status' in data && data.status === 'success') {
        this.toast.success(`Successfuly closed ${symbol} ${side} position`, this.toastOptions);
      } else {
        this.toast.error(`Error occurred while closing ${symbol} ${side} position`, this.toastOptions);
      }
    }
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
}
</script>