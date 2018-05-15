import amqp from 'amqplib'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'

import { formatMeta } from './logging'

export const connect = (url, logger) => {
  const store = new BehaviorSubject(null)

  startConnection(
    url,
    store,
    typeof logger === 'undefined' ? console : logger
  )

  return store
}

async function startConnection(url, store, logger) {
  const reconnect = delay => {
    if (logger) {
      logger.log(formatMeta('AMQP', `Reconnecting in ${delay / 1000} seconds...`))
    }
    setTimeout(() => startConnection(url, store, logger), delay)
  }

  try {
    const connection = await amqp.connect(url)

    connection.on('error', error => {
      if (logger) {
        logger.warn(formatMeta('AMQP', `Connection error: ${error.message}`))
      }
    })

    connection.on('close', () => {
      if (logger) {
        logger.log(formatMeta('AMQP', 'Connection was closed'))
      }
      store.next(null)
      reconnect(1000)
    })

    if (logger) {
      logger.log(formatMeta('AMQP', 'Connected'))
    }
    store.next(connection)
  } catch (error) {
    if (logger) {
      logger.warn(formatMeta('AMQP', `Failed to connect: ${error.message}`))
    }
    reconnect(5000)
  }
}
