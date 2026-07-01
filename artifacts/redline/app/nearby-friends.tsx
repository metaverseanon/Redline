import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, Platform, ActivityIndicator, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import * as ExpoLocation from 'expo-location';
import { MapPin, Users, RefreshCw, ChevronRight } from 'lucide-react-native';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { trpc } from '@/lib/trpc';

let MapView: React.ComponentType<any> | null = null;
let Marker: React.ComponentType<any> | null = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
  } catch {
    console.log('react-native-maps not available');
  }
}

type Friend = {
  id: string;
  displayName: string;
  carBrand: string | null;
  carModel: string | null;
  profilePicture: string | null;
  latitude: number;
  longitude: number;
  locationUpdatedAt: number;
  distanceKm: number;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NearbyFriendsScreen() {
  const { colors, settings } = useSettings();
  const { user, isAuthenticated } = useUser();
  const isDark = settings.theme !== 'light';
  const mapRef = useRef<any>(null);

  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (Platform.OS === 'web') {
          if (mounted) setLocating(false);
          return;
        }
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) {
            setPermissionDenied(true);
            setLocating(false);
          }
          return;
        }
        const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
        if (mounted) {
          setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          setLocating(false);
        }
      } catch (e) {
        console.error('[NEARBY_FRIENDS] location error', e);
        if (mounted) setLocating(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const friendsQuery = trpc.user.getNearbyFriends.useQuery(
    {
      userId: user?.id || '',
      latitude: location?.latitude || 0,
      longitude: location?.longitude || 0,
    },
    { enabled: !!user?.id && !!location }
  );

  const friends = (friendsQuery.data as Friend[] | undefined) ?? [];

  const region = useMemo(() => {
    if (!location) return undefined;
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    };
  }, [location]);

  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const renderContent = () => {
    if (!isAuthenticated) {
      return (
        <View style={styles.centered}>
          <Users size={48} color={colors.textLight} />
          <Text style={styles.emptyTitle}>Sign in to see friends</Text>
          <Text style={styles.emptyText}>Log in to find the people you follow nearby.</Text>
        </View>
      );
    }

    if (Platform.OS === 'web' || !MapView) {
      // Web / no-map fallback: render the list instead of the native map.
      return renderList(true);
    }

    if (locating) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.emptyText}>Finding your location…</Text>
        </View>
      );
    }

    if (permissionDenied) {
      return (
        <View style={styles.centered}>
          <MapPin size={48} color={colors.textLight} />
          <Text style={styles.emptyTitle}>Location needed</Text>
          <Text style={styles.emptyText}>
            Enable location access to see which friends are nearby.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsCompass={false}
          customMapStyle={isDark ? darkMapStyle : []}
          mapType="standard"
        >
          {friends.map((f) => (
            Marker ? (
              <Marker
                key={f.id}
                coordinate={{ latitude: f.latitude, longitude: f.longitude }}
                title={f.displayName}
                description={`${[f.carBrand, f.carModel].filter(Boolean).join(' ') || 'Driver'} · ${f.distanceKm} km · ${timeAgo(f.locationUpdatedAt)}`}
                onCalloutPress={() => router.push(`/user-profile?userId=${f.id}` as any)}
              >
                <View style={styles.marker}>
                  {f.profilePicture ? (
                    <Image source={{ uri: f.profilePicture }} style={styles.markerAvatar} />
                  ) : (
                    <Text style={styles.markerInitial}>
                      {(f.displayName || '?').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
              </Marker>
            ) : null
          ))}
        </MapView>

        <View style={styles.countPill}>
          <Users size={14} color={colors.textInverted} />
          <Text style={styles.countPillText}>
            {friendsQuery.isLoading ? 'Loading…' : `${friends.length} nearby`}
          </Text>
        </View>

        {!friendsQuery.isLoading && friends.length === 0 && (
          <View style={styles.emptyOverlay} pointerEvents="box-none">
            <View style={styles.emptyCard}>
              <Users size={32} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No friends nearby</Text>
              <Text style={styles.emptyText}>
                Friends you follow who share their location will show up here. Ask them to turn on “Share Location with Friends” in Settings.
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderList = (isWebFallback: boolean) => {
    return (
      <ScrollView contentContainerStyle={styles.listContent}>
        {isWebFallback && (
          <Text style={styles.webNote}>Map view is available in the mobile app.</Text>
        )}
        {friendsQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : friends.length === 0 ? (
          <View style={styles.centered}>
            <Users size={48} color={colors.textLight} />
            <Text style={styles.emptyTitle}>No friends nearby</Text>
            <Text style={styles.emptyText}>
              Friends you follow who share their location will show up here.
            </Text>
          </View>
        ) : (
          friends.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push(`/user-profile?userId=${f.id}` as any)}
            >
              <View style={styles.rowAvatar}>
                {f.profilePicture ? (
                  <Image source={{ uri: f.profilePicture }} style={styles.rowAvatarImg} />
                ) : (
                  <Text style={styles.rowAvatarInitial}>
                    {(f.displayName || '?').charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{f.displayName}</Text>
                <Text style={styles.rowMeta}>
                  {[f.carBrand, f.carModel].filter(Boolean).join(' ') || 'Driver'} · {f.distanceKm} km · {timeAgo(f.locationUpdatedAt)}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textLight} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen
        options={{
          title: 'Nearby Friends',
          headerShown: true,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => friendsQuery.refetch()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.headerRefreshBtn}
            >
              <RefreshCw size={18} color={colors.accent} />
            </TouchableOpacity>
          ),
        }}
      />
      {renderContent()}
    </SafeAreaView>
  );
}

function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
    headerRefreshBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    emptyTitle: { fontSize: 16, fontFamily: 'Orbitron_700Bold', color: colors.text, textAlign: 'center' },
    emptyText: { fontSize: 13, fontFamily: 'Orbitron_400Regular', color: colors.textLight, textAlign: 'center', lineHeight: 19 },
    marker: {
      width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF',
      overflow: 'hidden',
    },
    markerAvatar: { width: '100%', height: '100%' },
    markerInitial: { color: colors.textInverted, fontSize: 16, fontFamily: 'Orbitron_700Bold' },
    countPill: {
      position: 'absolute', top: 16, alignSelf: 'center', flexDirection: 'row',
      alignItems: 'center', gap: 6, backgroundColor: colors.accent,
      paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
    },
    countPillText: { color: colors.textInverted, fontSize: 13, fontFamily: 'Orbitron_600SemiBold' },
    emptyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyCard: {
      backgroundColor: isDark ? '#141414' : '#FFFFFF', borderRadius: 16, padding: 24,
      alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border,
    },
    listContent: { padding: 16, gap: 10, flexGrow: 1 },
    webNote: { fontSize: 12, fontFamily: 'Orbitron_400Regular', color: colors.textLight, textAlign: 'center', marginBottom: 8 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
      backgroundColor: isDark ? '#141414' : '#FFFFFF', borderRadius: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    rowAvatar: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    rowAvatarImg: { width: '100%', height: '100%' },
    rowAvatarInitial: { color: colors.textInverted, fontSize: 18, fontFamily: 'Orbitron_700Bold' },
    rowName: { fontSize: 15, fontFamily: 'Orbitron_600SemiBold', color: colors.text },
    rowMeta: { fontSize: 12, fontFamily: 'Orbitron_400Regular', color: colors.textLight, marginTop: 2 },
  });
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
];
