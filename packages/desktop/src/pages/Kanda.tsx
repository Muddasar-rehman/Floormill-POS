import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Printer, Trash2 } from "lucide-react";
import { kandaSlipSchema, type GatePass, type KandaSlip, type KandaSlipInput } from "shared";
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

export function Kanda() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<KandaSlip[]>([]);
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<KandaSlipInput>({ resolver: zodResolver(kandaSlipSchema) });

  async function load() {
    setLoading(true);
    const [rowsRes, gatePassesRes] = await Promise.all([
      supabase.from("kanda_slips").select("*").order("created_at", { ascending: false }),
      supabase.from("gate_passes").select("*").order("gate_time", { ascending: false }),
    ]);
    setRows((rowsRes.data as KandaSlip[]) ?? []);
    setGatePasses((gatePassesRes.data as GatePass[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function gatePassLabel(id: string) {
    const gp = gatePasses.find((g) => g.id === id);
    return gp ? `${gp.vehicle_number} · ${new Date(gp.gate_time).toLocaleString()}` : id;
  }

  async function onSubmit(values: KandaSlipInput) {
    const { error } = await supabase.from("kanda_slips").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("kanda.toastRecorded"));
    reset({ gate_pass_id: undefined, gross_weight_kg: undefined, tare_weight_kg: undefined });
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("kanda_slips").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("kanda.toastDeleted"));
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("kanda.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("kanda.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("kanda.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("kanda.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("kanda.fieldGatePass")} error={errors.gate_pass_id?.message} className="col-span-2">
                <Controller
                  name="gate_pass_id"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("kanda.selectGatePass")} />
                      </SelectTrigger>
                      <SelectContent>
                        {gatePasses.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.vehicle_number} · {new Date(g.gate_time).toLocaleString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label={t("kanda.fieldGross")} error={errors.gross_weight_kg?.message}>
                <Input type="number" step="0.01" {...register("gross_weight_kg")} />
              </FormField>
              <FormField label={t("kanda.fieldTare")} error={errors.tare_weight_kg?.message}>
                <Input type="number" step="0.01" {...register("tare_weight_kg")} />
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
                  <TableHead>{t("kanda.colGatePass")}</TableHead>
                  <TableHead className="text-right">{t("kanda.colGross")}</TableHead>
                  <TableHead className="text-right">{t("kanda.colTare")}</TableHead>
                  <TableHead className="text-right">{t("kanda.colNet")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{gatePassLabel(r.gate_pass_id)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.gross_weight_kg.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.tare_weight_kg.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-medium">{r.net_weight_kg.toFixed(1)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" asChild>
                          <Link to={`/kanda/${r.id}/print`}>
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                        <DeleteConfirm
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={t("kanda.deleteTitle")}
                          description={t("common.cannotUndo")}
                          onConfirm={() => handleDelete(r.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t("kanda.empty")}
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
