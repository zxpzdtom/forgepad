import { DEFAULT_DOTMATRIX_STYLE, DOTMATRIX_MAP } from './dotmatrix';

/**
 * Renders a DotMatrix loading spinner by style id.
 * Replaces the old unicode-animations based spinner.
 */
export function Spinner({
  name = DEFAULT_DOTMATRIX_STYLE,
  className,
  size = 16,
  dotSize = 2,
}: {
  name?: string;
  className?: string;
  size?: number;
  dotSize?: number;
}) {
  const entry = DOTMATRIX_MAP.get(name);
  if (!entry) {
    // Fallback to default if unknown name
    const fallback = DOTMATRIX_MAP.get(DEFAULT_DOTMATRIX_STYLE)!;
    const Comp = fallback.Component;
    return (
      <span className={className}>
        <Comp size={size} dotSize={dotSize} color="currentColor" animated />
      </span>
    );
  }

  const Comp = entry.Component;
  return (
    <span className={className}>
      <Comp size={size} dotSize={dotSize} color="currentColor" animated />
    </span>
  );
}
