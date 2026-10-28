import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { commissionEntrySchema, todayStr, type CommissionAgent, type CommissionEntry, type CommissionEntryInput, type Purchase, type Sale } from "shared";
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

export function CommissionEntries() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<CommissionEntry[]>([]);
  const [agents, setAgents] = useState<CommissionAgent[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [open, setOpen] = useState(false);
  const [linkType, setLinkType] = useState<"purchase" | "sale">("sale");
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CommissionEntryInput>({
    resolver: zodResolver(commissionEntrySchema),
    defaultValues: { type: "self", date: todayStr() },
  });

  const commissionType = watch("type");

  async function load() {
    setLoading(true);
    const [rowsRes, agentsRes, purchasesRes, salesRes] = await Promise.all([
      supabase.from("commission_entries").select("*").order("date", { ascending: false }),
      supabase.from("commission_agents").select("*").order("name"),
      supabase.from("purchases").select("*").order("date", { ascending: false }),
      supabase.from("sales").select("*").order("date", { ascending: false }),
    ]);
    setRows((rowsRes.data as CommissionEntry[]) ?? []);
    setAgents((agentsRes.data as CommissionAgent[]) ?? []);
    setPurchases((purchasesRes.data as Purchase[]) ?? []);
    setSales((salesRes.data as Sale[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function agentName(id: string | null) {
    return id ? agents.find((a) => a.id === id)?.name ?? "-" : t("commissionEntries.selfShort");
  }
  function txnLabel(r: CommissionEntry) {
    if (r.purchase_id) {
      const p = purchases.find((x) => x.id === r.purchase_id);
      return p ? `${t("commissionEntries.linkPurchase")} #${p.invoice_no}` : t("commissionEntries.linkPurchase");
    }
    const s = sales.find((x) => x.id === r.sale_id);
    return s ? `${t("commissionEntries.linkSale")} #${s.invoice_no}` : t("commissionEntries.linkSale");
  }

  async function onSubmit(values: CommissionEntryInput) {
    const payload = {
      ...values,
      purchase_id: linkType === "purchase" ? values.purchase_id : null,
      sale_id: linkType === "sale" ? values.sale_id : null,
      agent_id: values.type === "agent" ? values.agent_id : null,
      amount: values.type === "self" ? values.amount ?? 0 : undefined,
    };
    const { error } = await supabase.from("commission_entries").insert(payload);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("commissionEntries.toastRecorded"));
    reset({ type: "self", date: todayStr() });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("commissionEntries.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("commissionEntries.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("commissionEntries.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("commissionEntries.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("commissionEntries.fieldLinkedTo")} className="col-span-2">
                <Select value={linkType} onValueChange={(v) => setLinkType(v as "purchase" | "sale")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">{t("commissionEntries.linkPurchase")}</SelectItem>
                    <SelectItem value="sale">{t("commissionEntries.linkSale")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              {linkType === "purchase" ? (
                <FormField label={t("commissionEntries.linkPurchase")} error={errors.purchase_id?.message} className="col-span-2">
                  <Controller
                    name="purchase_id"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("commissionEntries.selectPurchase")} />
                        </SelectTrigger>
                        <SelectContent>
                          {purchases.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              #{p.invoice_no} · {p.date} · {p.total.toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              ) : (
                <FormField label={t("commissionEntries.linkSale")} error={errors.sale_id?.message} className="col-span-2">
                  <Controller
                    name="sale_id"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("commissionEntries.selectSale")} />
                        </SelectTrigger>
                        <SelectContent>
                          {sales.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              #{s.invoice_no} · {s.date} · {s.total.toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              )}
              <FormField label={t("commissionEntries.fieldType")}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">{t("commissionEntries.typeSelf")}</SelectItem>
                        <SelectItem value="agent">{t("commissionEntries.typeAgent")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              {commissionType === "agent" ? (
                <FormField label={t("commissionEntries.fieldAgent")} error={errors.agent_id?.message}>
                  <Controller
                    name="agent_id"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("commissionEntries.selectAgent")} />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} ({a.rate_type === "percentage" ? `${a.rate}%` : `${a.rate}/mun`})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              ) : (
                <FormField label={t("common.amount")} error={errors.amount?.message}>
                  <Input type="number" step="0.01" {...register("amount")} />
                </FormField>
              )}
              <FormField label={t("common.date")} error={errors.date?.message} className="col-span-2">
                <Input type="date" {...register("date")} />
              </FormField>
              {commissionType === "agent" && (
                <p className="col-span-2 text-xs text-muted-foreground">{t("commissionEntries.amountAutoNote")}</p>
              )}
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
                  <TableHead>{t("commissionEntries.colLinkedTo")}</TableHead>
                  <TableHead>{t("common.type")}</TableHead>
                  <TableHead>{t("commissionEntries.colAgent")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">{txnLabel(r)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {r.type === "self" ? t("commissionEntries.typeShortSelf") : t("commissionEntries.typeShortAgent")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{agentName(r.agent_id)}</TableCell>
                    <TableCell className="text-right font-medium">{r.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t("commissionEntries.empty")}
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
