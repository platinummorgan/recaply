import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Use service key for admin operations
);

async function createTestAccount() {
  console.log('Creating test account for Google Play reviewers...\n');

  const testEmail = 'support@platovalabs.com';
  const testPassword = 'ABC123';

  try {
    // 1. Create auth user
    console.log('Step 1: Creating auth user...');
    let { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    });

    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
        console.log('✓ User already exists, retrieving and updating...');
        // Get existing user by email
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) throw listError;
        
        const existingUser = users.find(u => u.email === testEmail);
        
        if (!existingUser) {
          throw new Error('User exists but could not be found');
        }
        
        console.log(`✓ Found existing user: ${existingUser.id}`);
        
        // Update password
        const { error: updateAuthError } = await supabase.auth.admin.updateUserById(existingUser.id, {
          password: testPassword,
          email_confirm: true
        });
        
        if (updateAuthError) throw updateAuthError;
        console.log('✓ Updated password');
        
        // Update database record
        const { error: updateError } = await supabase
          .from('users')
          .upsert({
            id: existingUser.id,
            email: testEmail,
            password_hash: 'managed_by_supabase_auth', // Placeholder since auth is handled by Supabase Auth
            subscription_tier: 'pro',
            minutes_limit: 999999,
            minutes_used: 0
          }, { onConflict: 'id' });

        if (updateError) throw updateError;
        console.log('✓ Updated user to Pro tier');
        
        // Set user ID for recording creation
        authData = { user: existingUser } as any;
      } else {
        throw authError;
      }
    } else {
      console.log(`✓ Auth user created: ${authData.user!.id}`);

      // 2. Create/update user in public.users table
      console.log('\nStep 2: Creating user profile...');
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user!.id,
          email: testEmail,
          password_hash: 'managed_by_supabase_auth', // Placeholder since auth is handled by Supabase Auth
          subscription_tier: 'pro',
          minutes_limit: 999999,
          minutes_used: 0
        });

      if (profileError) {
        if (profileError.code === '23505') { // Duplicate key
          console.log('✓ Profile already exists');
        } else {
          throw profileError;
        }
      } else {
        console.log('✓ User profile created');
      }
    }

    // 3. Add sample recordings
    console.log('\nStep 3: Adding sample recordings...');
    
    // Get the user ID
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users.users.find(u => u.email === testEmail);
    
    if (!user) {
      throw new Error('User not found after creation');
    }

    const sampleRecordings = [
      {
        user_id: user.id,
        filename: 'sample-meeting-notes.m4a',
        transcription: 'This is a sample transcription of a team meeting. We discussed the upcoming product launch, marketing strategies, and assigned tasks to team members. The deadline for the launch is next month, and everyone agreed to complete their assignments by the end of this week.',
        summary: 'Team meeting discussing product launch. Key points: upcoming launch next month, marketing strategies reviewed, tasks assigned with end-of-week deadline.',
        file_size: 524288,
        audio_url: 'sample-placeholder'
      },
      {
        user_id: user.id,
        filename: 'sample-lecture.m4a',
        transcription: 'Introduction to machine learning. Machine learning is a subset of artificial intelligence that enables computers to learn from data without being explicitly programmed. There are three main types: supervised learning, unsupervised learning, and reinforcement learning.',
        summary: 'Lecture on machine learning basics. Covers definition as AI subset, learning from data, and three main types: supervised, unsupervised, and reinforcement learning.',
        file_size: 786432,
        audio_url: 'sample-placeholder'
      }
    ];

    // Delete existing sample recordings
    await supabase
      .from('recordings')
      .delete()
      .eq('user_id', user.id);

    // Insert new samples
    const { error: recordingsError } = await supabase
      .from('recordings')
      .insert(sampleRecordings);

    if (recordingsError) {
      console.log('⚠ Warning: Could not add sample recordings:', recordingsError.message);
    } else {
      console.log('✓ Added sample recordings');
    }

    console.log('\n✅ TEST ACCOUNT CREATED SUCCESSFULLY!\n');
    console.log('═══════════════════════════════════════');
    console.log('Google Play Review Credentials:');
    console.log('═══════════════════════════════════════');
    console.log(`Email:    ${testEmail}`);
    console.log(`Password: ${testPassword}`);
    console.log('Tier:     Pro (Unlimited)');
    console.log('Sample recordings: 2');
    console.log('═══════════════════════════════════════\n');

  } catch (error: any) {
    console.error('❌ Error creating test account:', error.message);
    process.exit(1);
  }
}

createTestAccount();
