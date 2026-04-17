import type { UINode, BindingValue, Predicate } from '@uaip/types';

const PATH_REGEX = /^\$(state|machine)\.[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*|\[\d+\])*$/;

type BindingState = 'loading' | 'error' | 'stale' | 'fresh';

type ResolvedBinding = {
  value: unknown;
  state: BindingState;
};

type ResolvedProps = Record<string, unknown>;

export type ResolvedSpec = {
  resolvedProps: ResolvedProps;
  hasLoadingBindings: boolean;
  hasErrorBindings: boolean;
  bindingCount: number;
};

type WorkflowState = Record<string, unknown>;

type MachineState = string;

type BinderContext = {
  workflowState: WorkflowState;
  machineState: MachineState;
  stateVersion: number;
  previousVersion?: number;
};

function isValidPath(path: string): boolean {
  return PATH_REGEX.test(path);
}

function resolvePathInObject(obj: unknown, segments: string[]): unknown {
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;

    const bracketMatch = seg.match(/^(\w+)\[(\d+)\]$/);
    if (bracketMatch) {
      const key = bracketMatch[1];
      const idx = parseInt(bracketMatch[2], 10);
      if (typeof current !== 'object' || current === null) return undefined;
      const obj = current as Record<string, unknown>;
      const arr = obj[key ?? ''];
      if (!Array.isArray(arr)) return undefined;
      current = arr[idx];
    } else {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[seg ?? ''];
    }
  }
  return current;
}

function resolvePath(path: string, ctx: BinderContext): ResolvedBinding {
  if (!isValidPath(path)) {
    return { value: undefined, state: 'error' };
  }

  const firstDot = path.indexOf('.');
  const root = path.substring(1, firstDot);
  const rest = path.substring(firstDot + 1);

  const segments = rest.split(/\.(?![^\[]*\])/);

  const source: unknown = root === 'machine' ? ctx.machineState : ctx.workflowState;

  if (root === 'machine') {
    const value = segments.length === 1 && segments[0] === 'state'
      ? ctx.machineState
      : resolvePathInObject({ state: ctx.machineState }, segments);
    return { value, state: 'fresh' };
  }

  const bindingState: BindingState =
    ctx.stateVersion === 0
      ? 'loading'
      : ctx.previousVersion !== undefined && ctx.stateVersion === ctx.previousVersion
        ? 'stale'
        : 'fresh';

  const value = resolvePathInObject(source, segments);
  return { value, state: bindingState };
}

function resolveBindingValue(bv: BindingValue, ctx: BinderContext): ResolvedBinding {
  if (bv.kind === 'literal') {
    return { value: bv.value, state: 'fresh' };
  }
  return resolvePath(bv.path, ctx);
}

export function evaluatePredicate(predicate: Predicate | undefined, ctx: BinderContext): boolean {
  if (!predicate) return true;

  switch (predicate.op) {
    case 'exists': {
      const resolved = resolvePath(predicate.path, ctx);
      return resolved.value !== undefined && resolved.value !== null;
    }
    case 'not-exists': {
      const resolved = resolvePath(predicate.path, ctx);
      return resolved.value === undefined || resolved.value === null;
    }
    case '===': {
      const resolved = resolvePath(predicate.path, ctx);
      return resolved.value === predicate.value;
    }
    case '!==': {
      const resolved = resolvePath(predicate.path, ctx);
      return resolved.value !== predicate.value;
    }
    case '>': {
      const resolved = resolvePath(predicate.path, ctx);
      return typeof resolved.value === 'number' && resolved.value > predicate.value;
    }
    case '<': {
      const resolved = resolvePath(predicate.path, ctx);
      return typeof resolved.value === 'number' && resolved.value < predicate.value;
    }
    case '>=': {
      const resolved = resolvePath(predicate.path, ctx);
      return typeof resolved.value === 'number' && resolved.value >= predicate.value;
    }
    case '<=': {
      const resolved = resolvePath(predicate.path, ctx);
      return typeof resolved.value === 'number' && resolved.value <= predicate.value;
    }
    case 'in': {
      const resolved = resolvePath(predicate.path, ctx);
      return typeof resolved.value === 'string' && predicate.value.includes(resolved.value);
    }
    case 'not-in': {
      const resolved = resolvePath(predicate.path, ctx);
      return typeof resolved.value === 'string' && !predicate.value.includes(resolved.value);
    }
    case 'and':
      return predicate.children.every((child) => evaluatePredicate(child, ctx));
    case 'or':
      return predicate.children.some((child) => evaluatePredicate(child, ctx));
    case 'not':
      return !evaluatePredicate(predicate.child, ctx);
    default:
      return true;
  }
}

export class BindingResolver {
  private ctx: BinderContext;

  constructor(ctx: BinderContext) {
    this.ctx = ctx;
  }

  resolve(node: UINode): ResolvedSpec {
    const resolvedProps: ResolvedProps = {};
    let hasLoadingBindings = false;
    let hasErrorBindings = false;
    let bindingCount = 0;

    if (node.bindings) {
      for (const [key, bv] of Object.entries(node.bindings)) {
        const result = resolveBindingValue(bv, this.ctx);
        resolvedProps[key] = result.value;
        bindingCount++;

        if (result.state === 'loading') hasLoadingBindings = true;
        if (result.state === 'error') hasErrorBindings = true;
      }
    }

    return { resolvedProps, hasLoadingBindings, hasErrorBindings, bindingCount };
  }

  isVisible(node: UINode): boolean {
    return evaluatePredicate(node.visibility, this.ctx);
  }

  isEnabled(node: UINode): boolean {
    return evaluatePredicate(node.enabled, this.ctx);
  }
}

export function createBinderContext(
  workflowState: WorkflowState,
  machineState: MachineState,
  stateVersion: number,
  previousVersion?: number,
): BinderContext {
  return { workflowState, machineState, stateVersion, previousVersion };
}
