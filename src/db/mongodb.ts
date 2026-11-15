import { MongoClient, type Db } from "mongodb";

let cachedDb: Db | null = null;
let client: MongoClient | null = null;

export async function getDatabase(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not defined in .env");
  }

  const dbName = process.env.MONGODB_DATABASE || "rag_engine";

  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    await client.connect();
    console.log(`Connected to MongoDB Atlas: database "${dbName}"`);
    cachedDb = client.db(dbName);
    return cachedDb;
  } catch (error: any) {
    console.warn(`MongoDB Atlas connection warning: ${error.message}`);
    // If we cannot connect to Atlas (e.g. sandbox or network glitch),
    // we rethrow or handle gracefully.
    throw error;
  }
}
