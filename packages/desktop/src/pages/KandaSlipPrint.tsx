import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import type { GatePass, KandaSlip } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export function KandaSlipPrint() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [slip, setSlip] = useState<KandaSlip | null>(null);
  const [gatePass, setGatePass] = useState<GatePass | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data } = await supabase.from("kanda_slips").select("*").eq("id", id).single();
      const s = data as KandaSlip;
      setSlip(s);
      if (s) {
        const { data: gp } = await supabase.from("gate_passes").select("*").eq("id", s.gate_pass_id).single();
        setGatePass(gp as GatePass);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!slip) {
    return <div className="text-muted-foreground">{t("kanda.notFound")}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to="/kanda">
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
              <h2 className="text-lg font-semibold">{t("kanda.slipTitle")}</h2>
              <p className="text-sm text-muted-foreground">{new Date(slip.created_at).toLocaleString()}</p>
            </div>
          </div>

          {gatePass && (
            <div className="text-sm">
              <div className="mb-1 font-medium text-muted-foreground">{t("gatePass.colVehicle")}</div>
              <div className="font-medium">
                {gatePass.vehicle_number} {gatePass.driver && <span className="text-muted-foreground">· {gatePass.driver}</span>}
              </div>
            </div>
          )}

          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border">
                <td className="py-3 text-muted-foreground">{t("kanda.grossWeight")}</td>
                <td className="py-3 text-right font-medium">{slip.gross_weight_kg.toFixed(1)} kg</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 text-muted-foreground">{t("kanda.tareWeight")}</td>
                <td className="py-3 text-right font-medium">{slip.tare_weight_kg.toFixed(1)} kg</td>
              </tr>
              <tr>
                <td className="py-3 font-semibold">{t("kanda.netWeight")}</td>
                <td className="py-3 text-right text-lg font-semibold">{slip.net_weight_kg.toFixed(1)} kg</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
