import assert from "node:assert/strict";
import test from "node:test";
import { calculateCartTotal, paymentTotal, paymentsMatchTotal } from "../app/lib/sale.js";

test("calcula el total considerando cantidades", () => {
  const total = calculateCartTotal([
    { price: 1299.9, qty: 1 },
    { price: 45, qty: 2 },
  ]);
  assert.equal(total, 1389.9);
});

test("acepta pagos combinados que cuadran con la venta", () => {
  const payments = [{ method: "Efectivo", amount: 500 }, { method: "Yape/Plin", amount: 889.9 }];
  assert.equal(paymentTotal(payments), 1389.9);
  assert.equal(paymentsMatchTotal(payments, 1389.9), true);
});

test("rechaza pagos incompletos o sin monto", () => {
  assert.equal(paymentsMatchTotal([{ method: "Efectivo", amount: 100 }], 120), false);
  assert.equal(paymentsMatchTotal([{ method: "Efectivo", amount: 0 }], 0), false);
});
