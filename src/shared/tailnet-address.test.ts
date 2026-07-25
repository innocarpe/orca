import { describe, expect, it } from 'vitest'
import { isProxyFakeIpIPv4Address, isTailnetIPv4Address } from './tailnet-address'

describe('isTailnetIPv4Address', () => {
  it('accepts the tailnet IPv4 allocation range', () => {
    expect(isTailnetIPv4Address('100.64.0.1')).toBe(true)
    expect(isTailnetIPv4Address('100.102.47.57')).toBe(true)
    expect(isTailnetIPv4Address('100.127.255.254')).toBe(true)
  })

  it('rejects non-tailnet IPv4 addresses and malformed input', () => {
    expect(isTailnetIPv4Address('100.63.255.255')).toBe(false)
    expect(isTailnetIPv4Address('100.128.0.1')).toBe(false)
    expect(isTailnetIPv4Address('192.168.1.24')).toBe(false)
    expect(isTailnetIPv4Address('fd7a:115c:a1e0::ce33:2f3a')).toBe(false)
    expect(isTailnetIPv4Address('100.102.47')).toBe(false)
  })
})

describe('isProxyFakeIpIPv4Address', () => {
  it('accepts RFC 2544 198.18.0.0/15 fake-ip pool addresses', () => {
    expect(isProxyFakeIpIPv4Address('198.18.0.1')).toBe(true)
    expect(isProxyFakeIpIPv4Address('198.18.9.1')).toBe(true)
    expect(isProxyFakeIpIPv4Address('198.19.255.254')).toBe(true)
  })

  it('rejects LAN, tailnet, and non-IPv4 values', () => {
    expect(isProxyFakeIpIPv4Address('192.168.50.238')).toBe(false)
    expect(isProxyFakeIpIPv4Address('100.64.1.20')).toBe(false)
    expect(isProxyFakeIpIPv4Address('198.17.0.1')).toBe(false)
    expect(isProxyFakeIpIPv4Address('198.20.0.1')).toBe(false)
    expect(isProxyFakeIpIPv4Address('198.18.1')).toBe(false)
  })
})
