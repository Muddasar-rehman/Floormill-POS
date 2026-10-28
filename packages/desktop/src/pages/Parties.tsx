import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { partySchema, type Party, type PartyInput } from "shared";
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

const ns = "parties";

export function Parties() {
  const { t } = useTranslation();
  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PartyInput>({
    resolver: zodResolver(partySchema),
    defaultValues: { opening_balance: 0 },
  });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("parties").select("*").order("name");
    setParties((data as Party[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredParties = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => p.name.toLowerCase().includes(q) || p.contact?.toLowerCase().includes(q));
  }, [parties, search]);

  function openCreate() {
    setEditing(null);
    reset({ opening_balance: 0, name: "", contact: "", address: "", cnic_ntn: "", payment_terms: "", credit_limit: undefined });
    setOpen(true);
  }

  function openEdit(p: Party) {
    setEditing(p);
    reset({
      name: p.name,
      contact: p.contact ?? "",
      address: p.address ?? "",
      cnic_ntn: p.cnic_ntn ?? "",
      payment_terms: p.payment_terms ?? "",
      opening_balance: p.opening_balance,
      credit_limit: p.credit_limit ?? undefined,
    });
    setOpen(true);
  }

  async function onSubmit(values: PartyInput) {
    if (editing) {
      const { error } = await supabase.from("parties").update(values).eq("id", editing.id);
      if (error) {
        toast.error(t("common.failedUpdate"), { description: error.message });
        return;
      }
      toast.success(t(`${ns}.toastUpdated`));
    } else {
      const { error } = await supabase.from("parties").insert(values);
      if (error) {
        toast.error(t("common.failedSave"), { description: error.message });
        return;
      }
      toast.success(t(`${ns}.toastAdded`));
    }
    setOpen(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("parties").delete().eq("id", id);
    if (error) {
      const description = error.code === "23503" ? t(`${ns}.deleteBlockedDesc`) : error.message;
      toast.error(t("common.failedDelete"), { description });
      return;
    }
    toast.success(t(`${ns}.toastDeleted`));
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(`${ns}.title`)}</h1>
          <p className="text-sm text-muted-foreground">{t(`${ns}.subtitle`)}</p>
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
              {t(`${ns}.add`)}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t(`${ns}.dialogEdit`) : t(`${ns}.dialogAdd`)}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("common.name")} error={errors.name?.message} className="col-span-2">
                <Input {...register("name")} autoFocus />
              </FormField>
              <FormField label={t("common.contact")}>
                <Input {...register("contact")} />
              </FormField>
              <FormField label={t("common.address")}>
                <Input {...register("address")} />
              </FormField>
              <FormField label={t("parties.fieldCnic")}>
                <Input {...register("cnic_ntn")} />
              </FormField>
              <FormField label={t("parties.fieldPaymentTerms")}>
                <Input {...register("payment_terms")} />
              </FormField>
              <FormField label={t("parties.fieldOpeningBalance")} className="col-span-2">
                <Input type="number" step="0.01" {...register("opening_balance")} />
                <p className="mt-1 text-xs text-muted-foreground">{t("parties.fieldOpeningBalanceHint")}</p>
              </FormField>
              <FormField label={t("parties.fieldCreditLimit")}>
                <Input type="number" step="0.01" {...register("credit_limit")} />
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

      <Input
        placeholder={t(`${ns}.searchPlaceholder`)}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.contact")}</TableHead>
                  <TableHead>{t("common.address")}</TableHead>
                  <TableHead className="text-right">{t("parties.colOpeningBalance")}</TableHead>
                  <TableHead className="text-right">{t("parties.colCreditLimit")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParties.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.contact ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.address ?? "-"}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        p.opening_balance > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : p.opening_balance < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {p.opening_balance.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{p.credit_limit?.toFixed(2) ?? "-"}</TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => openEdit(p)}
                        onDelete={() => handleDelete(p.id)}
                        deleteTitle={t(`${ns}.deleteTitle`, { name: p.name })}
                        deleteDescription={t(`${ns}.deleteDesc`)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredParties.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t(search ? `${ns}.noResults` : `${ns}.empty`)}
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
