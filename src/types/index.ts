import { Server as SocketIOServer } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

export interface JwtPayload {
  userId: string;
  email: string;
  uniqueCode: string;
}

export interface UserProfileResponse {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  about?: string | null;
  preferences?: Record<string, any>;
  uniqueCode: string;
  lastSeen: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfileResponse;
}

export interface PreSignedUrlResponse {
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
}

