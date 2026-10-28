import type { UserRole } from "shared";

export interface NavItem {
  to: string;
  labelKey: string;
  roles: UserRole[];
}

export const MORE_ITEMS: NavItem[] = [
  { to: "/parties", labelKey: "nav.parties", roles: ["owner_admin", "sales_purchase_staff", "accountant"] },
  { to: "/bank-accounts", labelKey: "nav.bankAccounts", roles: ["owner_admin", "accountant"] },
  { to: "/shareholders", labelKey: "nav.shareholders", roles: ["owner_admin", "accountant"] },
  { to: "/stock", labelKey: "nav.stockOnHand", roles: ["owner_admin", "warehouse_staff", "sales_purchase_staff", "accountant"] },
  { to: "/ap-ar", labelKey: "nav.apAr", roles: ["owner_admin", "accountant"] },
  { to: "/profit-loss", labelKey: "nav.profitLoss", roles: ["owner_admin", "accountant"] },
];

export function moreItemsForRole(role: UserRole | undefined): NavItem[] {
  if (!role) return [];
  return MORE_ITEMS.filter((item) => item.roles.includes(role));
}
