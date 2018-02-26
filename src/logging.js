import { yellow, red, blue, grey } from 'chalk'

export const toIncomingRequest = message => {
  const {
    fields: { routingKey },
    properties: { correlationId, appId }
  } = message

  return [
    `{${yellow(correlationId.slice(0, 8))}}`,
    `Received ${yellow(routingKey)}`,
    `from ${yellow(appId)}`
  ]
}

export const toResponse = message => {
  const { replyTo, correlationId, appId } = message.properties
  return [
    `{${blue(correlationId.slice(0, 8))}}`,
    `Response sent to '${blue(replyTo)}'`,
    `for '${blue(appId)}'`
  ]
}

export const toOutgoingError = (message, error) => {
  const { replyTo, correlationId, appId } = message.properties
  return [
    `{${red(correlationId.slice(0, 8))}}`,
    `Error '${red(error.toString())}'`,
    `sent to '${red(replyTo)}'`,
    `for '${red(appId)}'`
  ]
}

export const toIncomingError = (message, error) => {
  const { correlationId, appId } = message.properties
  return [
    `{${red(correlationId.slice(0, 8))}}`,
    `Error '${red(error.toString())}'`,
    `received from '${red(appId)}'`
  ]
}

export const toOutgoingRequest = options => [
  `{${blue(options.correlationId.slice(0, 8))}}`,
  `Request '${blue(options.routingKey)}'`,
  `sent by '${blue(options.appId)}'`
]

export const toMeta = (message, owner) => {
  const oneRowMessage = Array.isArray(message) ? message.join(' ') : message
  const time = new Date().toTimeString().split(' ')[0]

  return `[${grey(time)}] [${owner}] ${oneRowMessage}`
}
