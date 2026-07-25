function parseIPv4Octets(address: string): number[] | null {
  const parts = address.split('.')
  if (parts.length !== 4) {
    return null
  }

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN
    }
    return Number(part)
  })

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }
  return octets
}

export function isTailnetIPv4Address(address: string): boolean {
  const octets = parseIPv4Octets(address)
  if (!octets) {
    return false
  }

  // Why: Tailnet IPv4 addresses live in 100.64.0.0/10. Prefer them for
  // phone pairing because LAN addresses stop working once devices split networks.
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
}

/**
 * Clash/mihomo/sing-box TUN "fake-ip" pools default to RFC 2544 198.18.0.0/15.
 * Those addresses only exist inside the desktop proxy and are unroutable from phones.
 */
export function isProxyFakeIpIPv4Address(address: string): boolean {
  const octets = parseIPv4Octets(address)
  if (!octets) {
    return false
  }
  // Why: 198.18.0.0/15 → first octet 198, second 18–19 (#10404).
  return octets[0] === 198 && octets[1] >= 18 && octets[1] <= 19
}
