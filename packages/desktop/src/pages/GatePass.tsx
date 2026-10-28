import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Printer, Trash2 } from "lucide-react";
import { gatePassSchema, formatKgAsMun, parseInsufficientStockError, todayStr, type GatePass, type GatePassInput, type Item, type Party, type Warehouse } from "shared";
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
import { DeleteConfirm } from "../components/DeleteConfirm";

type GatePassRow = GatePass & { gate_pass_items: { item_id: string; qty_kg: number; rate: number | null }[] };
interface StockLevel {
  item_id: string;
  warehouse_id: string;
  qty_kg: number;
}

export function GatePassPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<GatePassRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<GatePassInput>({
    resolver: zodResolver(gatePassSchema),
    defaultValues: {
      direction: "out",
      date: todayStr(),
      items: [{ item_id: "", weighed_qty_kg: undefined, kaat_pct: 0, rate: undefined, watta_pct: 0 }] as never,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const warehouseId = watch("warehouse_id");
  // Gate Pass only records stock going out (a sale) now, so this is always a
  // customer — but any party can be picked, since the same person can also
  // have a vendor history with the mill (their Khata nets both together).
  const partyOptions = parties;
  const stockForWarehouse = stock
    .filter((s) => s.warehouse_id === warehouseId && s.qty_kg > 0)
    .sort((a, b) => b.qty_kg - a.qty_kg);

  async function load() {
    setLoading(true);
    const [rowsRes, itemsRes, warehousesRes, partiesRes, stockRes] = await Promise.all([
      supabase
        .from("gate_passes")
        .select("*, gate_pass_items(item_id, qty_kg, rate)")
        .order("gate_time", { ascending: false }),
      supabase.from("items").select("*").order("name"),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("parties").select("*").order("name"),
      supabase.from("item_stock").select("item_id, warehouse_id, qty_kg"),
    ]);
    setRows((rowsRes.data as GatePassRow[]) ?? []);
    setItems((itemsRes.data as Item[]) ?? []);
    setWarehouses((warehousesRes.data as Warehouse[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setStock((stockRes.data as StockLevel[]) ?? []);
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
  function itemsSummary(r: GatePassRow) {
    if (!r.gate_pass_items?.length) return "-";
    return r.gate_pass_items
      .map((gpi) => `${itemName(gpi.item_id)} (${formatKgAsMun(gpi.qty_kg, items.find((i) => i.id === gpi.item_id)?.mun_kg ?? 40)})`)
      .join(", ");
  }
  function billTotal(r: GatePassRow) {
    if (!r.gate_pass_items?.length) return null;
    const total = r.gate_pass_items.reduce((sum, gpi) => sum + gpi.qty_kg * (gpi.rate ?? 0), 0);
    return total > 0 ? total : null;
  }
  function friendlyError(message: string): string {
    const info = parseInsufficientStockError(message);
    if (!info) return message;
    const infoItem = items.find((i) => i.id === info.itemId);
    return t("common.insufficientStock", {
      item: infoItem?.name ?? t("common.item"),
      available: formatKgAsMun(info.availableKg, infoItem?.mun_kg ?? 40),
      requested: formatKgAsMun(info.requestedKg, infoItem?.mun_kg ?? 40),
    });
  }

  function resetForm() {
    reset({
      direction: "out",
      date: todayStr(),
      items: [{ item_id: "", weighed_qty_kg: undefined, kaat_pct: 0, rate: undefined, watta_pct: 0 }] as never,
    });
  }

  async function onSubmit(values: GatePassInput) {
    const { error } = await supabase.rpc("fn_record_gate_pass", {
      p_vehicle_number: values.vehicle_number,
      p_driver: values.driver ?? null,
      p_party_id: values.party_id,
      p_warehouse_id: values.warehouse_id,
      p_direction: values.direction,
      p_date: values.date,
      p_items: values.items,
    });
    if (error) {
      toast.error(t("common.failedSave"), { description: friendlyError(error.message) });
      return;
    }
    toast.success(t("gatePass.toastRecorded"));
    resetForm();
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("gate_passes").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("gatePass.toastDeleted"));
    load();
  }

  const itemsError = errors.items as unknown as { message?: string; root?: { message?: string } } | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("gatePass.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("gatePass.subtitle")}</p>
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
              {t("gatePass.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("gatePass.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label={t("gatePass.fieldVehicle")} error={errors.vehicle_number?.message}>
                  <Controller name="vehicle_number" control={control} render={({ field }) => <Input {...field} autoFocus />} />
                </FormField>
                <FormField label={t("gatePass.fieldDriver")}>
                  <Controller name="driver" control={control} render={({ field }) => <Input value={field.value ?? ""} onChange={field.onChange} />} />
                </FormField>
                <FormField
                  label={t("common.customer")}
                  error={errors.party_id?.message}
                >
                  <Controller
                    name="party_id"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("common.customer")} />
                        </SelectTrigger>
                        <SelectContent>
                          {partyOptions.map((p) => (
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
                  <Controller name="date" control={control} render={({ field }) => <Input type="date" {...field} />} />
                </FormField>
              </div>

              {warehouseId && (
                <div className="rounded-md border border-border">
                  <div className="border-b border-border px-3 py-2 text-sm font-medium">{t("gatePass.stockAvailable")}</div>
                  <div className="max-h-40 overflow-y-auto">
                    {stockForWarehouse.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">{t("gatePass.stockAvailableEmpty")}</p>
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
                  <span className="text-sm font-medium">{t("gatePass.itemsLabel")}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ item_id: "", weighed_qty_kg: undefined, kaat_pct: 0, rate: undefined, watta_pct: 0 } as never)}
                  >
                    <Plus className="h-4 w-4" />
                    {t("gatePass.addItem")}
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
                        <Controller
                          name={`items.${index}.weighed_qty_kg`}
                          control={control}
                          render={({ field: qtyField }) => (
                            <Input type="number" step="0.01" placeholder={t("gatePass.fieldQuantityKg")} {...qtyField} value={qtyField.value ?? ""} />
                          )}
                        />
                        {errors.items?.[index]?.weighed_qty_kg?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.items[index]?.weighed_qty_kg?.message}</p>
                        )}
                      </div>
                      <div>
                        <Controller
                          name={`items.${index}.kaat_pct`}
                          control={control}
                          render={({ field: kaatField }) => (
                            <Input type="number" step="0.01" placeholder={t("purchases.fieldKaatPct")} {...kaatField} value={kaatField.value ?? 0} />
                          )}
                        />
                      </div>
                      <div>
                        <Controller
                          name={`items.${index}.rate`}
                          control={control}
                          render={({ field: rateField }) => (
                            <Input type="number" step="0.01" placeholder={t("purchases.fieldRatePerKg")} {...rateField} value={rateField.value ?? ""} />
                          )}
                        />
                        {errors.items?.[index]?.rate?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.items[index]?.rate?.message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Controller
                          name={`items.${index}.watta_pct`}
                          control={control}
                          render={({ field: wattaField }) => (
                            <Input type="number" step="0.01" placeholder={t("purchases.fieldWattaPct")} {...wattaField} value={wattaField.value ?? 0} />
                          )}
                        />
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
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("gatePass.colVehicle")}</TableHead>
                  <TableHead>{t("gatePass.fieldPartyName")}</TableHead>
                  <TableHead>{t("gatePass.colDirection")}</TableHead>
                  <TableHead>{t("gatePass.itemsLabel")}</TableHead>
                  <TableHead>{t("common.warehouse")}</TableHead>
                  <TableHead className="text-right">{t("sales.colTotal")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.gate_pass_no}</TableCell>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">{r.vehicle_number}</TableCell>
                    <TableCell className="text-muted-foreground">{r.party_name ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={r.direction === "in" ? "success" : "secondary"}>
                        {r.direction === "in" ? t("gatePass.directionIn") : t("gatePass.directionOut")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{itemsSummary(r)}</TableCell>
                    <TableCell className="text-muted-foreground">{warehouseName(r.warehouse_id)}</TableCell>
                    <TableCell className="text-right font-medium">{billTotal(r)?.toFixed(2) ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" asChild>
                          <Link to={`/gate-pass/${r.id}/print`}>
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                        <DeleteConfirm
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={t("gatePass.deleteTitle")}
                          description={t("gatePass.deleteDescTransactional")}
                          onConfirm={() => handleDelete(r.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      {t("gatePass.empty")}
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
