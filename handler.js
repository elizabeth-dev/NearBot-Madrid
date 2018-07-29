'use strict'

// Telegram and Botgram libraries and config
const https = require('https')
const agent = new https.Agent({ keepAlive: true, maxFreeSockets: 5 }) // Creating keepAlive agent
const botgram = require('botgram')
const bot = botgram('...', { agent: agent }) // Initializing Botgram with keepAlive agent

// AWS DynamoDB libraries and config
const AWS = require('aws-sdk')
const ddbGeo = require('dynamodb-geo')
const ddb = new AWS.DynamoDB({ region: 'eu-west-1' })
const converter = AWS.DynamoDB.Converter.output

const radiusLimit = 3200 // Radius limit to expand the search

const regex = {
  mediosTransporte: 'Vamos a buscar estaciones de ',
  metro: 'Vamos a buscar estaciones de metro. ',
  cercanias: 'Vamos a buscar estaciones de cercanías. ',
  metroligero: 'Vamos a buscar estaciones de metro ligero. ',
  transporte: 'Vamos a buscar estaciones de cualquier medio de transporte. '
}

// Keyboard used to request location
const locationKeyboard = [
  [{ text: '📌 Enviar mi ubicación', request: 'location' }]
]

// Function for querying the DB
async function searchQuery(msg, searchDB, initialRadius, queryInput, callback) {
  // Increment the radius until results are found
  for (let radius = initialRadius, foundResult = false; radius <= radiusLimit && foundResult === false; radius = radius*2) {
    await searchDB.queryRadius(Object.assign({
      RadiusInMeter: radius,
      CenterPoint: {
        latitude: msg.latitude,
        longitude: msg.longitude
      }
    }, queryInput))
    .then((result) => {
      // When done, or the radius limit is reached, return the resulted array
      if (result.length > 0 || radius === radiusLimit) {
        foundResult = true
        return callback(result)
      }
    })
  }
}

// Function for calculating distances http://jonisalonen.com/2014/computing-distance-between-coordinates-can-be-simple-and-fast/
function calcDistance(msg, result) {
  let geoJson = JSON.parse(result.geoJson.S)
  return 110.25 * Math.sqrt(Math.pow(geoJson.coordinates[1] - msg.latitude, 2) + Math.pow((geoJson.coordinates[0] - msg.longitude) * Math.cos(msg.latitude * (Math.PI/180)), 2))
}

async function processTransport(mode, msg, reply, results) {
  if (results.length === 0) { // If no results found
    reply.keyboard().text('Parece que estás bastante lejos de la ciudad. No hemos logrado encontrar ninguna estación de ' + mode + ' cercana.')
  } else {
    let result = null
    let distance = null
    if (results.length === 1) { // If a unique result found
      result = results[0]
      distance = Math.round(calcDistance(msg, result) * 100000) / 100
    } else { // If more than one result is found, search for the nearest
      let nearest = 0
      distance = calcDistance(msg, results[nearest])
      for (let i = 1; i < results.length; i++) {
        let newDistance = calcDistance(msg, results[i])
        
        if (newDistance < distance) { // If the new calculated distance is les than the actual nearest distance, replace it
          nearest = i
          distance = newDistance
        }
      }
      result = results[nearest]
      distance = Math.round(distance * 100000) / 100
    }

    switch(mode) {
      case 'metro':
        var denominacionPrincipal = result.denominacionMetro.S
        var lineasPrincipal = '\nLíneas Metro: _' + converter(result.lineasMetro).sort().toString().replace(/,/g, '_, _') + '_'
        var modos = '🚇'
        break
      case 'cercanías':
        var denominacionPrincipal = result.denominacionCercanias.S
        var lineasPrincipal = '\nLíneas Cercanías: _' + converter(result.lineasCercanias).sort().toString().replace(/,/g, '_, _') + '_'
        var modos = '🚆'
        break
      case 'metro ligero':
        var denominacionPrincipal = result.denominacionLigero.S
        var lineasPrincipal = '\nLíneas Metro ligero: _' + converter(result.lineasLigero).sort().toString().replace(/,/g, '_, _') + '_'
        var modos = '🚊'
        break
      case 'transporte':
        if (result.denominacionMetro) {
          var denominacionPrincipal = result.denominacionMetro.S
         var lineasPrincipal = '\nLíneas Metro: _' + converter(result.lineasMetro).sort().toString().replace(/,/g, '_, _') + '_'
          var modos = '🚇'
          mode = 'metro'
        } else if (result.denominacionCercanias) {
          var denominacionPrincipal = result.denominacionCercanias.S
          var lineasPrincipal = '\nLíneas Cercanías: _' + converter(result.lineasCercanias).sort().toString().replace(/,/g, '_, _') + '_'
          var modos = '🚆'
          mode = 'cercanías'
        } else {
          var denominacionPrincipal = result.denominacionLigero.S
          var lineasPrincipal = '\nLíneas Metro ligero: _' + converter(result.lineasLigero).sort().toString().replace(/,/g, '_, _') + '_'
          var modos = '🚊'
          mode = 'metro ligero'
        }
        break
    }

    let denominacionSecundaria = ''
    let lineasSecundaria = ''

    if (result.denominacionMetro && mode !== 'metro') {
      if (result.denominacionMetro.S !== denominacionPrincipal) {
        denominacionSecundaria = '\n🚇 Metro: ' + result.denominacionMetro.S
      } else {
        modos = modos + '🚇'
      }
      lineasSecundaria = '\nLíneas Metro: _' + converter(result.lineasMetro).sort().toString().replace(/,/g, '_, _') + '_'
    }
    if (result.denominacionCercanias && mode !== 'cercanías') {
      if (result.denominacionCercanias.S !== denominacionPrincipal) {
        denominacionSecundaria = denominacionSecundaria + '\n🚆 Cercanías: ' + result.denominacionCercanias.S
      } else {
        modos = modos + '🚆'
      }
      lineasSecundaria = lineasSecundaria + '\nLíneas Cercanías: _' + converter(result.lineasCercanias).sort().toString().replace(/,/g, '_, _') + '_'
    }
    if (result.denominacionLigero && mode !== 'metro ligero') {
      if (result.denominacionLigero.S !== denominacionPrincipal) {
        denominacionSecundaria = denominacionSecundaria + '\n🚊 Metro ligero: ' + result.denominacionLigero.S
      } else {
        modos = modos + '🚊'
      }
      lineasSecundaria = lineasSecundaria + '\nLíneas Metro ligero: _' + converter(result.lineasLigero).sort().toString().replace(/,/g, '_, _') + '_'
    }
    
    reply.keyboard().text('Esta es la estación de ' + mode + ' más cercana:')
    reply.markdown(modos + ' *' + denominacionPrincipal + '* (_' + distance + 'm_)' + denominacionSecundaria + '\n' + lineasPrincipal + lineasSecundaria)
  }
}

