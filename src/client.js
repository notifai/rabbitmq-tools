import { v4 as uuid } from 'uuid'
import { Subject } from 'rxjs/Subject'
import curry from 'lodash/curry'
import 'rxjs/add/operator/first'

import { connect } from './connection'
import { openChannel } from './channel'
import { Router } from './router'
import * as logging from './logging'

const toBuffer = obj => Buffer.from(JSON.stringify(obj, null, '\t'))

export class Messenger {
  static create(options) {
    return new Messenger(options)
  }

  get pubOptions() {
    return {
      appId: this.appId,
      contentEncoding: 'utf-8',
      contentType: 'application/json'
    }
  }

  constructor(options) {
    this.appId = options.appId || 'default-app'
    this.logger = typeof options.logger === 'undefined' ? console : options.logger
    this.channelStore = openChannel(connect(options.url, this.logger), this.logger)
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

    this.log(logging.formatOutgoingRequest(correlationId, routingKey, this.appId), message)

    channel.publish(exchange, routingKey, toBuffer(message), {
      replyTo,
      correlationId,
      ...this.pubOptions
    })

    return this.requests.get(correlationId).first().toPromise().then(({ data }) => data)
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

      this.log(logging.formatIncomingResponse(message, reply.error), reply)
    }
  }

  async _publish(exchange, routingKey, message) {
    const channel = await this.getChannel()

    this.log(logging.formatEvent(routingKey, this.appId), message)

    return channel.publish(exchange, routingKey, toBuffer(message), this.pubOptions)
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
    if (!this.logger) {
      return
    }

    this.logger.log(logging.formatMeta('AMQP', message))

    if (data) {
      this.logger.dir(data, { colors: true, depth: 10 })
    }
  }
}
