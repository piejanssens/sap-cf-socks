const { socksAuthMessages } = require('./lib/socks-messages')
const xsenv = require('@sap/xsenv')
const https = require('https')
const { SocksClient } = require('socks')
const net = require('net')
const log = console.log // eslint-disable-line no-console
const connectivityCredentials = xsenv.cfServiceCredentials('connectivity')

module.exports = ConnectivitySocks

class ConnectivitySocks {
  #jwtCache
  #socket

  constructor() {
    if (!connectivityCredentials) {
      throw Error(
        'No connectivity credentials provided (local: not supported, SAP BTP: check binding)'
      )
    }
    xsenv.loadEnv()
    this.#jwtCache = {
      expiration: 0,
      jwt: undefined,
    }
    createSocket()
  }

  async #connectivityToken() {
    return new Promise((resolve, reject) => {
      log('Renewing the new connectivity access token')
      https
        .get(
          `${connectivityCredentials.token_service_url}/oauth/token?grant_type=client_credentials&response_type=token`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(
                `${connectivityCredentials.clientid}:${connectivityCredentials.clientsecret}`
              ).toString('base64')}`,
            },
          },
          (res) => {
            const data = []
            res.on('data', (chunk) => data.push(chunk))
            res.on('end', () => {
              let r = JSON.parse(data.join(''))
              this.#jwtCache.expiration =
                Date.now() + (r.expires_in - 60) * 1000
              this.#jwtCache.jwt = r.access_token
              resolve(r.access_token)
            })
          }
        )
        .on('error', (err) => {
          reject('Error while getting connectivity JWT: ' + err.message)
        })
    })
  }

  async #generateSocksClientOptions() {
    let jwt =
      Date.now() > this.#jwtCache.expiration
        ? await this.#connectivityToken()
        : this.#jwtCache.jwt

    let logAuthMessage = function (authStatusByte) {
      if (socksAuthMessages.length < authStatusByte - 1) {
        log('ERROR: Unknown SOCKS5 auth flow error.')
      } else {
        log(socksAuthMessages[authStatusByte])
      }
    }

    let sLocationBase64 = process.env.PG_CONNECTIVITY_LOCATION_ID
      ? Buffer.from(process.env.PG_CONNECTIVITY_LOCATION_ID).toString('base64')
      : ''
    let iJWTLength = Buffer.byteLength(jwt, 'utf8')
    let iLocationLength = Buffer.byteLength(sLocationBase64, 'utf8')
    let xJWTLengthBuffer = Buffer.alloc(4)
    xJWTLengthBuffer.writeInt32BE(iJWTLength)
    let xLocationLengthBuffer = Buffer.alloc(1)
    xLocationLengthBuffer.writeInt8(iLocationLength)
    return {
      proxy: {
        host: connectivityCredentials.onpremise_proxy_host,
        port: parseInt(connectivityCredentials.onpremise_socks5_proxy_port),
        type: 5,
        custom_auth_method: 0x80,
        custom_auth_request_handler: async () => {
          return Buffer.concat([
            Buffer.from([0x01]), // Authentication method version - currently 1
            xJWTLengthBuffer, // Length of the JWT
            Buffer.from(jwt), // The actual value of the JWT in its encoded form
            xLocationLengthBuffer, // Length of the Cloud Connector location ID (0 if no Cloud Connector location ID is used)
            Buffer.from(sLocationBase64), // The value of the Cloud Connector location ID in base64-encoded form
          ])
        },
        custom_auth_response_size: 2,
        custom_auth_response_handler: async (data) => {
          logAuthMessage(data[1])
          if (data[1] === 0x00) {
            return true
          } else {
            return false
          }
        },
      },
      command: 'connect',
      destination: {
        host: process.env.PG_HOST,
        port: parseInt(process.env.PG_PORT),
      },
    }
  }

  async #createSocket() {
    this.#socket = new net.Socket()
    this.#socket.setKeepAlive(true, 60 * 60 * 1000) // TODO: no effect because BTP ends first
    this.#socket.setTimeout(60 * 60 * 1000) // TODO: no effect because BTP ends first

    let connectSocksSocket = function () {
      this.#socket.connect(
        connectivityCredentials.onpremise_socks5_proxy_port,
        connectivityCredentials.onpremise_proxy_host,
        async () => {
          let options = await this.#generateSocksClientOptions()
          let socksClient = new SocksClient(options)
          socksClient.connect(this.#socket)
        }
      )
    }

    this.#socket.on('close', () => {
      log('Connection closed, reconnecting...')
      connectSocksSocket()
    })
    this.#socket.on('error', (e) => {
      log('Socket error: ', e.code)
    })
    this.#socket.on('end', () => {
      log('Socket ended by BTP')
    })
    this.#socket.on('ready', () => {
      log('Socket ready')
    })
    this.#socket.on('timeout', () => {
      log('Socket timeout due to inactivity')
    })
    this.#socket.on('connect', () => {
      log('Socket connected')
    })

    connectSocksSocket()
  }

  /**
   * Creates a SOCKS5 connection to the SAP BTP Connectivity service
   */
  getSocket() {
    return this.#socket
  }
}
