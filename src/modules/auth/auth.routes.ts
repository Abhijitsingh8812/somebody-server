import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service';
import { authenticate } from '../../middleware/auth.middleware';
import { JwtPayload } from '../../types';

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/v1/auth/signup
  fastify.post('/signup', async (request, reply) => {
    const body = request.body as { email?: string; password?: string; display_name?: string };

    if (!body?.email || !body?.password) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
        },
      });
    }

    try {
      const { user, profile } = await AuthService.createUser(body.email, body.password, body.display_name);
      const token = fastify.jwt.sign({ userId: user.id, email: user.email, uniqueCode: user.uniqueCode });
      const userAgent = request.headers['user-agent'] || 'Mobile Client';
      const refreshToken = await AuthService.createRefreshToken(user.id, userAgent);

      const userProfile = await AuthService.getProfileByUserId(user.id);

      return reply.send({
        accessToken: token,
        refreshToken,
        user: userProfile,
      });
    } catch (err: any) {
      return reply.status(400).send({
        error: {
          code: 'SIGNUP_FAILED',
          message: err.message || 'Signup failed',
        },
      });
    }
  });

  // POST /api/v1/auth/signin
  fastify.post('/signin', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };

    if (!body?.email || !body?.password) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
        },
      });
    }

    try {
      const { user } = await AuthService.validateUser(body.email, body.password);
      const token = fastify.jwt.sign({ userId: user.id, email: user.email, uniqueCode: user.uniqueCode });
      const userAgent = request.headers['user-agent'] || 'Mobile Client';
      const refreshToken = await AuthService.createRefreshToken(user.id, userAgent);

      const userProfile = await AuthService.getProfileByUserId(user.id);

      return reply.send({
        accessToken: token,
        refreshToken,
        user: userProfile,
      });
    } catch (err: any) {
      return reply.status(401).send({
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: err.message || 'Authentication failed',
        },
      });
    }
  });

  // POST /api/v1/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string };

    if (!body?.refreshToken) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refresh token is required',
        },
      });
    }

    try {
      const userAgent = request.headers['user-agent'] || 'Mobile Client';
      const { user, profile, newRefreshToken } = await AuthService.rotateRefreshToken(body.refreshToken, userAgent);
      const accessToken = fastify.jwt.sign({ userId: user.id, email: user.email, uniqueCode: user.uniqueCode });

      return reply.send({
        accessToken,
        refreshToken: newRefreshToken,
        user: profile,
      });
    } catch (err: any) {
      return reply.status(401).send({
        error: {
          code: 'AUTH_INVALID_REFRESH_TOKEN',
          message: 'Invalid, expired, or revoked refresh token',
        },
      });
    }
  });

  // POST /api/v1/auth/logout (Protected Route)
  fastify.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const body = request.body as { refreshToken?: string } | undefined;

    try {
      await AuthService.revokeRefreshToken(jwtUser.userId, body?.refreshToken);
      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (err: any) {
      return reply.status(500).send({
        error: {
          code: 'LOGOUT_FAILED',
          message: 'Failed to complete logout',
        },
      });
    }
  });

  // GET /api/v1/auth/me (Protected Route)
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    try {
      const userProfile = await AuthService.getProfileByUserId(jwtUser.userId);
      return reply.send(userProfile);
    } catch (err: any) {
      return reply.status(404).send({
        error: {
          code: 'USER_NOT_FOUND',
          message: err.message || 'Profile not found',
        },
      });
    }
  });
}
