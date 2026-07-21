import { useTheme } from "@/lib/theme";

/** Horizontal wordmark — white text on dark theme, black text on light. */
export function BrandLogo({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const { theme } = useTheme();
  const file = theme === "light" ? "The-Ledge-Games-Logo-1.png" : "The-Ledge-Games-Logo-4.png";
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/${file}`}
      alt="The Ledge Games"
      className={className}
      style={style}
    />
  );
}
