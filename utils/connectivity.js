/**
 * Provides socks proxy to reach on-premise PostgreSQL database via SAP Cloud Connector
 * @module connectivity
 */

const xsenv = require('@sap/xsenv')
const https = require('https')
const SocksClient = require('socks').SocksClient
const net = require('net')
const jwtCache = {
  expiration: 0,
  jwt: undefined,
}

const log = console.log // eslint-disable-line no-console

const connectivityCredentials = xsenv.cfServiceCredentials('connectivity')
if (!connectivityCredentials) {
  throw Error(
    'No connectivity credentials provided (local: not supported, SAP BTP: check binding)'
  )
}

async function _connectivityToken() {
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
            jwtCache.expiration = Date.now() + (r.expires_in - 60) * 1000
            jwtCache.jwt = r.access_token
            resolve(r.access_token)
          })
        }
      )
      .on('error', (err) => {
        reject('Error while getting connectivity JWT: ' + err.message)
      })
  })
}

async function _generateSocksClientOptions() {
  let jwt =
    Date.now() > jwtCache.expiration ? await _connectivityToken() : jwtCache.jwt

  let logAuthMessage = function (authStatusByte) {
    const msgs = [
      'SUCCESS: SOCKS5 authentication complete.',
      'FAILURE: Connection closed by backend or general scenario failure.',
      'FORBIDDEN: No matching host mapping found in Cloud Connector access control settings',
      `NETWORK_UNREACHABLE: The Cloud Connector is not connected to the subaccount and the Cloud Connector Location ID that is used by the cloud application can't be identified.`,
      'HOST_UNREACHABLE: Cannot open connection to the backend, that is, the host is unreachable.',
      'CONNECTION_REFUSED: Authentication failure',
      'TTL_EXPIRED: Not used',
      'COMMAND_UNSUPPORTED: Only the SOCKS5 CONNECT command is supported.',
      'ADDRESS_UNSUPPORTED: Only the SOCKS5 DOMAIN and IPv4 commands are supported.',
    ]
    if (msgs.length < authStatusByte - 1) {
      log('ERROR: Unknown SOCKS5 auth flow error.')
    } else {
      log(msgs[authStatusByte])
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

/**
 * Creates a SOCKS5 connection to the SAP BTP Connectivity service
 */
async function createConnectivitySocket() {
  let socket = new net.Socket()
  socket.setKeepAlive(true, 60 * 60 * 1000) // TODO: no effect because BTP ends first
  socket.setTimeout(60 * 60 * 1000) // TODO: no effect because BTP ends first

  let connectSocksSocket = function () {
    socket.connect(
      connectivityCredentials.onpremise_socks5_proxy_port,
      connectivityCredentials.onpremise_proxy_host,
      async () => {
        let options = await _generateSocksClientOptions()
        let socksClient = new SocksClient(options)
        socksClient.connect(socket)
      }
    )
  }

  socket.on('close', () => {
    log('Connection closed, reconnecting...')
    connectSocksSocket()
  })
  socket.on('error', (e) => {
    log('Socket error: ', e.code)
  })
  socket.on('end', () => {
    log('Socket ended by BTP')
  })
  socket.on('ready', () => {
    log('Socket ready')
  })
  socket.on('timeout', () => {
    log('Socket timeout due to inactivity')
  })
  socket.on('connect', () => {
    log('Socket connected')
  })

  connectSocksSocket()

  return socket
}

module.exports = {
  createConnectivitySocket,
}
