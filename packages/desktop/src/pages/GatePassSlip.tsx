import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { formatKgAsMun, type GatePass, type Item, type Party, type Purchase, type Sale, type Warehouse } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";

type GatePassItemRow = { item_id: string; qty_kg: number; rate: number | null; kaat_pct: number; watta_pct: number; purchase_id: string | null };

export function GatePassSlip() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [gatePass, setGatePass] = useState<GatePass | null>(null);
  const [gatePassItems, setGatePassItems] = useState<GatePassItemRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [linkedPurchases, setLinkedPurchases] = useState<Purchase[]>([]);
  const [linkedSale, setLinkedSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data } = await supabase
        .from("gate_passes")
        .select("*, gate_pass_items(item_id, qty_kg, rate, kaat_pct, watta_pct, purchase_id)")
        .eq("id", id)
        .single();
      const gp = data as (GatePass & { gate_pass_items: GatePassItemRow[] }) | null;
      setGatePass(gp);
      if (gp) {
        const gpItems = gp.gate_pass_items ?? [];
        setGatePassItems(gpItems);
        const itemIds = gpItems.map((gpi) => gpi.item_id);
        const [itemsRes, warehouseRes, partyRes] = await Promise.all([
          itemIds.length ? supabase.from("items").select("*").in("id", itemIds) : Promise.resolve({ data: [] }),
          supabase.from("warehouses").select("*").eq("id", gp.warehouse_id).single(),
          gp.party_id ? supabase.from("parties").select("*").eq("id", gp.party_id).single() : Promise.resolve({ data: null }),
        ]);
        setItems((itemsRes.data as Item[]) ?? []);
        setWarehouse(warehouseRes.data as Warehouse);
        setParty(partyRes.data as Party | null);

        if (gp.direction === "in") {
          const purchaseIds = [...new Set(gpItems.map((gpi) => gpi.purchase_id).filter((v): v is string => !!v))];
          if (purchaseIds.length) {
            const { data: ps } = await supabase.from("purchases").select("*").in("id", purchaseIds);
            setLinkedPurchases((ps as Purchase[]) ?? []);
          }
        } else if (gp.sale_id) {
          const { data: s } = await supabase.from("sales").select("*").eq("id", gp.sale_id).single();
          setLinkedSale(s as Sale | null);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function itemName(itemId: string) {
    return items.find((i) => i.id === itemId)?.name ?? itemId;
  }
  function lineTotal(gpi: GatePassItemRow) {
    const netQty = gpi.qty_kg * (1 - ((gpi.kaat_pct ?? 0) + (gpi.watta_pct ?? 0)) / 100);
    return netQty * (gpi.rate ?? 0);
  }
  const grandTotal = gatePassItems.reduce((sum, gpi) => sum + lineTotal(gpi), 0);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!gatePass) {
    return <div className="text-muted-foreground">{t("gatePass.notFound")}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to="/gate-pass">
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
              <h2 className="text-lg font-semibold">{t("gatePass.slipTitle")}</h2>
              <p className="text-sm text-muted-foreground">#{gatePass.gate_pass_no}</p>
              <p className="text-sm text-muted-foreground">{gatePass.date}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("gatePass.colVehicle")}</div>
              <div className="font-medium">{gatePass.vehicle_number}</div>
              {gatePass.driver && (
                <div className="text-muted-foreground">
                  {t("gatePass.colDriver")}: {gatePass.driver}
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("gatePass.fieldDirection")}</div>
              <Badge variant={gatePass.direction === "in" ? "success" : "secondary"}>
                {gatePass.direction === "in" ? t("gatePass.directionIn") : t("gatePass.directionOut")}
              </Badge>
            </div>
            {(party?.name ?? gatePass.party_name) && (
              <div>
                <div className="mb-1 font-medium text-muted-foreground">
                  {gatePass.direction === "in" ? t("common.vendor") : t("common.customer")}
                </div>
                <div className="font-medium">{party?.name ?? gatePass.party_name}</div>
              </div>
            )}
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("common.warehouse")}</div>
              <div className="font-medium">{warehouse?.name}</div>
              {warehouse?.location && <div className="text-muted-foreground">{warehouse.location}</div>}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">{t("common.item")}</th>
                <th className="py-2 text-right">{t("gatePass.colQtyKg")}</th>
                <th className="py-2 text-right">{t("purchases.fieldKaatPct")}</th>
                <th className="py-2 text-right">{t("purchases.fieldRatePerKg")}</th>
                <th className="py-2 text-right">{t("purchases.fieldWattaPct")}</th>
                <th className="py-2 text-right">{t("sales.colTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {gatePassItems.map((gpi, index) => (
                <tr key={index} className="border-b border-border">
                  <td className="py-3 font-medium">{itemName(gpi.item_id)}</td>
                  <td className="py-3 text-right">{formatKgAsMun(gpi.qty_kg, items.find((i) => i.id === gpi.item_id)?.mun_kg ?? 40)}</td>
                  <td className="py-3 text-right">{gpi.kaat_pct}</td>
                  <td className="py-3 text-right">{gpi.rate?.toFixed(2) ?? "-"}</td>
                  <td className="py-3 text-right">{gpi.watta_pct}</td>
                  <td className="py-3 text-right">{lineTotal(gpi).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="py-3 text-right font-medium">
                  {t("common.total")}
                </td>
                <td className="py-3 text-right font-semibold">{grandTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          {(linkedPurchases.length > 0 || linkedSale) && (
            <div className="no-print border-t border-border pt-4">
              <div className="mb-2 text-sm font-medium text-muted-foreground">{t("gatePass.linkedTransaction")}</div>
              <div className="flex flex-wrap gap-2">
                {linkedPurchases.map((p) => (
                  <Button key={p.id} variant="outline" size="sm" asChild>
                    <Link to={`/invoices/purchase/${p.id}`}>P-{p.invoice_no}</Link>
                  </Button>
                ))}
                {linkedSale && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/invoices/sale/${linkedSale.id}`}>S-{linkedSale.invoice_no}</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
