import { useEffect, useState } from "react";
import {
  type BrailleSpinnerName,
  spinners,
} from "unicode-animations";

const defaults: BrailleSpinnerName = "braille";

export function Spinner({
  name = defaults,
  className,
}: {
  name?: BrailleSpinnerName;
  className?: string;
}) {
  const preset = spinners[name];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0);
    const id = setInterval(
      () => setFrame((i) => (i + 1) % preset.frames.length),
      preset.interval,
    );
    return () => clearInterval(id);
  }, [preset]);

  return (
    <span className={`spinner${className ? ` ${className}` : ""}`}>
      {preset.frames[frame]}
    </span>
  );
}
