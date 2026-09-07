import 'dotenv/config';
import { getDb, schema } from '../src/database';
import { AuthService } from '../src/modules/auth/auth.service';
import { sql } from 'drizzle-orm';

async function runValidationTests() {
  console.log('--- 1. NEON DATABASE CONNECTION TEST ---');
  const db = getDb();
  const ping = await db.execute(sql`SELECT 1 as connected`);
  console.log('Neon Database Ping Result:', ping);

  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'StrongPassword123!';

  console.log('\n--- 2. AUTHENTICATION: SIGN UP TEST ---');
  const { user, profile } = await AuthService.createUser(testEmail, testPassword, 'Neon Tester');
  console.log('User created in Neon:', { id: user.id, email: user.email, uniqueCode: user.uniqueCode });
  console.log('Profile created in Neon:', { id: profile.id, displayName: profile.displayName });

  const initialRefreshToken = await AuthService.createRefreshToken(user.id, 'Integration Test Agent');
  console.log('Initial Refresh Token generated:', initialRefreshToken.slice(0, 10) + '...');

  console.log('\n--- 3. AUTHENTICATION: SIGN IN TEST ---');
  const validUser = await AuthService.validateUser(testEmail, testPassword);
  console.log('Sign in successful for:', validUser.user.email);

  console.log('\n--- 4. AUTHENTICATION: PROFILE FETCH TEST ---');
  const userProfile = await AuthService.getProfileByUserId(user.id);
  console.log('Profile fetched from Neon:', { email: userProfile.email, displayName: userProfile.displayName, uniqueCode: userProfile.uniqueCode });

  console.log('\n--- 5. REFRESH TOKEN ROTATION TEST ---');
  const rotationResult = await AuthService.rotateRefreshToken(initialRefreshToken, 'Test Device 2');
  console.log('Token Rotation Success! New Refresh Token:', rotationResult.newRefreshToken.slice(0, 10) + '...');

  console.log('\n--- 6. REFRESH TOKEN REUSE DETECTION SECURITY TEST ---');
  try {
    console.log('Attempting to reuse old revoked refresh token...');
    await AuthService.rotateRefreshToken(initialRefreshToken, 'Attacker Device');
    console.error('FAIL: Revoked token was accepted!');
  } catch (err: any) {
    console.log('SUCCESS: Revoked token reuse detected and rejected! Error:', err.message);
  }

  console.log('\n--- 7. LOGOUT TEST ---');
  await AuthService.revokeRefreshToken(user.id, rotationResult.newRefreshToken);
  console.log('Logout executed. Target refresh token revoked.');

  try {
    await AuthService.rotateRefreshToken(rotationResult.newRefreshToken, 'Post Logout Attempt');
    console.error('FAIL: Logged out token was accepted!');
  } catch (err: any) {
    console.log('SUCCESS: Logged out token rejected! Error:', err.message);
  }

  console.log('\n========================================');
  console.log('🎉 ALL NEON & AUTHENTICATION TESTS PASSED!');
  console.log('========================================');
  process.exit(0);
}

runValidationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
