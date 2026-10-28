import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { expenseSchema, todayStr, type BankAccount, type Expense, type ExpenseInput, type Warehouse } from "shared";
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

export function Expenses() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Expense[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { payment_source: "cash", date: todayStr() },
  });

  const paymentSource = watch("payment_source");

  async function load() {
    setLoading(true);
    const [rowsRes, warehousesRes, banksRes] = await Promise.all([
      supabase.from("expenses").select("*").order("date", { ascending: false }),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("bank_accounts").select("*").order("bank_name"),
    ]);
    setRows((rowsRes.data as Expense[]) ?? []);
    setWarehouses((warehousesRes.data as Warehouse[]) ?? []);
    setBankAccounts((banksRes.data as BankAccount[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function warehouseName(id: string | null) {
    return id ? warehouses.find((w) => w.id === id)?.name ?? "-" : "-";
  }

  async function onSubmit(values: ExpenseInput) {
    const payload = { ...values, bank_account_id: values.payment_source === "bank" ? values.bank_account_id : null };
    const { error } = await supabase.from("expenses").insert(payload);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("expenses.toastRecorded"));
    reset({ payment_source: "cash", date: todayStr() });
    setOpen(false);
    load();
  }

  const totalThisMonth = rows.filter((r) => r.date.slice(0, 7) === todayStr().slice(0, 7)).reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("expenses.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("expenses.subtitleMonth", { amount: totalThisMonth.toFixed(2) })}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("expenses.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("expenses.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("common.category")} error={errors.category?.message} className="col-span-2">
                <Input {...register("category")} placeholder={t("expenses.fieldCategoryPlaceholder") ?? undefined} autoFocus />
              </FormField>
              <FormField label={t("common.amount")} error={errors.amount?.message}>
                <Input type="number" step="0.01" {...register("amount")} />
              </FormField>
              <FormField label={t("common.date")} error={errors.date?.message}>
                <Input type="date" {...register("date")} />
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
                <FormField label={t("expenses.fieldBankAccount")} error={errors.bank_account_id?.message}>
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
              <FormField label={t("expenses.fieldWarehouseOptional")} className="col-span-2">
                <Controller
                  name="warehouse_id"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("expenses.none")} />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label={t("common.description")} className="col-span-2">
                <Input {...register("description")} />
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
                  <TableHead>{t("common.category")}</TableHead>
                  <TableHead>{t("common.description")}</TableHead>
                  <TableHead>{t("expenses.colWarehouse")}</TableHead>
                  <TableHead>{t("expenses.colSource")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">{r.category}</TableCell>
                    <TableCell className="text-muted-foreground">{r.description ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{warehouseName(r.warehouse_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(`common.${r.payment_source}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{r.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("expenses.empty")}
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
