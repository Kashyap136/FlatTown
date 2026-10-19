import mongoose from 'mongoose';
import { env } from './env';
import { createLogger } from '../utils/logger';

const log = createLogger('db');

export const connectDatabase = async (): Promise<typeof mongoose> => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 20,
    autoIndex: !env.isProd,
  } as mongoose.ConnectOptions);
  log.info(`connected to ${env.mongoUri.replace(/\/\/([^@]+)@/, '//***@')}`);
  return mongoose;
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.connection.close();
};

export const isDbConnected = (): boolean => mongoose.connection.readyState === 1;