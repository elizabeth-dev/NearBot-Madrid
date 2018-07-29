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

const regex = {
	mediosTransporte: 'Vamos a buscar estaciones de ',
	marcasSupermercado: 'Vamos a buscar el supermercado ',
	metro: 'Vamos a buscar estaciones de metro. ',
	cercanias: 'Vamos a buscar estaciones de cercanías. ',
	metroligero: 'Vamos a buscar estaciones de metro ligero. ',
	transporte: 'Vamos a buscar estaciones de cualquier medio de transporte. ',
	fuente: 'Vamos a buscar fuentes de agua. ',
	bici: 'Vamos a buscar bases de BiciMAD. ',
	aseo: 'Vamos a buscar el aseo más cercano. ',
	carrefour: 'Vamos a buscar el supermercado Carrefour más cercano. ',
	mercadona: 'Vamos a buscar el supermercado Mercadona más cercano. ',
	supermercado: 'Vamos a buscar el supermercado más cercano. '
}

// Keyboard used to request location
const locationKeyboard = [
	[{ text: '📌 Enviar mi ubicación', request: 'location' }]
]

// I still need this https://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript/196991#196991
function toTitleCase(str) {
	return str.replace(/\w\S*/g, function(txt){
			return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
	});
}

function transformHour(hora) {
	return hora.slice(0, hora.length-2) + ':' + hora.slice(hora.length-2, hora.length)
}

// Function for querying the DB
async function searchQuery(msg, searchDB, initialRadius, radiusLimit, queryInput, callback) {
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

async function processFuente(msg, reply, results) {
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna fuente cercana.')
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

		let calle = ''
		if (result.calle) {
			calle = result.calle.S
		}

		reply.keyboard().text('La fuente más cercana es:')
		reply.markdown('🚰 *' + toTitleCase(result.denominacion.S) + '* (_' + distance + 'm_)\n\n' + toTitleCase(calle))
	}
}

async function processBici(msg, reply, results) {
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna estación de BiciMAD.')
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

		reply.keyboard().text('La estación de BiciMAD más cercana es:')
		reply.markdown('🚲 ' + result.numeroBase.S + ' - *' + result.denominacionBici.S + '* (_' + distance + 'm_)\n\n' + result.calle.S)
	}
}

async function processAseo(msg, reply, results) {
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ningún aseo cercano.')
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

		let descripcion = ''
		if (result.descripcion) {
			descripcion = result.descripcion.S
		}

		reply.keyboard().text('El aseo más cercano es:')
		reply.markdown('🚽 *' + toTitleCase(result.calle.S) + '* (_' + distance + 'm_)\n\n' + descripcion)
	}
}

async function processSuper(marca, msg, reply, results) {
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de la ciudad. No hemos logrado encontrar ningún ' + marca + ' cercano.')
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

		let day = new Date().getDay()
		let arrayHorarios = converter(result.horario.L[day])
		let horario = ''
		if (arrayHorarios[0][0] === 0) {
			horario = ' Cerrado hoy'
		} else {
			for (let i = 0; i < arrayHorarios[0].length; i++) {
				horario = (horario + ' ' + transformHour(arrayHorarios[0][i].toString()) + 'h - ' + transformHour(arrayHorarios[1][i].toString()) + 'h ').replace('  ', ', ')
			}
		}

		let descripcion = ''
		if (result.descripcion) {
			descripcion = '\n' + result.descripcion.S
		}
		reply.keyboard().text('El ' + marca + ' más cercano es:')
		reply.markdown('🛒 *' + result.nombre.S + '* (_' + distance + 'm_)\n\n' + result.calle.S + ', ' + result.ciudad.S + descripcion + '\n\n📞 ' + result.telefono.S + '\n🕒' + horario)
	}
}

bot.command('metro', 'cercanias', 'metroligero', 'transporte', 'fuente', 'bici', 'aseo', 'carrefour', 'mercadona', 'supermercado', (msg, reply) => {
	reply.keyboard(locationKeyboard, true).text(regex[msg.command] + 'Toca en el botón inferior para enviar tu ubicación.')
})

