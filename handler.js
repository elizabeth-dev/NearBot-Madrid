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

const metroRegex = 'Vamos a buscar estaciones de metro. ' // Regexp to search for metro

// Keyboard used to request location
const locationKeyboard = [
  [{ text: '📌 Enviar mi ubicación', request: 'location' }]
]

// IN the future, this will be done in the DB
function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt){
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

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

bot.command('metro', (msg, reply, next) => {
  reply.keyboard(locationKeyboard, true).text(metroRegex + 'Toca en el botón inferior para enviar tu ubicación.')
})

bot.location((msg, reply) => {
  // If message responds to a metro location
  if (RegExp('^' + metroRegex).test(msg.reply.text)) {
    // Initialize the DB client
    const transporteConfig = new ddbGeo.GeoDataManagerConfiguration(ddb, 'NearBot_Madrid_Transporte')
    transporteConfig.hashKeyLength = 8
    const transporteDB = new ddbGeo.GeoDataManager(transporteConfig)
    
    // Filter for limiting the search to metro stations
    const metroFilter = {
      QueryInput: {
        FilterExpression: 'contains(#modos, :type)',
        ExpressionAttributeNames: { '#modos': 'modos' },
        ExpressionAttributeValues: { ':type': {'S': 'Metro' } }
      }}
      
      // Query the DB and process the results
      searchQuery(msg, transporteDB, 200, metroFilter, (results) => {
        if (results.length === 0) { // If no results found
          reply.text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna estación de metro cercana.')
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
              let actualDistance = calcDistance(msg, results[nearest]) //delete?
              let newDistance = calcDistance(msg, results[i])
              
              if (newDistance < distance) { // If the new calculated distance is les than the actual nearest distance, replace it
                nearest = i
                distance = newDistance
              }
            }
            result = results[nearest]
            distance = Math.round(distance * 100000) / 100
          }
          let lineasMetro = '\nLíneas Metro: _' + AWS.DynamoDB.Converter.output(result.lineasMetro).sort().toString().replace(/,/g, '_, _') + '_'
          let lineasCercanias = ''
          let lineasLigero = ''
          
          let denominacionMetro = toTitleCase(result.denominacionMetro.S)
          let denominacionCercanias = ''
          let denominacionLigero = ''
          
          // Get list of transport modes and turn them into emojis, and process the different mode names
          let modos = '🚇'
          if (converter(result.modos).indexOf('Cercanías') > -1) {
            if (result.denominacionCercanias.S !== denominacionMetro) {
              denominacionCercanias = '\n🚆 Cercanías: ' + toTitleCase(result.denominacionCercanias.S)
            } else {
              modos = modos + '🚆'
            }
            lineasCercanias = '\nLíneas Cercanías: _' + AWS.DynamoDB.Converter.output(result.lineasCercanias).sort().toString().replace(/,/g, '_, _') + '_'
          }
          if (converter(result.modos).indexOf('Metro Ligero') > -1) {
            if (result.denominacionLigero.S !== denominacionMetro) {
              denominacionLigero = '\n🚊 Metro ligero: ' + toTitleCase(result.denominacionLigero.S)
            } else {
              modos = modos + '🚊'
            }
            lineasLigero = '\nLíneas Metro ligero: _' + AWS.DynamoDB.Converter.output(result.lineasLigero).sort().toString().replace(/,/g, '_, _') + '_'
          }
          
          reply.keyboard().markdown(modos + ' *' + denominacionMetro + '* (_' + distance + 'm_)' + denominacionCercanias + denominacionLigero + '\n' + lineasMetro + lineasCercanias + lineasLigero)
        }
      })
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