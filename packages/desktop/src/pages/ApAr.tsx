import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { computeApArLists, type ApArBalance } from "../lib/apAr";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";

export function ApAr() {
  const { t } = useTranslation();
  const [vendors, setVendors] = useState<ApArBalance[]>([]);
  const [customers, setCustomers] = useState<ApArBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { vendors, customers } = await computeApArLists();
      setVendors(vendors);
      setCustomers(customers);
      setLoading(false);
    }
    load();
  }, []);

  const totalPayable = vendors.reduce((sum, v) => sum + v.balance, 0);
  const totalReceivable = customers.reduce((sum, c) => sum + c.balance, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("apAr.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("apAr.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("apAr.totalPayable")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-semibold">{totalPayable.toFixed(2)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("apAr.totalReceivable")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-semibold">{totalReceivable.toFixed(2)}</div>}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payable">
        <TabsList>
          <TabsTrigger value="payable">{t("apAr.tabPayable")}</TabsTrigger>
          <TabsTrigger value="receivable">{t("apAr.tabReceivable")}</TabsTrigger>
        </TabsList>
        <TabsContent value="payable" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" asChild>
              <Link to="/ap-ar/print?type=payable">
                <Printer />
                {t("common.print")}
              </Link>
            </Button>
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
                      <TableHead>{t("common.vendor")}</TableHead>
                      <TableHead className="text-right">{t("apAr.colBalance")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((v) => (
                      <TableRow key={v.party.id}>
                        <TableCell className="font-medium">{v.party.name}</TableCell>
                        <TableCell className="text-right font-medium">{v.balance.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {vendors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                          {t("apAr.emptyVendors")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="receivable" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" asChild>
              <Link to="/ap-ar/print?type=receivable">
                <Printer />
                {t("common.print")}
              </Link>
            </Button>
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
                      <TableHead>{t("common.customer")}</TableHead>
                      <TableHead className="text-right">{t("apAr.colBalance")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c) => (
                      <TableRow key={c.party.id}>
                        <TableCell className="font-medium">{c.party.name}</TableCell>
                        <TableCell className="text-right font-medium">{c.balance.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {customers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                          {t("apAr.emptyCustomers")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
