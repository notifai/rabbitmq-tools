import amqp from 'amqplib'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'

export const connect = (url, logger = console) => {
  const store = new BehaviorSubject(null)

  startConnection(url, store, logger)

  return store
}

async function startConnection(url, store, logger) {
  const reconnect = delay => {
    logger.log(`[AMQP] Reconnecting in ${delay / 1000} seconds...`)
    setTimeout(() => startConnection(url, store, logger), delay)
  }

  try {
    const connection = await amqp.connect(url)

    connection.on('error', error => {
      logger.warn(`[AMQP] Connection error: ${error.message}`)
      reconnect(1000)
    })

    connection.on('close', () => {
      store.next(null)
      logger.log('[AMQP] Connection was closed')
      reconnect(1000)
    })

    logger.log('[AMQP] Connected')
    store.next(connection)
  } catch (error) {
    logger.warn(`[AMQP] Failed to connect: ${error.message}`)
    reconnect(5000)
  }
}
