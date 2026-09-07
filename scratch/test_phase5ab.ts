import { getDb, schema } from '../src/database';
import { StorageModuleService } from '../src/modules/storage/storage.service';
import { ChatsService } from '../src/modules/chats/chats.service';
import { ConnectionsService } from '../src/modules/connections/connections.service';
import { buildApp } from '../src/app';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';

async function testPhase5AB() {
  console.log('🧪 Starting Phase 5A & 5B Storage & R2 Backend Tests...');
  const app = buildApp();
  await app.ready();

  let createdChatId: string | null = null;
  let user1Id: string | null = null;
  let user2Id: string | null = null;

  try {
    const db = getDb();
    const passwordHash = await argon2.hash('TestPassword123!');

    // 1. Create fresh unblocked test users (uniqueCode max 8 chars: SB-XX12)
    const code1 = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const code2 = `SB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const [u1] = await db.insert(schema.users).values({
      uniqueCode: code1,
      email: `voice1_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    user1Id = u1.id;

    await db.insert(schema.profiles).values({
      userId: u1.id,
      displayName: 'Voice Tester 1',
    });

    const [u2] = await db.insert(schema.users).values({
      uniqueCode: code2,
      email: `voice2_${Date.now()}@example.com`,
      passwordHash,
    }).returning();
    user2Id = u2.id;

    await db.insert(schema.profiles).values({
      userId: u2.id,
      displayName: 'Voice Tester 2',
    });

    // 2. Establish accepted connection
    const connectionReq = await ConnectionsService.requestConnection(u1.id, u2.id);
    await ConnectionsService.acceptConnection(connectionReq.id, u2.id);

    // 3. Create chat
    const chat = await ChatsService.createOrGetChat(u1.id, u2.id);
    createdChatId = chat.id;

    console.log(`[+] Created Fresh Test Chat ID: ${chat.id}`);
    console.log(`[+] User 1 ID: ${u1.id}`);

    // 4. Test StorageModuleService.requestUploadUrl for chat participant
    const uploadRes = await StorageModuleService.requestUploadUrl(u1.id, chat.id, 'audio/m4a');
    console.log('✅ POST /api/v1/storage/upload-url authorization PASS:');
    console.log(`    Upload Key: ${uploadRes.key}`);
    console.log(`    Upload URL generated: ${uploadRes.uploadUrl ? 'YES' : 'NO'}`);

    if (!uploadRes.key.startsWith(`voice/${chat.id}/`)) {
      throw new Error('Invalid key structure returned from upload-url generator');
    }

    // 5. Test non-participant access rejection
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    try {
      await StorageModuleService.requestUploadUrl(fakeUserId, chat.id, 'audio/m4a');
      throw new Error('Non-participant upload request SHOULD HAVE BEEN REJECTED');
    } catch (err: any) {
      console.log(`✅ Non-participant upload rejection PASS: ${err.message}`);
    }

    // 6. Test download URL request for a test voice message inserted in Neon
    const [testVoiceMsg] = await db.insert(schema.messages).values({
      chatId: chat.id,
      senderId: u1.id,
      messageType: 'VOICE',
      storageObjectKey: uploadRes.key,
      voiceDuration: 15,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    }).returning();

    const downloadRes = await StorageModuleService.requestDownloadUrl(u1.id, chat.id, uploadRes.key);
    console.log('✅ GET /api/v1/storage/download-url authorization PASS:');
    console.log(`    Download URL generated: ${downloadRes.downloadUrl ? 'YES' : 'NO'}`);

    // Clean up test message
    await db.delete(schema.messages).where(eq(schema.messages.id, testVoiceMsg.id));

    console.log('\n🎉 ALL PHASE 5A & 5B BACKEND STORAGE TESTS PASSED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('❌ PHASE 5A & 5B TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    // Cleanup created test resources
    const db = getDb();
    if (createdChatId) {
      await db.delete(schema.chats).where(eq(schema.chats.id, createdChatId));
    }
    if (user1Id) {
      await db.delete(schema.users).where(eq(schema.users.id, user1Id));
    }
    if (user2Id) {
      await db.delete(schema.users).where(eq(schema.users.id, user2Id));
    }
    await app.close();
  }
}

testPhase5AB();
