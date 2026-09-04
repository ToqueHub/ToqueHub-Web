import { Prisma } from '@prisma/client';

export type DecimalInput = Prisma.Decimal.Value;

export type ProductionProfileMode = 'FIXED' | 'MULTIPLES' | 'FLEXIBLE' | 'FORMATS' | 'EQUIPMENT';

export interface ProductionRuleSet {
  mode?: ProductionProfileMode;
  referenceYield: DecimalInput;
  minimumQuantity?: DecimalInput | null;
  optimalQuantity?: DecimalInput | null;
  maximumQuantity?: DecimalInput | null;
  stepQuantity?: DecimalInput | null;
  allowedFormats?: DecimalInput[] | null;
  allowHalfBatch?: boolean;
  allowDoubleBatch?: boolean;
}

export interface ProductionScenarioInput {
  grossRequirement: DecimalInput;
  usableStock: DecimalInput;
  confirmedProduction?: DecimalInput;
  storageCapacity?: DecimalInput | null;
  optimizedTarget?: DecimalInput | null;
  rules: ProductionRuleSet;
}

export interface ProductionScenario {
  kind: 'RECOMMENDED' | 'MINIMAL' | 'OPTIMIZED';
  quantity: string;
  batches: string[];
  coveredQuantity: string;
  uncoveredQuantity: string;
  surplusQuantity: string;
  storageShortage: string;
  warnings: string[];
}

export interface FefoLot {
  id: string;
  quantity: DecimalInput;
  reservedQuantity?: DecimalInput;
  expiresAt?: Date | string | null;
  availableAt?: Date | string | null;
  state?:
    | 'AMBIENT'
    | 'CHILLED'
    | 'FROZEN'
    | 'THAWING'
    | 'THAWED'
    | 'COOLING'
    | 'BLOCKED'
    | 'EXPIRED'
    | 'DEPLETED';
  siteId?: string | null;
}

export interface FefoSelection {
  allocations: Array<{ lotId: string; quantity: string }>;
  allocatedQuantity: string;
  shortageQuantity: string;
}

export interface PackagingComponentAvailability {
  componentId: string;
  availableQuantity: DecimalInput;
  requiredPerPackage: DecimalInput;
}

export interface PackagingCapacity {
  maximumPackages: string;
  limitingComponentId: string | null;
  componentCapacities: Array<{ componentId: string; maximumPackages: string }>;
}

type BatchPlan = { total: Prisma.Decimal; batches: Prisma.Decimal[] };

const ZERO = new Prisma.Decimal(0);
const MAX_PLAN_STATES = 20_000;

function decimal(value: DecimalInput | null | undefined): Prisma.Decimal {
  return value == null ? ZERO : new Prisma.Decimal(value);
}

function positive(value: DecimalInput | null | undefined): Prisma.Decimal | null {
  const result = decimal(value);
  return result.gt(0) ? result : null;
}

function quantity(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(3).toFixed(3);
}

function maxDecimal(left: Prisma.Decimal, right: Prisma.Decimal): Prisma.Decimal {
  return left.gte(right) ? left : right;
}

function uniqueSorted(values: Prisma.Decimal[]): Prisma.Decimal[] {
  const byValue = new Map(
    values.filter((value) => value.gt(0)).map((value) => [quantity(value), value]),
  );
  return [...byValue.values()].sort((left, right) => left.comparedTo(right));
}

export function calculateNetRequirement(
  grossRequirement: DecimalInput,
  usableStock: DecimalInput,
  confirmedProduction: DecimalInput = 0,
): string {
  const net = decimal(grossRequirement).sub(decimal(usableStock)).sub(decimal(confirmedProduction));
  return quantity(net.gt(0) ? net : ZERO);
}

