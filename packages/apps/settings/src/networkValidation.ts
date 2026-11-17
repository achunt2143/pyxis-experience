/** Pure IPv4/IPv6 and RFC-1123 hostname validation helpers for Network settings. */

const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEX_GROUP_RE = /^[0-9a-fA-F]{1,4}$/;
const HOSTNAME_LABEL_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function isValidIpv4(value: string): boolean {
  return IPV4_RE.test(value);
}

/** Validates an IPv6 address (including `::` compression and optional trailing IPv4). */
export function isValidIpv6(value: string): boolean {
  if (!value.includes(':') || /\s/.test(value)) return false;
  const parts = value.split('::');
  if (parts.length > 2) return false;

  const countSide = (side: string, allowIpv4Tail: boolean): number | null => {
    if (side === '') return 0;
    const groups = side.split(':');
    let count = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      if (g === '') return null;
      if (allowIpv4Tail && i === groups.length - 1 && g.includes('.')) {
        if (!isValidIpv4(g)) return null;
        count += 2;
      } else {
        if (!HEX_GROUP_RE.test(g)) return null;
        count += 1;
      }
    }
    return count;
  };

  if (parts.length === 1) {
    const total = countSide(parts[0]!, true);
    return total === 8;
  }

  const left = countSide(parts[0]!, false);
  const right = countSide(parts[1]!, true);
  if (left === null || right === null) return false;
  return left + right < 8;
}

export function isValidIpAddress(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value);
}

export function validateDnsInput(raw: string): { servers: string[]; error: string | null } {
  const tokens = raw.split(',').map((s) => s.trim());
  if (raw.trim() === '' || tokens.every((t) => t === '')) {
    return { servers: [], error: 'Enter at least one DNS nameserver IP address.' };
  }
  if (tokens.some((t) => t === '')) {
    return { servers: [], error: 'Remove empty comma-separated entries in DNS nameservers.' };
  }
  const invalid = tokens.filter((s) => !isValidIpAddress(s));
  if (invalid.length > 0) {
    return { servers: [], error: `Invalid DNS IP address: ${invalid[0]}` };
  }
  return { servers: tokens, error: null };
}

export function validateHostname(raw: string): { hostname: string; error: string | null } {
  const clean = raw.trim();
  if (clean === '') {
    return { hostname: '', error: 'Hostname cannot be empty.' };
  }
  if (clean.length > 253) {
    return { hostname: '', error: 'Hostname must be 253 characters or fewer.' };
  }
  const labels = clean.split('.');
  if (!labels.every((label) => HOSTNAME_LABEL_RE.test(label))) {
    return {
      hostname: '',
      error: 'Hostname must use RFC-1123 labels (letters, digits, internal hyphens, separated by dots).',
    };
  }
  return { hostname: clean, error: null };
}
