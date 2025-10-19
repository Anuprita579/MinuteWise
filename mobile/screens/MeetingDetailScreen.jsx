import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Audio } from "expo-av";
import Slider from "@react-native-community/slider";
import { supabaseService } from "../services/supabaseService";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { useAuth } from "../context/AuthContext";

export default function MeetingDetailScreen({ route, navigation }) {
  const { meeting: routeMeeting, meetingId } = route.params;
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [meeting, setMeeting] = useState(routeMeeting);
  const { user } = useAuth();

  // Audio playback state
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  useEffect(() => {
    configureAudio();

    if (!meeting && meetingId) {
      loadMeetingDetails();
    }

    return () => {
      if (sound) {
        console.log('🧹 Cleaning up audio...');
        sound.unloadAsync();
      }
    };
  }, []);

  async function configureAudio() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
    } catch (error) {
      console.error("Error configuring audio:", error);
    }
  }

  async function loadMeetingDetails() {
    try {
      setLoading(true);
      const data = await supabaseService.getMeetingById(meetingId);
      setMeeting(data);
    } catch (error) {
      console.error("Error loading meeting:", error);
      Alert.alert("Error", "Failed to load meeting details");
    } finally {
      setLoading(false);
    }
  }

  async function getSignedAudioUrl() {
    try {
      if (!meeting.audio_file_path) {
        throw new Error("No audio file path found");
      }

      console.log('🔐 Getting signed URL for:', meeting.audio_file_path);

      // Get a signed URL that's valid for 1 hour
      const { data, error } = await supabaseService.supabase.storage
        .from('recordings')
        .createSignedUrl(meeting.audio_file_path, 3600); // 1 hour

      if (error) {
        console.error('Signed URL error:', error);
        throw error;
      }

      console.log('✅ Signed URL obtained');
      return data.signedUrl;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      
      // Fallback: Try to use public URL if signed URL fails
      if (meeting.audio_url) {
        console.log('⚠️ Falling back to public URL');
        return meeting.audio_url;
      }
      
      throw error;
    }
  }

  async function loadAudio() {
    try {
      setIsLoadingAudio(true);

      if (!meeting.audio_file_path && !meeting.audio_url) {
        Alert.alert("Error", "No audio file found for this meeting");
        return;
      }

      // Try to get signed URL first, then fallback to public URL
      let audioUrl;
      try {
        audioUrl = await getSignedAudioUrl();
      } catch (signedUrlError) {
        console.warn('Could not get signed URL, using public URL');
        audioUrl = meeting.audio_url;
      }

      if (!audioUrl) {
        throw new Error("Could not get audio URL");
      }

      console.log("🎵 Loading audio from URL:", audioUrl);

      // Unload previous sound if exists
      if (sound) {
        await sound.unloadAsync();
      }

      // Create and load new sound
      const { sound: newSound, status } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      
      if (status.isLoaded) {
        setDuration(status.durationMillis || 0);
        console.log('✅ Audio loaded successfully, duration:', formatTime(status.durationMillis));
      }
    } catch (error) {
      console.error("Error loading audio:", error);
      
      // Provide more helpful error message
      let errorMessage = "Failed to load audio. ";
      if (error.message.includes('400')) {
        errorMessage += "The audio file may not exist or you don't have permission to access it.";
      } else if (error.message.includes('404')) {
        errorMessage += "The audio file was not found.";
      } else {
        errorMessage += error.message;
      }
      
      Alert.alert("Error", errorMessage);
    } finally {
      setIsLoadingAudio(false);
    }
  }

  function onPlaybackStatusUpdate(status) {
    if (status.isLoaded) {
      setDuration(status.durationMillis || 0);
      setPosition(status.positionMillis || 0);
      setIsPlaying(status.isPlaying);

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    } else if (status.error) {
      console.error('Playback error:', status.error);
      Alert.alert('Playback Error', 'Failed to play audio');
    }
  }

  async function handlePlayPause() {
    try {
      if (!sound) {
        await loadAudio();
        // After loading, automatically play
        setTimeout(async () => {
          if (sound) {
            await sound.playAsync();
          }
        }, 100);
        return;
      }

      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch (error) {
      console.error("Error playing/pausing audio:", error);
      Alert.alert("Error", "Failed to play audio");
    }
  }

  async function handleSeek(value) {
    if (sound) {
      try {
        await sound.setPositionAsync(value);
      } catch (error) {
        console.error("Error seeking:", error);
      }
    }
  }

  function formatTime(millis) {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadMeetingDetails();
    setRefreshing(false);
  }

  async function handleDelete() {
    Alert.alert(
      "Delete Recording",
      "Are you sure you want to delete this recording? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Stop and unload sound before deleting
              if (sound) {
                await sound.stopAsync();
                await sound.unloadAsync();
                setSound(null);
              }
              
              // Delete from Supabase
              await supabaseService.deleteMeeting(meeting.id);
              
              Alert.alert("Success", "Recording deleted successfully");
              navigation.goBack();
            } catch (error) {
              console.error("Error deleting recording:", error);
              Alert.alert("Error", error.message || "Failed to delete recording");
            }
          },
        },
      ]
    );
  }

  // Test audio URL accessibility
  async function testAudioUrl() {
    try {
      const url = await getSignedAudioUrl();
      console.log('🧪 Testing audio URL:', url);
      
      const response = await fetch(url, { method: 'HEAD' });
      console.log('🧪 Response status:', response.status);
      console.log('🧪 Response headers:', response.headers);
      
      if (response.status === 200) {
        Alert.alert('Success', 'Audio file is accessible!');
      } else {
        Alert.alert('Error', `Audio file returned status: ${response.status}`);
      }
    } catch (error) {
      console.error('Test failed:', error);
      Alert.alert('Error', `Test failed: ${error.message}`);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-black">
        <ActivityIndicator size="large" color="#DC2626" />
        <Text className="text-gray-400 mt-4">Loading details...</Text>
      </View>
    );
  }

  if (!meeting) {
    return (
      <View className="flex-1 justify-center items-center bg-black">
        <MaterialIcons name="error-outline" size={64} color="#666" />
        <Text className="text-gray-400 mt-4">Meeting not found</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="bg-red-600 px-6 py-3 rounded-lg mt-6"
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-black"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#DC2626"
        />
      }
    >
      <View className="p-6">
        {/* Header */}
        <View className="mb-6">
          <Text className="text-white text-2xl font-bold mb-2">
            {meeting?.title}
          </Text>
          <Text className="text-gray-400 text-sm">
            {new Date(meeting?.created_at).toLocaleString()}
          </Text>
          {meeting?.audio_source && (
            <View className="flex-row items-center mt-2">
              <MaterialIcons 
                name={meeting.audio_source === 'mobile' ? 'phone-android' : 'computer'} 
                size={16} 
                color="#9CA3AF" 
              />
              <Text className="text-gray-400 text-xs ml-2">
                Source: {meeting.audio_source === 'mobile' ? 'Mobile App' : 'Web Upload'}
              </Text>
            </View>
          )}
        </View>

        {/* Audio Player */}
        {(meeting.audio_url || meeting.audio_file_path) && (
          <View className="bg-gray-800 rounded-lg p-5 mb-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-lg font-semibold">
                Audio Recording
              </Text>
            </View>

            {/* Play/Pause Button */}
            <View className="items-center mb-4">
              <TouchableOpacity
                onPress={handlePlayPause}
                disabled={isLoadingAudio}
                className="bg-red-600 w-16 h-16 rounded-full items-center justify-center"
              >
                {isLoadingAudio ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <MaterialIcons
                    name={isPlaying ? "pause" : "play-arrow"}
                    size={36}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>
            </View>

            {/* Progress Slider */}
            {sound && (
              <View>
                <Slider
                  style={{ width: "100%", height: 40 }}
                  minimumValue={0}
                  maximumValue={duration}
                  value={position}
                  onSlidingComplete={handleSeek}
                  minimumTrackTintColor="#DC2626"
                  maximumTrackTintColor="#374151"
                  thumbTintColor="#DC2626"
                />
                <View className="flex-row justify-between">
                  <Text className="text-gray-400 text-xs">
                    {formatTime(position)}
                  </Text>
                  <Text className="text-gray-400 text-xs">
                    {formatTime(duration)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Participants Section */}
        {meeting?.participants && meeting.participants.length > 0 && (
          <View className="bg-gray-800 rounded-lg p-5 mb-6">
            <Text className="text-white text-lg font-semibold mb-3">
              Participants ({meeting.participants.length})
            </Text>
            <View className="space-y-2">
              {meeting.participants.map((participant, idx) => (
                <View 
                  key={idx} 
                  className="flex-row items-center py-2 border-b border-gray-700"
                >
                  <MaterialIcons name="person" size={20} color="#9CA3AF" />
                  <View className="flex-1 ml-3">
                    <Text className="text-white font-medium">
                      {participant.name}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-1">
                      {participant.email}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* File Info */}
        <View className="bg-gray-800 rounded-lg p-5 mb-6">
          <Text className="text-white text-lg font-semibold mb-3">
            Meeting Information
          </Text>
          <View className="space-y-2">
            <View className="flex-row justify-between py-2 border-b border-gray-700">
              <Text className="text-gray-400">Status</Text>
              <Text className={`font-semibold ${
                meeting?.status === 'completed' ? 'text-green-500' : 
                meeting?.status === 'processing' ? 'text-yellow-500' : 
                'text-gray-400'
              }`}>
                {meeting?.status?.toUpperCase()}
              </Text>
            </View>
            {meeting?.audio_file_path && (
              <View className="flex-row justify-between py-2 border-b border-gray-700">
                <Text className="text-gray-400">File Path</Text>
                <Text className="text-white text-xs" numberOfLines={1}>
                  {meeting.audio_file_path.split('/').pop()}
                </Text>
              </View>
            )}
            {meeting?.transcript && (
              <View className="flex-row justify-between py-2 border-b border-gray-700">
                <Text className="text-gray-400">Transcript</Text>
                <Text className="text-white">
                  {meeting.transcript.length} characters
                </Text>
              </View>
            )}
            {meeting?.action_items && (
              <View className="flex-row justify-between py-2">
                <Text className="text-gray-400">Action Items</Text>
                <Text className="text-white">
                  {meeting.action_items.length} items
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Delete Button */}
        <TouchableOpacity
          onPress={handleDelete}
          className="bg-red-600 rounded-lg p-4 items-center"
        >
          <Text className="text-white font-semibold text-lg">
            Delete Recording
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}