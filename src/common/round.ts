// Repeated float subtraction/multiplication (FIFO stock draws, cost
// roll-ups across purchase -> consumption -> produced-batch chains) drifts
// into values like 3.3999999999999995. Every derived float written to the
// DB should be passed through this first -- 3 decimals is plenty for
// kg/piece quantities and comfortably covers currency (৳) too.
export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
