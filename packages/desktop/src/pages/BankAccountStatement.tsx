import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Printer } from "lucide-react";
import { bankLedgerSchema, todayStr, type BankAccount, type BankLedgerInput, type BankStatementRow } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "../components/ui/sonner";

const SOURCE_KEY: Record<BankStatementRow["source"], string> = {
  expense: "bankAccounts.sourceExpense",
  payment: "bankAccounts.sourcePayment",
  receipt: "bankAccounts.sourceReceipt",
  roznamcha: "bankAccounts.sourceRoznamcha",
  bank_ledger: "bankAccounts.sourceManual",
  transfer: "bankAccounts.sourceTransfer",
};

export function BankAccountStatement() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [rows, setRows] = useState<BankStatementRow[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BankLedgerInput>({
    resolver: zodResolver(bankLedgerSchema),
    defaultValues: { direction: "in", date: todayStr() },
  });

  async function load() {
    if (!id) return;
    setLoading(true);
    const [{ data: accountData }, { data: rowsData }] = await Promise.all([
      supabase.from("bank_accounts").select("*").eq("id", id).single(),
      supabase.rpc("fn_bank_account_ledger", { p_bank_account_id: id }),
    ]);
    setAccount(accountData as BankAccount | null);
    setRows((rowsData as BankStatementRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Rows come back chronologically ascending, which is what a running
  // balance needs — computed once here, then reversed for display so the
  // most recent activity shows first.
  const withRunning = useMemo(() => {
    if (!account) return [];
    let running = account.opening_balance;
    const out = rows.map((r) => {
      running += r.direction === "in" ? r.amount : -r.amount;
      return { ...r, runningBalance: running };
    });
    return out.reverse();
  }, [rows, account]);

  const filteredRows = useMemo(
    () => withRunning.filter((r) => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo)),
    [withRunning, dateFrom, dateTo]
  );

  function openAdd() {
    reset({ bank_account_id: id, direction: "in", date: todayStr(), amount: undefined, tag: "" });
    setOpen(true);
  }

  async function onSubmit(values: BankLedgerInput) {
    const { error } = await supabase.from("bank_ledger").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("bankAccounts.toastEntryAdded"));
    setOpen(false);
    load();
  }

  if (loading && !account) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!account) {
    return <div className="text-muted-foreground">{t("bankAccounts.notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button variant="ghost" asChild className="-ml-3 mb-1">
            <Link to="/bank-accounts">
              <ArrowLeft />
              {t("common.back")}
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{account.bank_name}</h1>
          <p className="text-sm text-muted-foreground">{account.account_title}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const params = new URLSearchParams();
              if (dateFrom) params.set("from", dateFrom);
              if (dateTo) params.set("to", dateTo);
              const qs = params.toString();
              navigate(`/bank-accounts/${id}/print${qs ? `?${qs}` : ""}`);
            }}
          >
            <Printer />
            {t("common.print")}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAdd}>
                <Plus />
                {t("bankAccounts.addEntry")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("bankAccounts.dialogAddEntry")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={t("bankAccounts.fieldDirection")} className="col-span-2">
                  <Controller
                    name="direction"
                    control={control}
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
                <FormField label={t("common.amount")} error={errors.amount?.message}>
                  <Input type="number" step="0.01" {...register("amount")} autoFocus />
                </FormField>
                <FormField label={t("common.date")} error={errors.date?.message}>
                  <Input type="date" {...register("date")} />
                </FormField>
                <FormField label={t("bankAccounts.fieldTag")} error={errors.tag?.message} className="col-span-2">
                  <Input {...register("tag")} placeholder={t("bankAccounts.fieldTagPlaceholder") ?? undefined} />
                </FormField>
                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t("common.saving") : t("common.save")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="max-w-sm">
        <CardContent className="p-4">
          <div className="text-xs font-medium text-muted-foreground">{t("bankAccounts.colBalance")}</div>
          <div className="text-3xl font-semibold">{account.balance.toFixed(2)}</div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t("common.from")}>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </FormField>
        <FormField label={t("common.to")}>
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
                  <TableHead>{t("bankAccounts.colSource")}</TableHead>
                  <TableHead>{t("bankAccounts.colDescription")}</TableHead>
                  <TableHead className="text-right">{t("cash.directionIn")}</TableHead>
                  <TableHead className="text-right">{t("cash.directionOut")}</TableHead>
                  <TableHead className="text-right">{t("bankAccounts.colBalance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.opening_balance !== 0 && !dateFrom && (
                  <TableRow>
                    <TableCell className="text-muted-foreground">{account.created_at.slice(0, 10)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t("ledger.openingBalance")}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                    <TableCell className="text-right font-medium">{account.opening_balance.toFixed(2)}</TableCell>
                  </TableRow>
                )}
                {filteredRows.map((r, i) => (
                  <TableRow key={`${r.source}-${r.created_at}-${i}`}>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(SOURCE_KEY[r.source])}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.description || "-"}</TableCell>
                    <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                      {r.direction === "in" ? r.amount.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="text-right text-red-600 dark:text-red-400">
                      {r.direction === "out" ? r.amount.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{r.runningBalance.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("bankAccounts.emptyStatement")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
