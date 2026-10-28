import type { LedgerEntry, Party } from "./types";

type LedgerEntryLike = Pick<LedgerEntry, "txn_type" | "debit" | "credit">;
type PartyLike = Pick<Party, "opening_balance">;

/**
 * Signed contribution of one ledger entry to a party's NET balance, where
 * positive = the party owes the business (receivable) and negative = the
 * business owes the party (payable). This lets a single party accumulate
 * both purchase/payment (vendor-side) and sale/receipt (customer-side)
 * activity on one consistent scale, instead of the raw stored
 * `balance_after` chain which only makes sense when a party is exclusively
 * one type or the other.
 */
export function ledgerEntryNetDelta(entry: LedgerEntryLike): number {
  switch (entry.txn_type) {
    case "purchase":
      return -entry.credit;
    case "sale":
      return entry.debit;
    case "payment":
      return entry.debit;
    case "receipt":
      return -entry.credit;
    case "transfer":
      return entry.debit - entry.credit;
    default:
      return 0;
  }
}

/** A party's opening balance — already stored signed on the same net scale as computePartyNetBalance. */
export function openingNet(party: PartyLike): number {
  return party.opening_balance;
}

/** Final net balance for a party given their opening balance and all ledger entries (any order). */
export function computePartyNetBalance(party: PartyLike, entries: LedgerEntryLike[]): number {
  return entries.reduce((net, e) => net + ledgerEntryNetDelta(e), openingNet(party));
}

/** Running net balance after each entry, in the same order as the input (expects chronological order). */
export function computeRunningNetBalances(party: PartyLike, entries: LedgerEntryLike[]): number[] {
  let net = openingNet(party);
  return entries.map((e) => {
    net += ledgerEntryNetDelta(e);
    return net;
  });
}