bot.location((msg, reply) => {
	if (RegExp('^' + regex.mediosTransporte).test(msg.reply.text)) { // If message requests a transport station
		// Initialize the DB client
		let transporteConfig = new ddbGeo.GeoDataManagerConfiguration(ddb, 'NearBot_Madrid_Transporte')
		transporteConfig.hashKeyLength = 8
		let transporteDB = new ddbGeo.GeoDataManager(transporteConfig)
		let filter = {}
		let transporteRadius = 3200
		
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
				searchQuery(msg, transporteDB, 200, transporteRadius, filter, (results) => {
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
				searchQuery(msg, transporteDB, 200, transporteRadius, filter, (results) => {
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
				searchQuery(msg, transporteDB, 200, transporteRadius, filter, (results) => {
					processTransport('metro ligero', msg, reply, results)
				})
				break
			case RegExp('^' + regex.transporte).test(msg.reply.text):
				// Query the DB and process the results
				searchQuery(msg, transporteDB, 200, transporteRadius, filter, (results) => {
					processTransport('transporte', msg, reply, results)
				})
				break
		}
	} else if (RegExp('^' + regex.marcasSupermercado).test(msg.reply.text)) { // If message requests a supermarket
		// Initialize the DB client
		let supermercadoConfig = new ddbGeo.GeoDataManagerConfiguration(ddb, 'NearBot_Madrid_Supermercado')
		supermercadoConfig.hashKeyLength = 9
		let supermercadoDB = new ddbGeo.GeoDataManager(supermercadoConfig)
		let filter = {}
		let supermercadoRadius = 3200

		switch (true) {
			case RegExp('^' + regex.carrefour).test(msg.reply.text):
				filter = {
					QueryInput: {
						FilterExpression: '#marca = :type',
						ExpressionAttributeNames: { '#marca': 'marca' },
						ExpressionAttributeValues: { ':type': { 'S': 'Carrefour' } }
					}
				}
				searchQuery(msg, supermercadoDB, 200, supermercadoRadius, filter, (results) => {
					processSuper('Carrefour', msg, reply, results)
				})
				break
			case RegExp('^' + regex.mercadona).test(msg.reply.text):
				filter = {
					QueryInput: {
						FilterExpression: '#marca = :type',
						ExpressionAttributeNames: { '#marca': 'marca' },
						ExpressionAttributeValues: { ':type': { 'S': 'Mercadona' } }
					}
				}
				searchQuery(msg, supermercadoDB, 200, supermercadoRadius, filter, (results) => {
					processSuper('Mercadona', msg, reply, results)
				})
				break
			case RegExp('^' + regex.supermercado).test(msg.reply.text):
				searchQuery(msg, supermercadoDB, 200, supermercadoRadius, filter, (results) => {
					processSuper('supermercado', msg, reply, results)
				})
				break
		}
	} else if (RegExp('^' + regex.fuente).test(msg.reply.text)) { // If message requests a water fountain
		// Initialize the DB client
		let fuenteConfig = new ddbGeo.GeoDataManagerConfiguration(ddb, 'NearBot_Madrid_Fuente')
		fuenteConfig.hashKeyLength = 9
		let fuenteDB = new ddbGeo.GeoDataManager(fuenteConfig)
		let filter = {}
		let fuenteRadius = 1600

		searchQuery(msg, fuenteDB, 100, fuenteRadius, filter, (results) => {
			processFuente(msg, reply, results)
		})
	} else if (RegExp('^' + regex.bici).test(msg.reply.text)) { // If message requests a bike station
		// Initialize the DB client
		let biciConfig = new ddbGeo.GeoDataManagerConfiguration(ddb, 'NearBot_Madrid_Bici')
		biciConfig.hashKeyLength = 8
		let biciDB = new ddbGeo.GeoDataManager(biciConfig)
		let filter = {}
		let biciRadius = 800

		searchQuery(msg, biciDB, 100, biciRadius, filter, (results) => {
			processBici(msg, reply, results)
		})
	} else if (RegExp('^' + regex.aseo).test(msg.reply.text)) { // If message requests a WC
		// Initialize the DB client
		let aseoConfig = new ddbGeo.GeoDataManagerConfiguration(ddb, 'NearBot_Madrid_Aseo')
		aseoConfig.hashKeyLength = 9
		let aseoDB = new ddbGeo.GeoDataManager(aseoConfig)
		let filter = {}
		let aseoRadius = 800

		searchQuery(msg, aseoDB, 100, aseoRadius, filter, (results) => {
			processAseo(msg, reply, results)
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
