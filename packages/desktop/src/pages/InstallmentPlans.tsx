import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { installmentPlanSchema, todayStr, type Installment, type InstallmentPlanInput, type Party } from "shared";
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

interface InstallmentRow extends Installment {
  installment_plans: { party_id: string; direction: string } | null;
}

export function InstallmentPlans() {
  const { t } = useTranslation();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InstallmentPlanInput>({
    resolver: zodResolver(installmentPlanSchema),
    defaultValues: { direction: "receivable", start_date: todayStr(), frequency_days: 30 },
  });

  async function load() {
    setLoading(true);
    const [installmentsRes, partiesRes] = await Promise.all([
      supabase
        .from("installments")
        .select("*, installment_plans(party_id, direction)")
        .order("due_date"),
      supabase.from("parties").select("*").order("name"),
    ]);
    setInstallments((installmentsRes.data as unknown as InstallmentRow[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function partyName(id: string | undefined) {
    return parties.find((p) => p.id === id)?.name ?? "-";
  }

  async function onSubmit(values: InstallmentPlanInput) {
    const { error } = await supabase.from("installment_plans").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("installments.toastCreated"));
    reset({ direction: "receivable", start_date: todayStr(), frequency_days: 30 });
    setOpen(false);
    load();
  }

  async function markPaid(id: string) {
    const { error } = await supabase
      .from("installments")
      .update({ paid: true, paid_date: todayStr() })
      .eq("id", id);
    if (error) {
      toast.error(t("common.failedUpdate"), { description: error.message });
      return;
    }
    toast.success(t("installments.toastMarkedPaid"));
    load();
  }

  function status(inst: InstallmentRow): { label: string; variant: "success" | "destructive" | "outline" } {
    if (inst.paid) return { label: t("installments.statusPaid"), variant: "success" };
    if (new Date(inst.due_date) < new Date(new Date().toDateString())) return { label: t("installments.statusOverdue"), variant: "destructive" };
    return { label: t("installments.statusUpcoming"), variant: "outline" };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("installments.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("installments.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("installments.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("installments.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("installments.fieldParty")} error={errors.party_id?.message} className="col-span-2">
                <Controller
                  name="party_id"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("installments.selectParty")} />
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
              <FormField label={t("installments.fieldDirection")}>
                <Controller
                  name="direction"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receivable">{t("installments.directionReceivable")}</SelectItem>
                        <SelectItem value="payable">{t("installments.directionPayable")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label={t("installments.fieldTotalAmount")} error={errors.total_amount?.message}>
                <Input type="number" step="0.01" {...register("total_amount")} />
              </FormField>
              <FormField label={t("installments.fieldNumInstallments")} error={errors.num_installments?.message}>
                <Input type="number" step="1" {...register("num_installments")} />
              </FormField>
              <FormField label={t("installments.fieldFrequency")} error={errors.frequency_days?.message}>
                <Input type="number" step="1" {...register("frequency_days")} />
              </FormField>
              <FormField label={t("installments.fieldStartDate")} error={errors.start_date?.message} className="col-span-2">
                <Input type="date" {...register("start_date")} />
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
                  <TableHead>{t("installments.colParty")}</TableHead>
                  <TableHead>{t("installments.colDirection")}</TableHead>
                  <TableHead>{t("installments.colDueDate")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                  <TableHead>{t("installments.colStatus")}</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((inst) => {
                  const s = status(inst);
                  return (
                    <TableRow key={inst.id}>
                      <TableCell className="font-medium">{partyName(inst.installment_plans?.party_id)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {inst.installment_plans?.direction === "receivable"
                          ? t("installments.shortReceivable")
                          : t("installments.shortPayable")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{inst.due_date}</TableCell>
                      <TableCell className="text-right font-medium">{inst.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {!inst.paid && (
                          <Button variant="ghost" size="sm" onClick={() => markPaid(inst.id)}>
                            {t("common.markPaid")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {installments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("installments.empty")}
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
