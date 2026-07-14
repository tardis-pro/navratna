// Tests for the IP literal + CIDR classifier used by the egress proxy.

import { describe, it, expect } from 'vitest';
import { classifyAddress, isLoopbackLiteral } from '../../../egress/ip_classifier.js';

describe('classifyAddress', () => {
  it('classifies public IPv4 as public', () => {
    expect(classifyAddress('1.1.1.1')).toEqual({ kind: 'public' });
    expect(classifyAddress('8.8.8.8')).toEqual({ kind: 'public' });
    expect(classifyAddress('93.184.216.34')).toEqual({ kind: 'public' });
  });

  it('classifies IPv4 loopback as blocked', () => {
    const r = classifyAddress('127.0.0.1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('127.0.0.0/8');
  });

  it('classifies 10.x as private', () => {
    const r = classifyAddress('10.0.0.5');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('10.0.0.0/8');
  });

  it('classifies 192.168.x as private', () => {
    const r = classifyAddress('192.168.1.1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('192.168.0.0/16');
  });

  it('classifies 172.16-31 as private', () => {
    const r = classifyAddress('172.20.1.1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('172.16.0.0/12');
  });

  it('classifies 169.254.x as link-local', () => {
    const r = classifyAddress('169.254.1.1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('169.254.0.0/16');
  });

  it('classifies 169.254.169.254 as metadata', () => {
    const r = classifyAddress('169.254.169.254');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('169.254.169.254/32');
  });

  it('classifies 224.x as multicast', () => {
    const r = classifyAddress('224.0.0.1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('224.0.0.0/4');
  });

  it('classifies 0.0.0.0/8 as blocked', () => {
    expect(classifyAddress('0.0.0.0').kind).toBe('blocked');
  });

  it('classifies 255.255.255.255 as broadcast', () => {
    const r = classifyAddress('255.255.255.255');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('255.255.255.255/32');
  });

  it('classifies IPv6 ::1 (loopback) as blocked', () => {
    const r = classifyAddress('::1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('::1/128');
  });

  it('classifies fc00::/7 (unique-local) as blocked', () => {
    const r = classifyAddress('fc00::1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('fc00::/7');
  });

  it('classifies fe80:: link-local as blocked', () => {
    const r = classifyAddress('fe80::1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('fe80::/10');
  });

  it('classifies ff00:: multicast as blocked', () => {
    const r = classifyAddress('ff00::1');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('ff00::/8');
  });

  it('classifies public IPv6 as public', () => {
    expect(classifyAddress('2606:4700:4700::1111').kind).toBe('public');
  });

  it('rejects non-IP strings outright', () => {
    const r = classifyAddress('github.com');
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.cidr).toBe('not-an-ip');
  });
});

describe('isLoopbackLiteral', () => {
  it('true for IPv4 loopback', () => {
    expect(isLoopbackLiteral('127.0.0.1')).toBe(true);
    expect(isLoopbackLiteral('127.99.99.99')).toBe(true);
  });
  it('true for IPv6 loopback', () => {
    expect(isLoopbackLiteral('::1')).toBe(true);
  });
  it('false for public IPs', () => {
    expect(isLoopbackLiteral('1.1.1.1')).toBe(false);
    expect(isLoopbackLiteral('2606:4700:4700::1111')).toBe(false);
  });
  it('false for non-IPv4 private ranges', () => {
    expect(isLoopbackLiteral('10.0.0.1')).toBe(false);
    expect(isLoopbackLiteral('192.168.1.1')).toBe(false);
    expect(isLoopbackLiteral('169.254.169.254')).toBe(false);
  });
});
