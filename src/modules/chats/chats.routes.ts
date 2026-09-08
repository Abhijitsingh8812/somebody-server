import { FastifyInstance } from 'fastify';
import { ChatsService } from './chats.service';
import { authenticate } from '../../middleware/auth.middleware';
import { JwtPayload } from '../../types';

export default async function chatsRoutes(fastify: FastifyInstance) {
  // POST /api/v1/chats
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const body = request.body as { userId?: string };

    if (!body?.userId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Target userId is required',
        },
      });
    }

    try {
      const chat = await ChatsService.createOrGetChat(jwtUser.userId, body.userId);
      return reply.send(chat);
    } catch (err: any) {
      return reply.status(400).send({
        error: {
          code: 'CHAT_CREATION_FAILED',
          message: err.message || 'Failed to create chat',
        },
      });
    }
  });

  // GET /api/v1/chats
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    try {
      const list = await ChatsService.getUserChats(jwtUser.userId);
      return reply.send(list);
    } catch (err: any) {
      return reply.status(500).send({
        error: {
          code: 'FETCH_FAILED',
          message: err.message || 'Failed to fetch chats',
        },
      });
    }
  });

  // GET /api/v1/chats/:chatId
  fastify.get('/:chatId', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { chatId } = request.params as { chatId: string };

    try {
      const chat = await ChatsService.getChatById(chatId, jwtUser.userId);
      return reply.send(chat);
    } catch (err: any) {
      return reply.status(403).send({
        error: {
          code: 'CHAT_ACCESS_DENIED',
          message: err.message || 'Access denied to this chat',
        },
      });
    }
  });

  // GET /api/v1/chats/:chatId/messages
  fastify.get('/:chatId/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { chatId } = request.params as { chatId: string };

    try {
      const messages = await ChatsService.getChatMessages(chatId, jwtUser.userId);
      return reply.send(messages);
    } catch (err: any) {
      return reply.status(403).send({
        error: {
          code: 'FETCH_MESSAGES_FAILED',
          message: err.message || 'Failed to fetch chat messages',
        },
      });
    }
  });

  // POST /api/v1/chats/:chatId/read
  fastify.post('/:chatId/read', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { chatId } = request.params as { chatId: string };

    try {
      const result = await ChatsService.markMessagesAsRead(chatId, jwtUser.userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({
        error: {
          code: 'MARK_READ_FAILED',
          message: err.message || 'Failed to mark messages as read',
        },
      });
    }
  });

  // POST /api/v1/chats/:chatId/messages
  fastify.post('/:chatId/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { chatId } = request.params as { chatId: string };
    const body = request.body as { content?: string };

    console.log(`[MESSAGE ROUTE HIT] POST /api/v1/chats/${chatId}/messages | Sender: ${jwtUser.userId}`);

    if (!body?.content || typeof body.content !== 'string' || !body.content.trim()) {
      console.warn(`[MESSAGE CREATE ERROR] Invalid or empty content for chat ${chatId}`);
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message content is required and cannot be empty',
        },
      });
    }

    try {
      const message = await ChatsService.sendMessage(chatId, jwtUser.userId, body.content);
      console.log(`[MESSAGE CREATE SUCCESS] Created message ${message.id} in chat ${chatId}`);
      return reply.status(201).send(message);
    } catch (err: any) {
      console.error(`[MESSAGE CREATE ERROR] Chat ${chatId} send failed:`, err.message);
      const statusCode = err.message?.includes('blocked') || err.message?.includes('denied') || err.message?.includes('Access denied') ? 403 : 400;
      return reply.status(statusCode).send({
        error: {
          code: 'MESSAGE_SEND_FAILED',
          message: err.message || 'Failed to send message',
        },
      });
    }
  });

  // POST /api/v1/chats/:chatId/voice
  fastify.post(
    '/:chatId/voice',
    {
      bodyLimit: 1572864,
      preHandler: [authenticate],
    },
    async (request, reply) => {

      const jwtUser = request.user as JwtPayload;
      const { chatId } = request.params as { chatId: string };
      const durationHeader = request.headers['x-voice-duration'] as string;
      const durationQuery = (request.query as any)?.duration;
      const durationVal = parseFloat(durationHeader || durationQuery || '0');

      const contentType = (request.headers['content-type'] || 'audio/m4a').split(';')[0].trim();
      const bodyBuffer = request.body as Buffer;

      if (!bodyBuffer || !Buffer.isBuffer(bodyBuffer)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Voice payload must be raw binary audio data',
          },
        });
      }

      try {
        const message = await ChatsService.uploadVoiceMessage(
          chatId,
          jwtUser.userId,
          durationVal,
          contentType,
          bodyBuffer
        );
        return reply.status(201).send(message);
      } catch (err: any) {
        const statusCode = err.message?.includes('blocked') || err.message?.includes('denied') ? 403 : 400;
        return reply.status(statusCode).send({
          error: {
            code: 'VOICE_UPLOAD_FAILED',
            message: err.message || 'Failed to upload voice message',
          },
        });
      }
    }
  );
}

