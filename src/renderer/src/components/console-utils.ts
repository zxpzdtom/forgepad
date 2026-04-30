/** Structured argument from CDP Runtime.consoleAPICalled */
export type ConsoleArg = {
  type: string;
  subtype?: string;
  value?: unknown;
  description?: string;
  className?: string;
  preview?: {
    type: string;
    subtype?: string;
    description?: string;
    properties?: Array<{
      name: string;
      type: string;
      value?: string;
      subtype?: string;
    }>;
  };
};

export type ConsoleEntry = {
  id: number;
  level: 'log' | 'warn' | 'error' | 'debug';
  args: ConsoleArg[];
  timestamp: number;
  /** Origin of the entry: page log, user input, script result, or script error */
  source?: 'page' | 'input' | 'result' | 'error';
};

/** Render a single CDP RemoteObject arg as a readable string. */
export function stringifyArg(arg: ConsoleArg): string {
  switch (arg.type) {
    case 'string':
      return String(arg.value ?? '');
    case 'number':
    case 'boolean':
      return String(arg.value);
    case 'undefined':
      return 'undefined';
    case 'symbol':
      return arg.description ?? 'Symbol()';
    case 'bigint':
      return `${arg.description ?? arg.value}n`;
    case 'function':
      return arg.description ?? 'function()';
    case 'object': {
      if (arg.subtype === 'null') return 'null';
      if (arg.subtype === 'regexp') return arg.description ?? '/regex/';
      if (arg.subtype === 'date') return arg.description ?? 'Date';
      if (arg.subtype === 'error') return arg.description ?? 'Error';

      // Try to render from preview
      if (arg.preview?.properties) {
        const isArray = arg.subtype === 'array' || arg.preview.subtype === 'array';
        const props = arg.preview.properties;
        if (isArray) {
          const items = props.map((p) => p.value ?? p.subtype ?? '…').join(', ');
          return `[${items}]`;
        }
        const items = props.map((p) => `${p.name}: ${p.value ?? p.subtype ?? '…'}`).join(', ');
        return `{${items}}`;
      }

      // Fallback to description or className
      return arg.description ?? arg.className ?? '[object Object]';
    }
    default:
      return arg.description ?? String(arg.value ?? '');
  }
}

/** Stringify all arguments of a console call into a single string. */
export function stringifyConsoleArgs(args: ConsoleArg[]): string {
  if (args.length === 0) return '';

  const first = args[0];
  // Handle printf-style format strings: console.log('Hello %s, count: %d', name, 42)
  if (first.type === 'string' && typeof first.value === 'string' && /%[sdifoOc%]/.test(first.value)) {
    let result = first.value;
    let argIdx = 1;
    result = result.replace(/%([sdifoOc%])/g, (match, spec: string) => {
      if (spec === '%') return '%';
      if (spec === 'c') {
        // %c style directives — skip the arg (we handle rendering separately)
        argIdx++;
        return '';
      }
      if (argIdx >= args.length) return match;
      const arg = args[argIdx++];
      return stringifyArg(arg);
    });
    // Append any remaining args
    const remaining = args.slice(argIdx).map(stringifyArg).join(' ');
    return remaining ? `${result} ${remaining}` : result;
  }

  return args.map(stringifyArg).join(' ');
}

/** Parse %c format string into styled segments. */
export type StyledSegment = {
  text: string;
  style?: string; // Raw CSS string from %c
};

export function parseStyledConsole(args: ConsoleArg[]): StyledSegment[] {
  if (args.length === 0) return [];

  const first = args[0];
  if (first.type !== 'string' || typeof first.value !== 'string' || !first.value.includes('%c')) {
    // No %c directives — return as plain text
    return [{ text: stringifyConsoleArgs(args) }];
  }

  const segments: StyledSegment[] = [];
  const formatStr = first.value;
  let argIdx = 1;
  let lastIdx = 0;

  // Split on %c to get styled segments
  const parts = formatStr.split('%c');

  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];

    // Replace other format specifiers within this part
    part = part.replace(/%([sdifoo%])/gi, (match, spec: string) => {
      if (spec === '%') return '%';
      if (argIdx >= args.length) return match;
      return stringifyArg(args[argIdx++]);
    });

    if (i === 0) {
      // Text before first %c — no style
      if (part) segments.push({ text: part });
    } else {
      // Each %c consumes a style arg
      const styleArg = argIdx < args.length ? args[argIdx++] : undefined;
      const style = styleArg?.type === 'string' ? String(styleArg.value ?? '') : undefined;
      if (part) segments.push({ text: part, style });
    }
  }

  // Append remaining args
  const remaining = args.slice(argIdx);
  if (remaining.length > 0) {
    const text = remaining.map(stringifyArg).join(' ');
    segments.push({ text: ` ${text}` });
  }

  return segments;
}

/** Allowed CSS properties for %c style rendering (security whitelist). */
const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background',
  'background-color',
  'font-weight',
  'font-style',
  'font-size',
  'text-decoration',
  'padding',
  'border-radius',
  'margin',
]);

/** Sanitize a raw CSS string from %c to only allowed properties. */
export function sanitizeConsoleStyle(rawStyle: string): Record<string, string> {
  const result: Record<string, string> = {};
  const declarations = rawStyle.split(';');
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (ALLOWED_STYLE_PROPS.has(prop) && val) {
      // Convert CSS prop to camelCase for React
      const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      result[camelProp] = val;
    }
  }
  return result;
}
