import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { liabilitySchema, type Liability, type LiabilityInput } from "shared";
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

export function Liabilities() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Liability[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LiabilityInput>({ resolver: zodResolver(liabilitySchema), defaultValues: { status: "unpaid" } });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("liabilities").select("*").order("due_date", { ascending: true, nullsFirst: false });
    setRows((data as Liability[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(values: LiabilityInput) {
    const { error } = await supabase.from("liabilities").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("liabilities.toastRecorded"));
    reset({ status: "unpaid" });
    setOpen(false);
    load();
  }

  async function markPaid(id: string) {
    const { error } = await supabase.from("liabilities").update({ status: "paid" }).eq("id", id);
    if (error) {
      toast.error(t("common.failedUpdate"), { description: error.message });
      return;
    }
    toast.success(t("liabilities.toastMarkedPaid"));
    load();
  }

  const totalUnpaid = rows.filter((r) => r.status === "unpaid").reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("liabilities.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("liabilities.subtitleUnpaid", { amount: totalUnpaid.toFixed(2) })}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("liabilities.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("liabilities.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("liabilities.fieldType")} error={errors.type?.message} className="col-span-2">
                <Input {...register("type")} placeholder={t("liabilities.fieldTypePlaceholder") ?? undefined} autoFocus />
              </FormField>
              <FormField label={t("common.amount")} error={errors.amount?.message}>
                <Input type="number" step="0.01" {...register("amount")} />
              </FormField>
              <FormField label={t("liabilities.fieldDueDate")}>
                <Input type="date" {...register("due_date")} />
              </FormField>
              <FormField label={t("liabilities.fieldStatus")} className="col-span-2">
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unpaid">{t("liabilities.statusUnpaid")}</SelectItem>
                        <SelectItem value="paid">{t("liabilities.statusPaid")}</SelectItem>
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
                  <TableHead>{t("liabilities.colType")}</TableHead>
                  <TableHead>{t("common.description")}</TableHead>
                  <TableHead>{t("liabilities.colDueDate")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.type}</TableCell>
                    <TableCell className="text-muted-foreground">{l.description ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.due_date ?? "-"}</TableCell>
                    <TableCell className="text-right font-medium">{l.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "paid" ? "success" : "outline"}>
                        {l.status === "paid" ? t("liabilities.statusPaid") : t("liabilities.statusUnpaid")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {l.status === "unpaid" && (
                        <Button variant="ghost" size="sm" onClick={() => markPaid(l.id)}>
                          {t("common.markPaid")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("liabilities.empty")}
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
