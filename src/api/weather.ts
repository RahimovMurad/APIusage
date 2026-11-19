import { isAxiosError } from 'axios';
import client from './axiosClient';

export type Weather = {
  city: string;
  country: string;
  temperature: number;
  description: string;
  icon: string;
  updatedAt: number;
};
export type WeatherQuery = { q: string } | { lat: number; lon: number };

export function isWeather(value: unknown): value is Weather {
  if (!value || typeof value !== 'object') return false;
  const data = value as Weather;
  return typeof data.city === 'string' && typeof data.country === 'string'
    && Number.isFinite(data.temperature) && typeof data.description === 'string'
    && typeof data.icon === 'string' && /^\d{2}[dn]$/.test(data.icon)
    && Number.isFinite(data.updatedAt);
}

export const getWeather = async (query: WeatherQuery, signal?: AbortSignal): Promise<Weather> => {
  const key = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY?.trim();
  if (!key) throw new Error('OpenWeather API açarı əlavə edilməyib.');
  try {
    const res = await client.get('/weather', {
      params: { ...query, appid: key },
      signal,
    });
    const data = res.data;
    const result = {
      city: data.name, country: data.sys?.country ?? '',
      temperature: data.main?.temp, description: data.weather?.[0]?.description,
      icon: data.weather?.[0]?.icon, updatedAt: Date.now(),
    };
    if (!isWeather(result)) throw new Error('Hava məlumatının formatı yanlışdır.');
    return result;
  } catch (error) {
    if (isAxiosError(error)) {
      if (error.response?.status === 404) throw new Error('Şəhər tapılmadı. Adını yoxlayın.');
      if (error.response?.status === 401) throw new Error('OpenWeather API açarı etibarsızdır və ya aktiv deyil.');
      if (error.response?.status === 429) throw new Error('Sorğu limiti dolub. Bir qədər sonra yenidən yoxlayın.');
      throw new Error('Hava məlumatı alınmadı. İnternet bağlantısını yoxlayın.');
    }
    throw error;
  }
};
