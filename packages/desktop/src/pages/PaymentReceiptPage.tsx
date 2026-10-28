import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Pencil, Plus } from "lucide-react";
import { paymentSchema, receiptSchema, todayStr, type BankAccount, type Party, type Payment, type PaymentInput, type Receipt, type ReceiptInput } from "shared";
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

type Mode = "payment" | "receipt";
type Row = Payment | Receipt;
type Input_ = PaymentInput | ReceiptInput;

const CONFIG = {
  payment: {
    table: "payments",
    schema: paymentSchema,
    partyType: "vendor" as const,
    partyField: "vendor_id" as const,
    ns: "payments",
  },
  receipt: {
    table: "receipts",
    schema: receiptSchema,
    partyType: "customer" as const,
    partyField: "customer_id" as const,
    ns: "receipts",
  },
};

export function PaymentReceiptPage({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const cfg = CONFIG[mode];
  const partyLabel = mode === "payment" ? t("common.vendor") : t("common.customer");
  const [rows, setRows] = useState<Row[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Input_>({
    resolver: zodResolver(cfg.schema as never),
    defaultValues: { payment_source: "cash", date: todayStr() } as never,
  });

  const paymentSource = watch("payment_source" as never) as unknown as string;

  async function load() {
    setLoading(true);
    const [rowsRes, partiesRes, banksRes] = await Promise.all([
      supabase.from(cfg.table).select("*").order("date", { ascending: false }),
      supabase.from("parties").select("*").order("name"),
      supabase.from("bank_accounts").select("*").order("bank_name"),
    ]);
    setRows((rowsRes.data as Row[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setBankAccounts((banksRes.data as BankAccount[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && rows.length > 0) {
      const row = rows.find((r) => r.id === editId);
      if (row) openEdit(row);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function partyName(id: string) {
    return parties.find((p) => p.id === id)?.name ?? id;
  }

  function resetForm() {
    reset({ payment_source: "cash", date: todayStr() } as never);
    setEditingId(null);
  }

  function openEdit(row: Row) {
    const rr = row as Payment & Receipt;
    setEditingId(rr.id);
    reset({
      [cfg.partyField]: mode === "payment" ? rr.vendor_id : rr.customer_id,
      amount: rr.amount,
      date: rr.date,
      payment_source: rr.payment_source,
      bank_account_id: rr.bank_account_id,
      notes: rr.notes,
    } as never);
    setOpen(true);
  }

  async function onSubmit(values: Input_) {
    const payload = { ...values, bank_account_id: (values as PaymentInput).payment_source === "bank" ? values.bank_account_id : null };
    const { error } = editingId
      ? await supabase.from(cfg.table).update(payload as never).eq("id", editingId)
      : await supabase.from(cfg.table).insert(payload as never);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t(editingId ? `${cfg.ns}.toastUpdated` : `${cfg.ns}.toastRecorded`));
    resetForm();
    setOpen(false);
    load();
  }

  const errs = errors as never as Record<string, { message?: string }>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(`${cfg.ns}.title`)}</h1>
          <p className="text-sm text-muted-foreground">{t(`${cfg.ns}.subtitle`)}</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t(`${cfg.ns}.new`)}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t(`${cfg.ns}.dialogEditTitle`) : t(`${cfg.ns}.dialogTitle`)}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={partyLabel} error={errs[cfg.partyField]?.message} className="col-span-2">
                <Controller
                  name={cfg.partyField as never}
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value as string | undefined}>
                      <SelectTrigger>
                        <SelectValue placeholder={partyLabel} />
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
                <Input type="number" step="0.01" {...register("amount")} />
              </FormField>
              <FormField label={t("common.date")} error={errors.date?.message}>
                <Input type="date" {...register("date")} />
              </FormField>
              <FormField label={t("expenses.fieldPaymentSource")}>
                <Controller
                  name={"payment_source" as never}
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value as string}>
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
                <FormField label={t("expenses.fieldBankAccount")}>
                  <Controller
                    name={"bank_account_id" as never}
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value as string | undefined}>
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
              <FormField label={t("common.notes")} className="col-span-2">
                <Input {...register("notes" as never)} />
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
                  <TableHead>{partyLabel}</TableHead>
                  <TableHead>{t(`${cfg.ns}.colSource`)}</TableHead>
                  <TableHead>{t(`${cfg.ns}.colNotes`)}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const rr = r as Payment & Receipt;
                  const partyId = mode === "payment" ? rr.vendor_id : rr.customer_id;
                  return (
                    <TableRow key={rr.id}>
                      <TableCell className="text-muted-foreground">{rr.date}</TableCell>
                      <TableCell className="font-medium">{partyName(partyId)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {t(`common.${rr.payment_source}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{rr.notes ?? "-"}</TableCell>
                      <TableCell className="text-right font-medium">{rr.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t(`${cfg.ns}.empty`)}
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
