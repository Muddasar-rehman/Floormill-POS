import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { employeeSchema, type Employee, type EmployeeInput } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "../components/ui/sonner";
import { RowActions } from "../components/RowActions";

export function Employees() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeInput>({ resolver: zodResolver(employeeSchema) });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("employees").select("*").order("name");
    setRows((data as Employee[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    reset({ name: "", role: "", contact: "", salary_terms: "", joining_date: "" });
    setOpen(true);
  }

  function openEdit(e: Employee) {
    setEditing(e);
    reset({
      name: e.name,
      role: e.role ?? "",
      contact: e.contact ?? "",
      salary_terms: e.salary_terms ?? "",
      joining_date: e.joining_date ?? "",
    });
    setOpen(true);
  }

  async function onSubmit(values: EmployeeInput) {
    if (editing) {
      const { error } = await supabase.from("employees").update(values).eq("id", editing.id);
      if (error) {
        toast.error(t("common.failedUpdate"), { description: error.message });
        return;
      }
      toast.success(t("employees.toastUpdated"));
    } else {
      const { error } = await supabase.from("employees").insert(values);
      if (error) {
        toast.error(t("common.failedSave"), { description: error.message });
        return;
      }
      toast.success(t("employees.toastAdded"));
    }
    setOpen(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) {
      toast.error(t("common.failedDelete"), { description: error.message });
      return;
    }
    toast.success(t("employees.toastDeleted"));
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("employees.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("employees.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus />
              {t("employees.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t("employees.dialogEdit") : t("employees.dialogAdd")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("common.name")} error={errors.name?.message} className="col-span-2">
                <Input {...register("name")} autoFocus />
              </FormField>
              <FormField label={t("employees.fieldRole")}>
                <Input {...register("role")} placeholder={t("employees.fieldRolePlaceholder") ?? undefined} />
              </FormField>
              <FormField label={t("common.contact")}>
                <Input {...register("contact")} />
              </FormField>
              <FormField label={t("employees.fieldSalaryTerms")} className="col-span-2">
                <Input {...register("salary_terms")} placeholder={t("employees.fieldSalaryPlaceholder") ?? undefined} />
              </FormField>
              <FormField label={t("employees.fieldJoiningDate")} className="col-span-2">
                <Input type="date" {...register("joining_date")} />
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
                  <TableHead>{t("employees.colRole")}</TableHead>
                  <TableHead>{t("common.contact")}</TableHead>
                  <TableHead>{t("employees.colSalaryTerms")}</TableHead>
                  <TableHead>{t("employees.colJoiningDate")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">{e.role ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.contact ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.salary_terms ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.joining_date ?? "-"}</TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => openEdit(e)}
                        onDelete={() => handleDelete(e.id)}
                        deleteTitle={t("employees.deleteTitle", { name: e.name })}
                        deleteDescription={t("common.cannotUndo")}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("employees.empty")}
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
