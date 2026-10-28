import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { bardanaSchema, todayStr, type BardanaBalance, type BardanaInput, type Party } from "shared";
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

export function Bardana() {
  const { t } = useTranslation();
  const [balances, setBalances] = useState<BardanaBalance[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BardanaInput>({
    resolver: zodResolver(bardanaSchema),
    defaultValues: { direction: "out", date: todayStr() },
  });

  async function load() {
    setLoading(true);
    const [balancesRes, partiesRes] = await Promise.all([
      supabase.from("bardana_balances").select("*"),
      supabase.from("parties").select("*").order("name"),
    ]);
    setBalances((balancesRes.data as BardanaBalance[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function partyName(id: string) {
    return parties.find((p) => p.id === id)?.name ?? id;
  }

  async function onSubmit(values: BardanaInput) {
    const { error } = await supabase.from("bardana_ledger").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("bardana.toastRecorded"));
    reset({ direction: "out", date: todayStr() });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("bardana.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("bardana.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("bardana.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("bardana.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("bardana.fieldParty")} error={errors.party_id?.message} className="col-span-2">
                <Controller
                  name="party_id"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("bardana.selectParty")} />
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
              <FormField label={t("bardana.fieldDirection")}>
                <Controller
                  name="direction"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in">{t("bardana.directionIn")}</SelectItem>
                        <SelectItem value="out">{t("bardana.directionOut")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label={t("bardana.fieldBags")} error={errors.qty_bags?.message}>
                <Input type="number" step="1" {...register("qty_bags")} />
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
                  <TableHead>{t("bardana.colParty")}</TableHead>
                  <TableHead className="text-right">{t("bardana.colBalance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((b) => (
                  <TableRow key={b.party_id}>
                    <TableCell className="font-medium">{partyName(b.party_id)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{b.balance_bags}</TableCell>
                  </TableRow>
                ))}
                {balances.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                      {t("bardana.empty")}
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
