import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { Play, Trophy, BarChart3, Settings, Rss } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useSettings } from "@/providers/SettingsProvider";

// v1.1
export default function TabLayout() {
  const { colors } = useSettings();

  const handleTabPress = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors?.tabBarActive || '#1C1C1E',
        tabBarInactiveTintColor: colors?.tabBarInactive || '#8E8E93',
        tabBarStyle: {
          backgroundColor: colors?.tabBarBackground || '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: colors?.border || '#E5E5EA',
        },
      }}
    >
      <Tabs.Screen
        name="track"
        options={{
          title: "Track",
          tabBarIcon: ({ color, size }) => <Play size={size} color={color} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, size }) => <Rss size={size} color={color} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ color, size }) => <Trophy size={size} color={color} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="recap"
        options={{
          title: "Recap",
          tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
        listeners={{ tabPress: handleTabPress }}
      />
    </Tabs>
  );
}
