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
  const { login, signUp, loginWithGoogle, googleRequest, resetPassword } = useAuth(); // ✅ Add resetPassword

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

    // ✅ UPDATED: Handle all result cases
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
    } else if (result.showResetPassword) {
      // ✅ NEW: Handle case where user exists with Google but no password
      Alert.alert(
        'Account Exists',
        result.error + '\n\nWould you like to set a password for this account?',
        [
          { 
            text: 'Cancel', 
            style: 'cancel' 
          },
          { 
            text: 'Set Password', 
            onPress: async () => {
              setLoading(true);
              const resetResult = await resetPassword(email);
              setLoading(false);
              
              if (resetResult.success) {
                Alert.alert(
                  'Email Sent!',
                  'Check your email for a password reset link. After setting your password, you can sign in on mobile.',
                  [{ text: 'OK', onPress: () => setIsSignUp(false) }]
                );
              } else {
                Alert.alert('Error', resetResult.error || 'Failed to send reset email');
              }
            }
          }
        ]
      );
    } else {
      // ✅ Handle other errors
      Alert.alert(
        isSignUp ? 'Sign Up Failed' : 'Login Failed', 
        result.error || 'Please try again'
      );
    }
  }

  // ✅ NEW: Add a "Forgot Password" button for login mode
  async function handleForgotPassword() {
    if (!email) {
      Alert.alert('Enter Email', 'Please enter your email address first');
      return;
    }

    Alert.alert(
      'Reset Password',
      `Send password reset email to ${email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setLoading(true);
            const result = await resetPassword(email);
            setLoading(false);

            if (result.success) {
              Alert.alert(
                'Email Sent',
                'Check your inbox for the password reset link',
                [{ text: 'OK' }]
              );
            } else {
              Alert.alert('Error', result.error || 'Failed to send reset email');
            }
          }
        }
      ]
    );
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
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-white text-sm">Password</Text>
              {/* ✅ NEW: Forgot Password link (only in login mode) */}
              {!isSignUp && (
                <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
                  <Text className="text-red-600 text-xs">Forgot Password?</Text>
                </TouchableOpacity>
              )}
            </View>
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