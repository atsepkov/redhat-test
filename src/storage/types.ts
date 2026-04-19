export type Bucket = string;
export type ObjectId = string;
export type ContentHash = string;

export interface IStorageEngine {
  put(bucket: Bucket, id: ObjectId, data: string): Promise<void>;
  get(bucket: Bucket, id: ObjectId): Promise<string | null>;
  delete(bucket: Bucket, id: ObjectId): Promise<boolean>;
  close(): Promise<void>;
}
