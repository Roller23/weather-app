require('dotenv').config();

const express = require('express')
const app = express()
const mustacheExpress = require('mustache-express')
const { Client } = require('pg')

const DB_PATH = process.env.DEV_DB || process.env.DATABASE_URL;

const client = new Client({
  connectionString: DB_PATH,
  ssl: {
    rejectUnauthorized: false
  }
})

client.connect();

app.engine('mustache', mustacheExpress());
app.set('views', __dirname + '/public/views/')
app.set('view engine', 'mustache');

app.use(express.static('public'));

app.use(express.urlencoded({extended: true}));
app.use(express.json());

app.get('/', (req, res) => {
  return res.render('login');
});

const port = process.env.DEV_PORT || process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`listening at :${port}`)
})