import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

/** Optional buyer ↔ builder chat scoped to a flat/project. */
export interface IChatThread extends Document {
  flatId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  buyerId: Types.ObjectId;
  builderId: Types.ObjectId;
  agentId?: Types.ObjectId;
  lastMessageAt: Date;
  lastMessagePreview?: string;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatMessage {
  threadId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderRole: string;
  body: string;
  readBy: Types.ObjectId[];
  createdAt: Date;
}

const chatThreadSchema = new Schema<IChatThread>(
  {
    flatId: { type: Schema.Types.ObjectId, ref: 'Flat', index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    builderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User' },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: String,
    isClosed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

chatThreadSchema.index({ buyerId: 1, builderId: 1, flatId: 1 }, { unique: true, sparse: true });
chatThreadSchema.index({ builderId: 1, lastMessageAt: -1 });

const chatMessageSchema = new Schema<IChatMessage>(
  {
    threadId: { type: Schema.Types.ObjectId, ref: 'ChatThread', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: String,
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

chatMessageSchema.index({ threadId: 1, createdAt: 1 });

export const ChatThread: Model<IChatThread> = registerModel<IChatThread>('ChatThread', chatThreadSchema);
export const ChatMessage: Model<IChatMessage> = registerModel<IChatMessage>('ChatMessage', chatMessageSchema);