export type EasingType =
  | "linear"
  | "easeInOut"
  | "easeIn"
  | "easeOut"
  | "sine"
  | "bounce"
  | "elastic"
  | "exponential";

export const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "easeInOut", label: "Ease In-Out" },
  { value: "easeIn", label: "Ease In" },
  { value: "easeOut", label: "Ease Out" },
  { value: "sine", label: "Sine" },
  { value: "exponential", label: "Exponential" },
  { value: "bounce", label: "Bounce" },
  { value: "elastic", label: "Elastic" },
];

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

function elasticOut(t: number): number {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export function applyEasing(t: number, type: EasingType): number {
  const x = Math.min(1, Math.max(0, t));
  switch (type) {
    case "linear":
      return x;
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "sine":
      return 0.5 - 0.5 * Math.cos(Math.PI * x);
    case "exponential":
      return x === 0 ? 0 : Math.pow(2, 10 * x - 10);
    case "bounce":
      return bounceOut(x);
    case "elastic":
      return elasticOut(x);
    default:
      return x;
  }
}
