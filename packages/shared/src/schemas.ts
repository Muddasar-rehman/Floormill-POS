import { z } from "zod";

export const partySchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  cnic_ntn: z.string().optional().nullable(),
  opening_balance: z.coerce.number().default(0),
  credit_limit: z.coerce.number().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
});

export const itemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional().nullable(),
  mun_kg: z.coerce.number().positive().default(40),
  reorder_threshold_kg: z.coerce.number().optional().nullable(),
});

export const warehouseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional().nullable(),
  capacity_kg: z.coerce.number().optional().nullable(),
  incharge_employee: z.string().optional().nullable(),
});

export const purchaseSchema = z.object({
  vendor_id: z.string().uuid("Select a vendor"),
  item_id: z.string().uuid("Select an item"),
  warehouse_id: z.string().uuid("Select a warehouse"),
  weighed_qty_kg: z.coerce.number().positive("Quantity must be greater than 0"),
  kaat_pct: z.coerce.number().min(0, "Cannot be negative").max(99, "Must be less than 100%").default(0),
  rate: z.coerce.number().positive("Rate must be greater than 0"),
  watta_pct: z.coerce.number().min(0, "Cannot be negative").max(99, "Must be less than 100%").default(0),
  date: z.string().min(1),
});

export const saleSchema = z.object({
  customer_id: z.string().uuid("Select a customer"),
  warehouse_id: z.string().uuid("Select a warehouse"),
  date: z.string().min(1),
  items: z
    .array(
      z.object({
        item_id: z.string().uuid("Select an item"),
        weighed_qty_kg: z.coerce.number().positive("Quantity must be greater than 0"),
        kaat_pct: z.coerce.number().min(0, "Cannot be negative").max(99, "Must be less than 100%").default(0),
        rate: z.coerce.number().positive("Rate must be greater than 0"),
        watta_pct: z.coerce.number().min(0, "Cannot be negative").max(99, "Must be less than 100%").default(0),
      })
    )
    .min(1, "Add at least one item"),
});

export const gatePassSchema = z.object({
  vehicle_number: z.string().min(1, "Vehicle number is required"),
  driver: z.string().optional().nullable(),
  party_id: z.string().uuid("Select a vendor or customer"),
  warehouse_id: z.string().uuid("Select a warehouse"),
  direction: z.enum(["in", "out"]),
  date: z.string().min(1),
  items: z
    .array(
      z.object({
        item_id: z.string().uuid("Select an item"),
        weighed_qty_kg: z.coerce.number().positive("Quantity must be greater than 0"),
        kaat_pct: z.coerce.number().min(0, "Cannot be negative").max(99, "Must be less than 100%").default(0),
        rate: z.coerce.number().positive("Rate must be greater than 0"),
        watta_pct: z.coerce.number().min(0, "Cannot be negative").max(99, "Must be less than 100%").default(0),
      })
    )
    .min(1, "Add at least one item"),
});

export const kandaSlipSchema = z.object({
  gate_pass_id: z.string().uuid("Select a gate pass"),
  gross_weight_kg: z.coerce.number().positive("Gross weight must be greater than 0"),
  tare_weight_kg: z.coerce.number().nonnegative("Tare weight cannot be negative"),
});

export const bardanaSchema = z.object({
  party_id: z.string().uuid("Select a party"),
  direction: z.enum(["in", "out"]),
  qty_bags: z.coerce.number().positive("Bags must be greater than 0"),
  purchase_id: z.string().uuid().optional().nullable(),
  sale_id: z.string().uuid().optional().nullable(),
  date: z.string().min(1),
});

export const chadaiSchema = z.object({
  purchase_id: z.string().uuid().optional().nullable(),
  sale_id: z.string().uuid().optional().nullable(),
  basis: z.enum(["per_bag", "per_mun", "lump_sum"]),
  rate: z.coerce.number().positive("Rate must be greater than 0"),
  qty_basis: z.coerce.number().positive("Quantity must be greater than 0").default(1),
  date: z.string().min(1),
});

export const productionBatchSchema = z.object({
  warehouse_id: z.string().uuid("Select a warehouse"),
  date: z.string().min(1),
  notes: z.string().optional().nullable(),
  inputs: z
    .array(
      z.object({
        item_id: z.string().uuid("Select an item"),
        qty_kg: z.coerce.number().positive("Quantity must be greater than 0"),
      })
    )
    .min(1, "Add at least one input item"),
  outputs: z
    .array(
      z.object({
        item_id: z.string().uuid("Select an item"),
        qty_kg: z.coerce.number().positive("Quantity must be greater than 0"),
        rate: z.coerce.number().nonnegative("Rate cannot be negative"),
      })
    )
    .min(1, "Add at least one output item"),
});

export const stockAdjustmentSchema = z.object({
  item_id: z.string().uuid("Select an item"),
  warehouse_id: z.string().uuid("Select a warehouse"),
  reason: z.string().min(1, "Reason is required"),
  qty_delta_kg: z.coerce.number().refine((v) => v !== 0, "Adjustment cannot be zero"),
  date: z.string().min(1),
});

export const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  salary_terms: z.string().optional().nullable(),
  joining_date: z.string().optional().nullable(),
});

