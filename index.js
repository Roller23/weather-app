require('dotenv').config();

const express = require('express')
const app = express()
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const session = require('express-session')
const mustacheExpress = require('mustache-express')
const {Client} = require('pg')

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
  const cities = ['warszawa', 'lodz', 'wroclaw', 'szczecin', 'rzeszow', 'krakow', 'gdansk', 'suwalki']
  for (const city of cities) {
    const openweatherApiUrl = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHER_KEY}`;
    fetch(openweatherApiUrl).then(response => response.json()).then(async json => {
      // console.log('data for ' + city, json)
      const temp = kelvinToCelsius(json.main.temp) + '';
      const pressure = json.main.pressure + '';
      const humidity = Math.floor(json.main.humidity);
      const preci = json.precipitation?.value || 'no data';
      const wind = json.wind.speed + '';
      const windDir = json.wind.deg + '';
      await insertWeatherReport('openweather', city, time(), temp, pressure, humidity, preci, wind, windDir)
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

// client.query('CREATE TABLE weather(id serial, service text not null, city text not null, datetime integer not null, temp text not null, pressure text not null, humidity integer not null, preci text not null, wind text not null, wind_dir text not null);', (err, res) => {
//   console.log(err, res)
// });

// client.query('CREATE TABLE users(id serial, login text not null, password text not null, reg_date integer not null, last_visit integer not null);', (err, res) => {
//   console.log(err, res)
// });

// client.query('CREATE table info(id serial, last_refresh integer not null)', (err, res) => {
//   console.log(err, res)
// });

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

app.get('/', (req, res) => {
  if (req.session.logged) {
    return res.render('index', {
      username: req.session.login
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
  await client.query('update users set last_visit = $1 where login = $2', [now, login])
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
  await client.query('insert into users (login, password, reg_date, last_visit) values ($1, $2, $3, $4)', data)
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
  res.end();
});

const registeredTokens = []

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
    console.log('socket authenticated')
    socket.emit('connected');
  });
});

const port = process.env.DEV_PORT || process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`listening at port ${port}`)
})