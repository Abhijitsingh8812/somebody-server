import { FastifyInstance } from 'fastify';
import { StorageModuleService } from './storage.service';
import { authenticate } from '../../middleware/auth.middleware';
import { JwtPayload } from '../../types';

export async function storageRoutes(app: FastifyInstance) {
  // Request Presigned Upload URL for Voice/Media
  app.post(
    '/upload-url',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const jwtUser = request.user as JwtPayload;
      const { chatId, contentType } = request.body as { chatId: string; contentType?: string };

      if (!chatId) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'chatId is required',
          },
        });
      }

      try {
        const result = await StorageModuleService.requestUploadUrl(jwtUser.userId, chatId, contentType);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: {
            code: 'STORAGE_UPLOAD_ERROR',
            message: err.message || 'Failed to generate upload URL',
          },
        });
      }
    }
  );

  // Request Presigned Download URL for Voice/Media
  app.get(
    '/download-url',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const jwtUser = request.user as JwtPayload;
      const { chatId, key } = request.query as { chatId: string; key: string };

      if (!chatId || !key) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'chatId and key query parameters are required',
          },
        });
      }

      try {
        const result = await StorageModuleService.requestDownloadUrl(jwtUser.userId, chatId, key);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: {
            code: 'STORAGE_DOWNLOAD_ERROR',
            message: err.message || 'Failed to generate download URL',
          },
        });
      }
    }
  );
}
