const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { create, act } = require("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;
const CACHE_KEY = "weather:current:v1";
const weather = (city) => ({ city, country: "AZ", temperature: 15, description: "aydın səma", icon: "01d", updatedAt: Date.now() });

function loadModule(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name) => name in mocks ? mocks[name] : require(name),
    process, setTimeout, clearTimeout, AbortController,
  });
  return exports;
}

const { isWeather } = loadModule("src/api/weather.ts", { "./axiosClient": {} });

function setup({ online = false, cached, permission = "granted" } = {}) {
  const storage = new Map(cached === undefined ? [] : [[CACHE_KEY, cached]]);
  const calls = [];
  let listener;
  let onAppState;
  let refreshCount = 0;
  let locationCalls = 0;
  let handler = async (query) => weather("q" in query ? query.q : "Bakı");
  const state = (value) => ({ isConnected: value, isInternetReachable: value });
  const mocks = {
    "react-native": {
      ...Object.fromEntries(["ActivityIndicator", "Button", "ScrollView", "Text", "TextInput", "View"].map((name) => [name, name])),
      StyleSheet: { create: (styles) => styles },
      AppState: { addEventListener: (_, callback) => { onAppState = callback; return { remove: () => {} }; } },
    },
    "@react-native-async-storage/async-storage": {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
    },
    "@react-native-community/netinfo": {
      addEventListener: (callback) => { listener = callback; callback(state(online)); return () => { listener = null; }; },
      refresh: async () => { refreshCount++; },
    },
    "expo-location": {
      Accuracy: { Balanced: 3 },
      requestForegroundPermissionsAsync: async () => { locationCalls++; return { status: permission }; },
      getCurrentPositionAsync: async () => ({ coords: { latitude: 40.4, longitude: 49.8 } }),
    },
    "@/api/weather": {
      isWeather,
      getWeather: async (query, signal) => { calls.push(query); return handler(query, signal); },
    },
  };
  const Screen = loadModule("src/app/index.tsx", mocks).default;
  let screen;
  const flush = async (callback = () => {}) => {
    await act(async () => { callback(); await new Promise(setImmediate); });
  };
  return {
    storage, calls,
    mount: async () => { await flush(() => { screen = create(React.createElement(Screen)); }); },
    unmount: async () => { await flush(() => screen.unmount()); },
    network: async (value) => { await flush(() => listener(state(value))); },
    search: async (city) => {
      await flush(() => screen.root.findByType("TextInput").props.onChangeText(city));
      await flush(() => screen.root.findAllByType("Button").find((button) => button.props.title === "Axtar").props.onPress());
    },
    cards: () => screen.root.findAll((node) => node.type.name === "WeatherCard").map((node) => node.props.weather.city),
    text: () => JSON.stringify(screen.toJSON()),
    input: () => screen.root.findAllByType("TextInput")[0],
    searchButton: () => screen.root.findAllByType("Button").find((button) => button.props.title === "Axtar"),
    locationCalls: () => locationCalls,
    foreground: async () => { await flush(() => onAppState("active")); },
    refreshCount: () => refreshCount,
    handler: (next) => { handler = next; },
    flush,
  };
}

test("first offline launch waits; reconnect loads location; search leaves current cache unchanged", async () => {
  const app = setup();
  await app.mount();
  assert.match(app.text(), /İnternet bağlantısı yoxdur/);
  assert.equal(app.input(), undefined);
  assert.equal(app.locationCalls(), 0);
  assert.equal(app.calls.length, 0);
  await app.foreground();
  assert.equal(app.refreshCount(), 1);

  await app.network(true);
  assert.deepEqual(app.cards(), ["Bakı"]);
  assert.equal(app.locationCalls(), 1);
  assert.equal(app.calls[0].lat, 40.4);
  await app.search("Quba");
  assert.deepEqual(app.cards(), ["Bakı", "Quba"]);
  assert.equal(JSON.parse(app.storage.get(CACHE_KEY)).city, "Bakı");

  await app.network(false);
  assert.equal(app.input().props.editable, false);
  assert.equal(app.searchButton().props.disabled, true);
  const count = app.calls.length;
  await app.search("Gəncə");
  assert.equal(app.calls.length, count);
  await app.unmount();

  const reopened = setup({ cached: app.storage.get(CACHE_KEY) });
  await reopened.mount();
  assert.deepEqual(reopened.cards(), ["Bakı"]);
  assert.equal(reopened.input().props.editable, false);
  assert.equal(reopened.calls.length, 0);
  assert.equal(reopened.locationCalls(), 0);
  await reopened.unmount();
});

test("reconnecting updates the current city and enables search", async () => {
  const app = setup({ cached: JSON.stringify(weather("Bakı")) });
  await app.mount();
  app.handler(async () => weather("Gəncə"));
  await app.network(true);
  assert.deepEqual(app.cards(), ["Gəncə"]);
  assert.equal(app.input().props.editable, true);
  assert.equal(JSON.parse(app.storage.get(CACHE_KEY)).city, "Gəncə");
  await app.unmount();
});

test("a search response arriving after disconnect cannot replace the current city", async () => {
  const app = setup({ online: true });
  await app.mount();
  let resolve;
  let requestSignal;
  app.handler((query, signal) => { requestSignal = signal; return new Promise((done) => { resolve = done; }); });
  await app.search("Quba");
  await app.network(false);
  assert.equal(requestSignal.aborted, true);
  await app.flush(() => resolve(weather("Quba")));
  assert.deepEqual(app.cards(), ["Bakı"]);
  assert.equal(JSON.parse(app.storage.get(CACHE_KEY)).city, "Bakı");
  await app.unmount();
});

test("invalid cache and missing internet show the first launch gate", async () => {
  for (const cached of ["{bad", "{}", JSON.stringify({ city: "Quba" })]) {
    const app = setup({ cached });
    await app.mount();
    assert.match(app.text(), /İnternet bağlantısı yoxdur/);
    assert.equal(app.input(), undefined);
    await app.unmount();
  }
});

test("denied location permission shows a message without inventing a default city", async () => {
  const app = setup({ online: true, permission: "denied" });
  await app.mount();
  assert.match(app.text(), /məkan icazəsi verin/);
  assert.deepEqual(app.cards(), []);
  await app.search("Quba");
  assert.deepEqual(app.cards(), ["Quba"]);
  assert.equal(app.storage.has(CACHE_KEY), false);
  await app.unmount();
});
