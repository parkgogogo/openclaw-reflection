import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER_TAG_PATTERN = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export function normalizeTagVersion(refName) {
  if (!refName) {
    throw new Error('GITHUB_REF_NAME is required for release publishing.');
  }

  const match = refName.match(SEMVER_TAG_PATTERN);

  if (!match) {
    throw new Error(`Expected a tag like v1.2.3, received "${refName}".`);
  }

  return match[1];
}

export function verifyTagMatchesPackageVersion({ refName, packageVersion }) {
  const tagVersion = normalizeTagVersion(refName);

  if (!packageVersion) {
    throw new Error('package.json version is required for release publishing.');
  }

  if (tagVersion !== packageVersion) {
    throw new Error(
      `Tag version ${tagVersion} does not match package.json version ${packageVersion}.`
    );
  }

  return tagVersion;
}

function readPackageVersion() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.join(scriptDir, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  return packageJson.version;
}

function main() {
  const tagVersion = verifyTagMatchesPackageVersion({
    refName: process.env.GITHUB_REF_NAME,
    packageVersion: readPackageVersion(),
  });

  console.log(`Verified release tag v${tagVersion} matches package.json.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
