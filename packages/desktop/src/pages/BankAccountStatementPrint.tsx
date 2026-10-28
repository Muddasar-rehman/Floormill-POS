import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { type BankAccount, type BankStatementRow } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

const SOURCE_KEY: Record<BankStatementRow["source"], string> = {
  expense: "bankAccounts.sourceExpense",
  payment: "bankAccounts.sourcePayment",
  receipt: "bankAccounts.sourceReceipt",
  roznamcha: "bankAccounts.sourceRoznamcha",
  bank_ledger: "bankAccounts.sourceManual",
  transfer: "bankAccounts.sourceTransfer",
};

export function BankAccountStatementPrint() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [rows, setRows] = useState<(BankStatementRow & { runningBalance: number })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [{ data: accountData }, { data: rowsData }] = await Promise.all([
        supabase.from("bank_accounts").select("*").eq("id", id).single(),
        supabase.rpc("fn_bank_account_ledger", { p_bank_account_id: id }),
      ]);
      const accountRow = accountData as BankAccount | null;
      setAccount(accountRow);

      const allRows = (rowsData as BankStatementRow[]) ?? [];
      let running = accountRow?.opening_balance ?? 0;
      const withRunning = allRows.map((r) => {
        running += r.direction === "in" ? r.amount : -r.amount;
        return { ...r, runningBalance: running };
      });
      setRows(withRunning.filter((r) => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo)));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!account) {
    return <div className="text-muted-foreground">{t("bankAccounts.notFound")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to={`/bank-accounts/${id}`}>
            <ArrowLeft />
            {t("common.back")}
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer />
          {t("common.printSavePdf")}
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-6 p-10">
          <div className="flex items-start justify-between border-b border-border pb-6">
            <div>
              <h1 className="text-xl font-semibold">The Awan Flour Mill</h1>
              <p className="text-sm text-muted-foreground">Grain Trading &amp; Warehouse Management</p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-semibold">{t("bankAccounts.printTitle")}</h2>
              {(dateFrom || dateTo) && (
                <p className="text-sm text-muted-foreground">
                  {dateFrom || "…"} – {dateTo || "…"}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("bankAccounts.colBank")}</div>
              <div className="font-medium">{account.bank_name}</div>
              <div className="text-muted-foreground">{account.account_title}</div>
              {account.account_number && <div className="text-muted-foreground">{account.account_number}</div>}
            </div>
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("bankAccounts.colBalance")}</div>
              <div className="font-medium">{account.balance.toFixed(2)}</div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">{t("common.date")}</th>
                <th className="py-2">{t("bankAccounts.colSource")}</th>
                <th className="py-2">{t("bankAccounts.colDescription")}</th>
                <th className="py-2 text-right">{t("cash.directionIn")}</th>
                <th className="py-2 text-right">{t("cash.directionOut")}</th>
                <th className="py-2 text-right">{t("bankAccounts.colBalance")}</th>
              </tr>
            </thead>
            <tbody>
              {account.opening_balance !== 0 && !dateFrom && (
                <tr className="border-b border-border">
                  <td className="py-3 text-muted-foreground">{account.created_at.slice(0, 10)}</td>
                  <td className="py-3">{t("ledger.openingBalance")}</td>
                  <td className="py-3 text-muted-foreground">-</td>
                  <td className="py-3 text-right">-</td>
                  <td className="py-3 text-right">-</td>
                  <td className="py-3 text-right font-medium">{account.opening_balance.toFixed(2)}</td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={`${r.source}-${r.created_at}-${i}`} className="border-b border-border">
                  <td className="py-3 text-muted-foreground">{r.date}</td>
                  <td className="py-3">{t(SOURCE_KEY[r.source])}</td>
                  <td className="py-3 text-muted-foreground">{r.description || "-"}</td>
                  <td className="py-3 text-right">{r.direction === "in" ? r.amount.toFixed(2) : "-"}</td>
                  <td className="py-3 text-right">{r.direction === "out" ? r.amount.toFixed(2) : "-"}</td>
                  <td className="py-3 text-right font-medium">{r.runningBalance.toFixed(2)}</td>
                </tr>
              ))}
              {rows.length === 0 && account.opening_balance === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t("bankAccounts.emptyStatement")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
