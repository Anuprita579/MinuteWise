// src/screens/ParticipantSetupScreen.jsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ParticipantInput from '../components/ParticipantInput';
import ParticipantList from '../components/ParticipantList';
import { participantService } from '../services/participantService';

export default function ParticipantSetupScreen({ navigation }) {
  const [participants, setParticipants] = useState([]);
  const [meetingTitle, setMeetingTitle] = useState('');

  useEffect(() => {
    loadSavedParticipants();
  }, []);

  async function loadSavedParticipants() {
    try {
      const saved = await participantService.getParticipants();
      if (saved.length > 0) {
        setParticipants(saved);
      }
    } catch (error) {
      console.error('Error loading participants:', error);
    }
  }

  const handleAddParticipant = async (participant) => {
    // Check for duplicate emails
    const duplicate = participants.find(
      (p) => p.email.toLowerCase() === participant.email.toLowerCase()
    );

    if (duplicate) {
      Alert.alert('Duplicate', 'This email is already added');
      return;
    }

    const updated = [...participants, participant];
    setParticipants(updated);
    
    // Save to storage
    try {
      await participantService.saveParticipants(updated);
    } catch (error) {
      console.error('Error saving participants:', error);
    }
  };

  const handleRemoveParticipant = async (id) => {
    const updated = participants.filter((p) => p.id !== id);
    setParticipants(updated);
    
    try {
      await participantService.saveParticipants(updated);
    } catch (error) {
      console.error('Error saving participants:', error);
    }
  };

  const handleStartRecording = () => {
    if (participants.length === 0) {
      Alert.alert(
        'No Participants',
        'Please add at least one participant before starting the meeting.'
      );
      return;
    }

    Alert.alert(
      'Start Recording',
      `Start meeting with ${participants.length} participant(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: () => {
            navigation.navigate('Record', {
              participants,
              meetingTitle: meetingTitle || `Meeting ${new Date().toLocaleDateString()}`,
            });
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All',
      'Remove all participants?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setParticipants([]);
            await participantService.clearParticipants();
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-black"
    >
      <ScrollView className="flex-1 px-6 pt-8">
        {/* Header */}
        <View className="mb-6">
          <Text className="text-white text-3xl font-bold mb-2">
            Meeting Setup
          </Text>
          <Text className="text-gray-400">
            Add participants before starting the recording
          </Text>
        </View>

        {/* Meeting Title */}
        <View className="bg-gray-800 rounded-lg p-4 mb-4">
          <Text className="text-gray-400 text-sm mb-2">
            Meeting Title (Optional)
          </Text>
          <Text className="text-white text-base">
            {meetingTitle || `Meeting ${new Date().toLocaleDateString()}`}
          </Text>
        </View>

        {/* Add Participant Form */}
        <ParticipantInput onAdd={handleAddParticipant} />

        {/* Participant List */}
        <ParticipantList
          participants={participants}
          onRemove={handleRemoveParticipant}
        />

        {/* Action Buttons */}
        <View className="mt-6 mb-8">
          {participants.length > 0 && (
            <TouchableOpacity
              className="bg-gray-700 py-3 rounded-lg mb-3 flex-row items-center justify-center"
              onPress={handleClearAll}
            >
              <MaterialIcons name="clear-all" size={20} color="white" />
              <Text className="text-white font-semibold ml-2">
                Clear All
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className={`py-4 rounded-lg flex-row items-center justify-center ${
              participants.length > 0 ? 'bg-red-600' : 'bg-gray-700'
            }`}
            onPress={handleStartRecording}
            disabled={participants.length === 0}
          >
            <MaterialIcons name="mic" size={24} color="white" />
            <Text className="text-white text-lg font-semibold ml-2">
              Start Recording
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}