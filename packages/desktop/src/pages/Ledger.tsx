import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil, Printer } from "lucide-react";
import { computePartyNetBalance, computeRunningNetBalances, openingNet, type LedgerEntry, type Party } from "shared";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const TXN_KEY: Record<string, string> = {
  purchase: "common.txnPurchase",
  sale: "common.txnSale",
  payment: "common.txnPayment",
  receipt: "common.txnReceipt",
  transfer: "common.txnTransfer",
};

const TXN_EDIT_ROUTE: Record<string, string> = {
  purchase: "/purchases",
  sale: "/sales",
  payment: "/payments",
  receipt: "/receipts",
};

export function Ledger() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  useEffect(() => {
    async function load() {
      setLoadingList(true);
      const [{ data: partiesData }, { data: entriesData }] = await Promise.all([
        supabase.from("parties").select("*").order("name"),
        supabase.from("ledger_entries").select("*").order("date").order("created_at"),
      ]);
      const partiesList = (partiesData as Party[]) ?? [];
      setParties(partiesList);

      const entriesByParty = new Map<string, LedgerEntry[]>();
      for (const e of (entriesData as LedgerEntry[]) ?? []) {
        const list = entriesByParty.get(e.party_id);
        if (list) list.push(e);
        else entriesByParty.set(e.party_id, [e]);
      }
      const net = new Map<string, number>();
      for (const p of partiesList) {
        net.set(p.id, computePartyNetBalance(p, entriesByParty.get(p.id) ?? []));
      }
      setBalances(net);
      setLoadingList(false);
    }
    load();
  }, []);

  // Full unfiltered history for the selected party, so the running balance is always
  // correct even when a date range is applied for display purposes below.
  const [allEntries, setAllEntries] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    if (!selected) {
      setAllEntries([]);
      return;
    }
    setLoadingEntries(true);
    supabase
      .from("ledger_entries")
      .select("*")
      .eq("party_id", selected)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setAllEntries((data as LedgerEntry[]) ?? []);
        setLoadingEntries(false);
      });
  }, [selected]);

  const filteredParties = useMemo(
    () => parties.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [parties, search]
  );

  function partyBalance(p: Party) {
    return balances.get(p.id) ?? 0;
  }

  const selectedParty = parties.find((p) => p.id === selected);
  const selectedBalance = selectedParty ? partyBalance(selectedParty) : 0;

  useEffect(() => {
    if (!selectedParty) {
      setEntries([]);
      return;
    }
    const running = computeRunningNetBalances(selectedParty, allEntries);
    const withRunning = allEntries.map((e, i) => ({ ...e, balance_after: running[i] }));
    const filtered = withRunning.filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo));
    setEntries(filtered);
  }, [selectedParty, allEntries, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("ledger.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("ledger.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-4 space-y-3">
            <Input placeholder={t("ledger.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
            {loadingList ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="max-h-[32rem] space-y-1 overflow-y-auto">
                {filteredParties.map((p) => {
                  const balance = partyBalance(p);
                  const isReceivable = balance > 0;
                  const isPayable = balance < 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(p.id)}
                      className={`grid w-full grid-cols-[1fr_auto_5rem] items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                        selected === p.id ? "bg-muted" : ""
                      }`}
                    >
                      <span className="truncate font-medium" title={p.name}>
                        {p.name}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {isReceivable ? t("ledger.tagReceivable") : isPayable ? t("ledger.tagPayable") : t("ledger.tagSettled")}
                      </Badge>
                      <span
                        className={cn(
                          "text-right tabular-nums",
                          isReceivable
                            ? "font-medium text-emerald-600 dark:text-emerald-400"
                            : isPayable
                              ? "font-medium text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                        )}
                      >
                        {Math.abs(balance).toFixed(2)}
                      </span>
                    </button>
                  );
                })}
                {filteredParties.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("ledger.noParties")}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {!selectedParty ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">{t("ledger.selectPlaceholder")}</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-semibold">{selectedParty.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedBalance < 0
                        ? t("ledger.balancePayable", { amount: Math.abs(selectedBalance).toFixed(2) })
                        : selectedBalance > 0
                          ? t("ledger.balanceReceivable", { amount: selectedBalance.toFixed(2) })
                          : t("ledger.balanceSettled")}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <FormField label={t("ledger.fieldFrom")}>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </FormField>
                    <FormField label={t("ledger.fieldTo")}>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </FormField>
                    {(dateFrom || dateTo) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                        }}
                      >
                        {t("ledger.clearDates")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        const params = new URLSearchParams();
                        if (dateFrom) params.set("from", dateFrom);
                        if (dateTo) params.set("to", dateTo);
                        const qs = params.toString();
                        navigate(`/ledger/${selectedParty.id}/print${qs ? `?${qs}` : ""}`);
                      }}
                    >
                      <Printer />
                      {t("common.print")}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  {loadingEntries ? (
                    <div className="space-y-3 p-6">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("ledger.colDate")}</TableHead>
                          <TableHead>{t("ledger.colType")}</TableHead>
                          <TableHead className="text-right">{t("ledger.colDebit")}</TableHead>
                          <TableHead className="text-right">{t("ledger.colCredit")}</TableHead>
                          <TableHead className="text-right">{t("ledger.colBalance")}</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedParty.opening_balance !== 0 && (
                          <TableRow>
                            <TableCell className="text-muted-foreground">{selectedParty.created_at.slice(0, 10)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{t("ledger.openingBalance")}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">-</TableCell>
                            <TableCell className="text-right text-muted-foreground">-</TableCell>
                            <TableCell className="text-right font-medium">{openingNet(selectedParty).toFixed(2)}</TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}
                        {entries.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-muted-foreground">{e.date}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{t(TXN_KEY[e.txn_type] ?? e.txn_type)}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{e.debit ? e.debit.toFixed(2) : "-"}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{e.credit ? e.credit.toFixed(2) : "-"}</TableCell>
                            <TableCell className="text-right font-medium">{e.balance_after.toFixed(2)}</TableCell>
                            <TableCell>
                              {TXN_EDIT_ROUTE[e.txn_type] && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() => navigate(`${TXN_EDIT_ROUTE[e.txn_type]}?edit=${e.txn_id}`)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {entries.length === 0 && selectedParty.opening_balance === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                              {t("ledger.empty", { name: selectedParty.name })}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
