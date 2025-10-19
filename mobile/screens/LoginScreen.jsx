import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { login, signUp, loginWithGoogle, googleRequest } = useAuth();

  async function handleEmailAuth() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    if (isSignUp && !name) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    
    const result = isSignUp 
      ? await signUp(email, password, name)
      : await login(email, password);
    
    setLoading(false);

    if (result.success) {
      if (result.requiresConfirmation) {
        Alert.alert(
          'Verify Email',
          result.message || 'Please check your email to verify your account.',
          [{ text: 'OK' }]
        );
        setIsSignUp(false); // Switch back to login mode
      } else {
        Alert.alert('Success', isSignUp ? 'Account created!' : 'Logged in successfully!');
      }
    } else {
      Alert.alert(
        isSignUp ? 'Sign Up Failed' : 'Login Failed', 
        result.error || 'Please try again'
      );
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-black"
    >
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-8 py-12">
          {/* Logo/Title */}
          <View className="items-center mb-12">
            <Text className="text-red-600 text-4xl font-extrabold mb-2">
              Minute Wise
            </Text>
            <Text className="text-gray-400 text-center">
              {isSignUp ? 'Create your account' : 'Sign in to continue'}
            </Text>
          </View>

          {/* Name Input (Sign Up only) */}
          {isSignUp && (
            <View className="mb-4">
              <Text className="text-white text-sm mb-2">Name</Text>
              <TextInput
                className="bg-gray-800 text-white px-4 py-3 rounded-lg"
                placeholder="Enter your name"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* Email Input */}
          <View className="mb-4">
            <Text className="text-white text-sm mb-2">Email</Text>
            <TextInput
              className="bg-gray-800 text-white px-4 py-3 rounded-lg"
              placeholder="Enter your email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Password Input */}
          <View className="mb-6">
            <Text className="text-white text-sm mb-2">Password</Text>
            <TextInput
              className="bg-gray-800 text-white px-4 py-3 rounded-lg"
              placeholder="Enter your password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {/* Email Auth Button */}
          <TouchableOpacity
            className="bg-red-600 py-4 rounded-lg mb-4"
            onPress={handleEmailAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-center text-lg font-semibold">
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Toggle Sign Up / Sign In */}
          <TouchableOpacity
            onPress={() => {
              setIsSignUp(!isSignUp);
              setName('');
            }}
            className="py-3"
            disabled={loading}
          >
            <Text className="text-gray-400 text-center">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text className="text-red-600 font-semibold">
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </TouchableOpacity>

          {/* Info Text */}
          <View className="bg-blue-900 bg-opacity-30 rounded-lg p-4 mt-6">
            <View className="flex-row items-start">
              <MaterialIcons name="info-outline" size={20} color="#60A5FA" />
              <View className="flex-1 ml-3">
                <Text className="text-blue-300 text-xs leading-5">
                  {isSignUp 
                    ? 'After signing up, please check your email to verify your account before signing in.'
                    : 'Sign in with your email or Google account to access your meetings and recordings.'
                  }
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}