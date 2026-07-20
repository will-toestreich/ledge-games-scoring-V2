import {
  Axe,
  Beer,
  TreePine,
  Target,
  Timer,
  Hammer,
  type LucideProps,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  axe: Axe,
  keg: Beer,
  caber: TreePine,
  archery: Target,
  chop: Timer,
  hammer: Hammer,
};

export function EventIcon({
  eventId,
  size = 20,
  className = "text-text-tertiary",
}: {
  eventId: string;
  size?: number;
  className?: string;
}) {
  const Icon = iconMap[eventId];
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={1.5} className={className} />;
}
