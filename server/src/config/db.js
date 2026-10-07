import mongoose from 'mongoose';

let memoryServerInstance = null;

export async function connectDB(uri) {
  mongoose.set('strictQuery', true);

  // If a remote URI (e.g. MongoDB Atlas) is provided, connect directly
  if (uri && !uri.includes('127.0.0.1:27017') && !uri.includes('localhost:27017')) {
    await mongoose.connect(uri);
    console.log(`✅ MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return;
  }

  // Attempt local connection with a fast timeout (2.5s)
  try {
    if (!uri) throw new Error('MONGO_URI is not set');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    console.log(`✅ MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️ Local MongoDB not found on port 27017. Starting embedded in-memory database...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServerInstance = await MongoMemoryServer.create();
      const memUri = memoryServerInstance.getUri();
      await mongoose.connect(memUri, { dbName: 'dsa-quest' });
      console.log(`✅ Embedded in-memory MongoDB ready: ${memUri}`);
      return;
    }
    throw err;
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
  }
}
