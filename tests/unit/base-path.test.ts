import { expect, test } from 'vitest';
import { deploymentBase } from '../../vite.config.js';

test('root and renamed repository base paths work', () => {
  expect(deploymentBase()).toBe('/');
  expect(deploymentBase('/another-repository/')).toBe('/another-repository/');
  expect(deploymentBase('./', true)).toBe('./');
});

test.each(['./', 'assets/', '/assets', '//evil.test/', '/../', '/./', '/one/../two/', 'https://example.com/'])('reject malformed nonportable base %s', (base) => {
  expect(() => deploymentBase(base)).toThrow('SITE_BASE');
});
