import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import 'rxjs/add/operator/filter'

export const openChannel = (connectionStore, logger = console) => {
  const store = new BehaviorSubject(null)

  connectionStore
    .filter(connection => connection)
    .subscribe(connection => startChannel(connection, store, logger))

  return store
}

async function startChannel(connection, store, logger) {
  const restart = delay => {
    logger.log(`[AMQP] Restarting channel in ${delay / 1000} seconds...`)
    setTimeout(() => startChannel(connection, store, logger), delay)
  }

  connection.createChannel()
    .then(channel => {
      channel.on('error', error => {
        logger.log(`[AMQP] Channel error: ${error.message}`)
        restart(1000)
      })
      channel.on('close', () => {
        logger.log('[AMQP] Channel was closed')
        store.next(null)
      })

      logger.log('[AMQP] Channel has been opened')
      store.next(channel)
    })
    .catch(error => {
      logger.warn(`[AMQP] Failed to create channel: ${error.message}`)
      restart(1000)
    })
}
