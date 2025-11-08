import React from 'react';
import {TouchableOpacity} from 'react-native';
import {createStackNavigator} from '@react-navigation/stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Screens
import RecorderScreen from '../screens/RecorderScreen';
import TranscriptScreen from '../screens/TranscriptScreen';
import SummaryScreen from '../screens/SummaryScreen';
import ExportScreen from '../screens/ExportScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {PrivacyScreen} from '../screens/PrivacyScreen';
import {TermsScreen} from '../screens/TermsScreen';
import {DataUsageScreen} from '../screens/DataUsageScreen';
import {LLMSettingsScreen} from '../screens/LLMSettingsScreen';

export type RootStackParamList = {
  Home: undefined;
  Transcript: {recordingId: string};
  Summary: {recordingId: string};
  Export: {recordingId: string};
  Settings: undefined;
  Privacy: undefined;
  Terms: undefined;
  DataUsage: undefined;
  LLMSettings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const AppNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: {
          backgroundColor: '#6366f1',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}>
      <Stack.Screen
        name="Home"
        component={RecorderScreen}
        options={({navigation}) => ({
          title: 'Recaply - Record Meeting',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              style={{marginRight: 15}}>
              <Icon name="settings" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="Transcript"
        component={TranscriptScreen}
        options={{title: 'Transcript'}}
      />
      <Stack.Screen name="Summary" component={SummaryScreen} options={{title: 'Summary'}} />
      <Stack.Screen name="Export" component={ExportScreen} options={{title: 'Export & Share'}} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{title: 'Settings'}} />
      <Stack.Screen name="LLMSettings" component={LLMSettingsScreen} options={{title: 'LLM Configuration'}} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{title: 'Privacy Policy'}} />
      <Stack.Screen name="Terms" component={TermsScreen} options={{title: 'Terms of Service'}} />
      <Stack.Screen name="DataUsage" component={DataUsageScreen} options={{title: 'Data Usage'}} />
    </Stack.Navigator>
  );
};

export default AppNavigator;
