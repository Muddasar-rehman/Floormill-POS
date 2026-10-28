import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Lock, Plus, Printer, Trash2, Users } from "lucide-react";
import {
  addDaysStr,
  cashBankTransferSchema,
  daysAgoStr,
  partyTransferSchema,
  roznamchaEntrySchema,
  todayStr,
  type BankAccount,
  type CashBankTransfer,
  type CashBankTransferInput,
  type Party,
  type PartyTransfer,
  type PartyTransferInput,
  type RoznamchaDayClosure,
  type RoznamchaDirection,
  type RoznamchaEntry,
  type RoznamchaEntryInput,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "../components/ui/sonner";
import { DeleteConfirm } from "../components/DeleteConfirm";

// The active working day is the day after the most recently closed date, but
// never later than today — so the moment you're caught up, it settles back
// on today rather than drifting into the future.
function computeActiveDay(closures: RoznamchaDayClosure[]): string {
  if (closures.length === 0) return todayStr();
  const lastClosed = closures.reduce((max, c) => (c.date > max ? c.date : max), closures[0].date);
  const next = addDaysStr(lastClosed, 1);
  const today = todayStr();
  return next < today ? next : today;
}

// One display row shared by real Roznamcha entries and Cash<->Bank
// transfers, so both render in the same Kharcha/Aamdan tables — a cash
// deposit into the bank is just as much "cash leaving the drawer today" as
// any other Kharcha, and a withdrawal is as much an Aamdan as any other.
interface DayRow {
  id: string;
  date: string;
  isTransfer: boolean;
  label: string;
  description: string;
  reference: string;
  amount: number;
  onDelete: () => void;
}

export function Roznamcha() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<RoznamchaEntry[]>([]);
  const [cashBankTransfers, setCashBankTransfers] = useState<CashBankTransfer[]>([]);
  const [partyTransfers, setPartyTransfers] = useState<PartyTransfer[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cashAsOfDate, setCashAsOfDate] = useState<number>(0);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [closures, setClosures] = useState<RoznamchaDayClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [open, setOpen] = useState(false);
  const [cashBankOpen, setCashBankOpen] = useState(false);
  const [partyTransferOpen, setPartyTransferOpen] = useState(false);
  const [closeDayOpen, setCloseDayOpen] = useState(false);
  const [closeDate, setCloseDate] = useState(todayStr());
  const [closingDay, setClosingDay] = useState(false);
  const [closeDayTotals, setCloseDayTotals] = useState<{ opening: number; aamdan: number; kharcha: number } | null>(null);
  const [activeDayOverride, setActiveDayOverride] = useState<string | null>(null);

  const activeDay = activeDayOverride ?? computeActiveDay(closures);
  const closedDates = new Set(closures.map((c) => c.date));
  const closeDateAlreadyClosed = closedDates.has(closeDate);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RoznamchaEntryInput>({
    resolver: zodResolver(roznamchaEntrySchema),
    defaultValues: { date: todayStr(), direction: "kharcha", payment_source: "cash" },
  });

  const cashBankForm = useForm<CashBankTransferInput>({
    resolver: zodResolver(cashBankTransferSchema),
    defaultValues: { direction: "cash_to_bank", date: todayStr() },
  });

  const partyTransferForm = useForm<PartyTransferInput>({
    resolver: zodResolver(partyTransferSchema),
    defaultValues: { date: todayStr() },
  });

  const direction = watch("direction");
  const paymentSource = watch("payment_source");
  const entryDate = watch("date");
  const dateOptions = [
    { value: todayStr(), label: t("roznamcha.today") },
    { value: daysAgoStr(1), label: t("roznamcha.yesterday") },
    { value: daysAgoStr(2), label: t("roznamcha.dayBeforeYesterday") },
  ];

  async function load() {
    setLoading(true);
    const [entriesRes, cashBankRes, partyTransferRes, partiesRes, banksRes, cashRes, openingRes, closuresRes] = await Promise.all([
      supabase
        .from("roznamcha_entries")
        .select("*")
        .gte("date", fromDate)
        .lte("date", toDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("cash_bank_transfers")
        .select("*")
        .gte("date", fromDate)
        .lte("date", toDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("party_transfers")
        .select("*")
        .gte("date", fromDate)
        .lte("date", toDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("parties").select("*").order("name"),
      supabase.from("bank_accounts").select("*").order("bank_name"),
      supabase.rpc("fn_cash_balance_as_of", { p_date: toDate }),
      supabase.rpc("fn_cash_balance_as_of", { p_date: addDaysStr(fromDate, -1) }),
      supabase.from("roznamcha_day_closures").select("*"),
    ]);
    setEntries((entriesRes.data as RoznamchaEntry[]) ?? []);
    setCashBankTransfers((cashBankRes.data as CashBankTransfer[]) ?? []);
    setPartyTransfers((partyTransferRes.data as PartyTransfer[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setBankAccounts((banksRes.data as BankAccount[]) ?? []);
    setCashAsOfDate((cashRes.data as number | null) ?? 0);
    setOpeningBalance((openingRes.data as number | null) ?? 0);
    setClosures((closuresRes.data as RoznamchaDayClosure[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  function partyName(id: string | null) {
    if (!id) return "-";
    return parties.find((p) => p.id === id)?.name ?? id;
  }

  function bankName(id: string) {
    return bankAccounts.find((b) => b.id === id)?.bank_name ?? id;
  }

  function openAdd(dir: RoznamchaDirection) {
    reset({ date: activeDay, direction: dir, payment_source: "cash", party_id: undefined, reference_no: "", description: "", amount: undefined });
    setOpen(true);
  }

  function openCashBankTransfer() {
    cashBankForm.reset({ direction: "cash_to_bank", date: activeDay, amount: undefined, bank_account_id: undefined, note: "" });
    setCashBankOpen(true);
  }

  function openPartyTransfer() {
    partyTransferForm.reset({ date: activeDay, amount: undefined, from_party_id: undefined, to_party_id: undefined, note: "" });
    setPartyTransferOpen(true);
  }

  // The close-day summary must total everything that moved cash that day —
  // Roznamcha entries AND Cash<->Bank transfers — or it won't match the
  // Opening + Aamdan - Kharcha = Closing arithmetic fn_cash_balance_as_of
  // already uses for the balance cards. Only payment_source = 'cash' entries
  // count here: a bank-paid Roznamcha entry moves bank_accounts.balance, not
  // cash, same as fn_cash_balance_as_of's own payments/receipts/expenses filters.
  async function fetchCloseDayTotals(date: string) {
    setCloseDayTotals(null);
    const [entriesRes, transfersRes, openingRes] = await Promise.all([
      supabase.from("roznamcha_entries").select("direction, amount").eq("date", date).eq("payment_source", "cash"),
      supabase.from("cash_bank_transfers").select("direction, amount").eq("date", date),
      supabase.rpc("fn_cash_balance_as_of", { p_date: addDaysStr(date, -1) }),
    ]);
    const rows = (entriesRes.data as { direction: RoznamchaDirection; amount: number }[]) ?? [];
    const transferRows = (transfersRes.data as { direction: CashBankTransferInput["direction"]; amount: number }[]) ?? [];
    setCloseDayTotals({
      opening: (openingRes.data as number | null) ?? 0,
      aamdan:
        rows.filter((r) => r.direction === "aamdan").reduce((s, r) => s + r.amount, 0) +
        transferRows.filter((r) => r.direction === "bank_to_cash").reduce((s, r) => s + r.amount, 0),
      kharcha:
        rows.filter((r) => r.direction === "kharcha").reduce((s, r) => s + r.amount, 0) +
        transferRows.filter((r) => r.direction === "cash_to_bank").reduce((s, r) => s + r.amount, 0),
    });
  }

  function openCloseDay() {
    setCloseDate(activeDay);
    setCloseDayOpen(true);
    fetchCloseDayTotals(activeDay);
  }

  function onCloseDateChange(date: string) {
    setCloseDate(date);
    fetchCloseDayTotals(date);
  }

  async function handleCloseDay() {
    setClosingDay(true);
    const { error } = await supabase.from("roznamcha_day_closures").insert({ date: closeDate });
    setClosingDay(false);
    if (error) {
      if (error.code === "23505") {
        toast.error(t("roznamcha.dayAlreadyClosedError", { date: closeDate }));
      } else {
        toast.error(t("common.failedSave"), { description: error.message });
      }
      return;
    }
    toast.success(t("roznamcha.toastDayClosed", { date: closeDate }));
    setCloseDayOpen(false);
    setActiveDayOverride(null);
    const newDay = addDaysStr(closeDate, 1);
    const today = todayStr();
    const nextActive = newDay < today ? newDay : today;
    setFromDate(nextActive);
    setToDate(nextActive);
    load();
  }

  async function onSubmit(values: RoznamchaEntryInput) {
    const payload = {
      ...values,
      party_id: values.party_id || null,
      bank_account_id: values.payment_source === "bank" ? values.bank_account_id : null,
    };
    const { error } = await supabase.from("roznamcha_entries").insert(payload);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("roznamcha.toastRecorded"));
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("roznamcha_entries").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("roznamcha.toastDeleted"));
    load();
  }

  async function onCashBankSubmit(values: CashBankTransferInput) {
    const { error } = await supabase.from("cash_bank_transfers").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("transfers.toastCashBankRecorded"));
    setCashBankOpen(false);
    load();
  }

  async function handleDeleteCashBankTransfer(id: string) {
    const { error } = await supabase.from("cash_bank_transfers").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("transfers.toastCashBankDeleted"));
    load();
  }

  async function onPartyTransferSubmit(values: PartyTransferInput) {
    const { error } = await supabase.from("party_transfers").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("transfers.toastPartyRecorded"));
    setPartyTransferOpen(false);
    load();
  }

  async function handleDeletePartyTransfer(id: string) {
    const { error } = await supabase.from("party_transfers").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("transfers.toastPartyDeleted"));
    load();
  }

  function entryToRow(e: RoznamchaEntry): DayRow {
    return {
      id: e.id,
      date: e.date,
      isTransfer: false,
      label: partyName(e.party_id),
      description: e.description,
      reference: e.reference_no ?? "-",
      amount: e.amount,
      onDelete: () => handleDelete(e.id),
    };
  }

  function transferToRow(tr: CashBankTransfer): DayRow {
    return {
      id: tr.id,
      date: tr.date,
      isTransfer: true,
      label: bankName(tr.bank_account_id),
      description: tr.note || (tr.direction === "cash_to_bank" ? t("transfers.cashToBank") : t("transfers.bankToCash")),
      reference: "-",
      amount: tr.amount,
      onDelete: () => handleDeleteCashBankTransfer(tr.id),
    };
  }

  const kharchaRows = [
    ...entries.filter((e) => e.direction === "kharcha").map(entryToRow),
    ...cashBankTransfers.filter((tr) => tr.direction === "cash_to_bank").map(transferToRow),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const aamdanRows = [
    ...entries.filter((e) => e.direction === "aamdan").map(entryToRow),
    ...cashBankTransfers.filter((tr) => tr.direction === "bank_to_cash").map(transferToRow),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const kharchaTotal = kharchaRows.reduce((sum, r) => sum + r.amount, 0);
  const aamdanTotal = aamdanRows.reduce((sum, r) => sum + r.amount, 0);

  function Column({ dir, rows, total }: { dir: RoznamchaDirection; rows: DayRow[]; total: number }) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="font-semibold">{dir === "kharcha" ? t("roznamcha.kharcha") : t("roznamcha.aamdan")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("roznamcha.total")}: <span className="font-medium text-foreground">{total.toFixed(2)}</span>
              </p>
            </div>
            <Button size="sm" onClick={() => openAdd(dir)}>
              <Plus className="h-4 w-4" />
              {t("roznamcha.addEntry")}
            </Button>
          </div>
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("roznamcha.colParty")}</TableHead>
                  <TableHead>{t("roznamcha.colDescription")}</TableHead>
                  <TableHead>{t("roznamcha.colReference")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.isTransfer ? "transfer" : "entry"}-${r.id}`}>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">
                      {r.isTransfer ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="outline">{t("bankAccounts.sourceTransfer")}</Badge>
                          {r.label}
                        </span>
                      ) : (
                        r.label
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.description}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reference}</TableCell>
                    <TableCell className="text-right font-medium">{r.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <DeleteConfirm
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title={r.isTransfer ? t("transfers.deleteCashBankTitle") : t("roznamcha.deleteTitle")}
                        description={r.isTransfer ? t("transfers.deleteDesc") : t("roznamcha.deleteDesc")}
                        onConfirm={r.onDelete}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("roznamcha.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("roznamcha.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("roznamcha.subtitle")}</p>
        </div>
        <div className="flex items-end gap-3">
          <FormField label={t("common.from")}>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </FormField>
          <FormField label={t("common.to")}>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </FormField>
          <Button variant="outline" onClick={() => navigate(`/roznamcha/print?from=${fromDate}&to=${toDate}`)}>
            <Printer />
            {t("common.print")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("roznamcha.openDay")}:</span>
          <Input
            type="date"
            className="h-8 w-auto font-semibold"
            value={activeDay}
            onChange={(e) => setActiveDayOverride(e.target.value)}
          />
          {activeDayOverride !== null && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => setActiveDayOverride(null)}>
              {t("roznamcha.resetOpenDay")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={openCashBankTransfer}>
            <ArrowLeftRight className="h-4 w-4" />
            {t("transfers.cashBankTitle")}
          </Button>
          <Button size="sm" variant="outline" onClick={openPartyTransfer}>
            <Users className="h-4 w-4" />
            {t("transfers.partyTitle")}
          </Button>
          <Button size="sm" variant="outline" onClick={openCloseDay}>
            <Lock className="h-4 w-4" />
            {t("roznamcha.closeDay")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("roznamcha.openingBalance")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("roznamcha.openingBalanceNote", { date: addDaysStr(fromDate, -1) })}</p>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-semibold">{openingBalance.toFixed(2)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("roznamcha.totalAamdan")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{aamdanTotal.toFixed(2)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("roznamcha.totalKharcha")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-semibold text-red-600 dark:text-red-400">{kharchaTotal.toFixed(2)}</div>}
          </CardContent>
        </Card>
        <Link to="/cash">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{t("roznamcha.netCash")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("roznamcha.asOfDate", { date: toDate })}</p>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-semibold">{cashAsOfDate.toFixed(2)}</div>}
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Column dir="kharcha" rows={kharchaRows} total={kharchaTotal} />
        <Column dir="aamdan" rows={aamdanRows} total={aamdanTotal} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("roznamcha.partyTransfersSection")}</h2>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("transfers.fieldFromParty")}</TableHead>
                    <TableHead>{t("transfers.fieldToParty")}</TableHead>
                    <TableHead>{t("transfers.fieldNote")}</TableHead>
                    <TableHead className="text-right">{t("common.amount")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partyTransfers.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">{r.date}</TableCell>
                      <TableCell className="font-medium">{partyName(r.from_party_id)}</TableCell>
                      <TableCell className="font-medium">{partyName(r.to_party_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.note ?? "-"}</TableCell>
                      <TableCell className="text-right font-medium">{r.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <DeleteConfirm
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={t("transfers.deletePartyTitle")}
                          description={t("transfers.deleteDesc")}
                          onConfirm={() => handleDeletePartyTransfer(r.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {partyTransfers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        {t("transfers.emptyParty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{direction === "kharcha" ? t("roznamcha.dialogTitleKharcha") : t("roznamcha.dialogTitleAamdan")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("roznamcha.fieldParty")} className="col-span-2">
              <Controller
                name="party_id"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("roznamcha.partyPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("common.amount")} error={errors.amount?.message}>
              <Input type="number" step="0.01" {...register("amount")} autoFocus />
            </FormField>
            <FormField label={t("common.date")} error={errors.date?.message} className="col-span-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {dateOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={entryDate === opt.value ? "default" : "outline"}
                    onClick={() => setValue("date", opt.value, { shouldValidate: true })}
                  >
                    {opt.label}
                  </Button>
                ))}
                <span className="px-1 text-sm text-muted-foreground">{t("roznamcha.orPickDate")}</span>
                <Input type="date" className="w-auto" {...register("date")} />
              </div>
            </FormField>
            <FormField label={t("roznamcha.fieldDescription")} error={errors.description?.message} className="col-span-2">
              <Input {...register("description")} />
            </FormField>
            <FormField label={t("roznamcha.fieldReference")}>
              <Input {...register("reference_no")} />
            </FormField>
            <FormField label={t("expenses.fieldPaymentSource")}>
              <Controller
                name="payment_source"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t("common.cash")}</SelectItem>
                      <SelectItem value="bank">{t("common.bank")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            {paymentSource === "bank" && (
              <FormField label={t("expenses.fieldBankAccount")} className="col-span-2">
                <Controller
                  name="bank_account_id"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("expenses.selectAccount")} />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.bank_name} · {b.account_title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            )}
            <DialogFooter className="col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cashBankOpen} onOpenChange={setCashBankOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transfers.cashBankTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={cashBankForm.handleSubmit(onCashBankSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("transfers.fieldDirection")} className="col-span-2">
              <Controller
                name="direction"
                control={cashBankForm.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash_to_bank">{t("transfers.cashToBank")}</SelectItem>
                      <SelectItem value="bank_to_cash">{t("transfers.bankToCash")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("bankAccounts.title")} error={cashBankForm.formState.errors.bank_account_id?.message} className="col-span-2">
              <Controller
                name="bank_account_id"
                control={cashBankForm.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("transfers.selectBankAccount")} />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.bank_name} · {b.account_title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("common.amount")} error={cashBankForm.formState.errors.amount?.message}>
              <Input type="number" step="0.01" {...cashBankForm.register("amount")} />
            </FormField>
            <FormField label={t("common.date")} error={cashBankForm.formState.errors.date?.message}>
              <Input type="date" {...cashBankForm.register("date")} />
            </FormField>
            <FormField label={t("transfers.fieldNote")} className="col-span-2">
              <Input {...cashBankForm.register("note")} />
            </FormField>
            <DialogFooter className="col-span-2">
              <Button type="submit" disabled={cashBankForm.formState.isSubmitting}>
                {cashBankForm.formState.isSubmitting ? t("common.saving") : t("transfers.recordTransfer")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={partyTransferOpen} onOpenChange={setPartyTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transfers.partyTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={partyTransferForm.handleSubmit(onPartyTransferSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("transfers.fieldFromParty")} error={partyTransferForm.formState.errors.from_party_id?.message} className="col-span-2">
              <Controller
                name="from_party_id"
                control={partyTransferForm.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("transfers.selectParty")} />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("transfers.fieldToParty")} error={partyTransferForm.formState.errors.to_party_id?.message} className="col-span-2">
              <Controller
                name="to_party_id"
                control={partyTransferForm.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("transfers.selectParty")} />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t("common.amount")} error={partyTransferForm.formState.errors.amount?.message}>
              <Input type="number" step="0.01" {...partyTransferForm.register("amount")} />
            </FormField>
            <FormField label={t("common.date")} error={partyTransferForm.formState.errors.date?.message}>
              <Input type="date" {...partyTransferForm.register("date")} />
            </FormField>
            <FormField label={t("transfers.fieldNote")} className="col-span-2">
              <Input {...partyTransferForm.register("note")} />
            </FormField>
            <p className="col-span-2 text-xs text-muted-foreground">{t("transfers.partyHint")}</p>
            <DialogFooter className="col-span-2">
              <Button type="submit" disabled={partyTransferForm.formState.isSubmitting}>
                {partyTransferForm.formState.isSubmitting ? t("common.saving") : t("transfers.recordTransfer")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDayOpen} onOpenChange={setCloseDayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("roznamcha.closeDayTitle", { date: closeDate })}</DialogTitle>
          </DialogHeader>
          <FormField label={t("roznamcha.closeDayFieldDate")} error={closeDateAlreadyClosed ? t("roznamcha.dayAlreadyClosedWarning") : undefined}>
            <Input type="date" value={closeDate} onChange={(e) => onCloseDateChange(e.target.value)} />
          </FormField>
          {closeDayTotals === null ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("roznamcha.closeDayOpeningBalance")}</span>
                <span className="font-medium">{closeDayTotals.opening.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("roznamcha.totalAamdan")}</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">{closeDayTotals.aamdan.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("roznamcha.totalKharcha")}</span>
                <span className="font-medium text-red-600 dark:text-red-400">{closeDayTotals.kharcha.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>{t("roznamcha.closeDayClosingBalance")}</span>
                <span>{(closeDayTotals.opening + closeDayTotals.aamdan - closeDayTotals.kharcha).toFixed(2)}</span>
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">{t("roznamcha.closeDayWarning")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDayOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCloseDay} disabled={closingDay || closeDayTotals === null || closeDateAlreadyClosed}>
              {closingDay ? t("common.saving") : t("roznamcha.confirmCloseDay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
