import {
  Archive,
  BellRing,
  DatabaseBackup,
  Files,
  Fingerprint,
  Radar,
  ScrollText,
  Send,
  BookOpen,
  Boxes,
  Building2,
  Cable,
  Cloud,
  Container,
  CreditCard,
  Database,
  FolderOpen,
  Globe,
  KeyRound,
  Layers,
  LayoutGrid,
  Link2,
  Lock,
  Network,
  Plug,
  Route,
  Router,
  Server,
  Shield,
  ShieldCheck,
  Split,
  Terminal,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Content files store icon names as strings. Only icons listed here are
 * bundled, instead of the whole lucide set. Add an entry when a new
 * resource needs a new icon.
 */
const icons: Record<string, LucideIcon> = {
  Archive,
  BellRing,
  DatabaseBackup,
  Files,
  Fingerprint,
  Radar,
  ScrollText,
  Send,
  BookOpen,
  Boxes,
  Building2,
  Cable,
  Cloud,
  Container,
  CreditCard,
  Database,
  FolderOpen,
  Globe,
  KeyRound,
  Layers,
  LayoutGrid,
  Link2,
  Lock,
  Network,
  Plug,
  Route,
  Router,
  Server,
  Shield,
  ShieldCheck,
  Split,
  Terminal,
  User,
  Users,
};

export function ResourceIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = icons[name] ?? Cloud;
  return <Icon className={className} aria-hidden="true" />;
}
