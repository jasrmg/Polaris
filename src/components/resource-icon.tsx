import {
  BookOpen,
  Boxes,
  Building2,
  Cloud,
  CreditCard,
  Database,
  FolderOpen,
  Globe,
  Layers,
  LayoutGrid,
  Link2,
  Lock,
  Network,
  Route,
  Router,
  Server,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Content files store icon names as strings. Only icons listed here are
 * bundled, instead of the whole lucide set. Add an entry when a new
 * resource needs a new icon.
 */
const icons: Record<string, LucideIcon> = {
  BookOpen,
  Boxes,
  Building2,
  Cloud,
  CreditCard,
  Database,
  FolderOpen,
  Globe,
  Layers,
  LayoutGrid,
  Link2,
  Lock,
  Network,
  Route,
  Router,
  Server,
  ShieldCheck,
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
