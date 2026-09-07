import { getDb, schema } from '../src/database';
import { NotificationService } from '../src/modules/notifications/notification.service';
import { ConnectionsService } from '../src/modules/connections/connections.service';
import { ChatsService } from '../src/modules/chats/chats.service';
import { buildApp } from '../src/app';
import { eq, and } from 'drizzle-orm';
import argon2 from 'argon2';
import ioClient from 'socket.io-client';

async function testPhase6Notifications() {
  console.log('🧪 Starting Phase 6 Push Notifications Integration Tests...\n');
  const app = buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as { port: number };
  const serverUrl = `http://127.0.0.1:${address.port}`;

  let userAId: string | null = null;
  let userBId: string | null = null;
  let chatId: string | null = null;
  let tokenA = '';

  try {
    const db = getDb();
    const passwordHash = await argon2.hash('TestPass123!');

    // 1. Setup test users
    const codeA = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const codeB = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const [uA] = await db.insert(schema.users).values({
      uniqueCode: codeA,
      email: `p6a_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    userAId = uA.id;
    await db.insert(schema.profiles).values({ userId: uA.id, displayName: 'Push User A' });

    const [uB] = await db.insert(schema.users).values({
      uniqueCode: codeB,
      email: `p6b_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    userBId = uB.id;
    await db.insert(schema.profiles).values({ userId: uB.id, displayName: 'Push User B' });

    tokenA = app.jwt.sign({ userId: uA.id, email: uA.email });

    // --- TEST 1: Register Push Token Service & REST API ---
    const mockExpoToken = 'ExponentPushToken[mock-test-token-123456]';
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/profiles/push-token',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { pushToken: mockExpoToken, platform: 'android' },
    });

    if (regRes.statusCode !== 200) {
      throw new Error(`Test 1 Failed: Push token registration failed with ${regRes.statusCode}`);
    }

    const tokensA = await NotificationService.getUserPushTokens(userAId);
    if (!tokensA.includes(mockExpoToken)) {
      throw new Error('Test 1 Failed: Token not found in device_tokens table');
    }
    console.log('✅ TEST 1 PASSED: Push token registration REST API & device_tokens table persistence');

    // --- TEST 2: Register Second Device Token for Multi-Device Support ---
    const mockToken2 = 'ExponentPushToken[mock-second-device-789]';
    await NotificationService.registerPushToken(userAId, mockToken2, 'ios');
    const multiTokens = await NotificationService.getUserPushTokens(userAId);
    if (multiTokens.length !== 2) {
      throw new Error('Test 2 Failed: Multi-device push token storage failed');
    }
    console.log('✅ TEST 2 PASSED: Multi-device push token support per user verified');

    // --- TEST 3: Unregister Push Token REST API ---
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/profiles/push-token',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { pushToken: mockToken2 },
    });

    if (delRes.statusCode !== 200) {
      throw new Error('Test 3 Failed: Push token deletion failed');
    }

    const afterDelTokens = await NotificationService.getUserPushTokens(userAId);
    if (afterDelTokens.includes(mockToken2)) {
      throw new Error('Test 3 Failed: Token was not removed from device_tokens table');
    }
    console.log('✅ TEST 3 PASSED: Push token unregistration API & table cleanup');

    // --- TEST 4: Connection Request Push Notification Trigger ---
    // Register token for User B
    const mockTokenB = 'ExponentPushToken[mock-user-b-token]';
    await NotificationService.registerPushToken(userBId, mockTokenB, 'android');

    // Mock NotificationService.sendPushNotification to verify triggers
    let lastPushedTarget = '';
    let lastPushedTitle = '';
    let lastPushedBody = '';
    let lastPushedData: any = null;

    const origSendNotif = NotificationService.sendPushNotification;
    NotificationService.sendPushNotification = async (targetUserId, title, body, dataPayload) => {
      lastPushedTarget = targetUserId;
      lastPushedTitle = title;
      lastPushedBody = body;
      lastPushedData = dataPayload;
      return true;
    };

    const connReq = await ConnectionsService.requestConnection(userAId, userBId);
    if (lastPushedTarget !== userBId || lastPushedData?.type !== 'connection_request') {
      throw new Error('Test 4 Failed: Connection request notification trigger failed');
    }
    console.log('✅ TEST 4 PASSED: Connection request push notification triggered to recipient');

    // --- TEST 5: Connection Acceptance Push Notification Trigger ---
    await ConnectionsService.acceptConnection(connReq.id, userBId);
    if (lastPushedTarget !== userAId || lastPushedData?.type !== 'connection_accepted') {
      throw new Error('Test 5 Failed: Connection acceptance notification trigger failed');
    }
    console.log('✅ TEST 5 PASSED: Connection acceptance push notification triggered to requester');

    // --- TEST 6: Message Push Notification Trigger when Recipient is Offline / Not in Chat ---
    const chat = await ChatsService.createOrGetChat(userAId, userBId);
    chatId = chat.id;

    // Connect User A via Socket.IO
    const socketA = ioClient(serverUrl, { auth: { token: tokenA }, transports: ['websocket'] });
    await new Promise<void>((resolve) => socketA.on('connect', resolve));
    socketA.emit('chat:join', { chatId });

    // Clear last push state
    lastPushedTarget = '';
    lastPushedData = null;

    // User A sends text message via Socket while User B is NOT in chat room
    socketA.emit('message:send', { chatId, content: 'Hello offline User B!' });
    await new Promise((r) => setTimeout(r, 400));

    if (lastPushedTarget !== userBId || lastPushedData?.type !== 'chat' || !lastPushedBody.includes('Hello offline')) {
      throw new Error('Test 6 Failed: Offline message push notification trigger failed');
    }
    console.log('✅ TEST 6 PASSED: Offline message push notification triggered (User B not in chat room)');

    // --- TEST 7: Duplicate Notification Prevention (Recipient IS in Chat Room) ---
    const tokenBJWT = app.jwt.sign({ userId: userBId, email: 'p6b@example.com' });
    const socketB = ioClient(serverUrl, { auth: { token: tokenBJWT }, transports: ['websocket'] });
    await new Promise<void>((resolve) => socketB.on('connect', resolve));
    socketB.emit('chat:join', { chatId });
    await new Promise((r) => setTimeout(r, 200));

    // Clear last push state
    lastPushedTarget = '';
    lastPushedData = null;

    // User A sends message while User B IS in chat room
    socketA.emit('message:send', { chatId, content: 'Are you seeing this live?' });
    await new Promise((r) => setTimeout(r, 400));

    if (lastPushedTarget === userBId) {
      throw new Error('Test 7 Failed: Duplicate notification sent when recipient was actively in chat room');
    }
    console.log('✅ TEST 7 PASSED: Duplicate notification prevented when recipient is actively viewing chat room');

    // Restore NotificationService.sendPushNotification
    NotificationService.sendPushNotification = origSendNotif;

    socketA.disconnect();
    socketB.disconnect();

    console.log('\n🎉 ALL PHASE 6 PUSH NOTIFICATION INTEGRATION TESTS PASSED 100% SUCCESSFULLY!');
  } catch (err: any) {
    console.error('\n❌ PHASE 6 INTEGRATION TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    const db = getDb();
    if (chatId) await db.delete(schema.chats).where(eq(schema.chats.id, chatId));
    if (userAId) await db.delete(schema.users).where(eq(schema.users.id, userAId));
    if (userBId) await db.delete(schema.users).where(eq(schema.users.id, userBId));
    await app.close();
  }
}

testPhase6Notifications();
