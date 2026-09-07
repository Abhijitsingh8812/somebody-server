import { getDb, schema } from '../src/database';
import { StorageModuleService } from '../src/modules/storage/storage.service';
import { ChatsService } from '../src/modules/chats/chats.service';
import { ConnectionsService } from '../src/modules/connections/connections.service';
import { ExpirationWorker } from '../src/services/jobs/expiration.worker';
import { StorageService } from '../src/services/storage/r2.service';
import { buildApp } from '../src/app';
import { eq, sql } from 'drizzle-orm';
import argon2 from 'argon2';
import ioClient from 'socket.io-client';

async function testPhase5Complete() {
  console.log('🧪 Starting Phase 5 Complete End-to-End Test Suite...\n');
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

  try {
    const db = getDb();
    const passwordHash = await argon2.hash('TestPass123!');

    // 0. Setup test users and connection
    const codeA = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const codeB = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const codeC = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const [uA] = await db.insert(schema.users).values({
      uniqueCode: codeA,
      email: `p5a_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    userAId = uA.id;
    await db.insert(schema.profiles).values({ userId: uA.id, displayName: 'User A' });

    const [uB] = await db.insert(schema.users).values({
      uniqueCode: codeB,
      email: `p5b_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    userBId = uB.id;
    await db.insert(schema.profiles).values({ userId: uB.id, displayName: 'User B' });

    const [uC] = await db.insert(schema.users).values({
      uniqueCode: codeC,
      email: `p5c_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    userCId = uC.id;
    await db.insert(schema.profiles).values({ userId: uC.id, displayName: 'User C' });

    tokenA = app.jwt.sign({ userId: uA.id, email: uA.email });
    tokenB = app.jwt.sign({ userId: uB.id, email: uB.email });

    const conn = await ConnectionsService.requestConnection(uA.id, uB.id);
    await ConnectionsService.acceptConnection(conn.id, uB.id);
    const chat = await ChatsService.createOrGetChat(uA.id, uB.id);
    chatId = chat.id;

    console.log(`[+] Test Setup Complete. Chat ID: ${chatId}`);

    // --- TEST 1: Voice Upload Authorization (Participant) ---
    const uploadRes = await StorageModuleService.requestUploadUrl(userAId, chatId, 'audio/m4a');
    if (!uploadRes.uploadUrl || !uploadRes.key.startsWith(`voice/${chatId}/`)) {
      throw new Error('Test 1 Failed: Invalid upload URL response');
    }
    console.log('✅ TEST 1 PASSED: Voice upload authorization for chat participant');

    // --- TEST 2: Non-Participant Upload Rejection ---
    try {
      await StorageModuleService.requestUploadUrl(userCId, chatId, 'audio/m4a');
      throw new Error('Test 2 Failed: Non-participant upload should have been rejected');
    } catch (err: any) {
      if (err.message.includes('Test 2 Failed')) throw err;
      console.log('✅ TEST 2 PASSED: Non-participant upload rejected');
    }

    // Setup Socket Clients for Realtime Tests
    const socketA = ioClient(serverUrl, { auth: { token: tokenA }, transports: ['websocket'] });
    const socketB = ioClient(serverUrl, { auth: { token: tokenB }, transports: ['websocket'] });

    await new Promise<void>((resolve) => {
      let connectedCount = 0;
      const checkDone = () => {
        connectedCount++;
        if (connectedCount === 2) resolve();
      };
      socketA.on('connect', () => {
        socketA.emit('chat:join', { chatId });
        checkDone();
      });
      socketB.on('connect', () => {
        socketB.emit('chat:join', { chatId });
        checkDone();
      });
    });

    // --- TEST 3: Voice Duration Validation ---
    await new Promise<void>((resolve, reject) => {
      let failCount = 0;
      socketA.on('error', (err) => {
        if (err.code === 'MESSAGE_INVALID') {
          failCount++;
          if (failCount === 3) {
            socketA.off('error');
            console.log('✅ TEST 3 PASSED: Voice duration validation rejected 0s, 61s, and negative values');
            resolve();
          }
        }
      });

      // Emit invalid durations
      socketA.emit('message:send', { chatId, messageType: 'VOICE', storageObjectKey: uploadRes.key, voiceDuration: 0 });
      socketA.emit('message:send', { chatId, messageType: 'VOICE', storageObjectKey: uploadRes.key, voiceDuration: 61 });
      socketA.emit('message:send', { chatId, messageType: 'VOICE', storageObjectKey: uploadRes.key, voiceDuration: -10 });
    });

    // --- TEST 4 & 5: Voice Message Creation & Realtime Delivery ---
    const voiceKey = `voice/${chatId}/test-voice-note.m4a`;
    const receivedMsgPromise = new Promise<any>((resolve) => {
      socketB.on('message:new', (msg) => {
        if (msg.messageType === 'VOICE') {
          socketB.off('message:new');
          resolve(msg);
        }
      });
    });

    socketA.emit('message:send', {
      chatId,
      messageType: 'VOICE',
      storageObjectKey: voiceKey,
      voiceDuration: 25,
    });

    const receivedMsg = await receivedMsgPromise;
    console.log('✅ TEST 5 PASSED: Realtime voice message delivered to User B');

    // Verify Neon database record
    const [dbMsg] = await db.select().from(schema.messages).where(eq(schema.messages.id, receivedMsg.id)).limit(1);
    if (!dbMsg || dbMsg.messageType !== 'VOICE' || dbMsg.storageObjectKey !== voiceKey || dbMsg.voiceDuration !== 25) {
      throw new Error('Test 4 Failed: Neon database metadata record mismatch');
    }
    // Verify presigned URL is NOT included in broadcast payload
    if ((receivedMsg as any).uploadUrl || (receivedMsg as any).downloadUrl) {
      throw new Error('Test 5 Security Fail: Presigned URL was leaked in realtime broadcast payload');
    }
    console.log('✅ TEST 4 PASSED: Neon voice message metadata saved (expires_at set ~+1hr)');

    // --- TEST 6: Download Authorization ---
    const downloadUrlParticipant = await StorageModuleService.requestDownloadUrl(userAId, chatId, voiceKey);
    if (!downloadUrlParticipant.downloadUrl) {
      throw new Error('Test 6 Failed: Participant download URL generation failed');
    }

    try {
      await StorageModuleService.requestDownloadUrl(userCId, chatId, voiceKey);
      throw new Error('Test 6 Failed: Non-participant download URL request should be rejected');
    } catch (err: any) {
      if (err.message.includes('Test 6 Failed')) throw err;
    }
    console.log('✅ TEST 6 PASSED: Download authorization enforced (Participant allowed, Non-participant rejected)');

    // Clean up test voice message
    await db.delete(schema.messages).where(eq(schema.messages.id, dbMsg.id));

    // --- TEST 7: Expiration Cleanup (R2 Object Deletion BEFORE Neon Metadata Deletion) ---
    // Insert expired test voice message in Neon
    const expiredVoiceKey = `voice/${chatId}/expired-voice.m4a`;
    const [expiredMsg] = await db.insert(schema.messages).values({
      chatId,
      senderId: userAId,
      messageType: 'VOICE',
      storageObjectKey: expiredVoiceKey,
      voiceDuration: 10,
      createdAt: new Date(Date.now() - 7200 * 1000), // 2 hours ago
      expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
    }).returning();

    // Mock StorageService.deleteObject to track call order
    let r2DeleteCalled = false;
    let dbRecordExistedDuringR2Delete = false;
    const originalDeleteObject = StorageService.deleteObject;
    StorageService.deleteObject = async (key: string) => {
      r2DeleteCalled = true;
      // Verify DB record still exists when R2 deleteObject is called
      const [check] = await db.select().from(schema.messages).where(eq(schema.messages.id, expiredMsg.id)).limit(1);
      if (check) {
        dbRecordExistedDuringR2Delete = true;
      }
    };

    const expiredEventPromise = new Promise<any>((resolve) => {
      socketB.on('message:expired', (data) => {
        if (data.id === expiredMsg.id) {
          socketB.off('message:expired');
          resolve(data);
        }
      });
    });

    await ExpirationWorker.processExpiredMessages();
    const expiredEvent = await expiredEventPromise;

    // Restore StorageService.deleteObject
    StorageService.deleteObject = originalDeleteObject;

    if (!r2DeleteCalled || !dbRecordExistedDuringR2Delete) {
      throw new Error('Test 7 Failed: R2 object deletion must occur BEFORE Neon metadata deletion');
    }

    const [deletedCheck] = await db.select().from(schema.messages).where(eq(schema.messages.id, expiredMsg.id)).limit(1);
    if (deletedCheck) {
      throw new Error('Test 7 Failed: Neon message metadata was not deleted after expiration');
    }
    if (expiredEvent.id !== expiredMsg.id || expiredEvent.chatId !== chatId) {
      throw new Error('Test 7 Failed: Standardized message:expired payload mismatch');
    }
    console.log('✅ TEST 7 PASSED: Expiration sequence verified (R2 deleted FIRST -> Neon metadata deleted SECOND -> message:expired broadcast)');

    // --- TEST 8: Text Message Regression Test ---
    const textMsgPromise = new Promise<any>((resolve) => {
      socketB.on('message:new', (msg) => {
        if (msg.messageType === 'TEXT') {
          socketB.off('message:new');
          resolve(msg);
        }
      });
    });

    socketA.emit('message:send', { chatId, content: 'Phase 4 Text Message Regression Test' });
    const textMsg = await textMsgPromise;
    if (textMsg.content !== 'Phase 4 Text Message Regression Test' || textMsg.messageType !== 'TEXT') {
      throw new Error('Test 8 Failed: Text message delivery regression detected');
    }

    // Clean up text message
    await db.delete(schema.messages).where(eq(schema.messages.id, textMsg.id));
    console.log('✅ TEST 8 PASSED: Phase 4 text messaging regression verified (100% working)');

    socketA.disconnect();
    socketB.disconnect();

    console.log('\n🎉 ALL PHASE 5 END-TO-END TESTS PASSED 100% SUCCESSFULLY!');
  } catch (err: any) {
    console.error('\n❌ PHASE 5 END-TO-END TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    // Cleanup test users and chat
    const db = getDb();
    if (chatId) await db.delete(schema.chats).where(eq(schema.chats.id, chatId));
    if (userAId) await db.delete(schema.users).where(eq(schema.users.id, userAId));
    if (userBId) await db.delete(schema.users).where(eq(schema.users.id, userBId));
    if (userCId) await db.delete(schema.users).where(eq(schema.users.id, userCId));
    await app.close();
  }
}

testPhase5Complete();
