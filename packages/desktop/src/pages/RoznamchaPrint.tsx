import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { addDaysStr, todayStr, type BankAccount, type CashBankTransfer, type Party, type PartyTransfer, type RoznamchaEntry } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

interface DayRow {
  id: string;
  date: string;
  isTransfer: boolean;
  label: string;
  description: string;
  amount: number;
}

export function RoznamchaPrint() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const fromDate = searchParams.get("from") || todayStr();
  const toDate = searchParams.get("to") || todayStr();
  const [entries, setEntries] = useState<RoznamchaEntry[]>([]);
  const [cashBankTransfers, setCashBankTransfers] = useState<CashBankTransfer[]>([]);
  const [partyTransfers, setPartyTransfers] = useState<PartyTransfer[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [entriesRes, cashBankRes, partyTransferRes, partiesRes, banksRes, openingRes, closingRes] = await Promise.all([
        supabase.from("roznamcha_entries").select("*").gte("date", fromDate).lte("date", toDate).order("date").order("created_at"),
        supabase.from("cash_bank_transfers").select("*").gte("date", fromDate).lte("date", toDate).order("date").order("created_at"),
        supabase.from("party_transfers").select("*").gte("date", fromDate).lte("date", toDate).order("date").order("created_at"),
        supabase.from("parties").select("*"),
        supabase.from("bank_accounts").select("*"),
        supabase.rpc("fn_cash_balance_as_of", { p_date: addDaysStr(fromDate, -1) }),
        supabase.rpc("fn_cash_balance_as_of", { p_date: toDate }),
      ]);
      setEntries((entriesRes.data as RoznamchaEntry[]) ?? []);
      setCashBankTransfers((cashBankRes.data as CashBankTransfer[]) ?? []);
      setPartyTransfers((partyTransferRes.data as PartyTransfer[]) ?? []);
      setParties((partiesRes.data as Party[]) ?? []);
      setBankAccounts((banksRes.data as BankAccount[]) ?? []);
      setOpeningBalance((openingRes.data as number | null) ?? 0);
      setClosingBalance((closingRes.data as number | null) ?? 0);
      setLoading(false);
    }
    load();
  }, [fromDate, toDate]);

  function partyName(id: string | null) {
    if (!id) return "-";
    return parties.find((p) => p.id === id)?.name ?? id;
  }
  function bankName(id: string) {
    return bankAccounts.find((b) => b.id === id)?.bank_name ?? id;
  }

  function entryToRow(e: RoznamchaEntry): DayRow {
    return { id: e.id, date: e.date, isTransfer: false, label: partyName(e.party_id), description: e.description, amount: e.amount };
  }
  function transferToRow(tr: CashBankTransfer): DayRow {
    return {
      id: tr.id,
      date: tr.date,
      isTransfer: true,
      label: bankName(tr.bank_account_id),
      description: tr.note || (tr.direction === "cash_to_bank" ? t("transfers.cashToBank") : t("transfers.bankToCash")),
      amount: tr.amount,
    };
  }

  const kharchaRows = [
    ...entries.filter((e) => e.direction === "kharcha").map(entryToRow),
    ...cashBankTransfers.filter((tr) => tr.direction === "cash_to_bank").map(transferToRow),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const aamdanRows = [
    ...entries.filter((e) => e.direction === "aamdan").map(entryToRow),
    ...cashBankTransfers.filter((tr) => tr.direction === "bank_to_cash").map(transferToRow),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const kharchaTotal = kharchaRows.reduce((sum, r) => sum + r.amount, 0);
  const aamdanTotal = aamdanRows.reduce((sum, r) => sum + r.amount, 0);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to="/roznamcha">
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
              <h2 className="text-lg font-semibold">{t("roznamcha.printTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {fromDate === toDate ? fromDate : `${fromDate} – ${toDate}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 text-sm sm:grid-cols-4">
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("roznamcha.openingBalance")}</div>
              <div className="font-medium">{openingBalance.toFixed(2)}</div>
            </div>
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("roznamcha.totalAamdan")}</div>
              <div className="font-medium">{aamdanTotal.toFixed(2)}</div>
            </div>
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("roznamcha.totalKharcha")}</div>
              <div className="font-medium">{kharchaTotal.toFixed(2)}</div>
            </div>
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("roznamcha.netCash")}</div>
              <div className="font-medium">{closingBalance.toFixed(2)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("roznamcha.aamdan")}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("common.date")}</th>
                  <th className="py-2">{t("roznamcha.colParty")}</th>
                  <th className="py-2">{t("roznamcha.colDescription")}</th>
                  <th className="py-2 text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {aamdanRows.map((r) => (
                  <tr key={`aamdan-${r.id}`} className="border-b border-border">
                    <td className="py-2 text-muted-foreground">{r.date}</td>
                    <td className="py-2">
                      {r.isTransfer ? `${t("bankAccounts.sourceTransfer")}: ${r.label}` : r.label}
                    </td>
                    <td className="py-2 text-muted-foreground">{r.description}</td>
                    <td className="py-2 text-right">{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                {aamdanRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      {t("roznamcha.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("roznamcha.kharcha")}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("common.date")}</th>
                  <th className="py-2">{t("roznamcha.colParty")}</th>
                  <th className="py-2">{t("roznamcha.colDescription")}</th>
                  <th className="py-2 text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {kharchaRows.map((r) => (
                  <tr key={`kharcha-${r.id}`} className="border-b border-border">
                    <td className="py-2 text-muted-foreground">{r.date}</td>
                    <td className="py-2">
                      {r.isTransfer ? `${t("bankAccounts.sourceTransfer")}: ${r.label}` : r.label}
                    </td>
                    <td className="py-2 text-muted-foreground">{r.description}</td>
                    <td className="py-2 text-right">{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                {kharchaRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      {t("roznamcha.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("roznamcha.partyTransfersSection")}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("common.date")}</th>
                  <th className="py-2">{t("transfers.fieldFromParty")}</th>
                  <th className="py-2">{t("transfers.fieldToParty")}</th>
                  <th className="py-2">{t("transfers.fieldNote")}</th>
                  <th className="py-2 text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {partyTransfers.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-2 text-muted-foreground">{r.date}</td>
                    <td className="py-2">{partyName(r.from_party_id)}</td>
                    <td className="py-2">{partyName(r.to_party_id)}</td>
                    <td className="py-2 text-muted-foreground">{r.note ?? "-"}</td>
                    <td className="py-2 text-right">{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                {partyTransfers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      {t("transfers.emptyParty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
