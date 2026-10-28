import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { AppShell } from "./components/AppShell";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Roznamcha } from "./pages/Roznamcha";
import { RoznamchaPrint } from "./pages/RoznamchaPrint";
import { Parties } from "./pages/Parties";
import { Items } from "./pages/Items";
import { Warehouses } from "./pages/Warehouses";
import { Purchases } from "./pages/Purchases";
import { WheatPurchases } from "./pages/WheatPurchases";
import { Sales } from "./pages/Sales";
import { Stock } from "./pages/Stock";
import { Ledger } from "./pages/Ledger";
import { LedgerStatement } from "./pages/LedgerStatement";
import { GatePassPage } from "./pages/GatePass";
import { Kanda } from "./pages/Kanda";
import { Bardana } from "./pages/Bardana";
import { Chadai } from "./pages/Chadai";
import { StockAdjustments } from "./pages/StockAdjustments";
import { ProductionPage } from "./pages/Production";
import { Invoice } from "./pages/Invoice";
import { GatePassSlip } from "./pages/GatePassSlip";
import { KandaSlipPrint } from "./pages/KandaSlipPrint";
import { ProductionSlip } from "./pages/ProductionSlip";
import { Employees } from "./pages/Employees";
import { BankAccounts } from "./pages/BankAccounts";
import { BankAccountStatement } from "./pages/BankAccountStatement";
import { BankAccountStatementPrint } from "./pages/BankAccountStatementPrint";
import { Cash } from "./pages/Cash";
import { CashPrint } from "./pages/CashPrint";
import { Expenses } from "./pages/Expenses";
import { Liabilities } from "./pages/Liabilities";
import { Payments } from "./pages/Payments";
import { Receipts } from "./pages/Receipts";
import { InstallmentPlans } from "./pages/InstallmentPlans";
import { ApAr } from "./pages/ApAr";
import { ApArPrint } from "./pages/ApArPrint";
import { Shareholders } from "./pages/Shareholders";
import { CommissionAgents } from "./pages/CommissionAgents";
import { CommissionEntries } from "./pages/CommissionEntries";
import { TrialBalance } from "./pages/TrialBalance";
import { BalanceSheet } from "./pages/BalanceSheet";
import { ProfitLoss } from "./pages/ProfitLoss";
import { Breakeven } from "./pages/Breakeven";
import { Toaster } from "./components/ui/sonner";

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/roznamcha" element={<Protected><Roznamcha /></Protected>} />
      <Route path="/roznamcha/print" element={<Protected><RoznamchaPrint /></Protected>} />
      <Route path="/parties" element={<Protected><Parties /></Protected>} />
      <Route path="/items" element={<Protected><Items /></Protected>} />
      <Route path="/warehouses" element={<Protected><Warehouses /></Protected>} />
      <Route path="/purchases" element={<Protected><Purchases /></Protected>} />
      <Route path="/wheat-purchases" element={<Protected><WheatPurchases /></Protected>} />
      <Route path="/sales" element={<Protected><Sales /></Protected>} />
      <Route path="/stock" element={<Protected><Stock /></Protected>} />
      <Route path="/ledger" element={<Protected><Ledger /></Protected>} />
      <Route path="/ledger/:partyId/print" element={<Protected><LedgerStatement /></Protected>} />
      <Route path="/gate-pass" element={<Protected><GatePassPage /></Protected>} />
      <Route path="/kanda" element={<Protected><Kanda /></Protected>} />
      <Route path="/bardana" element={<Protected><Bardana /></Protected>} />
      <Route path="/chadai" element={<Protected><Chadai /></Protected>} />
      <Route path="/stock-adjustments" element={<Protected><StockAdjustments /></Protected>} />
      <Route path="/production" element={<Protected><ProductionPage /></Protected>} />
      <Route path="/invoices/:type/:id" element={<Protected><Invoice /></Protected>} />
      <Route path="/gate-pass/:id/print" element={<Protected><GatePassSlip /></Protected>} />
      <Route path="/kanda/:id/print" element={<Protected><KandaSlipPrint /></Protected>} />
      <Route path="/production/:id/print" element={<Protected><ProductionSlip /></Protected>} />
      <Route path="/employees" element={<Protected><Employees /></Protected>} />
      <Route path="/bank-accounts" element={<Protected><BankAccounts /></Protected>} />
      <Route path="/bank-accounts/:id" element={<Protected><BankAccountStatement /></Protected>} />
      <Route path="/bank-accounts/:id/print" element={<Protected><BankAccountStatementPrint /></Protected>} />
      <Route path="/cash" element={<Protected><Cash /></Protected>} />
      <Route path="/cash/print" element={<Protected><CashPrint /></Protected>} />
      <Route path="/expenses" element={<Protected><Expenses /></Protected>} />
      <Route path="/liabilities" element={<Protected><Liabilities /></Protected>} />
      <Route path="/payments" element={<Protected><Payments /></Protected>} />
      <Route path="/receipts" element={<Protected><Receipts /></Protected>} />
      <Route path="/installments" element={<Protected><InstallmentPlans /></Protected>} />
      <Route path="/ap-ar" element={<Protected><ApAr /></Protected>} />
      <Route path="/ap-ar/print" element={<Protected><ApArPrint /></Protected>} />
      <Route path="/shareholders" element={<Protected><Shareholders /></Protected>} />
      <Route path="/commission-agents" element={<Protected><CommissionAgents /></Protected>} />
      <Route path="/commission-entries" element={<Protected><CommissionEntries /></Protected>} />
      <Route path="/trial-balance" element={<Protected><TrialBalance /></Protected>} />
      <Route path="/balance-sheet" element={<Protected><BalanceSheet /></Protected>} />
      <Route path="/profit-loss" element={<Protected><ProfitLoss /></Protected>} />
      <Route path="/breakeven" element={<Protected><Breakeven /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}