export const bankAccountSchema = z.object({
  bank_name: z.string().min(1, "Bank name is required"),
  account_title: z.string().min(1, "Account title is required"),
  account_number: z.string().optional().nullable(),
  opening_balance: z.coerce.number().default(0),
});

export const bankLedgerSchema = z.object({
  bank_account_id: z.string().uuid("Select a bank account"),
  direction: z.enum(["in", "out"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  tag: z.string().min(1, "This field is required"),
  date: z.string().min(1),
});

export const cashBankTransferSchema = z.object({
  bank_account_id: z.string().uuid("Select a bank account"),
  direction: z.enum(["cash_to_bank", "bank_to_cash"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  note: z.string().optional().nullable(),
  date: z.string().min(1),
});

export const partyTransferSchema = z
  .object({
    from_party_id: z.string().uuid("Select who is giving"),
    to_party_id: z.string().uuid("Select who is receiving"),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    note: z.string().optional().nullable(),
    date: z.string().min(1),
  })
  .refine((v) => v.from_party_id !== v.to_party_id, {
    message: "Choose two different parties",
    path: ["to_party_id"],
  });

export const cashAccountSchema = z.object({
  opening_balance: z.coerce.number().default(0),
});

export const cashLedgerSchema = z.object({
  direction: z.enum(["in", "out"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  tag: z.string().min(1, "This field is required"),
  date: z.string().min(1),
});

export const expenseSchema = z.object({
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().min(1),
  payment_source: z.enum(["cash", "bank"]),
  bank_account_id: z.string().uuid().optional().nullable(),
  warehouse_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
});

export const liabilitySchema = z.object({
  type: z.string().min(1, "Type is required"),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  due_date: z.string().optional().nullable(),
  status: z.enum(["unpaid", "paid"]).default("unpaid"),
});

export const paymentSchema = z.object({
  vendor_id: z.string().uuid("Select a vendor"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().min(1),
  payment_source: z.enum(["cash", "bank"]),
  bank_account_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const receiptSchema = z.object({
  customer_id: z.string().uuid("Select a customer"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().min(1),
  payment_source: z.enum(["cash", "bank"]),
  bank_account_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const roznamchaEntrySchema = z.object({
  date: z.string().min(1),
  direction: z.enum(["kharcha", "aamdan"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  description: z.string().min(1, "Description is required"),
  party_id: z.string().uuid().optional().nullable(),
  reference_no: z.string().optional().nullable(),
  payment_source: z.enum(["cash", "bank"]),
  bank_account_id: z.string().uuid().optional().nullable(),
});

export const installmentPlanSchema = z.object({
  party_id: z.string().uuid("Select a party"),
  direction: z.enum(["payable", "receivable"]),
  total_amount: z.coerce.number().positive("Total amount must be greater than 0"),
  num_installments: z.coerce.number().int().positive("Must be at least 1"),
  start_date: z.string().min(1),
  frequency_days: z.coerce.number().int().positive().default(30),
});

export const shareholderSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().optional().nullable(),
  investment_amount: z.coerce.number().nonnegative().default(0),
  profit_ratio_pct: z.coerce.number().min(0).max(100),
});

export const shareholderLedgerSchema = z.object({
  shareholder_id: z.string().uuid("Select a shareholder"),
  type: z.enum(["contribution", "withdrawal", "profit_share"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().min(1),
});

export const commissionAgentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().optional().nullable(),
  rate_type: z.enum(["percentage", "fixed_per_mun"]),
  rate: z.coerce.number().positive("Rate must be greater than 0"),
});

export const commissionEntrySchema = z.object({
  purchase_id: z.string().uuid().optional().nullable(),
  sale_id: z.string().uuid().optional().nullable(),
  type: z.enum(["self", "agent"]),
  agent_id: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().optional(),
  date: z.string().min(1),
});

export type PartyInput = z.infer<typeof partySchema>;
export type ItemInput = z.infer<typeof itemSchema>;
export type WarehouseInput = z.infer<typeof warehouseSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export type GatePassInput = z.infer<typeof gatePassSchema>;
export type KandaSlipInput = z.infer<typeof kandaSlipSchema>;
export type BardanaInput = z.infer<typeof bardanaSchema>;
export type ChadaiInput = z.infer<typeof chadaiSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type ProductionBatchInput = z.infer<typeof productionBatchSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type CashAccountInput = z.infer<typeof cashAccountSchema>;
export type CashLedgerInput = z.infer<typeof cashLedgerSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type LiabilityInput = z.infer<typeof liabilitySchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type RoznamchaEntryInput = z.infer<typeof roznamchaEntrySchema>;
export type InstallmentPlanInput = z.infer<typeof installmentPlanSchema>;
export type ShareholderInput = z.infer<typeof shareholderSchema>;
export type ShareholderLedgerInput = z.infer<typeof shareholderLedgerSchema>;
export type BankLedgerInput = z.infer<typeof bankLedgerSchema>;
export type CashBankTransferInput = z.infer<typeof cashBankTransferSchema>;
export type PartyTransferInput = z.infer<typeof partyTransferSchema>;
export type CommissionAgentInput = z.infer<typeof commissionAgentSchema>;
export type CommissionEntryInput = z.infer<typeof commissionEntrySchema>;
