import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDottedTemplateValues,
  extractTemplateVariables,
} from "../src/lib/templates/template-placeholders.mjs";

test("extracts and deduplicates dotted placeholders", () => {
  assert.deepEqual(
    extractTemplateVariables("Hi {{ customer.name }}, order {{order.number}} / {{order.number}}"),
    ["customer.name", "order.number"],
  );
});

test("applies campaign-specific dotted values", () => {
  const context = applyDottedTemplateValues(
    { customer: { name: "Priya" } },
    { "appointment.date": "25 July", "appointment.time": "3:30 PM" },
  );
  assert.deepEqual(context, {
    customer: { name: "Priya" },
    appointment: { date: "25 July", time: "3:30 PM" },
  });
});

test("does not overwrite a placeholder with an empty value", () => {
  const context = applyDottedTemplateValues({ order: { number: "ORD-1" } }, { "order.number": "" });
  assert.equal(context.order.number, "ORD-1");
});
