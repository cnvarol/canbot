/* eslint-disable no-new */
/* eslint-disable no-undef */

Vue.filter('filter_price', function(value) {
  if (parseFloat(value) > 100000) {
    return Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      useGrouping: true,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
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
  return parseFloat(value).toFixed(decimalPlaces);
});

Vue.filter('date', function(value) {
  return new Date(value).toLocaleString();
});

const { Chart } = HighchartsVue;

Vue.component('highcharts', Chart);

new Vue({
  el: '#app',
  components: {
    dashboard: httpVueLoader(`js/dashboard.vue?v=${asset_version}`)
  }
});
