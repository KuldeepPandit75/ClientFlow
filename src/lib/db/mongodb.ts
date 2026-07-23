import { Db, MongoClient } from "mongodb";

const DEFAULT_DB_NAME = "next-automation";

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

function getMongoUri() {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Add it to your .env file.");
  }

  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error("MONGODB_URI must start with mongodb:// or mongodb+srv://.");
  }

  return uri;
}

export function getMongoClient() {
  if (!globalThis.mongoClientPromise) {
    globalThis.mongoClientPromise = new MongoClient(getMongoUri()).connect();
  }

  return globalThis.mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB?.trim() || DEFAULT_DB_NAME);
}
