import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ChatMessage, ChatThread } from '../models/Chat';
import { Notification } from '../models/Notification';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendCreated, sendOk } from '../utils/response';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

/* ------------------------------ notifications ----------------------------- */

/**
 * This router is mounted at `/notifications` in `app.ts`, so the paths below are
 * RELATIVE. They were previously written as `/notifications/...`, which made
 * every notification endpoint resolve to `/notifications/notifications` and left
 * the header bell permanently empty. The chat routes further down keep their
 * `/chat/...` prefix because the web client calls `/notifications/chat/threads`.
 */

router.get('/', async (req, res, next) => {
  try {
    const schema = z.object({
      unreadOnly: z.enum(['true', 'false']).default('false'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    });
    const query = schema.parse(req.query);
    const filter: Record<string, unknown> = { recipientId: req.user!._id };
    if (query.unreadOnly === 'true') filter.read = false;

    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipientId: req.user!._id, read: false }),
    ]);

    return sendOk(res, 'Notifications fetched successfully', notifications, {
      ...paginationMeta(query.page, query.limit, total),
      unread,
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id/read', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid id') }).parse(req.params);
    const notification = await Notification.findOne({ _id: id, recipientId: req.user!._id });
    if (!notification) throw ApiError.notFound('Notification not found');
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
    return sendOk(res, 'Notification marked as read', { notification });
  } catch (error) {
    return next(error);
  }
});

router.put('/read-all', async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipientId: req.user!._id, read: false },
      { $set: { read: true, readAt: new Date() } },
    );
    return sendOk(res, 'All notifications marked as read', { updated: result.modifiedCount });
  } catch (error) {
    return next(error);
  }
});

/* ----------------------------------- chat --------------------------------- */

const ensureParticipant = (thread: { buyerId: unknown; builderId: unknown; agentId?: unknown }, userId: string, role: string): boolean =>
  String(thread.buyerId) === userId ||
  String(thread.builderId) === userId ||
  String(thread.agentId ?? '') === userId ||
  role === 'admin';

router.get('/chat/threads', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> =
      req.user!.role === 'builder'
        ? { builderId: req.user!._id }
        : req.user!.role === 'agent'
          ? { agentId: req.user!._id }
          : { buyerId: req.user!._id };

    const threads = await ChatThread.find(filter)
      .populate('flatId', 'title bhk totalPrice images')
      .populate('builderId', 'name companyName avatar')
      .populate('buyerId', 'name avatar')
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean();

    return sendOk(res, 'Chat threads fetched successfully', threads, { total: threads.length });
  } catch (error) {
    return next(error);
  }
});

router.post('/chat/threads', async (req, res, next) => {
  try {
    const schema = z.object({
      flatId: z.string().refine(Types.ObjectId.isValid, 'Invalid flat id'),
      builderId: z.string().refine(Types.ObjectId.isValid, 'Invalid builder id').optional(),
      message: z.string().trim().min(1, 'Write a message').max(2000).optional(),
    });
    const input = schema.parse(req.body);

    const { Flat } = await import('../models/Flat');
    const flat = await Flat.findById(input.flatId).select('projectId builderId agentId').lean();
    if (!flat) throw ApiError.notFound('Flat not found');

    if (req.user!.role === 'builder') {
      if (String(flat.builderId) !== String(req.user!._id)) throw ApiError.forbidden('This is not your listing');
      if (String(flat.builderId) === String(req.user!._id)) {
        const buyerId = (req.body.buyerId as string) ?? '';
        if (!Types.ObjectId.isValid(buyerId)) throw ApiError.badRequest('A buyerId is required to start this thread');
        return createThread(buyerId, flat, input.message, req, res, next);
      }
    }
    return createThread(String(req.user!._id), flat, input.message, req, res, next);
  } catch (error) {
    return next(error);
  }
});

const createThread = async (
  otherUserId: string,
  flat: { _id: unknown; projectId: unknown; builderId: unknown; agentId?: unknown },
  message: string | undefined,
  req: Parameters<typeof authenticate>[0],
  res: Parameters<typeof authenticate>[1],
  next: Parameters<typeof authenticate>[2],
): Promise<unknown> => {
  try {
    const isBuyer = req.user!.role === 'buyer';
    const buyerId = isBuyer ? req.user!._id : new Types.ObjectId(otherUserId);
    const builderId = isBuyer ? flat.builderId : req.user!._id;

    const existing = await ChatThread.findOne({ buyerId, builderId, flatId: flat._id });
    let thread = existing;
    if (!thread) {
      thread = await ChatThread.create({
        flatId: flat._id,
        projectId: flat.projectId,
        buyerId,
        builderId,
        agentId: flat.agentId,
      });
    }
    if (message) {
      await ChatMessage.create({
        threadId: thread._id,
        senderId: req.user!._id,
        senderRole: req.user!.role,
        body: message,
      });
      thread.lastMessageAt = new Date();
      thread.lastMessagePreview = message.slice(0, 120);
      await thread.save();
    }
    return sendCreated(res, 'Chat thread ready', { thread });
  } catch (error) {
    return next(error);
  }
};

router.get('/chat/threads/:id/messages', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid thread id') }).parse(req.params);
    const thread = await ChatThread.findById(id);
    if (!thread) throw ApiError.notFound('Chat thread not found');
    if (!ensureParticipant(thread, String(req.user!._id), req.user!.role)) {
      throw ApiError.forbidden('You are not a participant in this conversation');
    }

    const messages = await ChatMessage.find({ threadId: id }).sort({ createdAt: 1 }).limit(200).lean();
    await ChatMessage.updateMany({ threadId: id, readBy: { $ne: req.user!._id } }, { $addToSet: { readBy: req.user!._id } });

    return sendOk(res, 'Messages fetched successfully', messages, { total: messages.length });
  } catch (error) {
    return next(error);
  }
});

router.post('/chat/threads/:id/messages', async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid thread id') }).parse(req.params);
    const { body } = z.object({ body: z.string().trim().min(1, 'Write a message').max(2000) }).parse(req.body);

    const thread = await ChatThread.findById(id);
    if (!thread) throw ApiError.notFound('Chat thread not found');
    if (!ensureParticipant(thread, String(req.user!._id), req.user!.role)) {
      throw ApiError.forbidden('You are not a participant in this conversation');
    }

    const message = await ChatMessage.create({
      threadId: id,
      senderId: req.user!._id,
      senderRole: req.user!.role,
      body,
      readBy: [req.user!._id],
    });
    thread.lastMessageAt = new Date();
    thread.lastMessagePreview = body.slice(0, 120);
    await thread.save();

    return sendCreated(res, 'Message sent', { message });
  } catch (error) {
    return next(error);
  }
});

export default router;