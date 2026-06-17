import { useEffect, useMemo, useState } from 'react';

function isRainWeather(weatherData) {
  const text = [
    weatherData?.desc,
    weatherData?.weather,
    weatherData?.condition,
    weatherData?.text,
  ].filter(Boolean).join(' ');
  return /雨|阵雨|小雨|中雨|大雨|rain|shower|drizzle/i.test(text);
}

function getHour() {
  return new Date().getHours();
}

export function useContextTheme(weatherData) {
  const [hour, setHour] = useState(getHour);

  useEffect(() => {
    const timer = window.setInterval(() => setHour(getHour()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    const isNight = hour >= 22 || hour < 6;
    const isRain = isRainWeather(weatherData);
    const className = [
      isNight ? 'context-theme-night' : 'context-theme-day',
      isRain ? 'context-theme-rain' : '',
    ].filter(Boolean).join(' ');
    return { isNight, isRain, className };
  }, [hour, weatherData]);
}
