import {
  expandIPv6,
  isValidIPv6,
  isValidIPv6CIDR,
  ipv6ToBigInt,
  bigIntToIPv6,
  compressIPv6,
  parseIPv6Subnet,
  isIPv6InSubnet,
  isUsableHostIPv6,
  doIPv6RangesOverlap,
  doIPv6CidrsOverlap,
  isIPv6SubnetContainedIn,
  findNextAvailableIPv6Subnet,
  findNextAvailableIPv6
} from '../server/utils/ipv6'

// ---------------------------------------------------------------------------
// expandIPv6
// ---------------------------------------------------------------------------
describe('expandIPv6', () => {
  it('expands loopback ::1', () => {
    expect(expandIPv6('::1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001')
  })

  it('expands unspecified ::', () => {
    expect(expandIPv6('::')).toBe('0000:0000:0000:0000:0000:0000:0000:0000')
  })

  it('expands full 8-group address unchanged', () => {
    expect(expandIPv6('2001:0db8:0000:0000:0000:0000:0000:0001'))
      .toBe('2001:0db8:0000:0000:0000:0000:0000:0001')
  })

  it('expands compressed address with :: in middle', () => {
    expect(expandIPv6('2001:db8::1'))
      .toBe('2001:0db8:0000:0000:0000:0000:0000:0001')
  })

  it('expands link-local fe80::1', () => {
    expect(expandIPv6('fe80::1'))
      .toBe('fe80:0000:0000:0000:0000:0000:0000:0001')
  })

  it('returns null for double :: in address', () => {
    expect(expandIPv6('2001::db8::1')).toBeNull()
  })

  it('returns null for too many groups', () => {
    expect(expandIPv6('1:2:3:4:5:6:7:8:9')).toBeNull()
  })

  it('returns null for invalid hex', () => {
    expect(expandIPv6('2001:gggg::1')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isValidIPv6
// ---------------------------------------------------------------------------
describe('isValidIPv6', () => {
  it('accepts loopback ::1', () => expect(isValidIPv6('::1')).toBe(true))
  it('accepts unspecified ::', () => expect(isValidIPv6('::')).toBe(true))
  it('accepts full address', () =>
    expect(isValidIPv6('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true))
  it('accepts compressed 2001:db8::1', () =>
    expect(isValidIPv6('2001:db8::1')).toBe(true))
  it('accepts link-local fe80::1', () =>
    expect(isValidIPv6('fe80::1')).toBe(true))
  it('rejects IPv4 address', () =>
    expect(isValidIPv6('192.168.1.1')).toBe(false))
  it('rejects double ::', () =>
    expect(isValidIPv6('2001::db8::1')).toBe(false))
  it('rejects empty string', () =>
    expect(isValidIPv6('')).toBe(false))
})

// ---------------------------------------------------------------------------
// isValidIPv6CIDR
// ---------------------------------------------------------------------------
describe('isValidIPv6CIDR', () => {
  it('accepts 2001:db8::/32', () =>
    expect(isValidIPv6CIDR('2001:db8::/32')).toBe(true))
  it('accepts ::/0', () =>
    expect(isValidIPv6CIDR('::/0')).toBe(true))
  it('accepts ::1/128', () =>
    expect(isValidIPv6CIDR('::1/128')).toBe(true))
  it('accepts fe80::/64', () =>
    expect(isValidIPv6CIDR('fe80::/64')).toBe(true))
  it('rejects prefix > 128', () =>
    expect(isValidIPv6CIDR('2001:db8::/129')).toBe(false))
  it('rejects prefix < 0', () =>
    expect(isValidIPv6CIDR('2001:db8::/-1')).toBe(false))
  it('rejects missing slash', () =>
    expect(isValidIPv6CIDR('2001:db8::')).toBe(false))
  it('rejects IPv4 CIDR', () =>
    expect(isValidIPv6CIDR('10.0.0.0/24')).toBe(false))
})

// ---------------------------------------------------------------------------
// ipv6ToBigInt / bigIntToIPv6
// ---------------------------------------------------------------------------
describe('ipv6ToBigInt / bigIntToIPv6', () => {
  it('::1 converts to 1n', () => {
    expect(ipv6ToBigInt('::1')).toBe(1n)
  })

  it(':: converts to 0n', () => {
    expect(ipv6ToBigInt('::')).toBe(0n)
  })

  it('round-trips through bigIntToIPv6', () => {
    const addresses = ['::1', '::', '2001:db8::1', 'fe80::1', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff']
    for (const addr of addresses) {
      expect(bigIntToIPv6(ipv6ToBigInt(addr))).toBe(compressIPv6(addr))
    }
  })

  it('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff is max value', () => {
    expect(ipv6ToBigInt('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'))
      .toBe((1n << 128n) - 1n)
  })
})

// ---------------------------------------------------------------------------
// parseIPv6Subnet
// ---------------------------------------------------------------------------
describe('parseIPv6Subnet', () => {
  it('parses 2001:db8::/32 correctly', () => {
    const info = parseIPv6Subnet('2001:db8::/32')
    expect(info.network_address).toBe('2001:db8::')
    expect(info.prefix_length).toBe(32)
    expect(BigInt(info.total_addresses)).toBe(1n << 96n)
  })

  it('parses ::1/128 (host route) correctly', () => {
    const info = parseIPv6Subnet('::1/128')
    expect(info.network_address).toBe('::1')
    expect(info.last_address).toBe('::1')
    expect(info.first_usable).toBe('::1')
    expect(info.last_usable).toBe('::1')
    expect(info.total_addresses).toBe('1')
  })

  it('parses /127 (point-to-point) correctly', () => {
    const info = parseIPv6Subnet('fe80::0/127')
    expect(info.total_addresses).toBe('2')
    expect(info.first_usable).toBe('fe80::')
    expect(info.last_usable).toBe('fe80::1')
  })

  it('parses /64 correctly', () => {
    const info = parseIPv6Subnet('2001:db8::/64')
    expect(BigInt(info.total_addresses)).toBe(1n << 64n)
    expect(info.prefix_length).toBe(64)
  })
})

// ---------------------------------------------------------------------------
// isIPv6InSubnet
// ---------------------------------------------------------------------------
describe('isIPv6InSubnet', () => {
  it('::1 is in ::1/128', () =>
    expect(isIPv6InSubnet('::1', '::1/128')).toBe(true))
  it('::2 is not in ::1/128', () =>
    expect(isIPv6InSubnet('::2', '::1/128')).toBe(false))
  it('2001:db8::1 is in 2001:db8::/32', () =>
    expect(isIPv6InSubnet('2001:db8::1', '2001:db8::/32')).toBe(true))
  it('2001:db9::1 is not in 2001:db8::/32', () =>
    expect(isIPv6InSubnet('2001:db9::1', '2001:db8::/32')).toBe(false))
  it('fe80::1 is in fe80::/64', () =>
    expect(isIPv6InSubnet('fe80::1', 'fe80::/64')).toBe(true))
  it('fe81::1 is not in fe80::/64', () =>
    expect(isIPv6InSubnet('fe81::1', 'fe80::/64')).toBe(false))
})

// ---------------------------------------------------------------------------
// isUsableHostIPv6
// ---------------------------------------------------------------------------
describe('isUsableHostIPv6', () => {
  it('rejects network address for /64', () =>
    expect(isUsableHostIPv6('2001:db8::', '2001:db8::/64')).toBe(false))
  it('rejects last address for /64', () => {
    const info = parseIPv6Subnet('2001:db8::/64')
    expect(isUsableHostIPv6(info.last_address, '2001:db8::/64')).toBe(false)
  })
  it('accepts interior address for /64', () =>
    expect(isUsableHostIPv6('2001:db8::1', '2001:db8::/64')).toBe(true))
  it('accepts both addresses for /127 (RFC 6164)', () => {
    expect(isUsableHostIPv6('fe80::', 'fe80::/127')).toBe(true)
    expect(isUsableHostIPv6('fe80::1', 'fe80::/127')).toBe(true)
  })
  it('accepts host address for /128', () =>
    expect(isUsableHostIPv6('::1', '::1/128')).toBe(true))
  it('rejects address outside subnet', () =>
    expect(isUsableHostIPv6('2001:db9::1', '2001:db8::/64')).toBe(false))
})

// ---------------------------------------------------------------------------
// doIPv6RangesOverlap
// ---------------------------------------------------------------------------
describe('doIPv6RangesOverlap', () => {
  it('detects overlap', () =>
    expect(doIPv6RangesOverlap('::1', '::100', '::50', '::200')).toBe(true))
  it('detects no overlap', () =>
    expect(doIPv6RangesOverlap('::1', '::49', '::50', '::200')).toBe(false))
  it('touching ranges overlap', () =>
    expect(doIPv6RangesOverlap('::1', '::50', '::50', '::200')).toBe(true))
})

// ---------------------------------------------------------------------------
// doIPv6CidrsOverlap
// ---------------------------------------------------------------------------
describe('doIPv6CidrsOverlap', () => {
  it('parent and child overlap', () =>
    expect(doIPv6CidrsOverlap('2001:db8::/32', '2001:db8:1::/48')).toBe(true))
  it('sibling blocks do not overlap', () =>
    expect(doIPv6CidrsOverlap('2001:db8:1::/48', '2001:db8:2::/48')).toBe(false))
  it('same block overlaps with itself', () =>
    expect(doIPv6CidrsOverlap('2001:db8::/48', '2001:db8::/48')).toBe(true))
})

// ---------------------------------------------------------------------------
// isIPv6SubnetContainedIn
// ---------------------------------------------------------------------------
describe('isIPv6SubnetContainedIn', () => {
  it('2001:db8:1::/48 is contained in 2001:db8::/32', () =>
    expect(isIPv6SubnetContainedIn('2001:db8:1::/48', '2001:db8::/32')).toBe(true))
  it('2001:db9::/32 is NOT contained in 2001:db8::/32', () =>
    expect(isIPv6SubnetContainedIn('2001:db9::/32', '2001:db8::/32')).toBe(false))
  it('same prefix is NOT contained (prefix must be longer)', () =>
    expect(isIPv6SubnetContainedIn('2001:db8::/32', '2001:db8::/32')).toBe(false))
  it('/128 is contained in /64', () =>
    expect(isIPv6SubnetContainedIn('2001:db8::1/128', '2001:db8::/64')).toBe(true))
})

// ---------------------------------------------------------------------------
// findNextAvailableIPv6Subnet
// ---------------------------------------------------------------------------
describe('findNextAvailableIPv6Subnet', () => {
  it('finds first /64 in an empty /32', () => {
    const result = findNextAvailableIPv6Subnet('2001:db8::/32', [], 64)
    expect(result).toBe('2001:db8::/64')
  })

  it('finds second /64 when first is taken', () => {
    const result = findNextAvailableIPv6Subnet('2001:db8::/32', ['2001:db8::/64'], 64)
    expect(result).toBe('2001:db8:0:1::/64')
  })

  it('returns null if prefix is not longer than parent', () => {
    expect(findNextAvailableIPv6Subnet('2001:db8::/32', [], 32)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// findNextAvailableIPv6
// ---------------------------------------------------------------------------
describe('findNextAvailableIPv6', () => {
  it('returns first usable for empty subnet', () => {
    const result = findNextAvailableIPv6('2001:db8::/64', [], [])
    expect(result).toBe('2001:db8::1')
  })

  it('skips allocated IPs', () => {
    const result = findNextAvailableIPv6('2001:db8::/64', ['2001:db8::1'], [])
    expect(result).toBe('2001:db8::2')
  })

  it('skips DHCP ranges', () => {
    const result = findNextAvailableIPv6(
      '2001:db8::/64',
      [],
      [{ start_ip: '2001:db8::1', end_ip: '2001:db8::ff' }]
    )
    expect(result).toBe('2001:db8::100')
  })
})
