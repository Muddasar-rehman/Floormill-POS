import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Receipt } from "lucide-react";
import { bankAccountSchema, type BankAccount, type BankAccountInput } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "../components/ui/sonner";
import { RowActions } from "../components/RowActions";

export function BankAccounts() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BankAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BankAccountInput>({ resolver: zodResolver(bankAccountSchema), defaultValues: { opening_balance: 0 } });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("bank_accounts").select("*").order("bank_name");
    setRows((data as BankAccount[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    reset({ opening_balance: 0, bank_name: "", account_title: "", account_number: "" });
    setOpen(true);
  }

  function openEdit(b: BankAccount) {
    setEditing(b);
    reset({
      bank_name: b.bank_name,
      account_title: b.account_title,
      account_number: b.account_number ?? "",
      opening_balance: b.opening_balance,
    });
    setOpen(true);
  }

  async function onSubmit(values: BankAccountInput) {
    if (editing) {
      const { data, error } = await supabase.from("bank_accounts").update(values).eq("id", editing.id).select();
      if (error) {
        toast.error(t("common.failedUpdate"), { description: error.message });
        return;
      }
      if (!data || data.length === 0) {
        toast.error(t("common.failedUpdate"));
        return;
      }
      toast.success(t("bankAccounts.toastUpdated"));
    } else {
      const { error } = await supabase.from("bank_accounts").insert(values);
      if (error) {
        toast.error(t("common.failedSave"), { description: error.message });
        return;
      }
      toast.success(t("bankAccounts.toastAdded"));
    }
    setOpen(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
    if (error) {
      const description = error.code === "23503" ? t("bankAccounts.deleteBlockedDesc") : error.message;
      toast.error(t("common.failedDelete"), { description });
      return;
    }
    toast.success(t("bankAccounts.toastDeleted"));
    load();
  }

  const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("bankAccounts.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("bankAccounts.subtitleTotal", { amount: totalBalance.toFixed(2) })}</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus />
              {t("bankAccounts.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t("bankAccounts.dialogEdit") : t("bankAccounts.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("bankAccounts.fieldBankName")} error={errors.bank_name?.message} className="col-span-2">
                <Input {...register("bank_name")} autoFocus />
              </FormField>
              <FormField label={t("bankAccounts.fieldAccountTitle")} error={errors.account_title?.message} className="col-span-2">
                <Input {...register("account_title")} />
              </FormField>
              <FormField label={t("bankAccounts.fieldAccountNumber")}>
                <Input {...register("account_number")} />
              </FormField>
              <FormField label={t("bankAccounts.fieldOpeningBalance")} className="col-span-2">
                <Input type="number" step="0.01" {...register("opening_balance")} />
                <p className="mt-1 text-xs text-muted-foreground">{t("bankAccounts.openingBalanceHint")}</p>
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
                  <TableHead>{t("bankAccounts.colBank")}</TableHead>
                  <TableHead>{t("bankAccounts.colAccountTitle")}</TableHead>
                  <TableHead>{t("bankAccounts.colAccountNumber")}</TableHead>
                  <TableHead className="text-right">{t("bankAccounts.colBalance")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <Link to={`/bank-accounts/${b.id}`} className="text-primary hover:underline">
                        {b.bank_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.account_title}</TableCell>
                    <TableCell className="text-muted-foreground">{b.account_number ?? "-"}</TableCell>
                    <TableCell className="text-right font-medium">{b.balance.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/bank-accounts/${b.id}`}>
                          <Receipt className="h-4 w-4" />
                          {t("bankAccounts.viewStatement")}
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => openEdit(b)}
                        onDelete={() => handleDelete(b.id)}
                        deleteTitle={t("bankAccounts.deleteTitle", { name: b.bank_name })}
                        deleteDescription={t("bankAccounts.deleteDesc")}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("bankAccounts.empty")}
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
