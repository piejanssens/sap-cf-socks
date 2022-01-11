# SAP BTP Cloud Foundry TCP connectvity via SAP Cloud Connector

## Intro

This package provides a drop in solution to communicate with an on-premise host over TCP communication. The connection is established using the SAP BTP Connectivity service. This module will provide a net.Socket.

## Prerequisites

- SAP Cloud Connector with TCP connection enabled to the TCP host
- BTP subaccount connected to the SAP Cloud Connector
- Cloud Foundry app bound to SAP BTP Connectivity service

## Installation

`npm i sap-cf-socks`

## Usage

```javascript
 (const { ConnectivitySocks } = require('sap-cf-socks')
const socket = new ConnectivitySocks().getSocket() // returns net.Socket
```

## References

- cds-pg
- ... (please add your examples)
