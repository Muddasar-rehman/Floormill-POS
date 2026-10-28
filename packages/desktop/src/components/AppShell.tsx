import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Languages, LogOut, Menu, Wheat } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import {
  DASHBOARD_ITEM,
  ROZNAMCHA_ITEM,
  PURCHASES_ITEM,
  WHEAT_PURCHASES_ITEM,
  GATE_PASS_ITEM,
  PRODUCTION_ITEM,
  sectionsForRole,
  type NavItem,
} from "../lib/roles";
import { supabase } from "../lib/supabase";
import { getStoredLanguage, setStoredLanguage } from "../i18n";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Sheet, SheetContent } from "./ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2 px-5 h-14 border-b border-border">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Wheat className="h-4 w-4" />
      </div>
      <span className="font-semibold text-sm tracking-tight">The Awan Flour Mill</span>
    </div>
  );
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      <Icon className="h-4 w-4" />
      {t(item.labelKey)}
    </NavLink>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const location = useLocation();
  const sections = sectionsForRole(profile?.role);
  const standaloneItems = [DASHBOARD_ITEM, ROZNAMCHA_ITEM, PURCHASES_ITEM, WHEAT_PURCHASES_ITEM, GATE_PASS_ITEM, PRODUCTION_ITEM].filter(
    (item) => profile?.role && item.roles.includes(profile.role)
  );
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const match = sections.find((s) => s.items.some((i) => i.to === location.pathname));
    if (match) {
      setOpenSections((prev) => (prev.has(match.labelKey) ? prev : new Set(prev).add(match.labelKey)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, profile?.role]);

  function toggle(labelKey: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(labelKey)) next.delete(labelKey);
      else next.add(labelKey);
      return next;
    });
  }

  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
      {standaloneItems.map((item) => (
        <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}
      {sections.map((section) => {
        const isOpen = openSections.has(section.labelKey);
        return (
          <div key={section.labelKey} className="pt-1">
            <button
              onClick={() => toggle(section.labelKey)}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(section.labelKey)}
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
            </button>
            {isOpen && (
              <div className="space-y-0.5 pt-0.5">
                {section.items.map((item) => (
                  <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function AccountMenu() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const initials = (profile?.name ?? "?").slice(0, 2).toUpperCase();
  const currentLang = getStoredLanguage();

  return (
    <div className="border-t border-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground">{profile?.name ?? "..."}</div>
            <div className="truncate text-xs text-muted-foreground">{profile ? t(`roles.${profile.role}`) : ""}</div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t("common.myAccount")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("common.language")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setStoredLanguage("en")} className={currentLang === "en" ? "bg-accent" : ""}>
            <Languages className="mr-2 h-4 w-4" />
            {t("common.english")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setStoredLanguage("ur")} className={currentLang === "ur" ? "bg-accent" : ""}>
            <Languages className="mr-2 h-4 w-4" />
            {t("common.urdu")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => supabase.auth.signOut()} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            {t("common.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* keep i18n instance referenced so hook stays subscribed to language changes */}
      <span className="hidden">{i18n.language}</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen bg-muted/30">
      <aside className="no-print hidden lg:flex w-64 shrink-0 border-r border-border bg-background flex-col">
        <SidebarBrand />
        <SidebarNav />
        <AccountMenu />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          <SidebarBrand />
          <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          <AccountMenu />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col min-w-0">
        <div className="no-print flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Wheat className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-sm tracking-tight">The Awan Flour Mill</span>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
