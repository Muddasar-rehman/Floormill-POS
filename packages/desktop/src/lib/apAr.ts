import { computePartyNetBalance, type LedgerEntry, type Party } from "shared";
import { supabase } from "./supabase";

export interface ApArBalance {
  party: Party;
  balance: number;
}

export async function computeApArLists(): Promise<{ vendors: ApArBalance[]; customers: ApArBalance[] }> {
  const [{ data: parties }, { data: entries }] = await Promise.all([
    supabase.from("parties").select("*"),
    supabase.from("ledger_entries").select("*").order("date").order("created_at"),
  ]);

  const entriesByParty = new Map<string, LedgerEntry[]>();
  for (const e of (entries as LedgerEntry[]) ?? []) {
    const list = entriesByParty.get(e.party_id);
    if (list) list.push(e);
    else entriesByParty.set(e.party_id, [e]);
  }

  // A party's net position decides which tab they show up in — any party can
  // be a net payable today and a net receivable later, once both purchases
  // and sales happen with them. A settled (net-zero) party has nothing
  // payable or receivable, so they don't appear in either list.
  const vendors: ApArBalance[] = [];
  const customers: ApArBalance[] = [];
  for (const p of (parties as Party[]) ?? []) {
    const net = computePartyNetBalance(p, entriesByParty.get(p.id) ?? []);
    if (net < 0) vendors.push({ party: p, balance: -net });
    else if (net > 0) customers.push({ party: p, balance: net });
  }
  vendors.sort((a, b) => b.balance - a.balance);
  customers.sort((a, b) => b.balance - a.balance);
  return { vendors, customers };
}

export async function computeApArTotals(): Promise<{ totalPayable: number; totalReceivable: number }> {
  const { vendors, customers } = await computeApArLists();
  return {
    totalPayable: vendors.reduce((sum, v) => sum + v.balance, 0),
    totalReceivable: customers.reduce((sum, c) => sum + c.balance, 0),
  };
}
