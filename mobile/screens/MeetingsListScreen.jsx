// src/screens/MeetingsListScreen.jsx (Supabase)
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { supabaseService } from "../services/supabaseService";
import { useAuth } from "../context/AuthContext";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

export default function MeetingsListScreen({ navigation }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      loadMeetings();
    }
  }, [user]);

  // Add focus listener to reload meetings when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user?.id) {
        loadMeetings();
      }
    });
    return unsubscribe;
  }, [navigation, user]);

  async function loadMeetings() {
    try {
      const data = await supabaseService.getUserMeetings(user.id);
      setMeetings(data);
    } catch (error) {
      console.error("Error loading meetings:", error);
      Alert.alert("Error", "Failed to load recordings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadMeetings();
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return 'N/A';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function getStatusColor(status) {
    const colors = {
      completed: 'text-green-500',
      processing: 'text-yellow-500',
      pending: 'text-blue-500',
      failed: 'text-red-500',
    };
    return colors[status] || 'text-gray-500';
  }

  function renderMeeting({ item }) {
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate("MeetingDetail", { 
          meeting: item,
          meetingId: item.id 
        })}
        className="bg-gray-800 p-4 rounded-lg mb-3"
      >
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1">
            <Text className="text-white text-lg font-semibold" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="text-gray-400 text-sm mt-1">
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
          <MaterialIcons 
            name={item.audio_source === 'mobile' ? 'phone-android' : 'computer'} 
            size={20} 
            color="#9CA3AF" 
          />
        </View>

        <View className="flex-row items-center justify-between mt-2">
          <Text className={`text-sm font-semibold ${getStatusColor(item.status)}`}>
            {item.status?.toUpperCase()}
          </Text>
          
          {item.participants && item.participants.length > 0 && (
            <View className="flex-row items-center">
              <MaterialIcons name="people" size={16} color="#9CA3AF" />
              <Text className="text-gray-400 text-xs ml-1">
                {item.participants.length} participant{item.participants.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {item.action_items && item.action_items.length > 0 && (
          <View className="mt-2 pt-2 border-t border-gray-700">
            <View className="flex-row items-center">
              <MaterialIcons name="assignment" size={14} color="#9CA3AF" />
              <Text className="text-gray-400 text-xs ml-1">
                {item.action_items.length} action item{item.action_items.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-black">
        <ActivityIndicator size="large" color="#DC2626" />
        <Text className="text-gray-400 mt-4">Loading recordings...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <View className="px-6 pt-8 pb-4">
        <Text className="text-white text-3xl font-bold">My Recordings</Text>
        <Text className="text-gray-400 text-sm mt-1">
          {meetings.length} recording{meetings.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={meetings}
        renderItem={renderMeeting}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#DC2626"
          />
        }
        ListEmptyComponent={
          <View className="items-center mt-20">
            <MaterialIcons name="mic-off" size={64} color="#666" />
            <Text className="text-gray-400 text-center text-lg mt-4">
              No recordings yet
            </Text>
            <Text className="text-gray-500 text-center text-sm mt-2">
              Start recording to see your meetings here
            </Text>
          </View>
        }
      />
    </View>
  );
}