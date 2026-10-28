import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Printer } from "lucide-react";
import { purchaseSchema, formatKgAsMun, todayStr, type Item, type Party, type Purchase, type PurchaseInput, type Warehouse } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { toast } from "../components/ui/sonner";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { Button as IconButton } from "../components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

const NS = "purchases";

export function TransactionPage({ itemKey, titleNs }: { itemKey?: string; titleNs?: string }) {
  const { t } = useTranslation();
  const labelNs = titleNs ?? NS;
  const partyLabel = t("common.vendor");
  const [rows, setRows] = useState<Purchase[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseInput>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { date: todayStr(), kaat_pct: 0, watta_pct: 0 },
  });

  const [qtyDisplay, setQtyDisplay] = useState("");
  const [qtyUnit, setQtyUnit] = useState<"kg" | "mun">("kg");
  const selectedItemId = watch("item_id");
  const munKg = items.find((i) => i.id === selectedItemId)?.mun_kg ?? 40;
  const kaatPct = Number(watch("kaat_pct") ?? 0);
  const wattaPct = Number(watch("watta_pct") ?? 0);
  const rateInput = Number(watch("rate") ?? 0);

  useEffect(() => {
    const qty = parseFloat(qtyDisplay);
    if (Number.isNaN(qty)) {
      setValue("weighed_qty_kg", undefined as never);
      return;
    }
    const kg = qtyUnit === "kg" ? qty : qty * munKg;
    setValue("weighed_qty_kg", kg, { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtyDisplay, qtyUnit, munKg]);

  const weighedKg = qtyDisplay && !Number.isNaN(parseFloat(qtyDisplay)) ? (qtyUnit === "kg" ? parseFloat(qtyDisplay) : parseFloat(qtyDisplay) * munKg) : 0;
  const netKg = weighedKg * (1 - ((kaatPct || 0) + (wattaPct || 0)) / 100);
  const previewTotal = netKg * rateInput;

  function resetForm() {
    reset({ date: todayStr(), kaat_pct: 0, watta_pct: 0 });
    setQtyDisplay("");
    setQtyUnit("kg");
    setEditingId(null);
  }

  function openEdit(row: Purchase) {
    setEditingId(row.id);
    reset({
      vendor_id: row.vendor_id,
      item_id: row.item_id,
      warehouse_id: row.warehouse_id,
      weighed_qty_kg: row.weighed_qty_kg,
      kaat_pct: row.kaat_pct,
      rate: row.rate,
      watta_pct: row.watta_pct,
      date: row.date,
    });
    setQtyDisplay(String(row.weighed_qty_kg));
    setQtyUnit("kg");
    setOpen(true);
  }

  async function load() {
    setLoading(true);
    const [rowsRes, partiesRes, itemsRes, warehousesRes] = await Promise.all([
      supabase.from("purchases").select("*").order("date", { ascending: false }),
      supabase.from("parties").select("*").order("name"),
      supabase.from("items").select("*").order("name"),
      supabase.from("warehouses").select("*").order("name"),
    ]);
    setRows((rowsRes.data as Purchase[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setItems((itemsRes.data as Item[]) ?? []);
    setWarehouses((warehousesRes.data as Warehouse[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && rows.length > 0) {
      const row = rows.find((r) => r.id === editId);
      if (row) openEdit(row);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    if (open && itemKey && !editingId) {
      const match = items.find((i) => i.key === itemKey);
      if (match) {
        setValue("item_id", match.id, { shouldValidate: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemKey, items]);

  function partyName(id: string) {
    return parties.find((p) => p.id === id)?.name ?? id;
  }
  function itemInfo(id: string) {
    return items.find((i) => i.id === id);
  }
  function warehouseName(id: string) {
    return warehouses.find((w) => w.id === id)?.name ?? id;
  }

  const allowedItems = itemKey ? items.filter((i) => i.key === itemKey) : items;
  const allowedItemIds = new Set(allowedItems.map((i) => i.id));
  const visibleRows = itemKey ? rows.filter((r) => allowedItemIds.has(r.item_id)) : rows;

  async function onSubmit(values: PurchaseInput) {
    const { error } = editingId
      ? await supabase.from("purchases").update(values).eq("id", editingId)
      : await supabase.from("purchases").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t(editingId ? `${NS}.toastUpdated` : `${NS}.toastRecorded`));
    resetForm();
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("purchases").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t(`${NS}.toastDeleted`));
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(`${labelNs}.title`)}</h1>
          <p className="text-sm text-muted-foreground">{t(`${labelNs}.subtitle`)}</p>
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
              {t(`${labelNs}.new`)}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? t(`${labelNs}.dialogEditTitle`) : t(`${labelNs}.dialogTitle`)}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label={partyLabel} error={errors.vendor_id?.message}>
                <Controller
                  name="vendor_id"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
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
              {(!itemKey || allowedItems.length !== 1) && (
                <FormField label={t("common.item")} error={errors.item_id?.message}>
                  <Controller
                    name="item_id"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("common.item")} />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedItems.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              )}
              <FormField label={t("common.warehouse")} error={errors.warehouse_id?.message}>
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
              <FormField label={t(`${NS}.fieldWeighedQuantity`)} error={errors.weighed_qty_kg?.message}>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={qtyDisplay}
                    onChange={(e) => setQtyDisplay(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={qtyUnit} onValueChange={(v) => setQtyUnit(v as "kg" | "mun")}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">{t(`${NS}.unitKg`)}</SelectItem>
                      <SelectItem value="mun">{t(`${NS}.unitMun`)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FormField>
              <FormField label={t(`${NS}.fieldKaatPct`)} error={errors.kaat_pct?.message}>
                <Input type="number" step="0.01" min={0} max={99} {...register("kaat_pct")} />
              </FormField>
              <FormField label={t(`${NS}.fieldRatePerKg`)} error={errors.rate?.message}>
                <Input type="number" step="0.01" {...register("rate")} />
              </FormField>
              <FormField label={t(`${NS}.fieldWattaPct`)} error={errors.watta_pct?.message}>
                <Input type="number" step="0.01" min={0} max={99} {...register("watta_pct")} />
              </FormField>
              <FormField label={t("common.date")} error={errors.date?.message}>
                <Input type="date" {...register("date")} />
              </FormField>
              {weighedKg > 0 && (
                <div className="col-span-1 sm:col-span-2 lg:col-span-3 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      {t(`${NS}.previewNetQty`)}: <span className="font-medium text-foreground">{formatKgAsMun(weighedKg, munKg)}</span>
                    </div>
                    <div>
                      {t(`${NS}.previewNetRate`)}: <span className="font-medium text-foreground">{formatKgAsMun(netKg, munKg)}</span>
                    </div>
                    <div className="col-span-2">
                      {t(`${NS}.previewTotal`)}: <span className="font-medium text-foreground">{previewTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="col-span-1 sm:col-span-2 lg:col-span-3">
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
                  <TableHead>#</TableHead>
                  <TableHead>{t(`${NS}.colDate`)}</TableHead>
                  <TableHead>{partyLabel}</TableHead>
                  <TableHead>{t(`${NS}.colItem`)}</TableHead>
                  <TableHead>{t(`${NS}.colWarehouse`)}</TableHead>
                  <TableHead className="text-right">{t(`${NS}.colQty`)}</TableHead>
                  <TableHead className="text-right">{t(`${NS}.colKaatWatta`)}</TableHead>
                  <TableHead className="text-right">{t(`${NS}.colRate`)}</TableHead>
                  <TableHead className="text-right">{t(`${NS}.colTotal`)}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((rr) => {
                  const info = itemInfo(rr.item_id);
                  const hasKaatWatta = rr.kaat_pct > 0 || rr.watta_pct > 0;
                  return (
                    <TableRow key={rr.id}>
                      <TableCell className="text-muted-foreground">P-{rr.invoice_no}</TableCell>
                      <TableCell className="text-muted-foreground">{rr.date}</TableCell>
                      <TableCell className="font-medium">{partyName(rr.vendor_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{info?.name ?? rr.item_id}</TableCell>
                      <TableCell className="text-muted-foreground">{warehouseName(rr.warehouse_id)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatKgAsMun(rr.qty_kg, info?.mun_kg ?? 40)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {hasKaatWatta ? `${rr.kaat_pct} / ${rr.watta_pct} kg/100kg` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{rr.net_rate.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">{rr.total.toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <IconButton variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" asChild>
                            <Link to={`/invoices/purchase/${rr.id}`}>
                              <Printer className="h-4 w-4" />
                            </Link>
                          </IconButton>
                          <IconButton variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(rr)}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <DeleteConfirm
                            trigger={
                              <IconButton variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            }
                            title={t(`${NS}.deleteTitle`)}
                            description={t(`${NS}.deleteDesc`)}
                            onConfirm={() => handleDelete(rr.id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visibleRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                      {t(`${labelNs}.empty`)}
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
