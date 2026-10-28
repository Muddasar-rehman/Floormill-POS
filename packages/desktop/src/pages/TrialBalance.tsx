import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TrialBalanceLine } from "shared";
import { supabase } from "../lib/supabase";
import { computeApArTotals } from "../lib/apAr";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";

const ACCOUNT_KEY: Record<string, string> = {
  "Bank Accounts": "trialBalance.accBankAccounts",
  "Stock Valuation": "trialBalance.accStockValuation",
  "Liabilities (Unpaid)": "trialBalance.accLiabilitiesUnpaid",
  "Shareholder Capital": "trialBalance.accShareholderCapital",
  "Sales Revenue": "trialBalance.accSalesRevenue",
  "Cost of Goods Sold": "trialBalance.accCogs",
  "Operating Expenses": "trialBalance.accOperatingExpenses",
  "Chadai Charges": "trialBalance.accChadaiCharges",
  "Commission Paid": "trialBalance.accCommissionPaid",
  "Accounts Receivable": "trialBalance.accAccountsReceivable",
  "Accounts Payable": "trialBalance.accAccountsPayable",
  "Retained Earnings (plug)": "trialBalance.accRetainedEarningsPlug",
};

const TYPE_KEY: Record<string, string> = {
  asset: "trialBalance.typeAsset",
  liability: "trialBalance.typeLiability",
  equity: "trialBalance.typeEquity",
  income: "trialBalance.typeIncome",
  expense: "trialBalance.typeExpense",
};

export function TrialBalance() {
  const { t } = useTranslation();
  const [lines, setLines] = useState<TrialBalanceLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [linesRes, apAr] = await Promise.all([supabase.rpc("fn_trial_balance_lines"), computeApArTotals()]);
      const rows = (linesRes.data as TrialBalanceLine[]) ?? [];
      rows.push({ account: "Accounts Receivable", account_type: "asset", side: "debit", amount: apAr.totalReceivable });
      rows.push({ account: "Accounts Payable", account_type: "liability", side: "credit", amount: apAr.totalPayable });

      const totalDebit = rows.filter((r) => r.side === "debit").reduce((s, r) => s + r.amount, 0);
      const totalCredit = rows.filter((r) => r.side === "credit").reduce((s, r) => s + r.amount, 0);
      const diff = totalCredit - totalDebit;
      if (diff > 0) {
        rows.push({ account: "Retained Earnings (plug)", account_type: "equity", side: "debit", amount: diff });
      } else if (diff < 0) {
        rows.push({ account: "Retained Earnings (plug)", account_type: "equity", side: "credit", amount: -diff });
      }

      setLines(rows);
      setLoading(false);
    }
    load();
  }, []);

  const totalDebit = lines.filter((r) => r.side === "debit").reduce((s, r) => s + r.amount, 0);
  const totalCredit = lines.filter((r) => r.side === "credit").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("trialBalance.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("trialBalance.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("trialBalance.colAccount")}</TableHead>
                    <TableHead>{t("trialBalance.colType")}</TableHead>
                    <TableHead className="text-right">{t("trialBalance.colDebit")}</TableHead>
                    <TableHead className="text-right">{t("trialBalance.colCredit")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines
                    .filter((l) => l.amount !== 0)
                    .map((l, idx) => (
                      <TableRow key={`${l.account}-${idx}`}>
                        <TableCell className="font-medium">{t(ACCOUNT_KEY[l.account] ?? l.account)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{t(TYPE_KEY[l.account_type] ?? l.account_type)}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {l.side === "debit" ? l.amount.toFixed(2) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {l.side === "credit" ? l.amount.toFixed(2) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm font-semibold">
                <span>{t("trialBalance.total")}</span>
                <div className="flex gap-12">
                  <span>{totalDebit.toFixed(2)}</span>
                  <span>{totalCredit.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
