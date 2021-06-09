require('dotenv').config();

const express = require('express')
const app = express()
const session = require('express-session')
const mustacheExpress = require('mustache-express')
const { Client } = require('pg')

const bcrypt = require('bcrypt');
const saltRounds = 10;

function time() {
  return Math.floor(Date.now() / 1000);
}

const DB_PATH = process.env.DEV_DB || process.env.DATABASE_URL;

const client = new Client({
  connectionString: DB_PATH,
  ssl: {
    rejectUnauthorized: false
  }
})

client.connect();

// client.query('CREATE TABLE weather(id serial, service text not null, city text not null, datetime integer not null, temp text not null, pressure text not null, humidity integer not null, preci integer not null, wind text not null, wind_dir text not null);', (err, res) => {
//   console.log(err, res)
// });

// client.query('CREATE TABLE users(id serial, login text not null, password text not null, reg_date integer not null, last_visit integer not null);', (err, res) => {
//   console.log(err, res)
// });

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
    return res.render('index')
  }
  res.render('login', {
    username: req.session.login
  });
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
  return res.json({success: true})
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.end();
});

const port = process.env.DEV_PORT || process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`listening at port ${port}`)
})