import uuid from 'uuid'
import { yellow } from 'chalk'

import { validate } from '../schema-validator'
import messageSchema from './message-schema'
import * as logging from '../logging'

const validateRouterOptions = options => {
  if (!options.channel) {
    throw new Error('"config.channel" is required')
  }

  if (!options.appId) {
    throw new Error('"config.appId" is required')
  }
}

export class Router {
  static listen(config) {
    if (!config.routes || !config.routes.length) {
      throw new Error('"config.routes" is required')
    }

    const router = new Router(config)
    return router.listen().then(() => router)
  }

  constructor(options) {
    validateRouterOptions(options)

    this.channel = options.channel
    this.appId = options.appId
    this.routes = options.routes
    this.logger = options.logger || console
    this.connectionId = options.connectionId || options.channel.connectionId
  }

  async listen() {
    await this.channel.prefetch(1)
    await Promise.all(this.routes.map(route => this.bindChannel(route)))
  }

  async bindChannel(route) {
    const queue = `${this.appId}.${route.routingKey}`

    await this.channel.assertQueue(queue, route.queueOptions)
    await this.channel.bindQueue(queue, route.exchange, route.routingKey)
    await this.channel.consume(queue, message => this.route(message, route), {
      consumerTag: `${this.appId}-${uuid.v4()}`,
      ...(route.consumerOptions || {})
    })

    this.log(`Starts listening to '${yellow(queue)}'`)
  }

  async route(message, route) {
    // TODO: think on better requeue logic (in case of replyWithData too)
    let requeueOnError = false
    const requeue = () => { requeueOnError = true }

    try {
      const request = this.getValidRequest(message, route)
      const response = await Promise.resolve(route.resolver(request, this.channel, requeue))

      return this.replyWithData(message, response)
    } catch (error) {
      return this.replyWithError({
        message,
        error: error.toString(),
        requeue: requeueOnError
      })
    }
  }

  getValidRequest(message, route) {
    validate(message.properties, messageSchema)

    const request = JSON.parse(message.content.toString())
    this.log(logging.formatIncomingMessage(message), request)

    if (route.requestSchema) {
      validate(request, route.requestSchema)
    }

    return request
  }

  replyWithData(message, data) {
    this.reply(message, { data })
    this.channel.ack(message)
  }

  replyWithError({ message, error, requeue = false }) {
    this.reply(message, { error })
    this.channel.reject(message, requeue)
  }

  reply(message, data) {
    if (!message || !message.properties || !message.properties.replyTo) {
      return
    }

    this.channel.sendToQueue(
      message.properties.replyTo,
      Buffer.from(JSON.stringify(data, null, '\t')),
      {
        appId: this.appId,
        contentEncoding: 'application/json',
        contentType: 'utf-8',
        correlationId: message.properties.correlationId
      },
    )

    this.log(logging.formatOutgoingResponse(message, data.error), data)
  }

  log(message, data) {
    if (!this.logger) {
      return
    }

    const prefix = this.connectionId ? `Router:${this.connectionId}` : 'Router'
    this.logger.log(logging.formatMeta(prefix, message))

    if (data) {
      this.logger.dir(data, { colors: true, depth: 10 })
    }
  }
}
