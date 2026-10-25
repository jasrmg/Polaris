import {
  Boxes,
  Building2,
  Cloud,
  CreditCard,
  Database,
  FolderOpen,
  Layers,
  Network,
  Server,
  type LucideIcon,
} from "lucide-react";

/**
 * Content files store icon names as strings. Only icons listed here are
 * bundled, instead of the whole lucide set. Add an entry when a new
 * resource needs a new icon.
 */
const icons: Record<string, LucideIcon> = {
  Boxes,
  Building2,
  Cloud,
  CreditCard,
  Database,
  FolderOpen,
  Layers,
  Network,
  Server,
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
