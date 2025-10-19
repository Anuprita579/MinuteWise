import React from 'react';
import { Text, TouchableOpacity, View} from 'react-native';
import {useLinkBuilder} from '@react-navigation/native';

const TabBar = props => {
  const {state, descriptors, navigation} = props || {};
  const {buildHref} = useLinkBuilder();

  return (
    <View className="flex-row w-full justify-around bg-black border-t border-gray-800 py-2 shadow-lg">
      {state.routes.map((route, index) => {
        const {options} = descriptors[route.key];
        const label = options.tabBarLabel;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <TouchableOpacity
            key={index}
            href={buildHref(route.name, route.params)}
            accessibilityState={isFocused ? {selected: true} : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            className="flex justify-center items-center gap-2 px-4 pt-2 pb-3"
            pressOpacity={0.7}
            pressColor="#efefef"
          >
            {options.tabBarIcon({focused: isFocused})}
            <Text className="text-white text-xs">
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
export default TabBar;