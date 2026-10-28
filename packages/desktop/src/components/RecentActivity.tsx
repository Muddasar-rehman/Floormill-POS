import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Skeleton } from "./ui/skeleton";
import { Badge } from "./ui/badge";

export interface ActivityRow {
  id: string;
  type: "purchase" | "sale" | "payment" | "receipt" | "expense";
  date: string;
  party: string;
  amount: number;
}

const TYPE_VARIANT: Record<ActivityRow["type"], "default" | "secondary" | "outline" | "destructive"> = {
  purchase: "secondary",
  sale: "default",
  payment: "outline",
  receipt: "outline",
  expense: "destructive",
};

const TYPE_KEY: Record<ActivityRow["type"], string> = {
  purchase: "common.txnPurchase",
  sale: "common.txnSale",
  payment: "common.txnPayment",
  receipt: "common.txnReceipt",
  expense: "common.txnExpense",
};

export function RecentActivity({ rows, loading }: { rows: ActivityRow[]; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
        <CardDescription>{t("dashboard.recentActivityDesc")}</CardDescription>
      </CardHeader>
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
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead>{t("ledger.selectParty")}</TableHead>
                <TableHead className="text-right">{t("common.amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.type}-${r.id}`}>
                  <TableCell className="text-muted-foreground">{r.date}</TableCell>
                  <TableCell>
                    <Badge variant={TYPE_VARIANT[r.type]}>{t(TYPE_KEY[r.type])}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{r.party}</TableCell>
                  <TableCell className="text-right font-medium">{r.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    {t("dashboard.noActivity")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
