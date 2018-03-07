import uuid from 'uuid'
import kebabCase from 'lodash/kebabCase'
import { yellow } from 'chalk'

import { validate } from '../schema-validator'
import messageSchema from './message-schema'
import * as logging from '../logging'

const { NODE_ENV } = process.env

export class Router {
  static create(config) {
    return new Router(config)
  }

  static listen(config) {
    if (!config.channel) {
      throw new Error('"config.channel" is required to start listening')
    }

    const router = Router.create(config)

    return router.listen(config.channel)
      .then(() => router)
  }

  constructor({ appId, routes, logger }) {
    if (!appId) {
      throw new Error('"config.appId" is required')
    }

    this.appId = appId
    this.routes = routes
    this.logger = typeof logger === 'undefined' ? console : logger
  }

  async listen(channel) {
    await channel.prefetch(1)
    await Promise.all(this.routes.map(route => this.bindChannel(channel, route)))
  }

  async bindChannel(channel, route) {
    const queue = kebabCase(`${this.appId}-${route.routingKey}`)

    await channel.assertQueue(queue, { durable: true })
    await channel.bindQueue(queue, route.exchange, route.routingKey)

    await channel.consume(queue, message => this.route(message, channel, route), {
      consumerTag: `${this.appId}-${process.pid}-${uuid.v4()}`,
      priority: NODE_ENV === 'development' ? 100 : null
    })

    this.log(`Starts listening to '${yellow(queue)}'`)
  }

  async route(message, channel, route) {
    try {
      const request = this.getValidRequest(message, route)

      const response = await Promise.resolve(route.resolver(request, channel))

      return this.replyWithData(channel, message, response)
    } catch (error) {
      return this.replyWithError(channel, message, error)
    }
  }

  getValidRequest(message, route) {
    validate(message.properties, messageSchema)

    const request = JSON.parse(message.content.toString())
    this.log(logging.formatIncomingRequest(message), request)

    if (route.requestSchema) {
      validate(request, route.requestSchema)
    }

    return request
  }

  replyWithData(channel, message, data) {
    this.reply(channel, message, { data })
    channel.ack(message)
  }

  replyWithError(channel, message, error) {
    this.reply(channel, message, { error: error.toString() })
    channel.reject(message, false)
  }

  reply(channel, message, data) {
    if (!message.properties.replyTo) {
      return
    }

    channel.sendToQueue(
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

    this.logger.log(logging.formatMeta('Router', message))

    if (data) {
      this.logger.dir(data, { colors: true, depth: 10 })
    }
  }
}
