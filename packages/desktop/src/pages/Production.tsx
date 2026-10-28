import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Printer, Trash2 } from "lucide-react";
import {
  productionBatchSchema,
  formatKgAsMun,
  parseInsufficientStockError,
  todayStr,
  type Item,
  type ProductionBatch,
  type ProductionBatchInput,
  type Warehouse,
} from "shared";
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

type ProductionRow = ProductionBatch & {
  production_inputs: { item_id: string; qty_kg: number }[];
  production_outputs: { item_id: string; qty_kg: number; rate: number }[];
};

export function ProductionPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductionBatchInput>({
    resolver: zodResolver(productionBatchSchema),
    defaultValues: {
      date: todayStr(),
      inputs: [{ item_id: "", qty_kg: undefined }] as never,
      outputs: [{ item_id: "", qty_kg: undefined, rate: undefined }] as never,
    },
  });

  const inputFields = useFieldArray({ control, name: "inputs" });
  const outputFields = useFieldArray({ control, name: "outputs" });

  async function load() {
    setLoading(true);
    const [rowsRes, itemsRes, warehousesRes] = await Promise.all([
      supabase
        .from("production_batches")
        .select("*, production_inputs(item_id, qty_kg), production_outputs(item_id, qty_kg, rate)")
        .order("date", { ascending: false }),
      supabase.from("items").select("*").order("name"),
      supabase.from("warehouses").select("*").order("name"),
    ]);
    setRows((rowsRes.data as ProductionRow[]) ?? []);
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
  function summarize(list: { item_id: string; qty_kg: number }[]) {
    if (!list?.length) return "-";
    return list.map((r) => `${itemName(r.item_id)} (${formatKgAsMun(r.qty_kg, items.find((i) => i.id === r.item_id)?.mun_kg ?? 40)})`).join(", ");
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
      inputs: [{ item_id: "", qty_kg: undefined }] as never,
      outputs: [{ item_id: "", qty_kg: undefined, rate: undefined }] as never,
    });
  }

  async function onSubmit(values: ProductionBatchInput) {
    const { error } = await supabase.rpc("fn_record_production_batch", {
      p_warehouse_id: values.warehouse_id,
      p_date: values.date,
      p_notes: values.notes ?? null,
      p_inputs: values.inputs,
      p_outputs: values.outputs,
    });
    if (error) {
      toast.error(t("common.failedSave"), { description: friendlyError(error.message) });
      return;
    }
    toast.success(t("production.toastRecorded"));
    resetForm();
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("production_batches").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("production.toastDeleted"));
    load();
  }

  const inputsError = errors.inputs as unknown as { root?: { message?: string } } | undefined;
  const outputsError = errors.outputs as unknown as { root?: { message?: string } } | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("production.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("production.subtitle")}</p>
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
              {t("production.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("production.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <FormField label={t("common.notes")}>
                  <Input {...register("notes")} />
                </FormField>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("production.inputsLabel")}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => inputFields.append({ item_id: "", qty_kg: undefined } as never)}
                  >
                    <Plus className="h-4 w-4" />
                    {t("production.addItem")}
                  </Button>
                </div>
                {inputsError?.root?.message && <p className="text-sm text-destructive">{inputsError.root.message}</p>}
                <div className="space-y-2">
                  {inputFields.fields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-2">
                      <div className="flex-1">
                        <Controller
                          name={`inputs.${index}.item_id`}
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
                        {errors.inputs?.[index]?.item_id?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.inputs[index]?.item_id?.message}</p>
                        )}
                      </div>
                      <div className="w-40">
                        <Input type="number" step="0.01" placeholder={t("gatePass.fieldQuantityKg")} {...register(`inputs.${index}.qty_kg`)} />
                        {errors.inputs?.[index]?.qty_kg?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.inputs[index]?.qty_kg?.message}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={inputFields.fields.length === 1}
                        onClick={() => inputFields.remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("production.outputsLabel")}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => outputFields.append({ item_id: "", qty_kg: undefined, rate: undefined } as never)}
                  >
                    <Plus className="h-4 w-4" />
                    {t("production.addItem")}
                  </Button>
                </div>
                {outputsError?.root?.message && <p className="text-sm text-destructive">{outputsError.root.message}</p>}
                <div className="space-y-2">
                  {outputFields.fields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-2">
                      <div className="flex-1">
                        <Controller
                          name={`outputs.${index}.item_id`}
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
                        {errors.outputs?.[index]?.item_id?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.outputs[index]?.item_id?.message}</p>
                        )}
                      </div>
                      <div className="w-36">
                        <Input type="number" step="0.01" placeholder={t("gatePass.fieldQuantityKg")} {...register(`outputs.${index}.qty_kg`)} />
                        {errors.outputs?.[index]?.qty_kg?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.outputs[index]?.qty_kg?.message}</p>
                        )}
                      </div>
                      <div className="w-36">
                        <Input type="number" step="0.01" placeholder={t("production.fieldRate")} {...register(`outputs.${index}.rate`)} />
                        {errors.outputs?.[index]?.rate?.message && (
                          <p className="mt-1 text-xs text-destructive">{errors.outputs[index]?.rate?.message}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={outputFields.fields.length === 1}
                        onClick={() => outputFields.remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                  <TableHead>{t("common.warehouse")}</TableHead>
                  <TableHead>{t("production.inputsLabel")}</TableHead>
                  <TableHead>{t("production.outputsLabel")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.batch_no}</TableCell>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="text-muted-foreground">{warehouseName(r.warehouse_id)}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{summarize(r.production_inputs)}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{summarize(r.production_outputs)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" asChild>
                          <Link to={`/production/${r.id}/print`}>
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                        <DeleteConfirm
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={t("production.deleteTitle")}
                          description={t("common.cannotUndo")}
                          onConfirm={() => handleDelete(r.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("production.empty")}
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
