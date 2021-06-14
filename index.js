require('dotenv').config();

const express = require('express')
const app = express()
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const session = require('express-session')
const mustacheExpress = require('mustache-express')
const {Client} = require('pg')

const moment = require('moment');
const fetch = require('node-fetch');
const {v4: uuidv4} = require('uuid');
const bcrypt = require('bcrypt');
const saltRounds = 10;

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

async function refreshWeatherData(force = false) {
  if (!force) {
    const lastRefresh = await client.query('select last_refresh from info where id = 1');
    const lastRefreshTime = lastRefresh.rows[0].last_refresh;
    const diffSeconds = time() - lastRefreshTime;
    const diffHours = Math.floor(diffSeconds / 60 / 60);
    if (diffHours < 6) {
      return console.log(diffHours, 'hours since last refresh, stopping')
    }
  }
  console.log('refreshing data...');
  for (const city of cities) {
    // openweather
    const openweatherApiUrl = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHER_KEY}`;
    fetch(openweatherApiUrl).then(response => response.json()).then(async json => {
      // console.log('data for ' + city, json)
      const temp = kelvinToCelsius(json.main.temp) + '';
      const pressure = json.main.pressure + '';
      const humidity = Math.floor(json.main.humidity);
      const precip = json.precipitation?.value || '0';
      const wind = json.wind.speed + '';
      const windDir = json.wind.deg + '';
      await insertWeatherReport('openweather', city, time(), temp, pressure, humidity, precip, wind, windDir)
    });
    // weatherbit
    const weatherbitApiUrl = `https://api.weatherbit.io/v2.0/current?city=${city}&key=${process.env.WEATHERBIT_KEY}`;
    fetch(weatherbitApiUrl).then(response => response.json()).then(async json => {
      // console.log('weatherbit for', city, json)
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
      // console.log('weatherstack for', city, json)
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
}

const DB_PATH = process.env.DEV_DB || process.env.DATABASE_URL;

const client = new Client({
  connectionString: DB_PATH,
  ssl: {
    rejectUnauthorized: false
  }
})

client.connect();

// try to refresh every hour
const refreshDeamon = setInterval(() => {
  refreshWeatherData();
}, 1000 * 60 * 60);

refreshWeatherData();

app.engine('mustache', mustacheExpress());
app.set('views', __dirname + '/public/views/')
app.set('view engine', 'mustache');

app.use(express.static('public'));

app.use(express.urlencoded({extended: true}));
app.use(express.json());

app.set('trust proxy', 1)
app.use(session({
  secret: 'I dont mind pineapple pizza',
  resave: false,
  saveUninitialized: true,
  cookie: {secure: false}
}))

app.get('/', async (req, res) => {
  if (req.session.logged) {
    await client.query('update users set counter = counter + 1 where login = $1', [req.session.login]) 
    const userRes = await client.query('select last_visit, counter from users where login = $1', [req.session.login])
    const user = userRes.rows[0];
    const counterStr = user.counter === 1 ? '1 time' : `${user.counter} times`;
    return res.render('index', {
      username: req.session.login,
      counter: counterStr,
      lastVisit: moment(new Date(user.last_visit * 1000)).format('MMMM Do YYYY, h:mm:ss a')
    });
  }
  res.render('login');
});

app.post('/login', async (req, res) => {
  const login = req.body.login;
  const password = req.body.password;
  if (!login || !password) {
    return res.json({success: false, msg: 'Missing fields'});
  }
  const users = await client.query('select * from users where login = $1;', [login])
  if (users.rowCount !== 1) {
    return res.json({success: false, msg: 'Incorrect login or password'});
  }
  const passwordsMatch = bcrypt.compareSync(password, users.rows[0].password);
  if (!passwordsMatch) {
    return res.json({success: false, msg: 'Incorrect login or password'});
  }
  const now = time();
  await client.query('update users set last_visit = $1, counter = counter + 1 where login = $2', [now, login])
  req.session.logged = true;
  req.session.login = login;
  req.session.token = uuidv4();
  req.session.save();
  registeredTokens.push(req.session.token)
  res.json({success: true});
});

app.post('/register', async (req, res) => {
  const login = req.body.login;
  const password = req.body.password;
  if (!login || !password) {
    return res.json({success: false, msg: 'Missing fields!'})
  }
  if (login.length < 3 || password.length < 3) {
    return res.json({success: false, msg: 'Login or password too short'})
  }
  if (login.length > 20 || password.length > 100) {
    return res.json({success: false, msg: 'Login or password too long'})
  }
  const result = await client.query('select * from users where login = $1;', [login])
  if (result.rowCount !== 0) {
    return res.json({success: false, msg: 'Nickname already taken'});
  }
  const hash = bcrypt.hashSync(password, saltRounds);
  const now = time();
  const data = [login, hash, now, now];
  await client.query('insert into users (login, password, reg_date, last_visit, counter) values ($1, $2, $3, $4, 1)', data)
  req.session.logged = true;
  req.session.login = login;
  req.session.token = uuidv4();
  registeredTokens.push(req.session.token)
  req.session.save();
  return res.json({success: true})
});

app.get('/token', (req, res) => {
  if (!req.session.logged) {
    return res.json({success: false, msg: "You're not logged in!"})
  }
  res.json({success: true, token: req.session.token})
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

const registeredTokens = []
const validRanges = ['1', '3', '7']
const validServices = ['openweather', 'weatherbit', 'weatherstack']

const removeToken = token => {
  const index = registeredTokens.indexOf(token);
  if (index === -1) return;
  registeredTokens.splice(index, 1);
}

io.on('connection', socket => {
  console.log('socket connected')
  socket._storage = {}
  // give the client one minute to authenticate
  socket._storage.timeout = setTimeout(() => {
    socket.disconnect();
  }, 1000 * 60);

  socket.on('disconnect', () => {
    clearTimeout(socket._storage.timeout);
    if (!socket._storage.token) return;
    removeToken(socket._storage.token);
  });

  socket.on('auth', token => {
    clearTimeout(socket._storage.timeout);
    if (!registeredTokens.includes(token)) {
      return socket.disconnect();
    }

    socket.on('get range data', async data => {
      console.log('get range data', data)
      if (!validRanges.includes(data.range) || !validServices.includes(data.service)) {
        return;
      }
      const startFrom = moment().startOf('day');
      if (data.range === '1') {
        startFrom.subtract(1, 'days')
      } else if (data.range === '3') {
        startFrom.subtract(2, 'days')
      } else if (data.range === '7') {
        startFrom.subtract(6, 'days')
      }
      const weatherRes = await client.query('select * from weather where service = $1 and datetime > $2 order by id desc', [
        data.service,
        startFrom.unix()
      ]);
      if (weatherRes.rows.length === 0) return;
      let dateRange = moment(new Date(weatherRes.rows[0].datetime * 1000)).format('[Today], HH:mm');
      if (data.range === '3') {
        dateRange = 'Average of 3 days'
      } else if (data.range === '7') {
        dateRange = 'Average of 7 days'
      }
      const response = {
        service: data.service,
        date: dateRange,
        range: data.range,
        cities: {}
      }
      if (data.range === '1') {
        for (const row of weatherRes.rows) {
          if (!response.cities[row.city]) {
            response.cities[row.city] = row;
          }
          for (const key of Object.keys(response.cities[row.city])) {
            response.cities[row.city][key] = response.cities[row.city][key] + '';
          }
        }
      } else {
        let records = 0;
        for (const row of weatherRes.rows) {
          if (!response.cities[row.city]) {
            response.cities[row.city] = row;
            records++;
          } else {
            response.cities[row.city].humidity = +response.cities[row.city].humidity + +row.humidity;
            response.cities[row.city].pressure = +response.cities[row.city].pressure + +row.pressure;
            response.cities[row.city].temp = +response.cities[row.city].temp + +row.temp;
            response.cities[row.city].wind = +response.cities[row.city].wind + +row.wind;
            response.cities[row.city].wind_dir = +response.cities[row.city].wind_dir + +row.wind_dir;
            if (!isNaN(response.cities[row.city].preci)) {
              response.cities[row.city].preci = +response.cities[row.city].preci + +row.preci;
            }
            records++;
          }
          for (const key of Object.keys(response.cities[row.city])) {
            response.cities[row.city][key] = response.cities[row.city][key] + '';
          }
        }
        records /= cities.length;
        for (const city of Object.keys(response.cities)) {
          for (const key of Object.keys(response.cities[city])) {
            if (isNaN(response.cities[city][key])) continue;
            response.cities[city][key] = (+response.cities[city][key] / records) + '';
          }
        }
      }
      socket.emit('range data', response);
    });

    socket.on('get city data', async city => {
      console.log('get city data', city)
      if (!cities.includes(city)) return;
      const res = await client.query('select * from weather where city = $1 and datetime > $2 order by id desc', [
        city,
        moment().startOf('day').subtract(1, 'days').unix()
      ]);
      const response = {city, services: {}}
      if (res.rows.length === 0) return;
      for (const row of res.rows) {
        if (!response.services[row.service]) {
          response.services[row.service] = row;
        }
      }
      socket.emit('city data', response);
    })

    console.log('socket authenticated')
    socket.emit('connected');
  });
});

const port = process.env.DEV_PORT || process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`listening at port ${port}`)
})