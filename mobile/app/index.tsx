import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import {
  NavigationContainer,
  NavigationIndependentTree,
} from "@react-navigation/native";
import { ActivityIndicator, View, Text } from "react-native";

import { AuthProvider, useAuth } from "../context/AuthContext";
import Header from "../components/Header";
import BottomStack from "../components/BottomStack";

import LoginScreen from "../screens/LoginScreen";
import MeetingDetailScreen from "../screens/MeetingDetailScreen";
import RecorderScreen from "../screens/RecorderScreen";
import PasswordRecoveryScreen from "../screens/PasswordRecoveryScreen";

const Stack = createStackNavigator();

function AppNavigator() {
  const { isAuthenticated, loading, user, isRecoveringPassword } = useAuth();

  // Show loader while checking auth status
  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-black">
        <ActivityIndicator size="large" color="#DC2626" />
        <Text className="text-white mt-4">Loading...</Text>
      </View>
    );
  }

  // Debug log
  console.log('Auth State:', { isAuthenticated, user: user?.email, isRecoveringPassword });

  return (
    <>
      {/* Only show header when authenticated and not recovering password */}
      {isAuthenticated && !isRecoveringPassword && <Header />}
      
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
      >
        {!isAuthenticated ? (
          // Unauthenticated - show only login
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : isRecoveringPassword ? (
          // Password recovery - show recovery screen
          <Stack.Screen name="PasswordRecovery" component={PasswordRecoveryScreen} />
        ) : (
          // Authenticated - show all app screens
          <>
            <Stack.Screen name="BottomStack" component={BottomStack} />
            <Stack.Screen name="MeetingDetail" component={MeetingDetailScreen} />
            <Stack.Screen name="Recorder" component={RecorderScreen} />
          </>
        )}
      </Stack.Navigator>
    </>
  );
}

export default function Index() {
  return (
    <NavigationIndependentTree>
      <NavigationContainer>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}