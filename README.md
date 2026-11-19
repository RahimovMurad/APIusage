# Hava tətbiqi

Expo / React Native tətbiqi birbaşa hava ekranında açılır.

## Başlatmaq

```bash
npm install
npx expo start
```

`.env` faylında `EXPO_PUBLIC_OPENWEATHER_API_KEY` olmalıdır. Nümunə
`.env.example` faylındadır. Açar dəyişəndə Expo serverini yenidən başladın.

## İş prinsipi

- Açılışda internet bağlantısı yoxlanılır. İlk dəfə internet yoxdursa, hava və
  axtarış əvəzinə interneti açmaq barədə mesaj görünür.
- İnternet olduqda məkan icazəsi istənilir və GPS koordinatlarına görə cari
  şəhərin havası yuxarıdakı kartda göstərilir.
- Cari şəhərin son uğurlu nəticəsi AsyncStorage-də ayrıca saxlanılır. Sonrakı
  oflayn açılışda bu kart şəhər adı və yenilənmə vaxtı ilə göstərilir.
- Axtarış cari şəhər kartının altındadır. Axtarılan şəhər ayrıca aşağıda görünür,
  yuxarıdakı cari şəhər və onun keşi dəyişmir.
- İnternet olmayanda axtarış sahəsi və düyməsi bağlıdır. İnternet qayıdanda
  cari məkan məlumatı avtomatik yenilənir və axtarış aktivləşir.

## Fayllar

- `src/app/index.tsx`: hava ekranı, məkan, bağlantı və keş.
- `src/app/_layout.tsx`: tətbiqin Stack quruluşu.
- `src/api/axiosClient.ts`: OpenWeatherMap üçün Axios klienti.
- `src/api/weather.ts`: hava məlumatını alan GET sorğusu.

`EXPO_PUBLIC_` dəyişənləri tətbiq paketində görünür.

## Yoxlama

```bash
npm test
npm run lint
npx tsc --noEmit
npx expo export --platform web
```

Cihazda məkan icazəsi, GPS və bağlantının dəyişməsini də yoxlayın.
Expo Go-da layihəni ilk dəfə yükləmək üçün development serverə bağlantı
lazımdır; tam oflayn soyuq açılışı ayrıca quraşdırılmış tətbiqdə yoxlayın.

Sənədlər: https://openweathermap.org/current və
https://docs.expo.dev/versions/v58.0.0/sdk/netinfo/.
