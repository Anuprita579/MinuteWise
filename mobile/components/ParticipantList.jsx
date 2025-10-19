// src/components/ParticipantList.jsx
import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

export default function ParticipantList({ participants, onRemove, onEdit }) {
  const handleRemove = (participant) => {
    Alert.alert(
      'Remove Participant',
      `Remove ${participant.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemove(participant.id),
        },
      ]
    );
  };

  const renderParticipant = ({ item }) => (
    <View className="bg-gray-700 rounded-lg p-4 mb-2 flex-row items-center justify-between">
      <View className="flex-1">
        <Text className="text-white font-semibold text-base">
          {item.name}
        </Text>
        <Text className="text-gray-400 text-sm mt-1">
          {item.email}
        </Text>
      </View>
      
      <TouchableOpacity
        onPress={() => handleRemove(item)}
        className="bg-red-600 p-2 rounded-lg ml-3"
      >
        <MaterialIcons name="delete" size={20} color="white" />
      </TouchableOpacity>
    </View>
  );

  if (participants.length === 0) {
    return (
      <View className="bg-gray-800 rounded-lg p-8 items-center">
        <MaterialIcons name="people-outline" size={48} color="#666" />
        <Text className="text-gray-400 text-center mt-3">
          No participants added yet
        </Text>
        <Text className="text-gray-500 text-xs text-center mt-1">
          Add at least one participant to continue
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-white text-lg font-semibold">
          Participants ({participants.length})
        </Text>
      </View>
      
      <FlatList
        data={participants}
        renderItem={renderParticipant}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
      />
    </View>
  );
}