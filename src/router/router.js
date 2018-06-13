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

  if (!options.routes) {
    throw new Error('"config.routes" is required')
  }
}

export class Router {
  static create(...args) {
    return new Router(...args)
  }

  constructor({ logger = console, ...options }) {
    validateRouterOptions(options)

    this.rxChannel = options.channel
    this.appId = options.appId
    this.routes = options.routes
    this.logger = logger
    this.connectionId = options.connectionId || options.channel.connectionId

    this.watchChannel()
  }

  watchChannel() {
    this.rxChannel
      .filter(channel => channel)
      .subscribe(channel => {
        this.channel = channel
        return this.listen()
      })
  }

  async listen() {
    await this.channel.prefetch(1)
    await Promise.all(this.routes.map(route => this.bindChannel(route)))
  }

  async bindChannel(route) {
    const queue = `${this.appId}.${route.routingKey}`

    await this.channel.assertQueue(queue, route.queueOptions)
      .catch(error => {
        this.log(`Failed to assert queue '${queue}'`)
        this.logger.log(error)
      })
    await this.channel.bindQueue(queue, route.exchange, route.routingKey)
      .catch(error => {
        this.log(`Failed to bindQueue queue '${queue}', on exchange '${route.exchange}', routing key '${route.routingKey}'`)
        this.logger.log(error)
      })
    await this.channel.consume(queue, message => this.route(message, route), Object.assign({
      consumerTag: `${this.appId}-${uuid.v4()}`
    }, route.consumerOptions))
      .catch(error => {
        this.log(`Failed to consume queue '${queue}'`)
        this.logger.log(error)
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
      this.log(logging.formatSubscriptionError(message, error))
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
