import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { todayStr, type BankAccount, type CashBankTransfer, type CashLedgerEntry, type Party, type RoznamchaEntry } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export function CashPrint() {
  const { t } = useTranslation();
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [entries, setEntries] = useState<CashLedgerEntry[]>([]);
  const [roznamchaEntries, setRoznamchaEntries] = useState<RoznamchaEntry[]>([]);
  const [transfers, setTransfers] = useState<CashBankTransfer[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [cashBalanceRes, entriesRes, roznamchaRes, transfersRes, banksRes, partiesRes] = await Promise.all([
        supabase.rpc("fn_cash_balance_as_of", { p_date: todayStr() }),
        supabase.from("cash_ledger").select("*").order("date", { ascending: true }).order("created_at", { ascending: true }),
        supabase
          .from("roznamcha_entries")
          .select("*")
          .eq("payment_source", "cash")
          .order("date", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("cash_bank_transfers").select("*").order("date", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("bank_accounts").select("*"),
        supabase.from("parties").select("*"),
      ]);
      setCashBalance((cashBalanceRes.data as number | null) ?? 0);
      setEntries((entriesRes.data as CashLedgerEntry[]) ?? []);
      setRoznamchaEntries((roznamchaRes.data as RoznamchaEntry[]) ?? []);
      setTransfers((transfersRes.data as CashBankTransfer[]) ?? []);
      setBankAccounts((banksRes.data as BankAccount[]) ?? []);
      setParties((partiesRes.data as Party[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function partyName(id: string | null) {
    if (!id) return "-";
    return parties.find((p) => p.id === id)?.name ?? id;
  }

  function bankName(id: string) {
    return bankAccounts.find((b) => b.id === id)?.bank_name ?? id;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to="/cash">
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
              <h2 className="text-lg font-semibold">{t("cash.printTitle")}</h2>
              <p className="text-sm text-muted-foreground">{todayStr()}</p>
            </div>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-muted-foreground">{t("cash.colBalance")}</div>
            <div className="text-2xl font-semibold">{loading ? "…" : cashBalance.toFixed(2)}</div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("cash.sectionManualEntries")}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("common.date")}</th>
                  <th className="py-2">{t("cash.colDirection")}</th>
                  <th className="py-2">{t("cash.colTag")}</th>
                  <th className="py-2 text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border">
                    <td className="py-2 text-muted-foreground">{e.date}</td>
                    <td className="py-2">{e.direction === "in" ? t("cash.directionIn") : t("cash.directionOut")}</td>
                    <td className="py-2 text-muted-foreground">{e.tag}</td>
                    <td className="py-2 text-right">
                      {e.direction === "in" ? "+" : "-"}
                      {e.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {!loading && entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      {t("cash.emptyEntries")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("cash.sectionRoznamcha")}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("common.date")}</th>
                  <th className="py-2">{t("cash.colDirection")}</th>
                  <th className="py-2">{t("roznamcha.colParty")}</th>
                  <th className="py-2">{t("roznamcha.colDescription")}</th>
                  <th className="py-2 text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {roznamchaEntries.map((e) => (
                  <tr key={e.id} className="border-b border-border">
                    <td className="py-2 text-muted-foreground">{e.date}</td>
                    <td className="py-2">{e.direction === "aamdan" ? t("roznamcha.aamdan") : t("roznamcha.kharcha")}</td>
                    <td className="py-2 text-muted-foreground">{partyName(e.party_id)}</td>
                    <td className="py-2 text-muted-foreground">{e.description}</td>
                    <td className="py-2 text-right">
                      {e.direction === "aamdan" ? "+" : "-"}
                      {e.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {!loading && roznamchaEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      {t("cash.emptyRoznamcha")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("cash.sectionTransfers")}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("common.date")}</th>
                  <th className="py-2">{t("cash.colDirection")}</th>
                  <th className="py-2">{t("bankAccounts.title")}</th>
                  <th className="py-2 text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr) => (
                  <tr key={tr.id} className="border-b border-border">
                    <td className="py-2 text-muted-foreground">{tr.date}</td>
                    <td className="py-2">{tr.direction === "bank_to_cash" ? t("cash.directionIn") : t("cash.directionOut")}</td>
                    <td className="py-2 text-muted-foreground">{bankName(tr.bank_account_id)}</td>
                    <td className="py-2 text-right">
                      {tr.direction === "bank_to_cash" ? "+" : "-"}
                      {tr.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {!loading && transfers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      {t("transfers.emptyCashBank")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
