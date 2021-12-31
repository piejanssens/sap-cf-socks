# Test connectivity to pg

## Requirements

- local Postgres DB
- database with books table at least a column 'name' (or change the query)
- SAP Cloud Connector with TCP connection enabled to the postgres host

## Deploy to CF

`cf push`

## Test

access the root of deployed application and it should print out all book names

## To be confirmed

It appears that SAP BTP will end() the exactly socket 1m after socks5 handshake, but this is extended by 10s for every TCP traffic
