import { supabase } from '../src/services/supabase';
import bcrypt from 'bcryptjs';
import '../src/config/env';

async function createDemoUser() {
  try {
    const email = 'apple.review@recaply.app';
    const password = 'Test1234!';
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (existingUser) {
      console.log('User already exists, updating to premium...');
      
      const { error: updateError } = await supabase
        .from('users')
        .update({
          subscription_tier: 'pro',
          minutes_limit: 999999,
          minutes_used: 0,
        })
        .eq('email', email);
      
      if (updateError) {
        console.error('Error updating user:', updateError);
        throw updateError;
      }
      
      console.log('✅ Demo user updated to premium!');
      console.log('Email:', email);
      console.log('Password:', password);
      return;
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user with premium subscription
    const { data, error } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        subscription_tier: 'pro',
        minutes_used: 0,
        minutes_limit: 999999, // Unlimited for demo
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating user:', error);
      throw error;
    }
    
    console.log('✅ Demo user created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Subscription:', data.subscription_tier);
    console.log('Minutes Limit:', data.minutes_limit);
    
  } catch (error) {
    console.error('Failed to create demo user:', error);
    process.exit(1);
  }
}

createDemoUser();
