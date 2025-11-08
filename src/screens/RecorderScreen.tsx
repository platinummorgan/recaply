import React from 'react';
import {View, Text, StyleSheet, Button} from 'react-native';
import {useNavigation} from '@react-navigation/native';

const RecorderScreen = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recaply</Text>
      <Text style={styles.subtitle}>Meeting Note AI Assistant</Text>
      
      <View style={styles.content}>
        <Text style={styles.info}>Record Screen - Coming Soon</Text>
        <Text style={styles.description}>
          This screen will allow you to record audio and upload files for transcription.
        </Text>
      </View>
      
      <Button title="View Settings" onPress={() => navigation.navigate('Settings' as never)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6366f1',
    marginTop: 40,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default RecorderScreen;
