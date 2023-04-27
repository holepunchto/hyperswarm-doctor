#!/usr/bin/env node

import DHT from 'hyperdht'
import minimist from 'minimist'
import b4a from 'b4a'

const argv = minimist(process.argv, {
  alias: { server: 's', client: 'c' }
})

const node = new DHT()

console.log('Waiting for node to be fully bootstrapped to collect info...')
await node.ready()

console.log()
console.log('Node info:')
console.log('- remote host:', node.host)
console.log('- remote port:', node.port)
console.log('- firewalled:', node.firewalled)
console.log('- nat type:', node.port ? 'consistent' : 'random')
console.log()

if (argv.client) {
  await testClient()
} else if (argv.server) {
  await testServer()
} else {
  await node.destroy()
}

async function testClient () {
  console.log('Connecting to test server...')
  const socket = node.connect(b4a.from(argv.client, 'hex'))

  socket.on('connect', function () {
    console.log('Connected to ' + socket.rawStream.remoteHost)
  })

  let time = 0
  write(32)

  socket.on('data', function (data) {
    if (!data.byteLength) return // ignore keep alives

    console.log('Server echoed back ' + data.byteLength + ' bytes in ' + (Date.now() - time) + 'ms')
    if (data.byteLength >= 4 * 1024 * 1024) {
      console.log('Done! ending connection...')
      socket.end()
      return
    }

    write(data.byteLength * 2)
  })

  socket.on('close', function () {
    console.log('Connection closed')
    node.destroy()
  })

  function write (n) {
    console.log('Sending ' + n + ' bytes for the server to echo')
    socket.write(b4a.alloc(n))
    time = Date.now()
  }
}

async function testServer () {
  console.log('Creating test server...')
  console.log()

  const seed = typeof argv.server === 'string' ? b4a.from(argv.server, 'hex') : undefined
  const keyPair = DHT.keyPair(seed)

  console.log('To restart with the same server do:')
  console.log('  --server=' + keyPair.secretKey.toString('hex').slice(0, 64))
  console.log()

  const server = node.createServer(function (socket) {
    let error = null
    const remoteHost = socket.rawStream.remoteHost

    console.log('Received new connection from ' + remoteHost)

    socket.pipe(socket)
    socket.setKeepAlive(5000)

    socket.on('error', function (err) {
      error = err
    })

    socket.on('close', function () {
      console.log('Connection from ' + remoteHost + ' was closed', error ? ' (' + error.message + ')' : '')
    })
  })

  await server.listen(keyPair)
  console.log('Server is listening. To test connections run:')
  console.log('  --client=' + keyPair.publicKey.toString('hex'))
  console.log()

  process.once('SIGINT', () => {
    console.log('Shutting down...')
    node.destroy()
  })
}
