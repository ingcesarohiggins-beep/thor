export function calculateCartTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
}

export function paymentTotal(payments) {
  return payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

export function paymentsMatchTotal(payments, total) {
  return payments.length > 0 && payments.every((payment) => payment.method && Number(payment.amount) > 0)
    && Math.abs(paymentTotal(payments) - total) < 0.01;
}
