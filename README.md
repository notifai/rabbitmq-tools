# Rabbit-tools

This library is aimed to ease [amqplib](https://github.com/squaremo/amqp.node) usage.

[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)


## Installation:
```
npm i rabbitmq-tools -S
```

## Following features are implemented:
* Client reconnection
* Failed channel reopening
* Routing and message validation via [jsonschema](https://github.com/tdegrunt/jsonschema)
* Promise based querying interface that is curried by default

## Basic usage:
```
const routerConfig = {
  routes: [
    {
      exchange: 'exchange',
      routingKey: 'routing.key',
      resolver: request => handle(request),
      requestSchema: jsonschema // optional
    }
  ]
}

const client = Messenger.create({
  url: 'rabbitMQUrl',
  appId: 'appId',
  routerConfig
})

client.request('exchange', replyTo, 'routing.key', message)
    .then(reply => ....)
    
// or 
const request = client.request(exchange, replyTo)
request(routingKey, message)
    .then(reply => ....)
```

## Roadmap
* Implement more flexible amqp configurations
* Cover with tests
* Improve documentation
* Implement logging disabling
