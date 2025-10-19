// src/components/ParticipantInput.jsx
import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { participantService } from '../services/participantService';

export default function ParticipantInput({ onAdd }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailDomain, setEmailDomain] = useState('@ves.ac.in');

  const handleAdd = () => {
    const fullEmail = email.includes('@') ? email : `${email}${emailDomain}`;
    
    const participant = {
      id: Date.now().toString(),
      name: name.trim(),
      email: fullEmail.trim(),
    };

    const validation = participantService.validateParticipant(participant);
    
    if (!validation.valid) {
      Alert.alert('Validation Error', validation.error);
      return;
    }

    onAdd(participant);
    setName('');
    setEmail('');
  };

  return (
    <View className="bg-gray-800 rounded-lg p-4 mb-4">
      <Text className="text-white text-lg font-semibold mb-3">
        Add Participant
      </Text>

      {/* Name Input */}
      <View className="mb-3">
        <Text className="text-gray-400 text-sm mb-1">Name *</Text>
        <TextInput
          className="bg-gray-700 text-white px-4 py-3 rounded-lg"
          placeholder="Enter participant name"
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      </View>

      {/* Email Input */}
      <View className="mb-3">
        <Text className="text-gray-400 text-sm mb-1">Email *</Text>
        <View className="flex-row items-center">
          <TextInput
            className="bg-gray-700 text-white px-4 py-3 rounded-lg flex-1"
            placeholder="john.doe or full email"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        
        {!email.includes('@') && (
          <View className="mt-2">
            <Text className="text-gray-400 text-xs mb-1">Domain</Text>
            <TextInput
              className="bg-gray-700 text-white px-4 py-2 rounded-lg"
              placeholder="@ves.ac.in"
              placeholderTextColor="#666"
              value={emailDomain}
              onChangeText={setEmailDomain}
              autoCapitalize="none"
            />
          </View>
        )}
        
        <Text className="text-gray-500 text-xs mt-1">
          {email.includes('@') 
            ? 'Full email detected' 
            : `Will use: ${email}${emailDomain}`}
        </Text>
      </View>

      {/* Add Button */}
      <TouchableOpacity
        className="bg-red-600 py-3 rounded-lg flex-row items-center justify-center"
        onPress={handleAdd}
        disabled={!name.trim() || !email.trim()}
      >
        <MaterialIcons name="person-add" size={20} color="white" />
        <Text className="text-white font-semibold ml-2">Add Participant</Text>
      </TouchableOpacity>
    </View>
  );
}