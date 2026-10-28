import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { commissionAgentSchema, type CommissionAgent, type CommissionAgentInput } from "shared";
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

export function CommissionAgents() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<CommissionAgent[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommissionAgentInput>({ resolver: zodResolver(commissionAgentSchema), defaultValues: { rate_type: "percentage" } });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("commission_agents").select("*").order("name");
    setRows((data as CommissionAgent[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(values: CommissionAgentInput) {
    const { error } = await supabase.from("commission_agents").insert(values);
    if (error) {
      toast.error(t("common.failedSave"), { description: error.message });
      return;
    }
    toast.success(t("commissionAgents.toastAdded"));
    reset({ rate_type: "percentage" });
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("commissionAgents.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("commissionAgents.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              {t("commissionAgents.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("commissionAgents.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("common.name")} error={errors.name?.message} className="col-span-2">
                <Input {...register("name")} autoFocus />
              </FormField>
              <FormField label={t("common.contact")}>
                <Input {...register("contact")} />
              </FormField>
              <FormField label={t("commissionAgents.fieldRateType")}>
                <Controller
                  name="rate_type"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">{t("commissionAgents.rateTypePercentage")}</SelectItem>
                        <SelectItem value="fixed_per_mun">{t("commissionAgents.rateTypeFixed")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label={t("commissionAgents.fieldRate")} error={errors.rate?.message} className="col-span-2">
                <Input type="number" step="0.01" {...register("rate")} />
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
                  <TableHead>{t("common.contact")}</TableHead>
                  <TableHead>{t("commissionAgents.colRateType")}</TableHead>
                  <TableHead className="text-right">{t("commissionAgents.colRate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground">{a.contact ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.rate_type === "percentage" ? t("commissionAgents.percentage") : t("commissionAgents.fixedPerMun")}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{a.rate}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      {t("commissionAgents.empty")}
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
