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

export default function PasswordRecoveryScreen({ navigation }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { updatePassword, recoveryEmail } = useAuth();

  async function handleUpdatePassword() {
    // Validation
    if (!newPassword) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    if (!confirmPassword) {
      Alert.alert('Error', 'Please confirm your password');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    console.log('🔐 Setting password...');

    const result = await updatePassword(newPassword);

    setLoading(false);

    if (result.success) {
      console.log('✅ Password set successfully');
      Alert.alert(
        'Success! 🎉',
        'Your password has been set. You can now sign in with your email and password.',
        [
          {
            text: 'Go to Login',
            onPress: () => {
              // Navigation will automatically go to login since user is logged out
              navigation.navigate('Login');
            },
          },
        ]
      );
    } else {
      console.error('❌ Password update failed:', result.error);
      Alert.alert('Error', result.error || 'Failed to set password');
    }
  }

  function getPasswordStrength(password) {
    if (!password) return { strength: 0, text: '', color: 'text-gray-400' };
    
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const strengthMap = {
      1: { text: 'Weak', color: 'text-red-500' },
      2: { text: 'Fair', color: 'text-yellow-500' },
      3: { text: 'Good', color: 'text-blue-500' },
      4: { text: 'Strong', color: 'text-green-500' },
      5: { text: 'Strong', color: 'text-green-500' },
      6: { text: 'Very Strong', color: 'text-green-600' },
    };

    return { strength, ...strengthMap[strength] };
  }

  const passwordStrength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const isValid = passwordsMatch && newPassword.length >= 6;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-black"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-6 py-12">
          {/* Header */}
          <View className="items-center mb-8">
            <View className="bg-red-600 p-4 rounded-full mb-4">
              <MaterialIcons name="lock" size={32} color="white" />
            </View>
            <Text className="text-white text-2xl font-extrabold mb-2">
              Set Password
            </Text>
            <Text className="text-gray-400 text-center text-sm">
              {recoveryEmail || 'Your account'}
            </Text>
          </View>

          {/* New Password */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-white text-sm font-medium">New Password</Text>
              {newPassword && (
                <Text className={`text-xs ${passwordStrength.color}`}>
                  {passwordStrength.text}
                </Text>
              )}
            </View>
            <View className="flex-row items-center bg-gray-800 rounded-lg border border-gray-700">
              <TextInput
                className="flex-1 text-white px-4 py-3"
                placeholder="Enter password"
                placeholderTextColor="#666"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="px-4"
              >
                <MaterialIcons
                  name={showPassword ? 'visibility' : 'visibility-off'}
                  size={20}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password */}
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-white text-sm font-medium">Confirm Password</Text>
              {confirmPassword && (
                <Text className={`text-xs ${
                  passwordsMatch ? 'text-green-500' : 'text-red-500'
                }`}>
                  {passwordsMatch ? '✅ Match' : '❌ No match'}
                </Text>
              )}
            </View>
            <View className="flex-row items-center bg-gray-800 rounded-lg border border-gray-700">
              <TextInput
                className="flex-1 text-white px-4 py-3"
                placeholder="Confirm password"
                placeholderTextColor="#666"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm(!showConfirm)}
                disabled={loading}
                className="px-4"
              >
                <MaterialIcons
                  name={showConfirm ? 'visibility' : 'visibility-off'}
                  size={20}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Requirements */}
          <View className="bg-blue-900 bg-opacity-30 rounded-lg p-4 mb-8">
            <View className="flex-row items-start">
              <MaterialIcons name="info" size={18} color="#60A5FA" className="mt-0.5" />
              <View className="ml-3 flex-1">
                <Text className="text-blue-300 text-xs font-semibold mb-2">
                  Password Requirements:
                </Text>
                <Text className="text-blue-200 text-xs leading-5">
                  • At least 6 characters{'\n'}
                  • Mix of uppercase & lowercase{'\n'}
                  • Include numbers for security
                </Text>
              </View>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            className={`py-4 rounded-lg mb-3 flex-row items-center justify-center ${
              isValid && !loading ? 'bg-red-600' : 'bg-gray-700'
            } ${!isValid || loading ? 'opacity-50' : ''}`}
            onPress={handleUpdatePassword}
            disabled={!isValid || loading}
          >
            {loading ? (
              <>
                <ActivityIndicator color="white" size="small" />
                <Text className="text-white font-semibold ml-2">Setting Password...</Text>
              </>
            ) : (
              <>
                <MaterialIcons name="check-circle" size={20} color="white" />
                <Text className="text-white font-semibold text-base ml-2">
                  Set Password
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Info */}
          <View className="bg-gray-900 rounded-lg p-4 mt-4">
            <Text className="text-gray-400 text-xs text-center">
              After setting your password, you'll be logged out.{'\n'}
              Sign in with your email and new password.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}