import { describe, expect, it } from 'vitest';
import { isValidIpAddress, isValidIpv4, isValidIpv6, validateDnsInput, validateHostname } from '../networkValidation';

describe('networkValidation', () => {
  it('validates IPv4 and IPv6 addresses', () => {
    expect(isValidIpv4('1.1.1.1')).toBe(true);
    expect(isValidIpv4('255.255.255.0')).toBe(true);
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv4('01.1.1.1')).toBe(false);
    expect(isValidIpv4('1.2.3')).toBe(false);

    expect(isValidIpv6('::1')).toBe(true);
    expect(isValidIpv6('2001:4860:4860::8888')).toBe(true);
    expect(isValidIpv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    expect(isValidIpv6('::ffff:192.0.2.1')).toBe(true);
    expect(isValidIpv6(':::1')).toBe(false);
    expect(isValidIpv6('2001::85a3::7334')).toBe(false);
    expect(isValidIpv6('gggg::1')).toBe(false);
    expect(isValidIpAddress('8.8.8.8')).toBe(true);
    expect(isValidIpAddress('not-ip')).toBe(false);
  });

  it('validates comma-separated DNS lists', () => {
    expect(validateDnsInput('')).toEqual({
      servers: [],
      error: 'Enter at least one DNS nameserver IP address.',
    });
    expect(validateDnsInput('1.1.1.1, , 8.8.8.8').error).toContain('empty');
    expect(validateDnsInput('1.1.1.1, bad').error).toContain('Invalid DNS IP address: bad');
    expect(validateDnsInput('1.1.1.1, 2606:4700:4700::1111')).toEqual({
      servers: ['1.1.1.1', '2606:4700:4700::1111'],
      error: null,
    });
  });

  it('validates RFC-1123 hostnames', () => {
    expect(validateHostname('  ').error).toBe('Hostname cannot be empty.');
    expect(validateHostname('-leading').error).toContain('RFC-1123');
    expect(validateHostname('trailing-').error).toContain('RFC-1123');
    expect(validateHostname('has space').error).toContain('RFC-1123');
    expect(validateHostname('pyxis-node.local')).toEqual({
      hostname: 'pyxis-node.local',
      error: null,
    });
  });
});
