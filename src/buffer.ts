export class CircularBuffer<T> {
  private buffer: T[];
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = [];
  }

  push(item: T): T | null {
    let evicted: T | null = null;
    
    if (this.isFull()) {
      evicted = this.buffer.shift() ?? null;
    }
    
    this.buffer.push(item);
    return evicted;
  }

  toArray(): T[] {
    return [...this.buffer];
  }

  isFull(): boolean {
    return this.buffer.length >= this.capacity;
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}
