import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { stockAdjustmentSchema, todayStr, type Item, type StockAdjustment, type StockAdjustmentInput, type Warehouse } from "shared";
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

export function StockAdjustments() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<StockAdjustment[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: { date: todayStr() },
  });

  const magnitude = watch("qty_delta_kg");

  async function load() {
    setLoading(true);
    const [rowsRes, itemsRes, warehousesRes] = await Promise.all([
      supabase.from("stock_adjustments").select("*").order("date", { ascending: false }),
      supabase.from("items").select("*").order("name"),
      supabase.from("warehouses").select("*").order("name"),
    ]);
    setRows((rowsRes.data as StockAdjustment[]) ?? []);
    setItems((itemsRes.data as Item[]) ?? []);
    setWarehouses((warehousesRes.data as Warehouse[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function itemName(id: string) {
    return items.find((i) => i.id === id)?.name ?? id;
  }
  function warehouseName(id: string) {
    return warehouses.find((w) => w.id === id)?.name ?? id;
  }

  async function onSubmit(values: StockAdjustmentInput) {
    const signedQty = direction === "decrease" ? -Math.abs(values.qty_delta_kg) : Math.abs(values.qty_delta_kg);
    const { error } = await supabase.from("stock_adjustments").insert({ ...values, qty_delta_kg: signedQty });
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("stockAdjustments.toastRecorded"));
    reset({ date: todayStr() });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("stockAdjustments.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("stockAdjustments.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("stockAdjustments.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("stockAdjustments.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("common.item")} error={errors.item_id?.message} className="col-span-2">
                <Controller
                  name="item_id"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("common.item")} />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label={t("common.warehouse")} error={errors.warehouse_id?.message} className="col-span-2">
                <Controller
                  name="warehouse_id"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("common.warehouse")} />
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
              <FormField label={t("stockAdjustments.fieldDirection")}>
                <Select value={direction} onValueChange={(v) => setDirection(v as "increase" | "decrease")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">{t("stockAdjustments.increase")}</SelectItem>
                    <SelectItem value="decrease">{t("stockAdjustments.decrease")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label={t("stockAdjustments.fieldQuantityKg")} error={errors.qty_delta_kg?.message}>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={magnitude ? Math.abs(magnitude) : ""}
                  onChange={(e) => setValue("qty_delta_kg", parseFloat(e.target.value) || 0, { shouldValidate: true })}
                />
              </FormField>
              <FormField label={t("stockAdjustments.fieldReason")} error={errors.reason?.message} className="col-span-2">
                <Input {...register("reason")} placeholder={t("stockAdjustments.fieldReasonPlaceholder") ?? undefined} />
              </FormField>
              <FormField label={t("common.date")} error={errors.date?.message} className="col-span-2">
                <Input type="date" {...register("date")} />
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
                  <TableHead>{t("common.item")}</TableHead>
                  <TableHead>{t("common.warehouse")}</TableHead>
                  <TableHead>{t("stockAdjustments.colReason")}</TableHead>
                  <TableHead className="text-right">{t("stockAdjustments.colChange")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">{itemName(r.item_id)}</TableCell>
                    <TableCell className="text-muted-foreground">{warehouseName(r.warehouse_id)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                    <TableCell className={`text-right font-medium ${r.qty_delta_kg < 0 ? "text-destructive" : "text-success"}`}>
                      {r.qty_delta_kg > 0 ? "+" : ""}
                      {r.qty_delta_kg.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t("stockAdjustments.empty")}
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
