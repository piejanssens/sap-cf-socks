exports.socksAuthMessages = [
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
