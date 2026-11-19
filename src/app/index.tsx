import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { getWeather, isWeather, type Weather } from "@/api/weather";

const CACHE_KEY = "weather:current:v1";

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Məkan müəyyən edilmədi. Yenidən yoxlayın.")), 15000);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export default function WeatherScreen() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [currentWeather, setCurrentWeather] = useState<Weather | null>(null);
  const [currentLoading, setCurrentLoading] = useState(false);
  const [currentError, setCurrentError] = useState("");
  const [saved, setSaved] = useState(true);
  const [retry, setRetry] = useState(0);
  const [city, setCity] = useState("");
  const [searchQuery, setSearchQuery] = useState<{ city: string } | null>(null);
  const [searchWeather, setSearchWeather] = useState<Weather | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    let active = true;
    const readCache = async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        const data: unknown = raw ? JSON.parse(raw) : null;
        if (active && isWeather(data)) setCurrentWeather(data);
      } catch {
        // Keş oxunmasa da internet olduqda məlumat alına bilər.
      } finally {
        if (active) setCacheReady(true);
      }
    };

    void readCache();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === false || state.isInternetReachable === false
        ? false : state.isConnected === true && state.isInternetReachable === true ? true : null;
      setOnline(connected);
      if (connected !== true) {
        setSearchQuery(null);
        setSearchLoading(false);
      }
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void NetInfo.refresh().catch(() => {});
    });

    return () => {
      active = false;
      unsubscribe();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (online !== true || !cacheReady) return;
    let active = true;
    const controller = new AbortController();

    const loadCurrentWeather = async () => {
      setCurrentLoading(true);
      setCurrentError("");
      setSaved(true);
      try {
        const permission = await withTimeout(Location.requestForegroundPermissionsAsync());
        if (!active) return;
        if (permission.status !== "granted") {
          throw new Error("Olduğunuz şəhərin havası üçün məkan icazəsi verin.");
        }
        const location = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!active) return;
        const data = await getWeather({ lat: location.coords.latitude, lon: location.coords.longitude }, controller.signal);
        if (!active) return;
        setCurrentWeather(data);
        setSaved(false);
        try {
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          if (active) setCurrentError("Hava göstərilir, amma cihazda saxlamaq mümkün olmadı.");
        }
      } catch (error) {
        if (active) setCurrentError(error instanceof Error ? error.message : "Hava məlumatı alınmadı.");
      } finally {
        if (active) setCurrentLoading(false);
      }
    };

    void loadCurrentWeather();
    return () => {
      active = false;
      controller.abort();
    };
  }, [online, cacheReady, retry]);

  useEffect(() => {
    if (online !== true || !searchQuery) return;
    let active = true;
    const controller = new AbortController();

    const loadSearchWeather = async () => {
      setSearchLoading(true);
      setSearchError("");
      setSearchWeather(null);
      try {
        const data = await getWeather({ q: searchQuery.city }, controller.signal);
        if (active) setSearchWeather(data);
      } catch (error) {
        if (active) setSearchError(error instanceof Error ? error.message : "Şəhər tapılmadı.");
      } finally {
        if (active) setSearchLoading(false);
      }
    };

    void loadSearchWeather();
    return () => {
      active = false;
      controller.abort();
    };
  }, [online, searchQuery]);

  const search = () => {
    if (online !== true || searchLoading) return;
    if (!city.trim()) {
      setSearchError("Şəhər adını daxil edin.");
      return;
    }
    setSearchQuery({ city: city.trim() });
  };

  if (!cacheReady || (online === null && !currentWeather)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.note}>İnternet bağlantısı yoxlanılır...</Text>
      </View>
    );
  }

  if (online === false && !currentWeather) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>İnternet bağlantısı yoxdur</Text>
        <Text style={styles.note}>İlk hava məlumatını almaq üçün interneti açın. Bağlantı yarandıqda olduğunuz şəhərin havası avtomatik göstəriləcək.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Olduğunuz şəhər</Text>
      {currentWeather && <WeatherCard weather={currentWeather} saved={saved || online !== true} />}
      {online === true && currentLoading && (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.note}>Məkanınıza uyğun hava alınır...</Text>
        </View>
      )}
      {online === true && !!currentError && (
        <View style={styles.section}>
          <Text accessibilityRole="alert" style={styles.error}>{currentError}</Text>
          <Button title="Yenidən yoxla" onPress={() => setRetry(retry + 1)} disabled={currentLoading} />
        </View>
      )}
      {online !== true && <Text style={styles.notice}>
        {online === false ? "İnternet yoxdur. Son saxlanmış hava göstərilir. Axtarış üçün interneti açın." : "İnternet bağlantısı yoxlanılır..."}
      </Text>}

      <View style={styles.section}>
        <Text style={styles.heading}>Başqa şəhər axtar</Text>
        <TextInput
          accessibilityLabel="Şəhər adı"
          placeholder="Məsələn, Quba"
          placeholderTextColor="#64748b"
          value={city}
          onChangeText={setCity}
          onSubmitEditing={search}
          editable={online === true && !searchLoading}
          returnKeyType="search"
          autoCorrect={false}
          maxLength={100}
          style={[styles.input, online !== true && styles.disabled]}
        />
        <Button title="Axtar" onPress={search} disabled={online !== true || searchLoading || !city.trim()} />
        {online === true && searchLoading && <ActivityIndicator />}
        {!!searchError && <Text accessibilityRole="alert" style={styles.error}>{searchError}</Text>}
      </View>
      {searchWeather && <WeatherCard weather={searchWeather} saved={online !== true} />}
      <Text style={styles.source}>OpenWeatherMap</Text>
    </ScrollView>
  );
}

