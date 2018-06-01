import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import 'rxjs/add/operator/filter'

import { formatMeta } from './logging'

export const openChannel = (connectionStore, options = { logger: console }) => {
  const store = new BehaviorSubject(null)

  connectionStore
    .filter(connection => connection)
    .subscribe(connection => startRxChannel(connection, store, options))

  return store
}

async function startRxChannel(connection, store, options) {
  const { logger } = options
  const connectionId = connection.connectionId || options.connectionId
  const prefix = connectionId ? `AMQP:${connectionId}` : 'AMQP'

  const log = message => logger && logger.log(formatMeta(prefix, message))

  connection.createChannel()
    .then(channel => {
      channel.on('error', error => (logger || console)
        .log(`Channel error: ${error.message}`))

      channel.on('close', () => {
        log('Channel was closed')
        store.next(null)
      })

      log('Channel has been opened')
      Object.assign(channel, { connectionId })
      store.next(channel)
    })
    .catch(error => {
      if (logger) {
        logger.warn(formatMeta(prefix, `Failed to create channel: ${error.message}`))
      }
      connection.close()
    })

  return store
}
