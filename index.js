'use strict'

const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const xsenv = require('@sap/xsenv')
xsenv.loadEnv()

const { Pool } = require('pg')
const { connectivityStream } = require('./utils/connectivity')

app.get('/', async (req, res) => {
  //const client = await app.locals.pool.connect()
  try {
    let pgRes = await app.locals.pool.query('SELECT * FROM "public"."db_books"')
    res.write('<html><body>')
    pgRes.rows.forEach((row) => {
      res.write(row.name)
      res.write('<br/>')
    })
    res.write('</body></html>')
  } catch (err) {
    console.error('Error executing query', err.stack)
    res.write('PG Error, check logs')
  } finally {
    //client.release()
  }
  res.end()
})

app.listen(port, () => {
  if (process.env.PG_CONNECTIVITY_ENABLED === 'true') {
    connectivityStream().then((socket) => {
      app.locals.pool = new Pool({
        host: 'localhost',
        port: parseInt(process.env.PG_PORT || 5432),
        ssl: process.env.PG_SSL === 'true' || false,
        database: process.env.PG_DB,
        user: process.env.PG_USERNAME,
        password: process.env.PG_PASSWORD,
        stream: socket,
      })
    })
  } else {
    app.locals.pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || 5432),
      ssl: process.env.PG_SSL === 'true' || false,
      database: process.env.PG_DB,
      user: process.env.PG_USERNAME,
      password: process.env.PG_PASSWORD,
    })
  }

  console.log(`Listening at http://localhost:${port}`)
})
