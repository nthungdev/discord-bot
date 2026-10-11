import type { RoastLogEntry } from "../models/roast-log";

export interface IRoastLogRepository {
  record(entry: RoastLogEntry): void;
  flush(): Promise<void>;
  destroy(): Promise<void> | void;
}
