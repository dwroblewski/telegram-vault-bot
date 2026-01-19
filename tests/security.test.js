/**
 * Security Unit Tests - IP Validation
 *
 * Run with: node --experimental-vm-modules tests/security.test.js
 * No external dependencies required.
 */

import { ipToInt, isValidTelegramIP } from '../worker/src/services/security.js';

// Simple test framework
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`Expected ${expected} but got ${actual} ${msg}`);
  }
}

function assertTrue(value, msg = '') {
  if (value !== true) {
    throw new Error(`Expected true but got ${value} ${msg}`);
  }
}

function assertFalse(value, msg = '') {
  if (value !== false) {
    throw new Error(`Expected false but got ${value} ${msg}`);
  }
}

// Tests
console.log('\n=== ipToInt Tests ===\n');

test('converts 0.0.0.0 to 0', () => {
  assertEqual(ipToInt('0.0.0.0'), 0);
});

test('converts 255.255.255.255 to max uint32', () => {
  assertEqual(ipToInt('255.255.255.255'), 4294967295);
});

test('converts 149.154.160.0 correctly', () => {
  assertEqual(ipToInt('149.154.160.0'), 2509938688);
});

test('converts 91.108.4.0 correctly', () => {
  assertEqual(ipToInt('91.108.4.0'), 1533805568);
});

console.log('\n=== isValidTelegramIP Tests - Valid IPs ===\n');

// Range 1: 149.154.160.0/20 (149.154.160.0 - 149.154.175.255)
test('accepts start of range 1: 149.154.160.0', () => {
  assertTrue(isValidTelegramIP('149.154.160.0'));
});

test('accepts within range 1: 149.154.160.1', () => {
  assertTrue(isValidTelegramIP('149.154.160.1'));
});

test('accepts middle of range 1: 149.154.167.128', () => {
  assertTrue(isValidTelegramIP('149.154.167.128'));
});

test('accepts end of range 1: 149.154.175.255', () => {
  assertTrue(isValidTelegramIP('149.154.175.255'));
});

// Range 2: 91.108.4.0/22 (91.108.4.0 - 91.108.7.255)
test('accepts start of range 2: 91.108.4.0', () => {
  assertTrue(isValidTelegramIP('91.108.4.0'));
});

test('accepts within range 2: 91.108.4.1', () => {
  assertTrue(isValidTelegramIP('91.108.4.1'));
});

test('accepts middle of range 2: 91.108.5.128', () => {
  assertTrue(isValidTelegramIP('91.108.5.128'));
});

test('accepts end of range 2: 91.108.7.255', () => {
  assertTrue(isValidTelegramIP('91.108.7.255'));
});

console.log('\n=== isValidTelegramIP Tests - Invalid IPs ===\n');

// Just outside range 1
test('rejects just before range 1: 149.154.159.255', () => {
  assertFalse(isValidTelegramIP('149.154.159.255'));
});

test('rejects just after range 1: 149.154.176.0', () => {
  assertFalse(isValidTelegramIP('149.154.176.0'));
});

// Just outside range 2
test('rejects just before range 2: 91.108.3.255', () => {
  assertFalse(isValidTelegramIP('91.108.3.255'));
});

test('rejects just after range 2: 91.108.8.0', () => {
  assertFalse(isValidTelegramIP('91.108.8.0'));
});

// Common external IPs
test('rejects Google DNS: 8.8.8.8', () => {
  assertFalse(isValidTelegramIP('8.8.8.8'));
});

test('rejects Cloudflare DNS: 1.1.1.1', () => {
  assertFalse(isValidTelegramIP('1.1.1.1'));
});

test('rejects private IP: 192.168.1.1', () => {
  assertFalse(isValidTelegramIP('192.168.1.1'));
});

test('rejects localhost: 127.0.0.1', () => {
  assertFalse(isValidTelegramIP('127.0.0.1'));
});

test('rejects random public IP: 203.0.113.50', () => {
  assertFalse(isValidTelegramIP('203.0.113.50'));
});

console.log('\n=== isValidTelegramIP Tests - Edge Cases ===\n');

test('rejects null', () => {
  assertFalse(isValidTelegramIP(null));
});

test('rejects undefined', () => {
  assertFalse(isValidTelegramIP(undefined));
});

test('rejects empty string', () => {
  assertFalse(isValidTelegramIP(''));
});

// Summary
console.log('\n=== Results ===\n');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('');

process.exit(failed > 0 ? 1 : 0);
