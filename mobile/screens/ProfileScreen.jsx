import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();

  function handleLogout() {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  }

  return (
    <View className="flex-1 bg-black px-6 pt-8">
      <Text className="text-white text-3xl font-bold mb-8">Profile</Text>

      <View className="bg-gray-800 rounded-lg p-6 mb-6">
        <View className="mb-4">
          <Text className="text-gray-400 text-sm mb-1">Name</Text>
          <Text className="text-white text-lg">{user?.name || 'User'}</Text>
        </View>

        <View className="mb-4">
          <Text className="text-gray-400 text-sm mb-1">Email</Text>
          <Text className="text-white text-lg">{user?.email || 'N/A'}</Text>
        </View>

        <View>
          <Text className="text-gray-400 text-sm mb-1">User ID</Text>
          <Text className="text-white text-xs font-mono">{user?.id || 'N/A'}</Text>
        </View>
      </View>

      <TouchableOpacity
        className="bg-red-600 py-4 rounded-lg"
        onPress={handleLogout}
      >
        <Text className="text-white text-center text-lg font-semibold">
          Logout
        </Text>
      </TouchableOpacity>

    </View>
  );
}