bot.command('metro', 'cercanias', 'metroligero', 'transporte', (msg, reply, next) => {
  reply.keyboard(locationKeyboard, true).text(regex[msg.command] + 'Toca en el botón inferior para enviar tu ubicación.')
})

bot.location((msg, reply) => {
  // If message requests a transport station
  if (RegExp('^' + regex.mediosTransporte).test(msg.reply.text)) {
    // Initialize the DB client
    let transporteConfig = new ddbGeo.GeoDataManagerConfiguration(ddb, 'NearBot_Madrid_Transporte')
    transporteConfig.hashKeyLength = 8
    let transporteDB = new ddbGeo.GeoDataManager(transporteConfig)
    let filter = {}
    
    // Check which type of station is the user requesting
    switch (true) {
      case RegExp('^' + regex.metro).test(msg.reply.text):
        // Filter for limiting the search to metro stations
        filter = {
          QueryInput: {
            FilterExpression: 'contains(#modos, :type)',
            ExpressionAttributeNames: { '#modos': 'modos' },
            ExpressionAttributeValues: { ':type': {'S': 'Metro' } }
          }}
      
        // Query the DB and process the results
        searchQuery(msg, transporteDB, 200, filter, (results) => {
          processTransport('metro', msg, reply, results)
        })
        break
      case RegExp('^' + regex.cercanias).test(msg.reply.text):
        // Filter for limiting the search to commuter train stations
        filter = {
          QueryInput: {
            FilterExpression: 'contains(#modos, :type)',
            ExpressionAttributeNames: { '#modos': 'modos' },
            ExpressionAttributeValues: { ':type': {'S': 'Cercanías' } }
          }}
      
        // Query the DB and process the results
        searchQuery(msg, transporteDB, 200, filter, (results) => {
          processTransport('cercanías', msg, reply, results)
        })
        break
      case RegExp('^' + regex.metroligero).test(msg.reply.text):
        // Filter for limiting the search to tram stations
        filter = {
          QueryInput: {
            FilterExpression: 'contains(#modos, :type)',
            ExpressionAttributeNames: { '#modos': 'modos' },
            ExpressionAttributeValues: { ':type': {'S': 'Metro Ligero' } }
          }}
      
        // Query the DB and process the results
        searchQuery(msg, transporteDB, 200, filter, (results) => {
          processTransport('metro ligero', msg, reply, results)
        })
        break
      case RegExp('^' + regex.transporte).test(msg.reply.text):
        // Query the DB and process the results
        searchQuery(msg, transporteDB, 200, filter, (results) => {
          processTransport('transporte', msg, reply, results)
        })
        break
    }
  }
})
  
  
  module.exports.telegram = (event, context, callback) => {
    bot.processUpdate(event.body) // Botgram processes incoming request
    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Go Serverless v1.0! Your function executed successfully!',
        input: event
      })
    }
    
    callback(null, response)
    
    // Use this code if you don't use the http event with the LAMBDA-PROXY integration
    // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
  }
