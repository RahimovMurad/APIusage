import { create } from "axios";

const client = create({
  baseURL: "https://api.openweathermap.org/data/2.5",
  timeout: 12000,
  params: {
    units: "metric",
    lang: "az",
  },
});

export default client;
