/**
 * Provides socks proxy to reach on-premise PostgreSQL database via SAP Cloud Connector
 * @module connectivity
 */

const xsenv = require('@sap/xsenv')
const https = require('https')
const SocksClient = require('socks').SocksClient

const log = console.log // eslint-disable-line no-console

async function _connectivityToken(credentials) {
  return new Promise((resolve, reject) => {
    https
      .get(
        `${credentials.token_service_url}/oauth/token?grant_type=client_credentials&response_type=token`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${credentials.clientid}:${credentials.clientsecret}`
            ).toString('base64')}`,
          },
        },
        (res) => {
          const data = []
          res.on('data', (chunk) => data.push(chunk))
          res.on('end', () => {
            resolve(JSON.parse(data.join('')).access_token)
          })
        }
      )
      .on('error', (err) => {
        reject('Error while getting connectivity JWT: ' + err.message)
      })
  })
}

async function _connectivtySocks(jwt, credentials) {
  let sLocationBase64 = process.env.PG_CONNECTIVITY_LOCATION_ID
    ? Buffer.from(process.env.PG_CONNECTIVITY_LOCATION_ID).toString('base64')
    : ''
  let iJWTLength = Buffer.byteLength(jwt, 'utf8')
  let iLocationLength = Buffer.byteLength(sLocationBase64, 'utf8')
  let xJWTLengthBuffer = Buffer.alloc(4)
  xJWTLengthBuffer.writeInt32BE(iJWTLength)
  let xLocationLengthBuffer = Buffer.alloc(1)
  xLocationLengthBuffer.writeInt8(iLocationLength)

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

  const options = {
    proxy: {
      host: credentials.onpremise_proxy_host,
      port: parseInt(credentials.onpremise_socks5_proxy_port),
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
    timeout: 30000,
  }

  const info = await SocksClient.createConnection(options)
  return info.socket
}

async function _connectivityStream() {
  const connectivityCredentials = xsenv.cfServiceCredentials('connectivity')

  if (!connectivityCredentials) {
    log(
      'ERROR: No connectivity credentials provided (local: check env, SAP BTP: check binding)'
    )
    return
  }

  try {
    let jwt = await _connectivityToken(connectivityCredentials)
    let socket = await _connectivtySocks(jwt, connectivityCredentials)
    return socket
  } catch (err) {
    log(err)
  }
}

/**
 * Creates a SOCKS5 connection to the SAP BTP Connectivity service
 * @param {Object} credentials
 * @param {string} credentials.host - Virtual hostname as defined in the SAP Cloud Connector.
 * @param {string} credentials.port - Virtual port as defined in the SAP Cloud Connector
 * @param {string} [credentials.connectivityLocationId] - The location ID for the SAP Cloud Connector connection (optional)
 */
async function connectivityStream() {
  return await _connectivityStream()
}

module.exports = {
  connectivityStream,
}
