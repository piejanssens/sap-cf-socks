# Test connectivity to pg

## Requirements

- local Postgres DB
- database with books table at least a column 'name' (or change the query)
- SAP Cloud Connector with TCP connection enabled to the postgres host

## Deploy to CF

`cf push`

## Test

access the root of deployed application and it should print out all book names

## Known issue

- initially, the connection works and will print all book names, even when refreshing over and over
- after about a minute (counting from the moment of deployment) the connection to postgress is getting refused
  `<ref *1> Error: connect ECONNREFUSED 127.0.0.1:5433`
