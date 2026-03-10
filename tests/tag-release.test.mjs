import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadReleaseVerifier() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/verify-tag-version.mjs')
  ).href;

  return import(`${moduleUrl}?t=${Date.now()}`);
}

test('normalizeTagVersion strips the v prefix from a semantic version tag', async () => {
  const { normalizeTagVersion } = await loadReleaseVerifier();

  assert.equal(normalizeTagVersion('v0.1.2'), '0.1.2');
});

test('verifyTagMatchesPackageVersion accepts matching tag and package versions', async () => {
  const { verifyTagMatchesPackageVersion } = await loadReleaseVerifier();

  assert.doesNotThrow(() =>
    verifyTagMatchesPackageVersion({
      refName: 'v0.1.2',
      packageVersion: '0.1.2',
    })
  );
});

test('verifyTagMatchesPackageVersion rejects a missing tag name', async () => {
  const { verifyTagMatchesPackageVersion } = await loadReleaseVerifier();

  assert.throws(
    () =>
      verifyTagMatchesPackageVersion({
        refName: '',
        packageVersion: '0.1.2',
      }),
    /GITHUB_REF_NAME/
  );
});

test('normalizeTagVersion rejects a malformed tag', async () => {
  const { normalizeTagVersion } = await loadReleaseVerifier();

  assert.throws(() => normalizeTagVersion('release-0.1.2'), /Expected a tag/);
});

test('verifyTagMatchesPackageVersion rejects mismatched versions', async () => {
  const { verifyTagMatchesPackageVersion } = await loadReleaseVerifier();

  assert.throws(
    () =>
      verifyTagMatchesPackageVersion({
        refName: 'v0.1.3',
        packageVersion: '0.1.2',
      }),
    /does not match/
  );
});
