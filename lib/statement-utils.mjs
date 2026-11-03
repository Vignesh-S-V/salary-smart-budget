export function normalizeTransactionText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const TRANSFER_TERMS = [
  /\bown account\b/, /\bown a c\b/, /\bself transfer\b/,
  /\btransfer to own\b/, /\btransfer from own\b/,
  /\btransfer to self\b/, /\btransfer from self\b/,
  /\bbetween own accounts\b/, /\binternal transfer\b/,
  /\bself a c\b/, /\bsweep transfer\b/, /\bown account transfer\b/
];

export function classifyStatementDirection(description, bankDirection) {
  const normalized = normalizeTransactionText(description);
  if (TRANSFER_TERMS.some((pattern) => pattern.test(normalized))) {
    return bankDirection === "credit" ? "transfer_in" : "transfer_out";
  }
  return bankDirection;
}

export function inferIncomeType(description) {
  const text = normalizeTransactionText(description);
  if (/\b(salary|payroll|wages|monthly pay)\b/.test(text)) return "salary";
  if (/\b(refund|reversal|cashback|cash back)\b/.test(text)) return "refund";
  return "other";
}

export function transactionFingerprint(date, amount, description, kind) {
  return [
    String(date ?? "").trim(),
    Number(amount).toFixed(2),
    normalizeTransactionText(description),
    String(kind ?? "").trim()
  ].join("|");
}

function netMovement(row) {
  const amount = Number(row.amount) || 0;
  if (row.direction === "credit" || row.direction === "transfer_in") return amount;
  return -amount;
}

function evaluateSequence(rows, chronological) {
  const ordered = chronological ? rows : [...rows].reverse();
  let residual = 0;
  for (let i = 1; i < ordered.length; i++) {
    const expected = Number(ordered[i - 1].balance) + netMovement(ordered[i]);
    residual += Math.abs(expected - Number(ordered[i].balance));
  }
  const opening = Number(ordered[0].balance) - netMovement(ordered[0]);
  const closing = Number(ordered[ordered.length - 1].balance);
  const movement = ordered.reduce((sum, row) => sum + netMovement(row), 0);
  const calculated = opening + movement;
  const difference = closing - calculated;
  return { opening, closing, calculated, difference, residual, ordered };
}

/**
 * Reconcile a statement's running-balance column against deposits and withdrawals.
 * Rows need date, amount, direction, and parsed balance. Rows without balance are ignored.
 */
export function reconcileStatementRows(rows, tolerance = 1) {
  const eligible = (rows ?? []).filter((row) =>
    row && row.date && Number.isFinite(Number(row.amount)) &&
    Number(row.amount) > 0 && Number.isFinite(Number(row.balance))
  );
  if (eligible.length < 2) {
    return { available: false, matched: false, rowCount: eligible.length, reason: "At least two transactions with readable running balances are required." };
  }
  const ordered = eligible.map((row, index) => ({ ...row, _index: index }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a._index - b._index);
  const asc = evaluateSequence(ordered, true);
  const desc = evaluateSequence(ordered, false);
  const chosen = asc.residual <= desc.residual ? asc : desc;
  const matched = chosen.residual <= tolerance && Math.abs(chosen.difference) <= tolerance;
  return {
    available: true,
    matched,
    rowCount: eligible.length,
    order: chosen === asc ? "ascending" : "descending",
    openingBalance: round2(chosen.opening),
    closingBalance: round2(chosen.closing),
    calculatedClosingBalance: round2(chosen.calculated),
    difference: round2(chosen.difference),
    maximumSequenceResidual: round2(chosen.residual),
    tolerance
  };
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
