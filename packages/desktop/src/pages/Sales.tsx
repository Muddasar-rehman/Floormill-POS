import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { saleSchema, formatKgAsMun, parseInsufficientStockError, todayStr, type Item, type Party, type Sale, type SaleInput, type Warehouse } from "shared";
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
import { DeleteConfirm } from "../components/DeleteConfirm";

type SaleRow = Sale & {
  sale_items: { item_id: string; weighed_qty_kg: number; qty_kg: number; rate: number; net_rate: number; kaat_pct: number; watta_pct: number }[];
};
interface StockLevel {
  item_id: string;
  warehouse_id: string;
  qty_kg: number;
}

export function Sales() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
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
  } = useForm<SaleInput>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      date: todayStr(),
      items: [{ item_id: "", weighed_qty_kg: undefined, kaat_pct: 0, rate: undefined, watta_pct: 0 }] as never,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const warehouseId = watch("warehouse_id");
  const stockForWarehouse = stock
    .filter((s) => s.warehouse_id === warehouseId && s.qty_kg > 0)
    .sort((a, b) => b.qty_kg - a.qty_kg);

  async function load() {
    setLoading(true);
    const [rowsRes, itemsRes, warehousesRes, partiesRes, stockRes] = await Promise.all([
      supabase
        .from("sales")
        .select("*, sale_items(item_id, weighed_qty_kg, qty_kg, rate, net_rate, kaat_pct, watta_pct)")
        .order("date", { ascending: false }),
      supabase.from("items").select("*").order("name"),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("parties").select("*").order("name"),
      supabase.from("item_stock").select("item_id, warehouse_id, qty_kg"),
    ]);
    setRows((rowsRes.data as SaleRow[]) ?? []);
    setItems((itemsRes.data as Item[]) ?? []);
    setWarehouses((warehousesRes.data as Warehouse[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setStock((stockRes.data as StockLevel[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
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

  function partyName(id: string) {
    return parties.find((p) => p.id === id)?.name ?? id;
  }
  function itemName(id: string) {
    return items.find((i) => i.id === id)?.name ?? id;
  }
  function warehouseName(id: string) {
    return warehouses.find((w) => w.id === id)?.name ?? id;
  }
  function itemsSummary(r: SaleRow) {
    if (!r.sale_items?.length) return "-";
    return r.sale_items
      .map((si) => `${itemName(si.item_id)} (${formatKgAsMun(si.qty_kg, items.find((i) => i.id === si.item_id)?.mun_kg ?? 40)})`)
      .join(", ");
  }
  function friendlyError(message: string): string {
    const info = parseInsufficientStockError(message);
    if (!info) return message;
    const info_item = items.find((i) => i.id === info.itemId);
    return t("common.insufficientStock", {
      item: info_item?.name ?? t("common.item"),
      available: formatKgAsMun(info.availableKg, info_item?.mun_kg ?? 40),
      requested: formatKgAsMun(info.requestedKg, info_item?.mun_kg ?? 40),
    });
  }

  function resetForm() {
    reset({
      date: todayStr(),
      items: [{ item_id: "", weighed_qty_kg: undefined, kaat_pct: 0, rate: undefined, watta_pct: 0 }] as never,
    });
    setEditingId(null);
  }

  function openEdit(row: SaleRow) {
    setEditingId(row.id);
    reset({
      customer_id: row.customer_id,
      warehouse_id: row.warehouse_id,
      date: row.date,
      items: row.sale_items.map((si) => ({
        item_id: si.item_id,
        weighed_qty_kg: si.weighed_qty_kg,
        kaat_pct: si.kaat_pct,
        rate: si.rate,
        watta_pct: si.watta_pct,
      })) as never,
    });
    setOpen(true);
  }

  async function onSubmit(values: SaleInput) {
    const { error } = editingId
      ? await supabase.rpc("fn_update_sale", {
          p_sale_id: editingId,
          p_customer_id: values.customer_id,
          p_warehouse_id: values.warehouse_id,
          p_date: values.date,
          p_items: values.items,
        })
      : await supabase.rpc("fn_record_sale", {
          p_customer_id: values.customer_id,
          p_warehouse_id: values.warehouse_id,
          p_date: values.date,
          p_items: values.items,
        });
    if (error) {
      toast.error(t("common.failedSave"), { description: friendlyError(error.message) });
      return;
    }
    toast.success(t(editingId ? "sales.toastUpdated" : "sales.toastRecorded"));
    resetForm();
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("sales.toastDeleted"));
    load();
  }

  const itemsError = errors.items as unknown as { root?: { message?: string } } | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("sales.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sales.subtitle")}</p>
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
              {t("sales.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editingId ? t("sales.dialogEditTitle") : t("sales.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label={t("common.customer")} error={errors.customer_id?.message}>
                  <Controller
                    name="customer_id"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("common.customer")} />
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
                <FormField label={t("common.date")} error={errors.date?.message}>
                  <Input type="date" {...register("date")} />
                </FormField>
              </div>

              {warehouseId && (
                <div className="rounded-md border border-border">
                  <div className="border-b border-border px-3 py-2 text-sm font-medium">{t("sales.stockAvailable")}</div>
                  <div className="max-h-40 overflow-y-auto">
                    {stockForWarehouse.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">{t("sales.stockAvailableEmpty")}</p>
                    ) : (
                      <Table>
                        <TableBody>
                          {stockForWarehouse.map((s) => {
                            const item = items.find((i) => i.id === s.item_id);
                            return (
                              <TableRow key={s.item_id}>
                                <TableCell className="py-1.5">{item?.name ?? s.item_id}</TableCell>
                                <TableCell className="py-1.5 text-right text-muted-foreground">
                                  {formatKgAsMun(s.qty_kg, item?.mun_kg ?? 40)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("sales.itemsLabel")}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ item_id: "", weighed_qty_kg: undefined, kaat_pct: 0, rate: undefined, watta_pct: 0 } as never)}
                  >
                    <Plus className="h-4 w-4" />
                    {t("sales.addItem")}
                  </Button>
                </div>
                {itemsError?.root?.message && <p className="text-sm text-destructive">{itemsError.root.message}</p>}
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-5">
                      <div className="sm:col-span-2">
                        <Controller
                          name={`items.${index}.item_id`}
                          control={control}
                          render={({ field: itemField }) => (
                            <Select onValueChange={itemField.onChange} value={itemField.value}>
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
                        {errors.items?.[index]?.item_id?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.items[index]?.item_id?.message}</p>
                        )}
                      </div>
                      <div>
                        <Input type="number" step="0.01" placeholder={t("sales.fieldWeighedQuantity")} {...register(`items.${index}.weighed_qty_kg`)} />
                        {errors.items?.[index]?.weighed_qty_kg?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.items[index]?.weighed_qty_kg?.message}</p>
                        )}
                      </div>
                      <div>
                        <Input type="number" step="0.01" placeholder={t("sales.fieldKaatPct")} {...register(`items.${index}.kaat_pct`)} />
                      </div>
                      <div>
                        <Input type="number" step="0.01" placeholder={t("sales.fieldRatePerKg")} {...register(`items.${index}.rate`)} />
                        {errors.items?.[index]?.rate?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.items[index]?.rate?.message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input type="number" step="0.01" placeholder={t("sales.fieldWattaPct")} {...register(`items.${index}.watta_pct`)} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={fields.length === 1}
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
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
                  <TableHead>{t("sales.colDate")}</TableHead>
                  <TableHead>{t("common.customer")}</TableHead>
                  <TableHead>{t("sales.colWarehouse")}</TableHead>
                  <TableHead>{t("sales.itemsLabel")}</TableHead>
                  <TableHead className="text-right">{t("sales.colTotal")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">S-{r.invoice_no}</TableCell>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">{partyName(r.customer_id)}</TableCell>
                    <TableCell className="text-muted-foreground">{warehouseName(r.warehouse_id)}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{itemsSummary(r)}</TableCell>
                    <TableCell className="text-right font-medium">{r.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" asChild>
                          <Link to={`/invoices/sale/${r.id}`}>
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DeleteConfirm
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={t("sales.deleteTitle")}
                          description={t("sales.deleteDesc")}
                          onConfirm={() => handleDelete(r.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      {t("sales.empty")}
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
