import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { warehouseSchema, type Warehouse, type WarehouseInput } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { toast } from "../components/ui/sonner";
import { RowActions } from "../components/RowActions";

export function Warehouses() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseInput>({ resolver: zodResolver(warehouseSchema) });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("warehouses").select("*").order("name");
    setWarehouses((data as Warehouse[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    reset({ name: "", location: "", capacity_kg: undefined, incharge_employee: "" });
    setOpen(true);
  }

  function openEdit(w: Warehouse) {
    setEditing(w);
    reset({
      name: w.name,
      location: w.location ?? "",
      capacity_kg: w.capacity_kg ?? undefined,
      incharge_employee: w.incharge_employee ?? "",
    });
    setOpen(true);
  }

  async function onSubmit(values: WarehouseInput) {
    if (editing) {
      const { error } = await supabase.from("warehouses").update(values).eq("id", editing.id);
      if (error) {
        toast.error(t("common.failedUpdate"), { description: error.message });
        return;
      }
      toast.success(t("warehouses.toastUpdated"));
    } else {
      const { error } = await supabase.from("warehouses").insert(values);
      if (error) {
        toast.error(t("common.failedSave"), { description: error.message });
        return;
      }
      toast.success(t("warehouses.toastAdded"));
    }
    setOpen(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("warehouses").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("warehouses.toastDeleted"));
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("warehouses.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("warehouses.subtitle")}</p>
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
              {t("warehouses.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t("warehouses.dialogEdit") : t("warehouses.dialogAdd")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("common.name")} error={errors.name?.message} className="col-span-2">
                <Input {...register("name")} autoFocus />
              </FormField>
              <FormField label={t("warehouses.fieldLocation")} className="col-span-2">
                <Input {...register("location")} />
              </FormField>
              <FormField label={t("warehouses.fieldCapacity")}>
                <Input type="number" step="0.01" {...register("capacity_kg")} />
              </FormField>
              <FormField label={t("warehouses.fieldIncharge")}>
                <Input {...register("incharge_employee")} />
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
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("warehouses.colLocation")}</TableHead>
                  <TableHead className="text-right">{t("warehouses.colCapacity")}</TableHead>
                  <TableHead>{t("warehouses.colIncharge")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-muted-foreground">{w.location ?? "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{w.capacity_kg ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{w.incharge_employee ?? "-"}</TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => openEdit(w)}
                        onDelete={() => handleDelete(w.id)}
                        deleteTitle={t("warehouses.deleteTitle", { name: w.name })}
                        deleteDescription={t("warehouses.deleteDesc")}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {warehouses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t("warehouses.empty")}
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
