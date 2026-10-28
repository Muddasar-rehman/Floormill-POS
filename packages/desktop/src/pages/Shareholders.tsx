import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import {
  shareholderLedgerSchema,
  shareholderSchema,
  todayStr,
  type Shareholder,
  type ShareholderInput,
  type ShareholderLedgerInput,
} from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "../components/ui/sonner";
import { RowActions } from "../components/RowActions";

interface Balance {
  shareholder_id: string;
  balance: number;
}

export function Shareholders() {
  const { t } = useTranslation();
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [openLedger, setOpenLedger] = useState(false);
  const [editing, setEditing] = useState<Shareholder | null>(null);
  const [loading, setLoading] = useState(true);

  const addForm = useForm<ShareholderInput>({
    resolver: zodResolver(shareholderSchema),
    defaultValues: { investment_amount: 0 },
  });

  const ledgerForm = useForm<ShareholderLedgerInput>({
    resolver: zodResolver(shareholderLedgerSchema),
    defaultValues: { type: "contribution", date: todayStr() },
  });

  async function load() {
    setLoading(true);
    const [shareholdersRes, balancesRes] = await Promise.all([
      supabase.from("shareholders").select("*").order("name"),
      supabase.from("shareholder_balances").select("*"),
    ]);
    setShareholders((shareholdersRes.data as Shareholder[]) ?? []);
    setBalances((balancesRes.data as Balance[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function balanceFor(id: string) {
    return balances.find((b) => b.shareholder_id === id)?.balance ?? 0;
  }

  function openCreate() {
    setEditing(null);
    addForm.reset({ investment_amount: 0, name: "", contact: "", profit_ratio_pct: undefined });
    setOpenAdd(true);
  }

  function openEdit(s: Shareholder) {
    setEditing(s);
    addForm.reset({
      name: s.name,
      contact: s.contact ?? "",
      investment_amount: s.investment_amount,
      profit_ratio_pct: s.profit_ratio_pct,
    });
    setOpenAdd(true);
  }

  async function onAddSubmit(values: ShareholderInput) {
    if (editing) {
      const { data, error } = await supabase.from("shareholders").update(values).eq("id", editing.id).select();
      if (error) {
        toast.error(t("common.failedUpdate"), { description: error.message });
        return;
      }
      if (!data || data.length === 0) {
        toast.error(t("common.failedUpdate"));
        return;
      }
      toast.success(t("shareholders.toastUpdated"));
    } else {
      const { error } = await supabase.from("shareholders").insert(values);
      if (error) {
        toast.error(t("common.failedSave"), { description: error.message });
        return;
      }
      toast.success(t("shareholders.toastAdded"));
    }
    addForm.reset({ investment_amount: 0 });
    setEditing(null);
    setOpenAdd(false);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("shareholders").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("shareholders.toastDeleted"));
    load();
  }

  async function onLedgerSubmit(values: ShareholderLedgerInput) {
    const { error } = await supabase.from("shareholder_ledger").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("shareholders.toastLedgerRecorded"));
    ledgerForm.reset({ type: "contribution", date: todayStr() });
    setOpenLedger(false);
    load();
  }

  const totalInvestment = shareholders.reduce((sum, s) => sum + s.investment_amount, 0);
  const totalRatio = shareholders.reduce((sum, s) => sum + s.profit_ratio_pct, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("shareholders.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("shareholders.subtitle", { investment: totalInvestment.toFixed(2), ratio: totalRatio })}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openLedger} onOpenChange={setOpenLedger}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus />
                {t("shareholders.ledgerEntry")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("shareholders.dialogLedger")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={ledgerForm.handleSubmit(onLedgerSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={t("shareholders.fieldShareholder")} error={ledgerForm.formState.errors.shareholder_id?.message} className="col-span-2">
                  <Controller
                    name="shareholder_id"
                    control={ledgerForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("shareholders.selectShareholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {shareholders.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label={t("shareholders.fieldType")}>
                  <Controller
                    name="type"
                    control={ledgerForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contribution">{t("shareholders.typeContribution")}</SelectItem>
                          <SelectItem value="withdrawal">{t("shareholders.typeWithdrawal")}</SelectItem>
                          <SelectItem value="profit_share">{t("shareholders.typeProfitShare")}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label={t("common.amount")} error={ledgerForm.formState.errors.amount?.message}>
                  <Input type="number" step="0.01" {...ledgerForm.register("amount")} />
                </FormField>
                <FormField label={t("common.date")} error={ledgerForm.formState.errors.date?.message} className="col-span-2">
                  <Input type="date" {...ledgerForm.register("date")} />
                </FormField>
                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={ledgerForm.formState.isSubmitting}>
                    {ledgerForm.formState.isSubmitting ? t("common.saving") : t("common.save")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={openAdd}
            onOpenChange={(v) => {
              setOpenAdd(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus />
                {t("shareholders.add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? t("shareholders.dialogEdit") : t("shareholders.dialogAdd")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={t("common.name")} error={addForm.formState.errors.name?.message} className="col-span-2">
                  <Input {...addForm.register("name")} autoFocus />
                </FormField>
                <FormField label={t("common.contact")}>
                  <Input {...addForm.register("contact")} />
                </FormField>
                <FormField label={t("shareholders.fieldRatio")} error={addForm.formState.errors.profit_ratio_pct?.message}>
                  <Input type="number" step="0.01" {...addForm.register("profit_ratio_pct")} />
                </FormField>
                <FormField label={t("shareholders.fieldInvestment")} className="col-span-2">
                  <Input type="number" step="0.01" {...addForm.register("investment_amount")} />
                </FormField>
                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={addForm.formState.isSubmitting}>
                    {addForm.formState.isSubmitting ? t("common.saving") : t("common.save")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
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
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.contact")}</TableHead>
                  <TableHead className="text-right">{t("shareholders.colInvestment")}</TableHead>
                  <TableHead className="text-right">{t("shareholders.colRatio")}</TableHead>
                  <TableHead className="text-right">{t("shareholders.colBalance")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shareholders.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.contact ?? "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{s.investment_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{s.profit_ratio_pct}%</TableCell>
                    <TableCell className="text-right font-medium">{balanceFor(s.id).toFixed(2)}</TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => openEdit(s)}
                        onDelete={() => handleDelete(s.id)}
                        deleteTitle={t("shareholders.deleteTitle", { name: s.name })}
                        deleteDescription={t("shareholders.deleteDesc")}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {shareholders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("shareholders.empty")}
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
