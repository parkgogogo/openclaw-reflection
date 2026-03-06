declare module "proper-lockfile" {
  export interface RetryOptions {
    retries?: number;
    factor?: number;
    minTimeout?: number;
    maxTimeout?: number;
    randomize?: boolean;
  }

  export interface LockOptions {
    retries?: number | RetryOptions;
    stale?: number;
    realpath?: boolean;
  }

  export type Release = () => Promise<void>;

  export function lock(filePath: string, options?: LockOptions): Promise<Release>;

  const lockfile: {
    lock: typeof lock;
  };

  export default lockfile;
}
