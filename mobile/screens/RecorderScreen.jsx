// src/screens/RecorderScreen.jsx (Updated - No Backend URL)
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import useRecorder from "../hooks/useRecorder";
import { supabaseService } from "../services/supabaseService";
import { participantService } from "../services/participantService";
import { useAuth } from "../context/AuthContext";

export default function RecorderScreen({ navigation, route }) {
  const recorder = useRecorder();
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const { user } = useAuth();
  
  // Get participants from navigation params or load from storage
  const [participants, setParticipants] = useState(
    route.params?.participants || []
  );
  const [meetingTitle, setMeetingTitle] = useState(
    route.params?.meetingTitle || `Meeting ${new Date().toLocaleDateString()}`
  );

  useEffect(() => {
    // If no participants passed, redirect to setup
    if (participants.length === 0) {
      navigation.replace('ParticipantSetup');
    }
  }, []);

  async function handleStart() {
    try {
      if (recorder.permissionStatus !== "granted") {
        const granted = await recorder.requestPermissions();
        if (!granted) {
          Alert.alert(
            "Permission Required",
            "Microphone access is required to record audio.",
            [{ text: "OK" }]
          );
          return;
        }
      }

      await recorder.startRecording();
      console.log("Recording started successfully");
    } catch (e) {
      console.error("Start recording error:", e);
      Alert.alert("Recording Error", e.message || "Failed to start recording");
    }
  }

  async function handleStop() {
    try {
      const uri = await recorder.stopRecording();
      if (!uri) {
        Alert.alert("Error", "No recording found");
        return;
      }

      if (!user?.id) {
        Alert.alert("Error", "User not authenticated");
        return;
      }

      setLoading(true);
      setUploadProgress("Preparing audio file...");

      console.log("Recording URI:", uri);

      // Upload and create meeting with participants (all in Supabase)
      setUploadProgress("Uploading to cloud...");
      
      const result = await supabaseService.createMeetingWithParticipants(
        uri,
        meetingTitle,
        participants,
        user.id
      );

      console.log("Meeting created successfully:", result.id);

      // Clean up local file
      try {
        const { File } = require('expo-file-system');
        const localFile = new File(uri);
        const exists = typeof localFile.exists === 'function' 
          ? await localFile.exists() 
          : localFile.exists;
        
        if (exists) {
          await localFile.delete();
          console.log("Local file deleted");
        }
      } catch (deleteError) {
        console.warn("Could not delete local file:", deleteError.message);
      }

      setLoading(false);
      setUploadProgress("");

      // Clear participants after successful upload
      await participantService.clearParticipants();

      Alert.alert(
        "Success!",
        `Meeting recorded successfully!\n\nParticipants: ${participants.length}\n\nProcessing will begin shortly. You'll be notified when transcription is complete.`,
        [
          {
            text: "View Recordings",
            onPress: () => {
              navigation.navigate('RecordingsTab', {
                screen: 'MeetingsList'
              });
            },
          },
          {
            text: "New Meeting",
            onPress: () => {
              navigation.replace('ParticipantSetup');
            },
          },
        ]
      );
    } catch (err) {
      setLoading(false);
      setUploadProgress("");
      console.error("Upload error:", err);

      Alert.alert(
        "Upload Error",
        err.message || "Failed to upload audio. Please try again."
      );
    }
  }

  const formatDuration = (millis) => {
    const seconds = Math.floor(millis / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  if (participants.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-black px-6">
        <MaterialIcons name="people-outline" size={64} color="#666" />
        <Text className="text-gray-400 text-center mt-4">
          No participants configured
        </Text>
        <TouchableOpacity
          className="bg-red-600 px-6 py-3 rounded-lg mt-6"
          onPress={() => navigation.replace('ParticipantSetup')}
        >
          <Text className="text-white font-semibold">Add Participants</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-black">
      <View className="flex-1 justify-center items-center px-6 py-8">
        <Text className="text-red-600 text-2xl font-extrabold mb-2">
          {meetingTitle}
        </Text>
        
        {/* Participants Summary */}
        <View className="bg-gray-800 rounded-lg p-4 mb-6 w-full max-w-md">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-white font-semibold">Participants</Text>
            <Text className="text-gray-400">{participants.length}</Text>
          </View>
          <View className="border-t border-gray-700 pt-2">
            {participants.slice(0, 3).map((p, idx) => (
              <Text key={idx} className="text-gray-400 text-sm py-1">
                • {p.name}
              </Text>
            ))}
            {participants.length > 3 && (
              <Text className="text-gray-500 text-xs mt-1">
                +{participants.length - 3} more
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('ParticipantSetup')}
            className="bg-gray-700 py-2 rounded mt-3"
          >
            <Text className="text-white text-center text-sm">Edit Participants</Text>
          </TouchableOpacity>
        </View>

        {/* Recording Status */}
        {recorder.isRecording && (
          <View className="mb-6 items-center">
            <View className="w-4 h-4 bg-red-600 rounded-full mb-2" 
              style={{ 
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: 10,
              }}
            />
            <Text className="text-white text-lg font-semibold">
              {formatDuration(recorder.durationMillis)}
            </Text>
            <Text className="text-gray-400 text-sm mt-1">Recording...</Text>
          </View>
        )}

        {/* Main Record Button */}
        <TouchableOpacity
          className={`px-10 py-4 rounded-full ${
            recorder.isRecording ? "bg-red-600" : "bg-gray-700"
          } ${loading ? "opacity-50" : ""}`}
          onPress={recorder.isRecording ? handleStop : handleStart}
          disabled={loading}
        >
          <View className="flex-row items-center">
            <MaterialIcons
              name={recorder.isRecording ? "stop" : "mic"}
              size={24}
              color="white"
            />
            <Text className="text-white text-lg font-semibold ml-2">
              {recorder.isRecording ? "Stop Recording" : "Start Recording"}
            </Text>
          </View>
        </TouchableOpacity>

        {loading && (
          <View className="mt-6 items-center">
            <ActivityIndicator size="large" color="#DC2626" />
            <Text className="text-white mt-2 text-center">{uploadProgress}</Text>
            <Text className="text-gray-400 text-xs mt-1 text-center">
              Please wait...
            </Text>
          </View>
        )}

        {!loading && !recorder.isRecording && (
          <View className="mt-6 bg-blue-900 bg-opacity-50 rounded-lg p-4 max-w-md">
            <Text className="text-blue-300 text-sm text-center">
              Recording will be processed automatically.{'\n'}
              Transcription and action items will be extracted.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}