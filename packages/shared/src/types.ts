export type UserRole =
  | "owner_admin"
  | "accountant"
  | "warehouse_staff"
  | "sales_purchase_staff"
  | "commission_agent";

export interface Profile {
  id: string;
  auth_user_id: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Party {
  id: string;
  name: string;
  contact: string | null;
  address: string | null;
  cnic_ntn: string | null;
  opening_balance: number;
  credit_limit: number | null;
  payment_terms: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  name: string;
  category: string | null;
  mun_kg: number;
  avg_cost: number;
  reorder_threshold_kg: number | null;
  key: string | null;
  is_protected: boolean;
  created_at: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  capacity_kg: number | null;
  incharge_employee: string | null;
  created_at: string;
}

export interface ItemStock {
  item_id: string;
  warehouse_id: string;
  qty_kg: number;
}

export interface Purchase {
  id: string;
  vendor_id: string;
  item_id: string;
  warehouse_id: string;
  weighed_qty_kg: number;
  kaat_pct: number;
  qty_kg: number;
  rate: number;
  watta_pct: number;
  net_rate: number;
  total: number;
  invoice_no: number;
  date: string;
  created_by: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  customer_id: string;
  warehouse_id: string;
  total: number;
  cogs: number;
  invoice_no: number;
  date: string;
  created_by: string | null;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  item_id: string;
  weighed_qty_kg: number;
  kaat_pct: number;
  qty_kg: number;
  rate: number;
  watta_pct: number;
  net_rate: number;
  total: number;
  cogs: number;
}

export type GateDirection = "in" | "out";

export interface GatePassItem {
  id: string;
  gate_pass_id: string;
  item_id: string;
  qty_kg: number;
  rate: number | null;
  kaat_pct: number;
  watta_pct: number;
  purchase_id: string | null;
}

export interface GatePass {
  id: string;
  gate_pass_no: number;
  vehicle_number: string;
  driver: string | null;
  party_id: string | null;
  party_name: string | null;
  warehouse_id: string;
  direction: GateDirection;
  purchase_id: string | null;
  sale_id: string | null;
  date: string;
  gate_time: string;
  created_at: string;
}

export interface KandaSlip {
  id: string;
  gate_pass_id: string;
  gross_weight_kg: number;
  tare_weight_kg: number;
  net_weight_kg: number;
  created_at: string;
}

export type BardanaDirection = "in" | "out";

export interface BardanaEntry {
  id: string;
  party_id: string;
  direction: BardanaDirection;
  qty_bags: number;
  purchase_id: string | null;
  sale_id: string | null;
  date: string;
  created_at: string;
}

export interface BardanaBalance {
  party_id: string;
  balance_bags: number;
}

export type ChadaiBasis = "per_bag" | "per_mun" | "lump_sum";

export interface ChadaiCharge {
  id: string;
  purchase_id: string | null;
  sale_id: string | null;
  basis: ChadaiBasis;
  rate: number;
  qty_basis: number;
  amount: number;
  date: string;
  created_at: string;
}

export interface StockAdjustment {
  id: string;
  item_id: string;
  warehouse_id: string;
  reason: string;
  qty_delta_kg: number;
  date: string;
  created_by: string | null;
  created_at: string;
}

export interface ProductionBatch {
  id: string;
  batch_no: number;
  warehouse_id: string;
  date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProductionInput {
  id: string;
  batch_id: string;
  item_id: string;
  qty_kg: number;
}

export interface ProductionOutput {
  id: string;
  batch_id: string;
  item_id: string;
  qty_kg: number;
  rate: number;
}

export type LedgerTxnType = "purchase" | "sale" | "payment" | "receipt" | "transfer";

export interface LedgerEntry {
  id: string;
  party_id: string;
  txn_type: LedgerTxnType;
  txn_id: string;
  debit: number;
  credit: number;
  balance_after: number;
  date: string;
  created_at: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string | null;
  contact: string | null;
  salary_terms: string | null;
  joining_date: string | null;
  profile_id: string | null;
  created_at: string;
}

export interface BankAccount {
  id: string;
  bank_name: string;
  account_title: string;
  account_number: string | null;
  opening_balance: number;
  balance: number;
  created_at: string;
}

export interface CashAccount {
  id: string;
  opening_balance: number;
  balance: number;
  created_at: string;
}

export type CashDirection = "in" | "out";

export interface CashLedgerEntry {
  id: string;
  direction: CashDirection;
  amount: number;
  tag: string;
  date: string;
  created_at: string;
}

export interface RoznamchaDayClosure {
  id: string;
  date: string;
  closed_by: string | null;
  closed_at: string;
}

export interface BankLedgerEntry {
  id: string;
  bank_account_id: string;
  direction: CashDirection;
  amount: number;
  tag: string;
  date: string;
  created_at: string;
}

export type CashBankTransferDirection = "cash_to_bank" | "bank_to_cash";

export interface CashBankTransfer {
  id: string;
  bank_account_id: string;
  direction: CashBankTransferDirection;
  amount: number;
  note: string | null;
  date: string;
  created_at: string;
}

export interface PartyTransfer {
  id: string;
  from_party_id: string;
  to_party_id: string;
  amount: number;
  note: string | null;
  date: string;
  created_by: string | null;
  created_at: string;
}

export type BankLedgerSource = "expense" | "payment" | "receipt" | "roznamcha" | "bank_ledger" | "transfer";

/** One row of fn_bank_account_ledger — a normalized, chronological statement line for a bank account. */
export interface BankStatementRow {
  source: BankLedgerSource;
  direction: CashDirection;
  amount: number;
  description: string;
  date: string;
  created_at: string;
}

export type PaymentSource = "cash" | "bank";

export interface Expense {
  id: string;
  category: string;
  amount: number;
  date: string;
  payment_source: PaymentSource;
  bank_account_id: string | null;
  warehouse_id: string | null;
  description: string | null;
  created_at: string;
}

export type LiabilityStatus = "unpaid" | "paid";

export interface Liability {
  id: string;
  type: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  status: LiabilityStatus;
  created_at: string;
}

export interface Payment {
  id: string;
  vendor_id: string;
  amount: number;
  date: string;
  payment_source: PaymentSource;
  bank_account_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Receipt {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  payment_source: PaymentSource;
  bank_account_id: string | null;
  notes: string | null;
  created_at: string;
}

export type RoznamchaDirection = "kharcha" | "aamdan";

export interface RoznamchaEntry {
  id: string;
  date: string;
  direction: RoznamchaDirection;
  amount: number;
  description: string;
  party_id: string | null;
  reference_no: string | null;
  payment_source: PaymentSource;
  bank_account_id: string | null;
  linked_payment_id: string | null;
  linked_receipt_id: string | null;
  linked_expense_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InstallmentPlan {
  id: string;
  party_id: string;
  direction: "payable" | "receivable";
  total_amount: number;
  num_installments: number;
  start_date: string;
  frequency_days: number;
  created_at: string;
}

export interface Installment {
  id: string;
  plan_id: string;
  due_date: string;
  amount: number;
  paid: boolean;
  paid_date: string | null;
  created_at: string;
}

export interface Shareholder {
  id: string;
  name: string;
  contact: string | null;
  investment_amount: number;
  profit_ratio_pct: number;
  created_at: string;
}

export type ShareholderLedgerType = "contribution" | "withdrawal" | "profit_share";

export interface ShareholderLedgerEntry {
  id: string;
  shareholder_id: string;
  type: ShareholderLedgerType;
  amount: number;
  date: string;
  created_at: string;
}

export type CommissionRateType = "percentage" | "fixed_per_mun";

export interface CommissionAgent {
  id: string;
  name: string;
  contact: string | null;
  rate_type: CommissionRateType;
  rate: number;
  created_at: string;
}

export type CommissionType = "self" | "agent";

export interface CommissionEntry {
  id: string;
  purchase_id: string | null;
  sale_id: string | null;
  type: CommissionType;
  agent_id: string | null;
  amount: number;
  paid: boolean;
  date: string;
  created_at: string;
}

export interface TrialBalanceLine {
  account: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense";
  side: "debit" | "credit";
  amount: number;
}

export interface ProfitLossResult {
  sales_revenue: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  chadai: number;
  commission: number;
  net_profit: number;
}

export interface BalanceSheetResult {
  bank_balance: number;
  stock_value: number;
  accounts_receivable: number;
  total_assets: number;
  accounts_payable: number;
  other_liabilities: number;
  total_liabilities: number;
  shareholder_capital: number;
  retained_earnings: number;
  total_equity: number;
}

export interface BreakevenResult {
  fixed_costs: number;
  avg_price_per_kg: number;
  avg_cost_per_kg: number;
  contribution_per_kg: number;
  breakeven_qty_kg: number;
  breakeven_revenue: number;
}
