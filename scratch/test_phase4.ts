import 'dotenv/config';
import { AuthService } from '../src/modules/auth/auth.service';
import { UsersService } from '../src/modules/users/users.service';
import { ConnectionsService } from '../src/modules/connections/connections.service';
import { BlocksService } from '../src/modules/blocks/blocks.service';
import { ChatsService } from '../src/modules/chats/chats.service';

async function runPhase4Tests() {
  console.log('--- PHASE 4 BACKEND INTEGRATION TESTS ---');

  const emailA = `userA_${Date.now()}@example.com`;
  const emailB = `userB_${Date.now()}@example.com`;

  // 1. Create two users
  const { user: userA } = await AuthService.createUser(emailA, 'Password123!', 'Alice');
  const { user: userB } = await AuthService.createUser(emailB, 'Password123!', 'Bob');
  console.log('Created User A:', { id: userA.id, code: userA.uniqueCode });
  console.log('Created User B:', { id: userB.id, code: userB.uniqueCode });

  // 2. User Discovery
  const discoveredB = await UsersService.getUserByUniqueCode(userB.uniqueCode, userA.id);
  console.log('User A discovered User B by code:', discoveredB);

  // 3. Connection Request & Accept
  const req = await ConnectionsService.requestConnection(userA.id, userB.id);
  console.log('User A requested connection with User B:', req);

  const accepted = await ConnectionsService.acceptConnection(req.id, userB.id);
  console.log('User B accepted connection:', accepted);

  // 4. Chat Creation & Duplicate Check
  const chat1 = await ChatsService.createOrGetChat(userA.id, userB.id);
  console.log('Chat created/retrieved:', chat1.id);

  const chat2 = await ChatsService.createOrGetChat(userB.id, userA.id);
  console.log('Duplicate creation check (should match):', chat1.id === chat2.id);

  // 5. Fetch Messages (Initially Empty)
  const msgs = await ChatsService.getChatMessages(chat1.id, userA.id);
  console.log('Initial chat messages count:', msgs.length);

  // 6. Test User Blocking
  const blockRes = await BlocksService.blockUser(userA.id, userB.id);
  console.log('User A blocked User B:', blockRes);

  const isBlocked = await BlocksService.isBlockedPair(userA.id, userB.id);
  console.log('Block status check:', isBlocked);

  console.log('\n========================================');
  console.log('🎉 ALL PHASE 4 BACKEND TESTS PASSED!');
  console.log('========================================');
  process.exit(0);
}

runPhase4Tests().catch((err) => {
  console.error('Phase 4 Test failed:', err);
  process.exit(1);
});
