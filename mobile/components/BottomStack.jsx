// src/navigation/BottomStack.jsx (Updated)
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

import TabBar from "../components/TabBar";

// Screens
import RecorderScreen from "../screens/RecorderScreen";
import ParticipantSetupScreen from "../screens/ParticipantSetupScreen";
import MeetingListScreen from "../screens/MeetingsListScreen";
import MeetingDetailScreen from "../screens/MeetingDetailScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Recording Stack Navigator
function RecordingStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="ParticipantSetup" 
        component={ParticipantSetupScreen}
      />
      <Stack.Screen 
        name="Record" 
        component={RecorderScreen}
      />
    </Stack.Navigator>
  );
}

// Meetings Stack Navigator
function MeetingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="MeetingsList" 
        component={MeetingListScreen}
      />
      <Stack.Screen 
        name="MeetingDetail" 
        component={MeetingDetailScreen}
      />
    </Stack.Navigator>
  );
}

const BottomStack = () => {
  return (
    <Tab.Navigator
      backBehavior="history"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Recording Tab (with nested stack) */}
      <Tab.Screen
        name="RecordTab"
        component={RecordingStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="mic"
              size={28}
              color={focused ? "#E50914" : "#888"}
            />
          ),
          tabBarLabel: "Record",
        }}
      />

      {/* Recordings Tab (with nested stack) */}
      <Tab.Screen
        name="RecordingsTab"
        component={MeetingsStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="list"
              size={26}
              color={focused ? "#E50914" : "#888"}
            />
          ),
          tabBarLabel: "Recordings",
        }}
      />
      
      {/* Profile Tab */}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="person"
              size={26}
              color={focused ? "#E50914" : "#888"}
            />
          ),
          tabBarLabel: "Profile",
        }}
      />
    </Tab.Navigator>
  );
};

export default BottomStack;