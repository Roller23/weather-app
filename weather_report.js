require('dotenv').config();

const {Client} = require('pg')
const fetch = require('node-fetch');

function time() {
  return Math.floor(Date.now() / 1000);
}

function kelvinToCelsius(k) {
  return k - 273.15;
}

async function insertWeatherReport(...data) {
  let query = 'insert into weather (service, city, datetime, temp, pressure, humidity, preci, wind, wind_dir)';
  query += ' values ($1, $2, $3, $4, $5, $6, $7, $8, $9)';
  return client.query(query, data)
}

const cities = ['warszawa', 'lodz', 'wroclaw', 'szczecin', 'rzeszow', 'krakow', 'gdansk', 'suwalki']

async function refreshWeatherData() {
  console.log('refreshing data...');
  for (const city of cities) {
    // openweather
    const openweatherApiUrl = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHER_KEY}`;
    fetch(openweatherApiUrl).then(response => response.json()).then(async json => {
      const temp = kelvinToCelsius(json.main.temp) + '';
      const pressure = json.main.pressure + '';
      const humidity = Math.floor(json.main.humidity);
      const precip = json.precipitation?.value || 'no data';
      const wind = json.wind.speed + '';
      const windDir = json.wind.deg + '';
      await insertWeatherReport('openweather', city, time(), temp, pressure, humidity, precip, wind, windDir)
    });
    // weatherbit
    const weatherbitApiUrl = `https://api.weatherbit.io/v2.0/current?city=${city}&key=${process.env.WEATHERBIT_KEY}`;
    fetch(weatherbitApiUrl).then(response => response.json()).then(async json => {
      const temp = json.data[0].temp + '';
      const pressure = json.data[0].pres + '';
      const humidity = Math.floor(json.data[0].rh);
      const precip = json.data[0].precip + '';
      const wind = json.data[0].wind_spd + '';
      const windDir = json.data[0].wind_dir + '';
      await insertWeatherReport('weatherbit', city, time(), temp, pressure, humidity, precip, wind, windDir)
    });
    // weatherstack
    const weatherstackApiUrl = `http://api.weatherstack.com/current?access_key=${process.env.WEATHERSTACK_KEY}&query=${city}`;
    fetch(weatherstackApiUrl).then(response => response.json()).then(async json => {
      const temp = json.current.temperature + '';
      const pressure = json.current.pressure + '';
      const humidity = Math.floor(json.current.humidity);
      const precip = json.current.precip + '';
      const wind = json.current.wind_speed + '';
      const windDir = json.current.wind_degree + '';
      await insertWeatherReport('weatherstack', city, time(), temp, pressure, humidity, precip, wind, windDir)
    });
  }
  await client.query('update info set last_refresh = $1 where id = 1', [time()])
  console.log('data refreshed')
}

const DB_PATH = process.env.DEV_DB || process.env.DATABASE_URL;

const client = new Client({
  connectionString: DB_PATH,
  ssl: {
    rejectUnauthorized: false
  }
})

client.connect();

refreshWeatherData().then(() => {
  setTimeout(() => {
    console.log('closing...')
    process.exit(0)
  }, 1000 * 10);
})