$(function () {
  function getPrecision(numberAsString) {
    const n = numberAsString.toString().split('.');
    return n.length > 1 ? n[1].length : 0;
  }

  $('.percent-input-group').on('click', 'button', function (e) {
    e.preventDefault();

    const input = $(this).closest('.input-group').find('input');

    const percentageChange = parseFloat($(this).val());

    const price = parseFloat(input.val());
    input.val((price + price / percentageChange / 100).toFixed(getPrecision(price)));
  });

  $('#order_form').submit((e) => {
    const order_type = $('#order_type').val();
    const amount_currency = $('#amount_currency').val();
    return confirm('You will open new ' + e.target.value + ' ' + order_type.toUpperCase() + ' order. Current amount '+ amount_currency +' USDT. Are you sure?');
  });

  $('.form-group-amount').on('keyup', 'input', function (e) {
    const value = $(this).val();

    if (!value || Number.isNaN(value)) {
      return;
    }

    const id = $(this).attr('id');

    const scope = $(this).closest('form');
    const assetPrice = scope.find('#price').val();

    if (!assetPrice) {
      return;
    }

    if (id === 'amount') {
      scope.find('#amount_currency').val((value * assetPrice).toFixed(getPrecision(parseFloat(assetPrice))));
    } else {
      scope.find('#amount').val((value / assetPrice).toFixed(8)); // precision (tick / lot size?)
    }
  });
});
