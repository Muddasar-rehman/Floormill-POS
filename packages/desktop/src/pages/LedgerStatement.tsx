import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { computeRunningNetBalances, openingNet, type BankAccount, type LedgerEntry, type Party } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

const TXN_KEY: Record<string, string> = {
  purchase: "common.txnPurchase",
  sale: "common.txnSale",
  payment: "common.txnPayment",
  receipt: "common.txnReceipt",
  transfer: "common.txnTransfer",
};

export function LedgerStatement() {
  const { t } = useTranslation();
  const { partyId } = useParams<{ partyId: string }>();
  const [searchParams] = useSearchParams();
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";
  const [party, setParty] = useState<Party | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [details, setDetails] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partyId) return;
    async function load() {
      const { data: partyData } = await supabase.from("parties").select("*").eq("id", partyId).single();
      const partyRow = partyData as Party | null;
      setParty(partyRow);

      const { data: entriesData } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("party_id", partyId)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });
      const allRows = (entriesData as LedgerEntry[]) ?? [];
      // Compute the running balance over the FULL history first (so it's correct even
      // under a date filter), then narrow down to the requested range for display.
      const running = partyRow ? computeRunningNetBalances(partyRow, allRows) : allRows.map(() => 0);
      const withRunning = allRows.map((e, i) => ({ ...e, balance_after: running[i] }));
      const rows = withRunning.filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo));
      setEntries(rows);

      const purchaseIds = rows.filter((r) => r.txn_type === "purchase").map((r) => r.txn_id);
      const saleIds = rows.filter((r) => r.txn_type === "sale").map((r) => r.txn_id);
      const paymentIds = rows.filter((r) => r.txn_type === "payment").map((r) => r.txn_id);
      const receiptIds = rows.filter((r) => r.txn_type === "receipt").map((r) => r.txn_id);

      const [purchasesRes, salesRes, paymentsRes, receiptsRes, bankAccountsRes] = await Promise.all([
        purchaseIds.length ? supabase.from("purchases").select("id, invoice_no").in("id", purchaseIds) : Promise.resolve({ data: [] }),
        saleIds.length ? supabase.from("sales").select("id, invoice_no").in("id", saleIds) : Promise.resolve({ data: [] }),
        paymentIds.length
          ? supabase.from("payments").select("id, payment_source, bank_account_id, notes").in("id", paymentIds)
          : Promise.resolve({ data: [] }),
        receiptIds.length
          ? supabase.from("receipts").select("id, payment_source, bank_account_id, notes").in("id", receiptIds)
          : Promise.resolve({ data: [] }),
        supabase.from("bank_accounts").select("*"),
      ]);

      const bankAccounts = (bankAccountsRes.data as BankAccount[]) ?? [];
      const bankName = (id: string | null) => bankAccounts.find((b) => b.id === id)?.bank_name ?? "";

      const map = new Map<string, string>();
      for (const p of (purchasesRes.data as { id: string; invoice_no: number }[]) ?? []) {
        map.set(p.id, `P-${p.invoice_no}`);
      }
      for (const s of (salesRes.data as { id: string; invoice_no: number }[]) ?? []) {
        map.set(s.id, `S-${s.invoice_no}`);
      }
      for (const p of (paymentsRes.data as { id: string; payment_source: string; bank_account_id: string | null; notes: string | null }[]) ?? []) {
        const source = p.payment_source === "bank" ? `${t("common.bank")} (${bankName(p.bank_account_id)})` : t("common.cash");
        map.set(p.id, [source, p.notes].filter(Boolean).join(" — "));
      }
      for (const r of (receiptsRes.data as { id: string; payment_source: string; bank_account_id: string | null; notes: string | null }[]) ?? []) {
        const source = r.payment_source === "bank" ? `${t("common.bank")} (${bankName(r.bank_account_id)})` : t("common.cash");
        map.set(r.id, [source, r.notes].filter(Boolean).join(" — "));
      }
      setDetails(map);

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!party) {
    return <div className="text-muted-foreground">{t("ledger.partyNotFound")}</div>;
  }

  const balance = entries.length > 0 ? entries[entries.length - 1].balance_after : party.opening_balance;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to="/ledger">
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
              <h2 className="text-lg font-semibold">{t("ledger.statementTitle")}</h2>
              {(dateFrom || dateTo) && (
                <p className="text-sm text-muted-foreground">
                  {dateFrom || "…"} – {dateTo || "…"}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("ledger.selectParty")}</div>
              <div className="font-medium">{party.name}</div>
              {party.address && <div className="text-muted-foreground">{party.address}</div>}
              {party.contact && <div className="text-muted-foreground">{party.contact}</div>}
            </div>
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("ledger.colBalance")}</div>
              <div className="font-medium">
                {balance < 0
                  ? t("ledger.balancePayable", { amount: Math.abs(balance).toFixed(2) })
                  : balance > 0
                    ? t("ledger.balanceReceivable", { amount: balance.toFixed(2) })
                    : t("ledger.balanceSettled")}
              </div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">{t("ledger.colDate")}</th>
                <th className="py-2">{t("ledger.colType")}</th>
                <th className="py-2">{t("ledger.colDetails")}</th>
                <th className="py-2 text-right">{t("ledger.colDebit")}</th>
                <th className="py-2 text-right">{t("ledger.colCredit")}</th>
                <th className="py-2 text-right">{t("ledger.colBalance")}</th>
              </tr>
            </thead>
            <tbody>
              {party.opening_balance !== 0 && (
                <tr className="border-b border-border">
                  <td className="py-3 text-muted-foreground">{party.created_at.slice(0, 10)}</td>
                  <td className="py-3">{t("ledger.openingBalance")}</td>
                  <td className="py-3 text-muted-foreground">-</td>
                  <td className="py-3 text-right">-</td>
                  <td className="py-3 text-right">-</td>
                  <td className="py-3 text-right font-medium">{openingNet(party).toFixed(2)}</td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border">
                  <td className="py-3 text-muted-foreground">{e.date}</td>
                  <td className="py-3">{t(TXN_KEY[e.txn_type] ?? e.txn_type)}</td>
                  <td className="py-3 text-muted-foreground">{details.get(e.txn_id) ?? "-"}</td>
                  <td className="py-3 text-right">{e.debit ? e.debit.toFixed(2) : "-"}</td>
                  <td className="py-3 text-right">{e.credit ? e.credit.toFixed(2) : "-"}</td>
                  <td className="py-3 text-right font-medium">{e.balance_after.toFixed(2)}</td>
                </tr>
              ))}
              {entries.length === 0 && party.opening_balance === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t("ledger.empty", { name: party.name })}
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
