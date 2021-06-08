require('dotenv').config();

const express = require('express')
const app = express()
const mustacheExpress = require('mustache-express')
const { Client } = require('pg')

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

console.log('shh', process.env.DATABASE_URL)

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