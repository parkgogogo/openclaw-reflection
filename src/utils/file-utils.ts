import * as fs from "fs/promises";
import * as path from "path";
import lockfile from "proper-lockfile";

const LOCK_TIMEOUT_MS = 5000;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}.md`;
}

async function createFileIfMissing(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      const handle = await fs.open(filePath, "a");
      await handle.close();
      return;
    }

    throw error;
  }
}

async function lockForWrite(filePath: string): Promise<() => Promise<void>> {
  await ensureDir(path.dirname(filePath));
  await createFileIfMissing(filePath);

  try {
    return await lockfile.lock(filePath, {
      retries: {
        retries: 5,
        factor: 1,
        minTimeout: 1000,
        maxTimeout: 1000,
        randomize: false,
      },
      stale: LOCK_TIMEOUT_MS,
      realpath: false,
    });
  } catch (error) {
    throw new Error(
      `Failed to acquire lock for "${filePath}" within ${LOCK_TIMEOUT_MS}ms: ${getErrorMessage(error)}`
    );
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(
      `Failed to ensure directory \"${dirPath}\": ${getErrorMessage(error)}`
    );
  }
}

export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw new Error(
      `Failed to read file \"${filePath}\": ${getErrorMessage(error)}`
    );
  }
}

export async function writeFile(
  filePath: string,
  content: string
): Promise<void> {
  try {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to write file \"${filePath}\": ${getErrorMessage(error)}`
    );
  }
}

export async function writeFileWithLock(
  filePath: string,
  content: string
): Promise<void> {
  const release = await lockForWrite(filePath);

  try {
    await writeFile(filePath, content);
  } finally {
    await release();
  }
}

export async function appendFile(
  filePath: string,
  content: string
): Promise<void> {
  try {
    await ensureDir(path.dirname(filePath));
    await fs.appendFile(filePath, content, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to append file \"${filePath}\": ${getErrorMessage(error)}`
    );
  }
}

export async function appendFileWithLock(
  filePath: string,
  content: string
): Promise<void> {
  const release = await lockForWrite(filePath);

  try {
    await appendFile(filePath, content);
  } finally {
    await release();
  }
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw new Error(
      `Failed to list files in \"${dirPath}\": ${getErrorMessage(error)}`
    );
  }
}

export async function moveFile(fromPath: string, toPath: string): Promise<void> {
  try {
    await ensureDir(path.dirname(toPath));
    await fs.rename(fromPath, toPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "EXDEV") {
      try {
        await fs.copyFile(fromPath, toPath);
        await fs.unlink(fromPath);
        return;
      } catch (copyError) {
        throw new Error(
          `Failed to move file \"${fromPath}\" to \"${toPath}\": ${getErrorMessage(copyError)}`
        );
      }
    }

    throw new Error(
      `Failed to move file \"${fromPath}\" to \"${toPath}\": ${getErrorMessage(error)}`
    );
  }
}

export function getTodayFilename(): string {
  return formatDate(new Date());
}

export function getYesterdayFilename(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatDate(date);
}
