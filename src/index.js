import 'babel-polyfill'

import { connect } from './connection'
import { openChannel } from './channel'
import { Router } from './router'
import { ReactiveMQ } from './client'

export { connect }
export { openChannel }
export { Router }
export { ReactiveMQ }

const {
  AMQP_URL,
  AMQP_USER,
  AMQP_PASSWORD
} = process.env

const [hostname, port] = AMQP_URL.split(':')
const EXCHANGE = 'events'

const client = ReactiveMQ.create({
  url: 'amqp://guest:guest@localhost:5672?heartbeat=5',
  // url: {
  //   protocol: 'amqp',
  //   hostname,
  //   port,
  //   username: AMQP_USER,
  //   password: AMQP_PASSWORD,
  //   frameMax: 0,
  //   heartbeat: 5,
  //   vhost: 'arbnco'
  // },
  appId: 'test'
})

client.setupRouter({
  routes: [
    {
      exchange: EXCHANGE,
      routingKey: 'hardware.v1.created',
      resolver: () => console.log('-------'),
      queueOptions: { durable: false }
    }
  ]
})

client.publish(EXCHANGE, 'hardware.v1.created', { foo: 'bar' })