export function allowedBatchQuantities(rules: ProductionRuleSet): string[] {
  const reference = positive(rules.referenceYield);
  if (!reference) throw new Error('referenceYield must be greater than zero');

  const explicitFormats = uniqueSorted((rules.allowedFormats ?? []).map((value) => decimal(value)));
  if (rules.mode === 'FORMATS' || explicitFormats.length > 0) {
    if (!explicitFormats.length) throw new Error('At least one allowed format is required');
    return explicitFormats.map(quantity);
  }

  if (!rules.mode || rules.mode === 'FIXED') {
    const sizes = [reference];
    if (rules.allowHalfBatch) sizes.push(reference.div(2));
    if (rules.allowDoubleBatch) sizes.push(reference.mul(2));
    return uniqueSorted(sizes).map(quantity);
  }

  const minimum = positive(rules.minimumQuantity) ?? reference;
  const maximum = positive(rules.maximumQuantity) ?? reference;
  const step = positive(rules.stepQuantity) ?? reference;
  if (maximum.lt(minimum))
    throw new Error('maximumQuantity must be greater than or equal to minimumQuantity');

  const sizes: Prisma.Decimal[] = [];
  for (let current = minimum; current.lte(maximum); current = current.add(step)) {
    sizes.push(current);
    if (sizes.length > 1_000) throw new Error('Production profile creates too many batch formats');
  }
  if (!sizes.some((value) => value.eq(maximum))) sizes.push(maximum);
  return uniqueSorted(sizes).map(quantity);
}

function feasiblePlans(target: Prisma.Decimal, rules: ProductionRuleSet): BatchPlan[] {
  const sizes = allowedBatchQuantities(rules).map((value) => decimal(value));
  const largest = sizes.at(-1)!;
  const limit = maxDecimal(target, largest).add(largest.mul(2));
  const plans = new Map<string, BatchPlan>([[quantity(ZERO), { total: ZERO, batches: [] }]]);
  const queue: BatchPlan[] = [{ total: ZERO, batches: [] }];

  for (let index = 0; index < queue.length; index += 1) {
    const plan = queue[index];
    for (const size of sizes) {
      const total = plan.total.add(size);
      if (total.gt(limit)) continue;
      const key = quantity(total);
      if (plans.has(key)) continue;
      const next = { total, batches: [...plan.batches, size] };
      plans.set(key, next);
      queue.push(next);
      if (plans.size > MAX_PLAN_STATES) {
        throw new Error('Production profile creates too many feasible plans');
      }
    }
  }

  return [...plans.values()]
    .filter((plan) => plan.total.gt(0))
    .sort((left, right) => left.total.comparedTo(right.total));
}

function scenario(
  kind: ProductionScenario['kind'],
  plan: BatchPlan,
  netRequirement: Prisma.Decimal,
  storageCapacity?: Prisma.Decimal | null,
): ProductionScenario {
  const covered = plan.total.gte(netRequirement) ? netRequirement : plan.total;
  const uncovered = netRequirement.sub(covered);
  const surplus = plan.total.sub(netRequirement).gt(0) ? plan.total.sub(netRequirement) : ZERO;
  const storageShortage =
    storageCapacity && surplus.gt(storageCapacity) ? surplus.sub(storageCapacity) : ZERO;
  const warnings: string[] = [];
  if (uncovered.gt(0)) warnings.push('PARTIAL_COVERAGE');
  if (storageShortage.gt(0)) warnings.push('INSUFFICIENT_STORAGE');

  return {
    kind,
    quantity: quantity(plan.total),
    batches: [...plan.batches].sort((a, b) => b.comparedTo(a)).map(quantity),
    coveredQuantity: quantity(covered),
    uncoveredQuantity: quantity(uncovered.gt(0) ? uncovered : ZERO),
    surplusQuantity: quantity(surplus),
    storageShortage: quantity(storageShortage),
    warnings,
  };
}

export function generateProductionScenarios(input: ProductionScenarioInput): ProductionScenario[] {
  const gross = decimal(input.grossRequirement);
  if (gross.lt(0)) throw new Error('grossRequirement cannot be negative');
  const net = decimal(
    calculateNetRequirement(gross, input.usableStock, input.confirmedProduction ?? 0),
  );
  if (net.isZero()) {
    return [
      {
        kind: 'RECOMMENDED',
        quantity: quantity(ZERO),
        batches: [],
        coveredQuantity: quantity(ZERO),
        uncoveredQuantity: quantity(ZERO),
        surplusQuantity: quantity(ZERO),
        storageShortage: quantity(ZERO),
        warnings: [],
      },
    ];
  }

  const optimizedTarget = maxDecimal(
    net,
    positive(input.optimizedTarget) ?? positive(input.rules.optimalQuantity) ?? net,
  );
  const plans = feasiblePlans(maxDecimal(net, optimizedTarget), input.rules);
  const recommended = plans.find((plan) => plan.total.gte(net));
  if (!recommended) throw new Error('No feasible production plan covers the requirement');

  const belowTarget = plans.filter((plan) => plan.total.lt(net));
  const minimal = belowTarget.at(-1) ?? recommended;
  const optimized = plans.find((plan) => plan.total.gte(optimizedTarget)) ?? recommended;
  const capacity = input.storageCapacity == null ? null : decimal(input.storageCapacity);

  const candidates: ProductionScenario[] = [scenario('RECOMMENDED', recommended, net, capacity)];
  if (!minimal.total.eq(recommended.total))
    candidates.push(scenario('MINIMAL', minimal, net, capacity));
  if (!optimized.total.eq(recommended.total) && !optimized.total.eq(minimal.total)) {
    candidates.push(scenario('OPTIMIZED', optimized, net, capacity));
  }
  return candidates;
}

