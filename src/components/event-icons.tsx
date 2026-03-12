import {
  Axe,
  Beer,
  TreePine,
  Target,
  Timer,
  Hammer,
  type LucideProps,
} from "lucide-react";
import type { Event } from "@/data/mock";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  "evt-axe": Axe,
  "evt-keg": Beer,
  "evt-caber": TreePine,
  "evt-archery": Target,
  "evt-chop": Timer,
  "evt-hammer": Hammer,
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

export function getEventIcon(event: Event) {
  return <EventIcon eventId={event.id} />;
}
