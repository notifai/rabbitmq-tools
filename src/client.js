import { v4 as uuid } from 'uuid'
import { Subject } from 'rxjs/Subject'
import curry from 'lodash/curry'
import 'rxjs/add/operator/first'

import { connect } from './connection'
import { openChannel } from './channel'
import { Router } from './router'
import * as logging from './logging'

export class Messenger {
  static create(options) {
    return new Messenger(options)
  }

  constructor(options) {
    this.appId = options.appId || 'default-app'
    this.logger = options.logger || console
    this.channelStore = openChannel(connect(options.url))
    this.replyQueues = new Set()
    this.requests = new Map()

    this.setupRouter(options)
    this.curry()
    this.watchChannelQueues()
  }

  async setupRouter(options) {
    return options.routerConfig &&
      Router.listen({
        logger: options.logger,
        appId: options.appId,
        ...options.routerConfig,
        channel: await this.getChannel()
      })
  }

  curry() {
    this.request = curry(this._request.bind(this)) // eslint-disable-line no-underscore-dangle
    this.publish = curry(this._publish.bind(this)) // eslint-disable-line no-underscore-dangle
  }

  async _request(exchange, replyTo, routingKey, message) {
    const correlationId = uuid()
    this.requests.set(correlationId, new Subject())

    const channel = await this.getChannel()
    await channel.assertQueue(replyTo, { exclusive: true })
    this.assertConsume(channel, replyTo, this.resolveReply)

    this.publish(exchange, routingKey, message, { replyTo, correlationId })

    return this.requests.get(correlationId).first().toPromise()
  }

  assertConsume(channel, queue, handler) {
    if (!this.replyQueues.has(queue)) {
      this.replyQueues.add(queue)
      return channel.consume(queue, handler.bind(this), { noAck: true })
    }
    return Promise.resolve(channel)
  }

  resolveReply(message) {
    if (this.requests.has(message.properties.correlationId)) {
      const reply = JSON.parse(message.content.toString())

      this.requests
        .get(message.properties.correlationId)
        .next(reply)

      const logMessage = reply.error ?
        logging.toIncomingError(message, reply.error) :
        logging.toResponse(message)

      this.log(logMessage, reply)
    }
  }

  async _publish(exchange, routingKey, message, options) {
    const channel = await this.getChannel()

    this.log(logging.toOutgoingRequest({
      correlationId: options.correlationId,
      routingKey,
      appId: this.appId
    }), message)

    return channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(message, null, '\t')),
      {
        appId: this.appId,
        contentEncoding: 'utf-8',
        contentType: 'application/json',
        ...options
      }
    )
  }

  getChannel() {
    return this.channelStore
      .filter(channel => channel)
      .first()
      .toPromise()
  }

  watchChannelQueues() {
    return this.channelStore
      .filter(channel => !channel)
      .subscribe(() => this.replyQueues.clear())
  }

  log(message, data) {
    this.logger.log(logging.toMeta(message, 'AMQP-Client'))

    if (data) {
      this.logger.dir(data, { colors: true, depth: 10 })
    }
  }
}
