export type StatementDirection = "debit" | "credit" | "transfer_in" | "transfer_out";
export type ReconciliationResult = {
  available: boolean;
  matched: boolean;
  rowCount: number;
  reason?: string;
  order?: "ascending" | "descending";
  openingBalance?: number;
  closingBalance?: number;
  calculatedClosingBalance?: number;
  difference?: number;
  maximumSequenceResidual?: number;
  tolerance?: number;
};
export function normalizeTransactionText(value: unknown): string;
export function classifyStatementDirection(description: string, bankDirection: "debit" | "credit"): StatementDirection;
export function inferIncomeType(description: string): "salary" | "refund" | "other";
export function transactionFingerprint(date: string, amount: number, description: string, kind: string): string;
export function reconcileStatementRows(rows: Array<{date:string;amount:number;direction:StatementDirection;balance:number|null}>, tolerance?: number): ReconciliationResult;
