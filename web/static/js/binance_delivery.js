/* eslint-disable no-new */
/* eslint-disable no-undef */

Vue.filter('filter_price', function(value) {
  if (parseFloat(value) > -10 && parseFloat(value) < 10) {
    return Intl.NumberFormat('en-US', {
      useGrouping: true,
      minimumFractionDigits: 2,
      maximumFractionDigits: 5
    }).format(value);
  }

  if (parseFloat(value) > 100 * 1000) {
    return Intl.NumberFormat('en-US', {
      useGrouping: true,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value);
  }

  return Intl.NumberFormat('en-US', {
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
});

Vue.filter('filter_currency', function(value) {
  if (parseFloat(value) > 0 && parseFloat(value) < 10) {
    return Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      useGrouping: true,
      minimumFractionDigits: 2,
      maximumFractionDigits: 5
    }).format(value);
  }

  if (parseFloat(value) > 100 * 1000) {
    return Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      useGrouping: true,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value);
  }

  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
});

Vue.filter('round', function(value, decimalPlaces = 0) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  });
});

Vue.filter('date', function(value) {
  return new Date(value).toLocaleString();
});

new Vue({
  el: '#app',
  components: {
    trades: httpVueLoader(`js/binance_delivery.vue?v=${asset_version}`),
    VueBootstrap4Table
  }
});
