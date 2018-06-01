import amqp from 'amqplib'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'

import { formatMeta } from './logging'

// TODO: implement connection close
export const connect = (url, options = { logger: console }) => startRxConnection(
  url,
  new BehaviorSubject(null),
  options
)

function startRxConnection(url, store, options) {
  const { logger } = options
  const connectionId = options.connectionId || (options.url && options.url.vhost)
  const prefix = connectionId ? `AMQP:${connectionId}` : 'AMQP'

  const log = message => logger && logger.log(formatMeta(prefix, message))
  const reconnect = delay => {
    log(`Reconnecting in ${delay / 1000} seconds...`)
    setTimeout(() => startRxConnection(url, store, options), delay)
  }

  Promise.resolve(amqp.connect(url))
    .then(connection => {
      connection.on('error', error => (logger || console)
        .warn(formatMeta(prefix, `Connection error: ${error.message}`)))

      connection.on('close', () => {
        log('Connection was closed')
        store.next(null)
        reconnect(1000)
      })

      log('Connected')
      Object.assign(connection, { connectionId })
      store.next(connection)
    })
    .catch(error => {
      if (logger) {
        logger.warn(formatMeta(prefix, `Failed to connect: ${error.message}`))
      }
      reconnect(5000)
    })

  return store
}