export function calculatePackagingCapacity(
  components: PackagingComponentAvailability[],
): PackagingCapacity {
  if (!components.length) {
    return { maximumPackages: quantity(ZERO), limitingComponentId: null, componentCapacities: [] };
  }

  const capacities = components.map((component) => {
    const required = decimal(component.requiredPerPackage);
    if (required.lte(0)) throw new Error('requiredPerPackage must be greater than zero');
    const available = decimal(component.availableQuantity);
    const maximum = available.gt(0) ? available.div(required).floor() : ZERO;
    return { componentId: component.componentId, maximum };
  });
  const limiting = capacities.reduce((current, candidate) =>
    candidate.maximum.lt(current.maximum) ? candidate : current,
  );
  return {
    maximumPackages: quantity(limiting.maximum),
    limitingComponentId: limiting.componentId,
    componentCapacities: capacities.map((entry) => ({
      componentId: entry.componentId,
      maximumPackages: quantity(entry.maximum),
    })),
  };
}

function isAvailableAt(lot: FefoLot, neededAt: Date, siteId?: string): boolean {
  if (siteId && lot.siteId !== siteId) return false;
  if (['BLOCKED', 'EXPIRED', 'DEPLETED', 'COOLING'].includes(lot.state ?? 'AMBIENT')) return false;
  if (lot.expiresAt && new Date(lot.expiresAt).getTime() < neededAt.getTime()) return false;
  const availableAt = lot.availableAt ? new Date(lot.availableAt) : null;
  if (['FROZEN', 'THAWING'].includes(lot.state ?? '') && !availableAt) return false;
  if (availableAt && availableAt.getTime() > neededAt.getTime()) return false;
  return true;
}

export function selectFefoLots(
  lots: FefoLot[],
  requestedQuantity: DecimalInput,
  neededAt: Date | string,
  siteId?: string,
): FefoSelection {
  const requested = decimal(requestedQuantity);
  if (requested.lt(0)) throw new Error('requestedQuantity cannot be negative');
  const needDate = new Date(neededAt);
  if (Number.isNaN(needDate.getTime())) throw new Error('neededAt must be a valid date');

  const candidates = lots
    .filter((lot) => isAvailableAt(lot, needDate, siteId))
    .map((lot) => ({
      ...lot,
      free: decimal(lot.quantity).sub(decimal(lot.reservedQuantity ?? 0)),
    }))
    .filter((lot) => lot.free.gt(0))
    .sort((left, right) => {
      const leftExpiry = left.expiresAt
        ? new Date(left.expiresAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightExpiry = right.expiresAt
        ? new Date(right.expiresAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      return leftExpiry - rightExpiry || left.id.localeCompare(right.id);
    });

  let remaining = requested;
  const allocations: Array<{ lotId: string; quantity: string }> = [];
  for (const lot of candidates) {
    if (remaining.isZero()) break;
    const allocated = lot.free.lte(remaining) ? lot.free : remaining;
    allocations.push({ lotId: lot.id, quantity: quantity(allocated) });
    remaining = remaining.sub(allocated);
  }

  return {
    allocations,
    allocatedQuantity: quantity(requested.sub(remaining)),
    shortageQuantity: quantity(remaining),
  };
}

export function detectRecipeCycle(
  graph: Readonly<Record<string, readonly string[]>>,
): string[] | null {
  const visited = new Set<string>();
  const active = new Set<string>();
  const path: string[] = [];

  const visit = (node: string): string[] | null => {
    if (active.has(node)) {
      const start = path.indexOf(node);
      return [...path.slice(start), node];
    }
    if (visited.has(node)) return null;
    visited.add(node);
    active.add(node);
    path.push(node);
    for (const dependency of graph[node] ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    active.delete(node);
    return null;
  };

  for (const node of Object.keys(graph)) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}
