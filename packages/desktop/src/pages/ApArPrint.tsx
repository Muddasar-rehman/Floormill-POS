import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { todayStr } from "shared";
import { computeApArLists, type ApArBalance } from "../lib/apAr";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export function ApArPrint() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") === "receivable" ? "receivable" : "payable";
  const [rows, setRows] = useState<ApArBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    computeApArLists().then(({ vendors, customers }) => {
      setRows(type === "payable" ? vendors : customers);
      setLoading(false);
    });
  }, [type]);

  const total = rows.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to="/ap-ar">
            <ArrowLeft />
            {t("common.back")}
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer />
          {t("common.printSavePdf")}
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-6 p-10">
          <div className="flex items-start justify-between border-b border-border pb-6">
            <div>
              <h1 className="text-xl font-semibold">The Awan Flour Mill</h1>
              <p className="text-sm text-muted-foreground">Grain Trading &amp; Warehouse Management</p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-semibold">
                {type === "payable" ? t("apAr.printTitlePayable") : t("apAr.printTitleReceivable")}
              </h2>
              <p className="text-sm text-muted-foreground">{todayStr()}</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{type === "payable" ? t("common.vendor") : t("common.customer")}</th>
                  <th className="py-2 text-right">{t("apAr.colBalance")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.party.id} className="border-b border-border">
                    <td className="py-3">{r.party.name}</td>
                    <td className="py-3 text-right">{r.balance.toFixed(2)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-10 text-center text-muted-foreground">
                      {type === "payable" ? t("apAr.emptyVendors") : t("apAr.emptyCustomers")}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-3">{t("common.total")}</td>
                  <td className="py-3 text-right">{total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
