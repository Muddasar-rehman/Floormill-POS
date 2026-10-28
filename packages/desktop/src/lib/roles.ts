import type { UserRole } from "shared";
import {
  LayoutDashboard,
  Users,
  Package,
  Warehouse,
  ShoppingCart,
  TrendingUp,
  Boxes,
  BookText,
  Truck,
  Scale,
  PackageX,
  HandCoins,
  SlidersHorizontal,
  UserCog,
  Landmark,
  Banknote,
  Receipt,
  FileWarning,
  ArrowUpCircle,
  ArrowDownCircle,
  CalendarClock,
  Wallet,
  PieChart,
  Handshake,
  Percent,
  ClipboardCheck,
  FileSpreadsheet,
  LineChart,
  Target,
  Factory,
  Wheat,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

const ALL_ROLES: UserRole[] = [
  "owner_admin",
  "accountant",
  "warehouse_staff",
  "sales_purchase_staff",
  "commission_agent",
];

export const DASHBOARD_ITEM: NavItem = { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, roles: ALL_ROLES };
export const ROZNAMCHA_ITEM: NavItem = {
  to: "/roznamcha",
  labelKey: "nav.roznamcha",
  icon: NotebookPen,
  roles: ["owner_admin", "accountant"],
};
export const PURCHASES_ITEM: NavItem = {
  to: "/purchases",
  labelKey: "nav.purchases",
  icon: ShoppingCart,
  roles: ["owner_admin", "sales_purchase_staff"],
};
export const WHEAT_PURCHASES_ITEM: NavItem = {
  to: "/wheat-purchases",
  labelKey: "nav.wheatPurchases",
  icon: Wheat,
  roles: ["owner_admin", "sales_purchase_staff"],
};
export const GATE_PASS_ITEM: NavItem = {
  to: "/gate-pass",
  labelKey: "nav.gatePass",
  icon: Truck,
  roles: ["owner_admin", "warehouse_staff", "accountant", "sales_purchase_staff"],
};
export const PRODUCTION_ITEM: NavItem = {
  to: "/production",
  labelKey: "nav.production",
  icon: Factory,
  roles: ["owner_admin", "warehouse_staff", "accountant", "sales_purchase_staff"],
};
export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: "nav.masterData",
    items: [
      { to: "/parties", labelKey: "nav.parties", icon: Users, roles: ["owner_admin", "sales_purchase_staff", "accountant"] },
      { to: "/items", labelKey: "nav.items", icon: Package, roles: ALL_ROLES },
      { to: "/warehouses", labelKey: "nav.warehouses", icon: Warehouse, roles: ["owner_admin", "warehouse_staff", "accountant"] },
      { to: "/employees", labelKey: "nav.employees", icon: UserCog, roles: ["owner_admin", "accountant"] },
      { to: "/bank-accounts", labelKey: "nav.bankAccounts", icon: Landmark, roles: ["owner_admin", "accountant"] },
      { to: "/cash", labelKey: "nav.cash", icon: Banknote, roles: ["owner_admin", "accountant"] },
      { to: "/commission-agents", labelKey: "nav.commissionAgents", icon: Handshake, roles: ["owner_admin", "accountant", "sales_purchase_staff"] },
      { to: "/shareholders", labelKey: "nav.shareholders", icon: PieChart, roles: ["owner_admin", "accountant"] },
    ],
  },
  {
    labelKey: "nav.transactions",
    items: [
      { to: "/sales", labelKey: "nav.sales", icon: TrendingUp, roles: ["owner_admin", "sales_purchase_staff"] },
      { to: "/payments", labelKey: "nav.payments", icon: ArrowUpCircle, roles: ["owner_admin", "accountant"] },
      { to: "/receipts", labelKey: "nav.receipts", icon: ArrowDownCircle, roles: ["owner_admin", "accountant"] },
      { to: "/installments", labelKey: "nav.installmentPlans", icon: CalendarClock, roles: ["owner_admin", "accountant"] },
      { to: "/commission-entries", labelKey: "nav.commissionEntries", icon: Percent, roles: ["owner_admin", "accountant", "sales_purchase_staff", "commission_agent"] },
    ],
  },
  {
    labelKey: "nav.warehouseOperations",
    items: [
      { to: "/stock", labelKey: "nav.stockOnHand", icon: Boxes, roles: ["owner_admin", "warehouse_staff", "sales_purchase_staff", "accountant"] },
      { to: "/kanda", labelKey: "nav.kandaSlips", icon: Scale, roles: ["owner_admin", "warehouse_staff", "accountant", "sales_purchase_staff"] },
      { to: "/bardana", labelKey: "nav.bardanaLedger", icon: PackageX, roles: ["owner_admin", "warehouse_staff", "accountant", "sales_purchase_staff"] },
      { to: "/chadai", labelKey: "nav.chadaiCharges", icon: HandCoins, roles: ["owner_admin", "warehouse_staff", "accountant", "sales_purchase_staff"] },
      { to: "/stock-adjustments", labelKey: "nav.stockAdjustments", icon: SlidersHorizontal, roles: ["owner_admin", "warehouse_staff", "accountant", "sales_purchase_staff"] },
    ],
  },
  {
    labelKey: "nav.financialReports",
    items: [
      { to: "/ledger", labelKey: "nav.partyLedger", icon: BookText, roles: ["owner_admin", "accountant"] },
      { to: "/ap-ar", labelKey: "nav.apAr", icon: Wallet, roles: ["owner_admin", "accountant"] },
      { to: "/expenses", labelKey: "nav.expenses", icon: Receipt, roles: ["owner_admin", "accountant"] },
      { to: "/liabilities", labelKey: "nav.liabilities", icon: FileWarning, roles: ["owner_admin", "accountant"] },
      { to: "/trial-balance", labelKey: "nav.trialBalance", icon: ClipboardCheck, roles: ["owner_admin", "accountant"] },
      { to: "/balance-sheet", labelKey: "nav.balanceSheet", icon: FileSpreadsheet, roles: ["owner_admin", "accountant"] },
      { to: "/profit-loss", labelKey: "nav.profitLoss", icon: LineChart, roles: ["owner_admin", "accountant"] },
      { to: "/breakeven", labelKey: "nav.breakeven", icon: Target, roles: ["owner_admin", "accountant"] },
    ],
  },
];

export function sectionsForRole(role: UserRole | undefined): NavSection[] {
  if (!role) return [];
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}