function WeatherCard({ weather, saved }: { weather: Weather; saved: boolean }) {
  const icon = weather.icon.slice(0, 2);
  const symbol = icon === "01" ? (weather.icon.endsWith("n") ? "🌙" : "☀️")
    : icon === "02" ? "🌤️" : icon === "09" || icon === "10" ? "🌧️"
      : icon === "11" ? "⛈️" : icon === "13" ? "❄️" : icon === "50" ? "🌫️" : "☁️";

  return (
    <View style={styles.card}>
      <Text style={styles.city}>{weather.city}{weather.country ? `, ${weather.country}` : ""}</Text>
      {saved && <Text style={styles.notice}>Son saxlanmış məlumat</Text>}
      <Text style={styles.icon} accessibilityLabel={weather.description}>{symbol}</Text>
      <Text style={styles.temperature}>{Math.round(weather.temperature)}°C</Text>
      <Text style={styles.description}>{weather.description}</Text>
      <Text style={styles.note}>Yenilənib: {new Date(weather.updatedAt).toLocaleString("az-AZ")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 20, gap: 18, backgroundColor: "#f0f7ff" },
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: "#f0f7ff" },
  title: { fontSize: 26, fontWeight: "700", color: "#12304a" },
  heading: { fontSize: 20, fontWeight: "600", color: "#12304a" },
  section: { gap: 12 },
  loading: { flexDirection: "row", alignItems: "center", gap: 12 },
  note: { fontSize: 14, color: "#475569", lineHeight: 21 },
  input: { borderWidth: 1, borderColor: "#94a3b8", borderRadius: 10, padding: 14, backgroundColor: "white", color: "#12304a", fontSize: 16 },
  disabled: { opacity: 0.5 },
  error: { color: "#b91c1c", lineHeight: 22 },
  notice: { color: "#92400e", lineHeight: 22 },
  card: { backgroundColor: "white", padding: 24, borderRadius: 20, alignItems: "center", gap: 10 },
  city: { fontSize: 26, fontWeight: "600", color: "#12304a", textAlign: "center" },
  icon: { fontSize: 64 },
  temperature: { fontSize: 52, fontWeight: "700", color: "#12304a" },
  description: { fontSize: 20, color: "#334155", textAlign: "center" },
  source: { color: "#64748b", textAlign: "center", fontSize: 12 },
});
