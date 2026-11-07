import {
  Bell, Bot, CalendarClock, Coins, Database, Gavel, Globe2, LayoutDashboard, LifeBuoy, Lightbulb, Map, Newspaper,
  Settings, ShieldCheck, TrendingUp, Wallet, Zap,
} from "lucide-react";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard", label: "Financial Dashboard", icon: Wallet },
  { href: "/simulator", label: "Shock Simulator", icon: Zap },
  { href: "/recovery", label: "Recovery Plans", icon: LifeBuoy },
  { href: "/worldpulse", label: "WorldPulse", icon: Newspaper },
  { href: "/map", label: "Global Event Map", icon: Map },
  { href: "/investments", label: "Investments & Stocks", icon: TrendingUp },
  { href: "/solana", label: "Solana Portfolio", icon: Coins },
  { href: "/advisor", label: "AI Financial Advisor", icon: Bot },
  { href: "/resilience", label: "Financial Resilience Score", icon: ShieldCheck },
  { href: "/timeline", label: "Financial Timeline", icon: CalendarClock },
  { href: "/alerts", label: "Alerts & Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const NAV_EXTRA = [
  { href: "/insights", label: "Insights & Discovery", icon: Lightbulb },
  { href: "/judge", label: "Judge Demo", icon: Gavel },
  { href: "/admin", label: "Data Import", icon: Database },
  { href: "/worldpulse?tab=indicators", label: "Economic Indicators", icon: Globe2 },
] as const;
