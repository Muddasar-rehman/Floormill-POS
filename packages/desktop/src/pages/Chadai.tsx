import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { chadaiSchema, todayStr, type ChadaiCharge, type ChadaiInput, type Purchase, type Sale } from "shared";
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

export function Chadai() {
  const { t } = useTranslation();
  const BASIS_LABELS: Record<string, string> = {
    per_bag: t("chadai.basisPerBag"),
    per_mun: t("chadai.basisPerMun"),
    lump_sum: t("chadai.basisLumpSum"),
  };
  const [rows, setRows] = useState<ChadaiCharge[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [open, setOpen] = useState(false);
  const [linkType, setLinkType] = useState<"purchase" | "sale">("purchase");
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChadaiInput>({
    resolver: zodResolver(chadaiSchema),
    defaultValues: { basis: "per_bag", qty_basis: 1, date: todayStr() },
  });

  const basis = watch("basis");
  const rate = watch("rate");
  const qtyBasis = watch("qty_basis");
  const previewAmount = basis === "lump_sum" ? rate || 0 : (rate || 0) * (qtyBasis || 0);

  async function load() {
    setLoading(true);
    const [rowsRes, purchasesRes, salesRes] = await Promise.all([
      supabase.from("chadai_charges").select("*").order("date", { ascending: false }),
      supabase.from("purchases").select("*").order("date", { ascending: false }),
      supabase.from("sales").select("*").order("date", { ascending: false }),
    ]);
    setRows((rowsRes.data as ChadaiCharge[]) ?? []);
    setPurchases((purchasesRes.data as Purchase[]) ?? []);
    setSales((salesRes.data as Sale[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function txnLabel(r: ChadaiCharge) {
    if (r.purchase_id) {
      const p = purchases.find((x) => x.id === r.purchase_id);
      return p ? `${t("chadai.linkPurchase")} #${p.invoice_no}` : t("chadai.linkPurchase");
    }
    const s = sales.find((x) => x.id === r.sale_id);
    return s ? `${t("chadai.linkSale")} #${s.invoice_no}` : t("chadai.linkSale");
  }

  async function onSubmit(values: ChadaiInput) {
    const payload = {
      ...values,
      purchase_id: linkType === "purchase" ? values.purchase_id : null,
      sale_id: linkType === "sale" ? values.sale_id : null,
    };
    const { error } = await supabase.from("chadai_charges").insert(payload);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("chadai.toastRecorded"));
    reset({ basis: "per_bag", qty_basis: 1, date: todayStr() });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("chadai.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("chadai.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("chadai.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("chadai.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("chadai.fieldLinkedTo")} className="col-span-2">
                <Select value={linkType} onValueChange={(v) => setLinkType(v as "purchase" | "sale")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">{t("chadai.linkPurchase")}</SelectItem>
                    <SelectItem value="sale">{t("chadai.linkSale")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              {linkType === "purchase" ? (
                <FormField label={t("chadai.linkPurchase")} error={errors.purchase_id?.message} className="col-span-2">
                  <Controller
                    name="purchase_id"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("chadai.selectPurchase")} />
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
                <FormField label={t("chadai.linkSale")} error={errors.sale_id?.message} className="col-span-2">
                  <Controller
                    name="sale_id"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("chadai.selectSale")} />
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
              <FormField label={t("chadai.fieldBasis")}>
                <Controller
                  name="basis"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_bag">{t("chadai.basisPerBag")}</SelectItem>
                        <SelectItem value="per_mun">{t("chadai.basisPerMun")}</SelectItem>
                        <SelectItem value="lump_sum">{t("chadai.basisLumpSum")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label={basis === "lump_sum" ? t("chadai.fieldAmount") : t("chadai.fieldRate")} error={errors.rate?.message}>
                <Input type="number" step="0.01" {...register("rate")} />
              </FormField>
              {basis !== "lump_sum" && (
                <FormField
                  label={basis === "per_bag" ? t("chadai.fieldBags") : t("chadai.fieldMun")}
                  error={errors.qty_basis?.message}
                  className="col-span-2"
                >
                  <Input type="number" step="0.01" {...register("qty_basis")} />
                </FormField>
              )}
              <FormField label={t("common.date")} error={errors.date?.message} className="col-span-2">
                <Input type="date" {...register("date")} />
              </FormField>
              <p className="col-span-2 text-sm text-muted-foreground">
                {t("chadai.amountPreview")}: <span className="font-medium text-foreground">{previewAmount.toFixed(2)}</span>
              </p>
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
                  <TableHead>{t("chadai.colLinkedTo")}</TableHead>
                  <TableHead>{t("chadai.colBasis")}</TableHead>
                  <TableHead className="text-right">{t("common.rate")}</TableHead>
                  <TableHead className="text-right">{t("chadai.colQty")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">{txnLabel(r)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{BASIS_LABELS[r.basis]}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.rate.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.basis === "lump_sum" ? "-" : r.qty_basis}</TableCell>
                    <TableCell className="text-right font-medium">{r.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("chadai.empty")}
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
