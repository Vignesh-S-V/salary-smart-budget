import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyStatementDirection,
  inferIncomeType,
  normalizeTransactionText,
  reconcileStatementRows,
  transactionFingerprint
} from "../lib/statement-utils.mjs";

test("only clear own-account descriptions become transfers", () => {
  assert.equal(classifyStatementDirection("NEFT transfer to own account", "debit"), "transfer_out");
  assert.equal(classifyStatementDirection("UPI self transfer", "credit"), "transfer_in");
  assert.equal(classifyStatementDirection("UPI to VIGNESH", "debit"), "debit");
});

test("income types distinguish salary, refunds and other credits", () => {
  assert.equal(inferIncomeType("SALARY CREDIT NOV"), "salary");
  assert.equal(inferIncomeType("UPI REFUND"), "refund");
  assert.equal(inferIncomeType("NEFT FROM CLIENT"), "other");
});

test("fingerprints normalize punctuation and casing", () => {
  assert.equal(
    transactionFingerprint("2026-11-03", 250, "UPI/Tea-Shop", "expense"),
    transactionFingerprint("2026-11-03", 250, "upi tea shop", "expense")
  );
  assert.equal(normalizeTransactionText(" UPI/ABC-123 "), "upi abc 123");
});

test("reconciles ascending running balances and returns opening/closing", () => {
  const result = reconcileStatementRows([
    {date:"2026-01-01",amount:100,direction:"credit",balance:1100},
    {date:"2026-01-02",amount:50,direction:"debit",balance:1050}
  ]);
  assert.equal(result.available,true);
  assert.equal(result.matched,true);
  assert.equal(result.openingBalance,1000);
  assert.equal(result.closingBalance,1050);
  assert.equal(result.difference,0);
});

test("reconciles statements whose PDF lists newest rows first", () => {
  const result = reconcileStatementRows([
    {date:"2026-01-02",amount:50,direction:"debit",balance:1050},
    {date:"2026-01-01",amount:100,direction:"credit",balance:1100}
  ]);
  assert.equal(result.available,true);
  assert.equal(result.matched,true);
  assert.equal(result.order,"ascending");
  assert.equal(result.openingBalance,1000);
});

test("flags a running-balance mismatch instead of silently accepting it", () => {
  const result = reconcileStatementRows([
    {date:"2026-01-01",amount:100,direction:"credit",balance:1100},
    {date:"2026-01-02",amount:50,direction:"debit",balance:990}
  ]);
  assert.equal(result.available,true);
  assert.equal(result.matched,false);
  assert.notEqual(result.difference,0);
});

import { categorySuggestion } from "../lib/category-utils.mjs";

test("raw chicken and mutton purchases are classified as Groceries", () => {
  for (const item of ["Chicken", "Mutton", "Mutton & Chicken", "Fresh chicken", "Mutton shop", "kozhi", "aadu"]) {
    assert.equal(categorySuggestion(item).category, "Groceries", item);
  }
});

test("Tamil meat purchase names are classified as Groceries", () => {
  for (const item of ["சிக்கன்", "மட்டன்", "கோழி", "ஆட்டிறைச்சி", "ஆட்டுக்கறி"]) {
    assert.equal(categorySuggestion(item).category, "Groceries", item);
  }
});

test("prepared chicken and mutton dishes stay in Food & Drinks", () => {
  assert.equal(categorySuggestion("Chicken biryani").category, "Food & Drinks");
  assert.equal(categorySuggestion("Mutton curry").category, "Food & Drinks");
});
