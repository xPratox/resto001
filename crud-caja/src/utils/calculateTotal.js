function calculateTotal(items) {
  return items.reduce((acc, item) => {
    const subtotal = item.cantidad * item.precioUnitario;
    return acc + subtotal;
  }, 0);
}

module.exports = calculateTotal;
