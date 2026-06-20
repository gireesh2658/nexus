import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('FATAL: MONGO_URI environment variable is missing.');
    const conn = await mongoose.connect(mongoUri);
    console.log(`[DB] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error('[DB] MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
