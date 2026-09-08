import { getDb, schema } from '../src/database';
import { ChatsService } from '../src/modules/chats/chats.service';
import { ConnectionsService } from '../src/modules/connections/connections.service';
import { BlocksService } from '../src/modules/blocks/blocks.service';
import { MessagesService } from '../src/modules/messages/messages.service';
import { NotificationService } from '../src/modules/notifications/notification.service';
import { ExpirationWorker } from '../src/services/jobs/expiration.worker';
import { buildApp } from '../src/app';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import ioClient from 'socket.io-client';

async function runPhase5RVerificationAudit() {
  console.log('🧪 Starting Final Phase 5R Verification Audit & Regression Suite...\n');

  const app = buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as { port: number };
  const serverUrl = `http://127.0.0.1:${address.port}`;

  let userAId: string | null = null;
  let userBId: string | null = null;
  let userCId: string | null = null;
  let chatId: string | null = null;
  let tokenA = '';
  let tokenB = '';
  let tokenC = '';

  try {
    const db = getDb();
    const passwordHash = await argon2.hash('TestPass123!');

    // --- SETUP: Create Test Users ---
    const codeA = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const codeB = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const codeC = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const [uA] = await db.insert(schema.users).values({
      uniqueCode: codeA,
      email: `p5ra_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    userAId = uA.id;
    await db.insert(schema.profiles).values({ userId: uA.id, displayName: 'Alice (Voice Sender)' });

    const [uB] = await db.insert(schema.users).values({
      uniqueCode: codeB,
      email: `p5rb_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    userBId = uB.id;
    await db.insert(schema.profiles).values({ userId: uB.id, displayName: 'Bob (Voice Recipient)' });

    const [uC] = await db.insert(schema.users).values({
      uniqueCode: codeC,
      email: `p5rc_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    userCId = uC.id;
    await db.insert(schema.profiles).values({ userId: uC.id, displayName: 'Charlie (Non-Participant)' });

    tokenA = app.jwt.sign({ userId: uA.id, email: uA.email });
    tokenB = app.jwt.sign({ userId: uB.id, email: uB.email });
    tokenC = app.jwt.sign({ userId: uC.id, email: uC.email });

    // Establish connection between User A & User B
    const conn = await ConnectionsService.requestConnection(userAId, userBId);
    await ConnectionsService.acceptConnection(conn.id, userBId);
    const chat = await ChatsService.createOrGetChat(userAId, userBId);
    chatId = chat.id;

    console.log(`[+] Test Setup Complete. Chat ID: ${chatId}`);

    // Mock audio binary (synthetic m4a buffer for verification)
    const sampleAudioBuffer = Buffer.from('RIFF_MOCK_AUDIO_DATA_FOR_BYTEA_TESTING_1234567890_SOMBODY_APP');
    const audioMimeType = 'audio/m4a';
    const voiceDuration = 15; // 15 seconds

    // =========================================================================
    // 1. END-TO-END VOICE FLOW VERIFICATION
    // =========================================================================

    // --- TEST 1: Raw Binary HTTP Upload to POST /api/v1/chats/:chatId/voice ---
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/voice`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': audioMimeType,
        'x-voice-duration': String(voiceDuration),
      },
      payload: sampleAudioBuffer,
    });

    if (uploadRes.statusCode !== 201) {
      throw new Error(`Test 1 Failed: Voice upload HTTP POST failed with status ${uploadRes.statusCode}: ${uploadRes.body}`);
    }

    const uploadedMessage = JSON.parse(uploadRes.body);
    if (!uploadedMessage.id || uploadedMessage.messageType !== 'VOICE' || uploadedMessage.voiceDuration !== voiceDuration) {
      throw new Error('Test 1 Failed: Voice upload response payload format invalid');
    }
    const voiceMessageId = uploadedMessage.id;
    console.log('✅ TEST 1 PASSED: Raw binary voice upload via HTTP POST succeeded (HTTP 201 Created)');

    // --- TEST 2: Neon PostgreSQL BYTEA Database Storage Verification ---
    const [dbMessage] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, voiceMessageId))
      .limit(1);

    if (!dbMessage) {
      throw new Error('Test 2 Failed: Voice message not found in Neon database');
    }
    if (!dbMessage.audioData || !Buffer.isBuffer(dbMessage.audioData)) {
      throw new Error('Test 2 Failed: audio_data is not stored as a valid BYTEA Buffer in Neon');
    }
    if (dbMessage.audioData.toString() !== sampleAudioBuffer.toString()) {
      throw new Error('Test 2 Failed: Stored BYTEA buffer content does not match uploaded audio binary');
    }
    if (dbMessage.audioMimeType !== audioMimeType || dbMessage.audioSizeBytes !== sampleAudioBuffer.length) {
      throw new Error('Test 2 Failed: audio_mime_type or audio_size_bytes metadata mismatch in database');
    }
    console.log('✅ TEST 2 PASSED: Neon PostgreSQL BYTEA storage verified (Binary buffer integrity 100% matched)');

    // --- TEST 3: Authenticated Playback Endpoint (Sender & Recipient Access) ---
    // Recipient (User B) requests stream
    const playbackResB = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/${voiceMessageId}/audio`,
      headers: { authorization: `Bearer ${tokenB}` },
    });

    if (playbackResB.statusCode !== 200) {
      throw new Error(`Test 3 Failed: Recipient playback request failed with status ${playbackResB.statusCode}`);
    }
    if (playbackResB.headers['content-type'] !== audioMimeType) {
      throw new Error('Test 3 Failed: Audio stream Content-Type response header incorrect');
    }
    if (playbackResB.rawPayload.toString() !== sampleAudioBuffer.toString()) {
      throw new Error('Test 3 Failed: Streamed audio binary payload does not match stored BYTEA buffer');
    }

    // Sender (User A) requests stream
    const playbackResA = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/${voiceMessageId}/audio`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    if (playbackResA.statusCode !== 200) {
      throw new Error(`Test 3 Failed: Sender playback request failed with status ${playbackResA.statusCode}`);
    }
    console.log('✅ TEST 3 PASSED: Authenticated audio streaming for sender and recipient verified (HTTP 200 OK)');

    // =========================================================================
    // 2. ACCESS CONTROL & EXPIRED AUDIO SECURITY VERIFICATION
    // =========================================================================

    // --- TEST 4: Non-Participant Access Rejection ---
    const playbackResC = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/${voiceMessageId}/audio`,
      headers: { authorization: `Bearer ${tokenC}` },
    });

    if (playbackResC.statusCode !== 403) {
      throw new Error(`Test 4 Security Fail: Non-participant returned HTTP ${playbackResC.statusCode} instead of 403 Forbidden`);
    }
    console.log('✅ TEST 4 PASSED: Non-participant audio access blocked (HTTP 403 Forbidden)');

    // --- TEST 5: Unauthorized (Missing JWT) Access Rejection ---
    const playbackResNoAuth = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/${voiceMessageId}/audio`,
    });

    if (playbackResNoAuth.statusCode !== 401) {
      throw new Error(`Test 5 Security Fail: Unauthenticated access returned HTTP ${playbackResNoAuth.statusCode} instead of 401 Unauthorized`);
    }
    console.log('✅ TEST 5 PASSED: Unauthenticated audio access blocked (HTTP 401 Unauthorized)');

    // --- TEST 6: Blocked Pair Access Rejection ---
    await BlocksService.blockUser(userAId, userBId);

    const playbackResBlocked = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/${voiceMessageId}/audio`,
      headers: { authorization: `Bearer ${tokenB}` },
    });

    if (playbackResBlocked.statusCode !== 403) {
      throw new Error(`Test 6 Security Fail: Blocked user returned HTTP ${playbackResBlocked.statusCode} instead of 403 Forbidden`);
    }

    // Unblock for remaining tests
    await BlocksService.unblockUser(userAId, userBId);
    console.log('✅ TEST 6 PASSED: Blocked user audio access blocked (HTTP 403 Forbidden)');

    // --- TEST 7: Expiration Deletion & Access Rejection ---
    // Insert an expired voice message directly
    const [expiredMsg] = await db
      .insert(schema.messages)
      .values({
        chatId,
        senderId: userAId,
        messageType: 'VOICE',
        audioData: sampleAudioBuffer,
        audioMimeType: 'audio/m4a',
        audioSizeBytes: sampleAudioBuffer.length,
        voiceDuration: 10,
        createdAt: new Date(Date.now() - 7200 * 1000), // 2 hours ago
        expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      })
      .returning();

    // Verify expired audio request before worker run returns 410 Gone
    const playbackResExpiredBefore = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/${expiredMsg.id}/audio`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    if (playbackResExpiredBefore.statusCode !== 410) {
      throw new Error(`Test 7 Fail: Expired message request returned HTTP ${playbackResExpiredBefore.statusCode} instead of 410 Gone`);
    }

    // Process expiration worker job
    await ExpirationWorker.processExpiredMessages();

    // Verify record is completely deleted from Neon database (BYTEA purged automatically)
    const [expiredCheck] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, expiredMsg.id))
      .limit(1);

    if (expiredCheck) {
      throw new Error('Test 7 Fail: Expired voice record was not purged from Neon database');
    }

    // Verify expired audio request after worker run returns 404 Not Found
    const playbackResExpiredAfter = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/${expiredMsg.id}/audio`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    if (playbackResExpiredAfter.statusCode !== 404) {
      throw new Error(`Test 7 Fail: Deleted expired message request returned HTTP ${playbackResExpiredAfter.statusCode} instead of 404 Not Found`);
    }

    console.log('✅ TEST 7 PASSED: Expiration deletion & expired audio rejection verified (HTTP 410 -> Purged -> HTTP 404)');

    // =========================================================================
    // 3. PHASE 4 & PHASE 6 REGRESSION SUITE
    // =========================================================================

    // --- TEST 8: Phase 4 Text Messaging & Socket.IO Regression ---
    const socketA = ioClient(serverUrl, { auth: { token: tokenA }, transports: ['websocket'] });
    const socketB = ioClient(serverUrl, { auth: { token: tokenB }, transports: ['websocket'] });

    await new Promise<void>((resolve) => {
      let count = 0;
      const check = () => { if (++count === 2) resolve(); };
      socketA.on('connect', () => { socketA.emit('chat:join', { chatId }); check(); });
      socketB.on('connect', () => { socketB.emit('chat:join', { chatId }); check(); });
    });

    const textMsgPromise = new Promise<any>((resolve) => {
      socketB.on('message:new', (msg) => {
        if (msg.messageType === 'TEXT') resolve(msg);
      });
    });

    socketA.emit('message:send', { chatId, content: 'Phase 4 Regression Test Message' });
    const receivedText = await textMsgPromise;

    if (receivedText.content !== 'Phase 4 Regression Test Message' || receivedText.messageType !== 'TEXT') {
      throw new Error('Test 8 Failed: Text message Socket.IO delivery regression detected');
    }
    console.log('✅ TEST 8 PASSED: Phase 4 text messaging regression verified (100% functional)');

    // --- TEST 9: Phase 6 Push Notification Triggers & Multi-Device Tokens ---
    let pushedTarget = '';
    let pushedBody = '';
    let pushedData: any = null;

    const origSendNotif = NotificationService.sendPushNotification;
    NotificationService.sendPushNotification = async (targetUserId, title, body, dataPayload) => {
      pushedTarget = targetUserId;
      pushedBody = body;
      pushedData = dataPayload;
      return true;
    };

    // Register token for User B
    const mockPushToken = 'ExponentPushToken[mock-regression-token-phase5r]';
    await NotificationService.registerPushToken(userBId, mockPushToken, 'android');

    // Disconnect User B socket completely (simulating app closed / away)
    socketB.disconnect();
    await new Promise((r) => setTimeout(r, 400));

    // User A uploads a voice message via HTTP while User B is offline
    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/voice`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': audioMimeType,
        'x-voice-duration': '10',
      },
      payload: sampleAudioBuffer,
    });

    await new Promise((r) => setTimeout(r, 400));


    if (pushedTarget !== userBId || !pushedBody.includes('Voice message received') || pushedData?.type !== 'chat') {
      throw new Error('Test 9 Failed: Push notification trigger for offline voice message failed');
    }

    NotificationService.sendPushNotification = origSendNotif;
    socketA.disconnect();
    socketB.disconnect();

    console.log('✅ TEST 9 PASSED: Phase 6 push notifications regression verified (100% functional)');

    console.log('\n================================================================');
    console.log('🎉 ALL PHASE 5R VERIFICATION & REGRESSION TESTS PASSED 100%!');
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('\n❌ PHASE 5R VERIFICATION AUDIT FAILED:', err.message);
    process.exit(1);
  } finally {
    const db = getDb();
    if (chatId) await db.delete(schema.chats).where(eq(schema.chats.id, chatId));
    if (userAId) await db.delete(schema.users).where(eq(schema.users.id, userAId));
    if (userBId) await db.delete(schema.users).where(eq(schema.users.id, userBId));
    if (userCId) await db.delete(schema.users).where(eq(schema.users.id, userCId));
    await app.close();
  }
}

runPhase5RVerificationAudit();
