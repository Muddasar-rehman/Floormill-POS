import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Printer } from "lucide-react";
import {
  cashAccountSchema,
  cashLedgerSchema,
  todayStr,
  type BankAccount,
  type CashAccount,
  type CashAccountInput,
  type CashBankTransfer,
  type CashLedgerEntry,
  type CashLedgerInput,
  type Party,
  type RoznamchaEntry,
} from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "../components/ui/sonner";
import { RowActions } from "../components/RowActions";

export function Cash() {
  const { t } = useTranslation();
  const [account, setAccount] = useState<CashAccount | null>(null);
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [entries, setEntries] = useState<CashLedgerEntry[]>([]);
  const [roznamchaEntries, setRoznamchaEntries] = useState<RoznamchaEntry[]>([]);
  const [transfers, setTransfers] = useState<CashBankTransfer[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [openBalance, setOpenBalance] = useState(false);
  const [openEntry, setOpenEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CashLedgerEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const balanceForm = useForm<CashAccountInput>({ resolver: zodResolver(cashAccountSchema) });

  const entryForm = useForm<CashLedgerInput>({
    resolver: zodResolver(cashLedgerSchema),
    defaultValues: { direction: "in", date: todayStr() },
  });
  const direction = entryForm.watch("direction");

  async function load() {
    setLoading(true);
    const [accountRes, cashBalanceRes, entriesRes, roznamchaRes, transfersRes, banksRes, partiesRes] = await Promise.all([
      supabase.from("cash_account").select("*").single(),
      supabase.rpc("fn_cash_balance_as_of", { p_date: todayStr() }),
      supabase.from("cash_ledger").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase
        .from("roznamcha_entries")
        .select("*")
        .eq("payment_source", "cash")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("cash_bank_transfers").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("bank_accounts").select("*"),
      supabase.from("parties").select("*"),
    ]);
    setAccount(accountRes.data as CashAccount | null);
    setCashBalance((cashBalanceRes.data as number | null) ?? 0);
    setEntries((entriesRes.data as CashLedgerEntry[]) ?? []);
    setRoznamchaEntries((roznamchaRes.data as RoznamchaEntry[]) ?? []);
    setTransfers((transfersRes.data as CashBankTransfer[]) ?? []);
    setBankAccounts((banksRes.data as BankAccount[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setLoading(false);
  }

  function bankName(id: string) {
    return bankAccounts.find((b) => b.id === id)?.bank_name ?? id;
  }

  function partyName(id: string | null) {
    if (!id) return "-";
    return parties.find((p) => p.id === id)?.name ?? id;
  }

  useEffect(() => {
    load();
  }, []);

  function openEditBalance() {
    if (!account) return;
    balanceForm.reset({ opening_balance: account.opening_balance });
    setOpenBalance(true);
  }

  async function onBalanceSubmit(values: CashAccountInput) {
    if (!account) return;
    const { data, error } = await supabase.from("cash_account").update(values).eq("id", account.id).select();
    if (error) {
      toast.error(t("common.failedUpdate"), { description: error.message });
      return;
    }
    if (!data || data.length === 0) {
      toast.error(t("common.failedUpdate"));
      return;
    }
    toast.success(t("common.updated"));
    setOpenBalance(false);
    load();
  }

  function openCreateEntry() {
    setEditingEntry(null);
    entryForm.reset({ direction: "in", date: todayStr(), amount: undefined, tag: "" });
    setOpenEntry(true);
  }

  function openEditEntry(e: CashLedgerEntry) {
    setEditingEntry(e);
    entryForm.reset({ direction: e.direction, amount: e.amount, tag: e.tag, date: e.date });
    setOpenEntry(true);
  }

  async function onEntrySubmit(values: CashLedgerInput) {
    if (editingEntry) {
      const { data, error } = await supabase.from("cash_ledger").update(values).eq("id", editingEntry.id).select();
      if (error) {
        toast.error(t("common.failedUpdate"), { description: error.message });
        return;
      }
      if (!data || data.length === 0) {
        toast.error(t("common.failedUpdate"));
        return;
      }
      toast.success(t("cash.toastEntryUpdated"));
    } else {
      const { error } = await supabase.from("cash_ledger").insert(values);
      if (error) {
        toast.error(t("common.failedSave"), { description: error.message });
        return;
      }
      toast.success(t("cash.toastEntryAdded"));
    }
    setOpenEntry(false);
    setEditingEntry(null);
    load();
  }

  async function handleDeleteEntry(id: string) {
    const { error } = await supabase.from("cash_ledger").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("cash.toastEntryDeleted"));
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("cash.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("cash.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/cash/print">
              <Printer />
              {t("common.print")}
            </Link>
          </Button>
          <Dialog open={openBalance} onOpenChange={setOpenBalance}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openEditBalance} disabled={!account}>
                <Pencil />
                {t("common.edit")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("cash.dialogEdit")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={balanceForm.handleSubmit(onBalanceSubmit)} className="space-y-4">
                <FormField label={t("cash.fieldOpeningBalance")} error={balanceForm.formState.errors.opening_balance?.message}>
                  <Input type="number" step="0.01" {...balanceForm.register("opening_balance")} autoFocus />
                </FormField>
                <p className="text-sm text-muted-foreground">{t("cash.openingBalanceHint")}</p>
                <DialogFooter>
                  <Button type="submit" disabled={balanceForm.formState.isSubmitting}>
                    {balanceForm.formState.isSubmitting ? t("common.saving") : t("common.save")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={openEntry}
            onOpenChange={(v) => {
              setOpenEntry(v);
              if (!v) setEditingEntry(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreateEntry}>
                <Plus />
                {t("cash.addEntry")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingEntry ? t("cash.dialogEditEntry") : t("cash.dialogAddEntry")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={entryForm.handleSubmit(onEntrySubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={t("cash.fieldDirection")} className="col-span-2">
                  <Controller
                    name="direction"
                    control={entryForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">{t("cash.directionIn")}</SelectItem>
                          <SelectItem value="out">{t("cash.directionOut")}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label={t("common.amount")} error={entryForm.formState.errors.amount?.message}>
                  <Input type="number" step="0.01" {...entryForm.register("amount")} autoFocus />
                </FormField>
                <FormField label={t("common.date")} error={entryForm.formState.errors.date?.message}>
                  <Input type="date" {...entryForm.register("date")} />
                </FormField>
                <FormField
                  label={direction === "out" ? t("cash.fieldTagOut") : t("cash.fieldTagIn")}
                  error={entryForm.formState.errors.tag?.message}
                  className="col-span-2"
                >
                  <Input {...entryForm.register("tag")} placeholder={direction === "out" ? t("cash.fieldTagOutPlaceholder") : t("cash.fieldTagInPlaceholder")} />
                </FormField>
                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={entryForm.formState.isSubmitting}>
                    {entryForm.formState.isSubmitting ? t("common.saving") : t("common.save")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">{t("cash.colBalance")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-9 w-32" /> : <div className="text-3xl font-semibold">{cashBalance.toFixed(2)}</div>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("cash.sectionManualEntries")}</h2>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("cash.colDirection")}</TableHead>
                    <TableHead>{t("cash.colTag")}</TableHead>
                    <TableHead className="text-right">{t("common.amount")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">{e.date}</TableCell>
                      <TableCell>
                        <Badge variant={e.direction === "in" ? "success" : "destructive"}>
                          {e.direction === "in" ? t("cash.directionIn") : t("cash.directionOut")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.tag}</TableCell>
                      <TableCell className={`text-right font-medium ${e.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {e.direction === "in" ? "+" : "-"}
                        {e.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <RowActions
                          onEdit={() => openEditEntry(e)}
                          onDelete={() => handleDeleteEntry(e.id)}
                          deleteTitle={t("cash.deleteEntryTitle")}
                          deleteDescription={t("cash.deleteEntryDesc")}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        {t("cash.emptyEntries")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("cash.sectionRoznamcha")}</h2>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("cash.colDirection")}</TableHead>
                    <TableHead>{t("roznamcha.colParty")}</TableHead>
                    <TableHead>{t("roznamcha.colDescription")}</TableHead>
                    <TableHead className="text-right">{t("common.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roznamchaEntries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">{e.date}</TableCell>
                      <TableCell>
                        <Badge variant={e.direction === "aamdan" ? "success" : "destructive"}>
                          {e.direction === "aamdan" ? t("roznamcha.aamdan") : t("roznamcha.kharcha")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{partyName(e.party_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.description}</TableCell>
                      <TableCell
                        className={`text-right font-medium ${e.direction === "aamdan" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {e.direction === "aamdan" ? "+" : "-"}
                        {e.amount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {roznamchaEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        {t("cash.emptyRoznamcha")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("cash.sectionTransfers")}</h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/roznamcha">{t("transfers.recordTransfer")}</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("cash.colDirection")}</TableHead>
                    <TableHead>{t("bankAccounts.title")}</TableHead>
                    <TableHead className="text-right">{t("common.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((tr) => (
                    <TableRow key={tr.id}>
                      <TableCell className="text-muted-foreground">{tr.date}</TableCell>
                      <TableCell>
                        <Badge variant={tr.direction === "bank_to_cash" ? "success" : "destructive"}>
                          {tr.direction === "bank_to_cash" ? t("cash.directionIn") : t("cash.directionOut")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{bankName(tr.bank_account_id)}</TableCell>
                      <TableCell
                        className={`text-right font-medium ${tr.direction === "bank_to_cash" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {tr.direction === "bank_to_cash" ? "+" : "-"}
                        {tr.amount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {transfers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        {t("transfers.emptyCashBank")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
