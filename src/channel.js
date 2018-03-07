import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import 'rxjs/add/operator/filter'

import { formatMeta } from './logging'

export const openChannel = (connectionStore, logger) => {
  const store = new BehaviorSubject(null)

  connectionStore
    .filter(connection => connection)
    .subscribe(connection => startChannel(
      connection,
      store,
      typeof logger === 'undefined' ? console : logger
    ))

  return store
}

async function startChannel(connection, store, logger) {
  const restart = delay => {
    logger.log(formatMeta('AMQP', `Restarting channel in ${delay / 1000} seconds...`))
    setTimeout(() => startChannel(connection, store, logger), delay)
  }

  connection.createChannel()
    .then(channel => {
      channel.on('error', error => {
        if (logger) {
          logger.log(formatMeta('AMQP', `Channel error: ${error.message}`))
        }
        restart(1000)
      })

      channel.on('close', () => {
        if (logger) {
          logger.log(formatMeta('AMQP', 'Channel was closed'))
        }
        store.next(null)
      })

      if (logger) {
        logger.log(formatMeta('AMQP', 'Channel has been opened'))
      }
      store.next(channel)
    })
    .catch(error => {
      if (logger) {
        logger.warn(formatMeta('AMQP', `Failed to create channel: ${error.message}`))
      }
      restart(1000)
    })
}
