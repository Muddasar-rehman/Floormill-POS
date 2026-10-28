import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { itemSchema, type Item, type ItemInput } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";
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

export function Items() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ItemInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: { mun_kg: 40 },
  });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("items").select("*").order("name");
    setItems((data as Item[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    reset({ mun_kg: 40, name: "", category: "", reorder_threshold_kg: undefined });
    setOpen(true);
  }

  function openEdit(i: Item) {
    setEditing(i);
    reset({
      name: i.name,
      category: i.category ?? "",
      mun_kg: i.mun_kg,
      reorder_threshold_kg: i.reorder_threshold_kg ?? undefined,
    });
    setOpen(true);
  }

  async function onSubmit(values: ItemInput) {
    if (editing) {
      const { error } = await supabase.from("items").update(values).eq("id", editing.id);
      if (error) {
        toast.error(t("common.failedUpdate"), { description: error.message });
        return;
      }
      toast.success(t("items.toastUpdated"));
    } else {
      const { error } = await supabase.from("items").insert(values);
      if (error) {
        toast.error(t("common.failedSave"), { description: error.message });
        return;
      }
      toast.success(t("items.toastAdded"));
    }
    setOpen(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("items.toastDeleted"));
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("items.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("items.subtitle")}</p>
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
              {t("items.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t("items.dialogEdit") : t("items.dialogAdd")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("common.name")} error={errors.name?.message} className="col-span-2">
                <Input {...register("name")} autoFocus />
              </FormField>
              <FormField label={t("items.fieldCategory")}>
                <Input {...register("category")} placeholder={t("items.fieldCategoryPlaceholder") ?? undefined} />
              </FormField>
              <FormField label={t("items.fieldMunKg")} error={errors.mun_kg?.message}>
                <Input type="number" step="0.01" {...register("mun_kg")} />
              </FormField>
              <FormField label={t("items.fieldReorder")} className="col-span-2">
                <Input type="number" step="0.01" {...register("reorder_threshold_kg")} />
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
                  <TableHead>{t("items.colCategory")}</TableHead>
                  <TableHead className="text-right">{t("items.colAvgCost")}</TableHead>
                  <TableHead className="text-right">{t("items.colMunKg")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {i.name}
                        {i.is_protected && (
                          <Badge variant="outline" className="text-xs">
                            {t("items.protected")}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{i.category ?? "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{i.avg_cost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{i.mun_kg}</TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => openEdit(i)}
                        onDelete={() => handleDelete(i.id)}
                        deleteTitle={t("items.deleteTitle", { name: i.name })}
                        deleteDescription={t("items.deleteDesc")}
                        canDelete={!i.is_protected}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t("items.empty")}
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
