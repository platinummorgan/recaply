import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import RecordScreen from './src/screens/RecordScreen';
import TranscriptScreen from './src/screens/TranscriptScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import { startQueueMonitoring } from './src/services/uploadQueue';

const Stack = createStackNavigator();

function AppNavigator() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Start monitoring network and processing upload queue
    const unsubscribe = startQueueMonitoring();
    return unsubscribe;
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user ? (
          // Authenticated screens
          <>
            <Stack.Screen 
              name="Home" 
              component={HomeScreen}
              options={{ title: 'Recaply' }}
            />
            <Stack.Screen 
              name="Record" 
              component={RecordScreen}
              options={{ title: 'Record' }}
            />
            <Stack.Screen 
              name="Transcript" 
              component={TranscriptScreen}
              options={{ title: 'Transcript' }}
            />
            <Stack.Screen 
              name="Settings" 
              component={SettingsScreen}
              options={{ title: 'Settings' }}
            />
            <Stack.Screen 
              name="Subscription" 
              component={SubscriptionScreen}
              options={{ title: 'Subscription' }}
            />
          </>
        ) : (
          // Authentication screens
          <>
            <Stack.Screen 
              name="Login" 
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="Register" 
              component={RegisterScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
