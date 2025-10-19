import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar } from "react-native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { useNavigation } from "@react-navigation/native";

const Header = ({ showBack = false }) => {
  const navigation = useNavigation();

  return (
    <>
      {/* StatusBar customization */}
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {/* SafeAreaView ensures content doesn't overlap with status bar */}
      <SafeAreaView style={{ backgroundColor: "#000" }}>
        <View className="flex-row items-center justify-between bg-black px-5 py-4 border-b border-red-600 shadow-md">
          {showBack ? (
            <TouchableOpacity
              className="p-2 rounded-full bg-red-600"
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View className="w-8" /> // placeholder for balance
          )}

          <Text className="text-red-600 text-2xl font-extrabold tracking-wide uppercase">
            Minute Wise
          </Text>

          <View className="p-2 rounded-full bg-red-600">
            <MaterialIcons name="mic" size={22} color="#fff" />
          </View>
        </View>
      </SafeAreaView>
    </>
  );
};

export default Header;
