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

const imgSize = '400x500' // Size for the map image
const mapsKey = '...' // Google Maps Static API Key
const regex = { // Strings for sending and comparing messages to regex
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

// I still need this https://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript/196991#196991
function toTitleCase(str) {
	return str.replace(/\w\S*/g, function(txt){
		return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
	});
}

function transformHour(hora) { // Transform hour in format 900 in format 9:00
	return hora.slice(0, hora.length-2) + ':' + hora.slice(hora.length-2, hora.length)
}

// Function for querying the DB
async function searchQuery(coordinates, config, callback) {
	let configDB = new ddbGeo.GeoDataManagerConfiguration(ddb, config.table)
	configDB.hashKeyLength = config.hashLength
	let searchDB = new ddbGeo.GeoDataManager(configDB)
	
	// Increment the radius until results are found
	for (let radius = config.radius, foundResult = false; radius <= config.radiusLimit && foundResult === false; radius = radius*2) {
		await searchDB.queryRadius(Object.assign({
			RadiusInMeter: radius,
			CenterPoint: {
				latitude: coordinates[0],
				longitude: coordinates[1]
			}
		}, config.filter))
		.then((result) => {
			// When done, or the radius limit is reached, return the resulted array
			if (result.length > 0 || radius === config.radiusLimit) {
				foundResult = true
				return callback(result)
			}
		})
	}
}

// Function for calculating distances http://jonisalonen.com/2014/computing-distance-between-coordinates-can-be-simple-and-fast/
function calcDistance(coordinates, result) {
	let geoJson = JSON.parse(result.geoJson.S)
	return 110.25 * Math.sqrt(Math.pow(geoJson.coordinates[1] - coordinates[0], 2) + Math.pow((geoJson.coordinates[0] - coordinates[1]) * Math.cos(coordinates[0] * (Math.PI/180)), 2))
}

async function getResult(coordinates, results, callback) { // Gets the results array and returns the nearest
	let distance = null
	if (results.length === 1) { // If a unique result found
		return callback(results[0], Math.round(calcDistance(coordinates, results[0]) * 100000) / 100) // Round the distance to meters
	} else { // If more than one result is found, search for the nearest
		let nearest = 0
		distance = calcDistance(coordinates, results[nearest])
		
		for (let i = 1; i < results.length; i++) {
			let newDistance = calcDistance(coordinates, results[i])
			
			if (newDistance < distance) { // If the new calculated distance is less than the actual nearest distance, replace it
				nearest = i
				distance = newDistance
			}
		}
		return callback(results[nearest], Math.round(distance * 100000) / 100)
	}
}

async function processTransport(mode, coordinates, reply, results) { // Process transport requests
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de la ciudad. No hemos logrado encontrar ninguna estación de ' + mode + ' cercana.')
	} else {
		getResult(coordinates, results, (result, distance) => {
			switch(mode) { // Set the principal station mode
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
			
			// Set the secondary station modes
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
			
			// Hide the custom keyboard, and return the result with a map
			let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
			reply.keyboard().text('Esta es la estación de ' + mode + ' más cercana:')
			reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo('https://maps.googleapis.com/maps/api/staticmap?size=' + imgSize + '&markers=color:blue|size:mid|' + coordinates[0] + ',' + coordinates[1] + '&markers=color:red|' + resultCoordinates + '&language=es&key=' + mapsKey, modos + ' *' + denominacionPrincipal + '* (_' + distance + 'm_)' + denominacionSecundaria + '\n' + lineasPrincipal + lineasSecundaria, 'Markdown')
		})
	}
}

async function processFuente(coordinates, reply, results) {
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna fuente cercana.')
	} else {
		getResult(coordinates, results, (result, distance) => {
			let calle = ''
			if (result.calle) { // If there's no "street" value, skip it
				calle = result.calle.S
			}
			
			// Hide the custom keyboard, and return the result with a map
			let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
			reply.keyboard().text('La fuente más cercana es:')
			reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo('https://maps.googleapis.com/maps/api/staticmap?size=' + imgSize + '&markers=color:blue|size:mid|' + coordinates[0] + ',' + coordinates[1] + '&markers=color:red|' + resultCoordinates + '&language=es&key=' + mapsKey, '🚰 *' + toTitleCase(result.denominacion.S) + '* (_' + distance + 'm_)\n\n' + toTitleCase(calle), 'Markdown')
		})
	}
}

async function processBici(coordinates, reply, results) {
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna estación de BiciMAD.')
	} else {
		getResult(coordinates, results, (result, distance) => {
			// Hide the custom keyboard, and return the result with a map
			let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
			reply.keyboard().text('La estación de BiciMAD más cercana es:')
			reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo('https://maps.googleapis.com/maps/api/staticmap?size=' + imgSize + '&markers=color:blue|size:mid|' + coordinates[0] + ',' + coordinates[1] + '&markers=color:red|' + resultCoordinates + '&language=es&key=' + mapsKey, '🚲 ' + result.numeroBase.S + ' - *' + result.denominacionBici.S + '* (_' + distance + 'm_)\n\n' + result.calle.S, 'Markdown')
		})
	}
}

async function processAseo(coordinates, reply, results) {
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ningún aseo cercano.')
	} else {
		getResult(coordinates, results, (result, distance) => {
			let descripcion = ''
			if (result.descripcion) { // If there's no "descripcion" value, skip it
				descripcion = result.descripcion.S
			}
			
			// Hide the custom keyboard, and return the result with a map
			let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
			reply.keyboard().text('El aseo más cercano es:')
			reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo('https://maps.googleapis.com/maps/api/staticmap?size=' + imgSize + '&markers=color:blue|size:mid|' + coordinates[0] + ',' + coordinates[1] + '&markers=color:red|' + resultCoordinates + '&language=es&key=' + mapsKey, '🚽 *' + toTitleCase(result.calle.S) + '* (_' + distance + 'm_)\n\n' + descripcion, 'Markdown')
		})
	}
}

async function processSuper(marca, coordinates, reply, results) {
	if (results.length === 0) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de la ciudad. No hemos logrado encontrar ningún ' + marca + ' cercano.')
	} else {
		getResult(coordinates, results, (result, distance) => {
			// Get the opening hours for the current day
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
			if (result.descripcion) { // If there's not "descripcion" value, skip it
				descripcion = '\n' + result.descripcion.S
			}
			
			// Hide the custom keyboard, and return the result with a map
			let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
			reply.keyboard().text('El ' + marca + ' más cercano es:')
			reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo('https://maps.googleapis.com/maps/api/staticmap?size=' + imgSize + '&markers=color:blue|size:mid|' + coordinates[0] + ',' + coordinates[1] + '&markers=color:red|' + resultCoordinates + '&language=es&key=' + mapsKey, '🛒 *' + result.nombre.S + '* (_' + distance + 'm_)\n\n' + result.calle.S + ', ' + result.ciudad.S + descripcion + '\n\n📞 ' + result.telefono.S + '\n🕒' + horario, 'Markdown')
		})
	}
}

// Show bot usage guide
bot.command('start', 'help', (msg, reply) => {
	reply.markdown('¡Hola! Soy NearBot. Puedes pedirme que busque sitios (como por ejemplo, supermercados) en Madrid y te responderé con la información y la localización del que tengas más cerca.\n\nPara ello, puedes enviarme tu ubicación y seleccionar el sitio que desees buscar en el menú que aparecerá, o puedes enviarme uno de estos comandos:\n\n*Medios de transporte*\n/transporte - Busca una estación de cualquier medio de transporte (no incluye bici)\n/metro - Busca una estación de metro\n/cercanias - Busca una estación de cercanías\n/metroligero - Busca una estación de metro ligero\n/bici - Busca una estación de BiciMAD\n\n*Supermercados*\n/supermercado - Busca un supermercado de cualquier marca\n/carrefour - Busca un supermercado Carrefour\n/mercadona - Busca un supermercado Mercadona\n\n*Otros*\n/fuente - Busca una fuente de agua potable en Madrid\n/aseo - Busca un aseo público en Madrid\n\n*Más comandos*\n/help - Vuelve a mostrar este mensaje\n/info - Muestra información del bot\n/novedades - Muestra los cambios añadidos recientemente al bot\n\nCada cierto tiempo, me iré actualizando automáticamente, añadiendo sitios y funcionalidades nuevas, usa el comando /novedades para ver los cambios recientes.')
})

// Show bot license and info
bot.command('info', (msg, reply) => {
	reply.disablePreview().markdown('*NearBot Madrid*\nVersión 1.0 (30/07/2018)\n\nTiempo de ejecución Node.js v8.10 junto al framework para bots [Botgram](https://github.com/botgram/botgram) v2.1.0.\n\nEste bot es software libre y está licenciado bajo [GNU AGPL v3.0](https://github.com/elizabeth-dev/NearBot-Madrid/blob/master/LICENSE.md), lo cuál significa que puedes modificarlo y redistribuirlo libremente conforme a los términos de la licencia. Asimismo, se distribuye sin ninguna garantía ni responsabilidad.\n\nPuedes obtener más informacion sobre el funcionamiento del bot, su código fuente, y su licencia en su repositorio de GitHub [NearBot-Madrid](https://github.com/elizabeth-dev/NearBot-Madrid).\n\nAdemás, puedes contactar con su creadora por [Twitter](https://twitter.com/Eli_coptero_), o por [Telegram](tg://user?id=74460537).\n\n_Elizabeth Martín Campos_\nhttps://eli.zabeth.es/')
})

// Show what's new in the last update
bot.command('novedades', (msg, reply) => {
	reply.markdown('Esta es la primera versión publicada de NearBot Madrid.\n\nAún no hay ninguna novedad, pero dentro de poco se publicará la versión 2.0, la cuál añadirá mejoras en cuanto a los horarios de los resultados, la integración con la API pública de BiciMAD, o el rendimiento general del bot, entre otras.\n\nVuelve pronto para comprobar si ya se ha publicado la actualización.')
})

// Place request
bot.command('metro', 'cercanias', 'metroligero', 'transporte', 'fuente', 'bici', 'aseo', 'carrefour', 'mercadona', 'supermercado', (msg, reply) => {
	reply.keyboard([[{ text: '📌 Enviar mi ubicación', request: 'location' }]], true).text(regex[msg.command] + 'Toca en el botón inferior para enviar tu ubicación.')
})

bot.location((msg, reply) => {
	let coordinates = [msg.latitude, msg.longitude]
	if (msg.reply) { // If the location is a reply to a message (serverless tricks)
		let config = { filter: {} }
		
		if (RegExp('^' + regex.mediosTransporte).test(msg.reply.text)) { // If message requests a transport station
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Transporte'
			config.hashLength = 8
			config.radius = 200
			config.radiusLimit = 3200
			
			// Check which type of station is the user requesting
			switch (true) {
				case RegExp('^' + regex.metro).test(msg.reply.text):
				// Filter for limiting the search to metro stations
				config.filter = {
					QueryInput: {
						FilterExpression: 'contains(#modos, :type)',
						ExpressionAttributeNames: { '#modos': 'modos' },
						ExpressionAttributeValues: { ':type': {'S': 'Metro' } }
					}
				}
				
				// Query the DB and process the results
				searchQuery(coordinates, config, (results) => {
					processTransport('metro', coordinates, reply, results)
				})
				break
				case RegExp('^' + regex.cercanias).test(msg.reply.text):
				// Filter for limiting the search to commuter train stations
				config.filter = {
					QueryInput: {
						FilterExpression: 'contains(#modos, :type)',
						ExpressionAttributeNames: { '#modos': 'modos' },
						ExpressionAttributeValues: { ':type': {'S': 'Cercanías' } }
					}
				}
				
				// Query the DB and process the results
				searchQuery(coordinates, config, (results) => {
					processTransport('cercanías', coordinates, reply, results)
				})
				break
				case RegExp('^' + regex.metroligero).test(msg.reply.text):
				// Filter for limiting the search to tram stations
				config.filter = {
					QueryInput: {
						FilterExpression: 'contains(#modos, :type)',
						ExpressionAttributeNames: { '#modos': 'modos' },
						ExpressionAttributeValues: { ':type': {'S': 'Metro Ligero' } }
					}
				}
				
				// Query the DB and process the results
				searchQuery(coordinates, config, (results) => {
					processTransport('metro ligero', coordinates, reply, results)
				})
				break
				case RegExp('^' + regex.transporte).test(msg.reply.text):
				// Query the DB and process the results
				searchQuery(coordinates, config, (results) => {
					processTransport('transporte', coordinates, reply, results)
				})
				break
			}
		} else if (RegExp('^' + regex.marcasSupermercado).test(msg.reply.text)) { // If message requests a supermarket
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Supermercado'
			config.hashLength = 9
			config.radius = 200
			config.radiusLimit = 3200
			
			switch (true) {
				case RegExp('^' + regex.carrefour).test(msg.reply.text):
				config.filter = {
					QueryInput: {
						FilterExpression: '#marca = :type',
						ExpressionAttributeNames: { '#marca': 'marca' },
						ExpressionAttributeValues: { ':type': { 'S': 'Carrefour' } }
					}
				}
				searchQuery(coordinates, config, (results) => {
					processSuper('Carrefour', coordinates, reply, results)
				})
				break
				case RegExp('^' + regex.mercadona).test(msg.reply.text):
				config.filter = {
					QueryInput: {
						FilterExpression: '#marca = :type',
						ExpressionAttributeNames: { '#marca': 'marca' },
						ExpressionAttributeValues: { ':type': { 'S': 'Mercadona' } }
					}
				}
				searchQuery(coordinates, config, (results) => {
					processSuper('Mercadona', coordinates, reply, results)
				})
				break
				case RegExp('^' + regex.supermercado).test(msg.reply.text):
				searchQuery(coordinates, config, (results) => {
					processSuper('supermercado', coordinates, reply, results)
				})
				break
			}
		} else if (RegExp('^' + regex.fuente).test(msg.reply.text)) { // If message requests a water fountain
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Fuente'
			config.hashLength = 9
			config.radius = 100
			config.radiusLimit = 1600
			
			searchQuery(coordinates, config, (results) => {
				processFuente(coordinates, reply, results)
			})
		} else if (RegExp('^' + regex.bici).test(msg.reply.text)) { // If message requests a bike station
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Bici'
			config.hashLength = 8
			config.radius = 100
			config.radiusLimit = 800
			
			searchQuery(coordinates, config, (results) => {
				processBici(coordinates, reply, results)
			})
		} else if (RegExp('^' + regex.aseo).test(msg.reply.text)) { // If message requests a WC
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Aseo'
			config.hashLength = 9
			config.radius = 100
			config.radiusLimit = 800
			
			searchQuery(coordinates, config, (results) => {
				processAseo(coordinates, reply, results)
			})
		}
	} else { // If the user sends their location and wants to pick a place
		reply.inlineKeyboard([
			[{ text: 'Transporte', callback_data: JSON.stringify({ t: 'tte_menu', c: coordinates, i: msg.chat.id }) }],
			[{ text: 'Supermercado', callback_data: JSON.stringify({ t: 'spr_menu', c: coordinates, i: msg.chat.id }) }],
			[{ text: 'BiciMAD', callback_data: JSON.stringify({ t: 'bici', c: coordinates, i: msg.chat.id }) }],
			[{ text: 'Fuente de agua', callback_data: JSON.stringify({ t: 'fuente', c: coordinates, i: msg.chat.id }) }],
			[{ text: 'Aseo', callback_data: JSON.stringify({ t: 'aseo', c: coordinates, i: msg.chat.id }) }]
		]).text('De acuerdo, ahora, dime qué quieres que busque.')
	}
})

bot.callback((query, next) => {
	try {
		var data = JSON.parse(query.data)
	} catch (err) {
		console.log(err)
		return next()
	}
	
	let reply = bot.reply(data.i)
	let config = { filter: {} }
	switch (data.t) {
		case 'tte_menu':
		reply.inlineKeyboard([
			[{ text: 'Metro', callback_data: JSON.stringify({ t: 'mtro', c: data.c, i: data.i }) }],
			[{ text: 'Cercanías', callback_data: JSON.stringify({ t: 'cerc', c: data.c, i: data.i }) }],
			[{ text: 'Metro ligero', callback_data: JSON.stringify({ t: 'mlig', c: data.c, i: data.i }) }],
			[{ text: 'Cualquiera', callback_data: JSON.stringify({ t: 'tte', c: data.c, i: data.i }) }]
		]).editReplyMarkup(query.message)
		break
		case 'mtro':
		// Initialize the DB client
		config.table = 'NearBot_Madrid_Transporte'
		config.hashLength = 8
		config.filter = {
			QueryInput: {
				FilterExpression: 'contains(#modos, :type)',
				ExpressionAttributeNames: { '#modos': 'modos' },
				ExpressionAttributeValues: { ':type': {'S': 'Metro' } }
			}
		}
		config.radius = 200
		config.radiusLimit = 3200
		
		// Query the DB and process the results
		searchQuery(data.c, config, (results) => {
			processTransport('metro', data.c, reply, results).then(query.answer())
		})
		break
		case 'cerc':
		// Initialize the DB client
		config.table = 'NearBot_Madrid_Transporte'
		config.hashLength = 8
		config.filter = {
			QueryInput: {
				FilterExpression: 'contains(#modos, :type)',
				ExpressionAttributeNames: { '#modos': 'modos' },
				ExpressionAttributeValues: { ':type': {'S': 'Cercanías' } }
			}
		}
		config.radius = 200
		config.radiusLimit = 3200
		
		// Query the DB and process the results
		searchQuery(data.c, config, (results) => {
			processTransport('cercanías', data.c, reply, results).then(query.answer())
		})
		break
		case 'mlig':
		// Initialize the DB client
		config.table = 'NearBot_Madrid_Transporte'
		config.hashLength = 8
		config.filter = {
			QueryInput: {
				FilterExpression: 'contains(#modos, :type)',
				ExpressionAttributeNames: { '#modos': 'modos' },
				ExpressionAttributeValues: { ':type': {'S': 'Metro Ligero' } }
			}
		}
		config.radius = 200
		config.radiusLimit = 3200
		
		// Query the DB and process the results
		searchQuery(data.c, config, (results) => {
			processTransport('metro ligero', data.c, reply, results).then(query.answer())
		})
		break
		case 'tte':
		// Initialize the DB client
		config.table = 'NearBot_Madrid_Transporte'
		config.hashLength = 8
		config.radius = 200
		config.radiusLimit = 3200
		
		// Query the DB and process the results
		searchQuery(data.c, config, (results) => {
			processTransport('transporte', data.c, reply, results).then(query.answer())
		})
		break
		case 'spr_menu':
		reply.inlineKeyboard([
			[{ text: 'Carrefour', callback_data: JSON.stringify({ t: 'crf', c: data.c, i: data.i }) }],
			[{ text: 'Mercadona', callback_data: JSON.stringify({ t: 'mrc', c: data.c, i: data.i }) }],
			[{ text: 'Cualquiera', callback_data: JSON.stringify({ t: 'spr', c: data.c, i: data.i }) }]
		]).editReplyMarkup(query.message)
		break
		case 'crf':
		config.table = 'NearBot_Madrid_Supermercado'
		config.hashLength = 9
		config.radius = 200
		config.radiusLimit = 3200
		config.filter = {
			QueryInput: {
				FilterExpression: '#marca = :type',
				ExpressionAttributeNames: { '#marca': 'marca' },
				ExpressionAttributeValues: { ':type': { 'S': 'Carrefour' } }
			}
		}
		
		searchQuery(data.c, config, (results) => {
			processSuper('Carrefour', data.c, reply, results)
		}).then(query.answer())
		break
		case 'mrc':
		config.table = 'NearBot_Madrid_Supermercado'
		config.hashLength = 9
		config.radius = 200
		config.radiusLimit = 3200
		config.filter = {
			QueryInput: {
				FilterExpression: '#marca = :type',
				ExpressionAttributeNames: { '#marca': 'marca' },
				ExpressionAttributeValues: { ':type': { 'S': 'Mercadona' } }
			}
		}
		
		searchQuery(data.c, config, (results) => {
			processSuper('Mercadona', data.c, reply, results)
		}).then(query.answer())
		break
		case 'spr':
		config.table = 'NearBot_Madrid_Supermercado'
		config.hashLength = 9
		config.radius = 200
		config.radiusLimit = 3200
		
		searchQuery(data.c, config, (results) => {
			processSuper('supermercado', data.c, reply, results)
		}).then(query.answer())
		break
		case 'bici':
		config.table = 'NearBot_Madrid_Bici'
		config.hashLength = 8
		config.radius = 100
		config.radiusLimit = 800
		
		searchQuery(data.c, config, (results) => {
			processBici(data.c, reply, results)
		}).then(query.answer())
		break
		case 'fuente':
		config.table = 'NearBot_Madrid_Fuente'
		config.hashLength = 9
		config.radius = 100
		config.radiusLimit = 1600
		
		searchQuery(data.c, config, (results) => {
			processFuente(data.c, reply, results)
		}).then(query.answer())
		break
		case 'aseo':
		config.table = 'NearBot_Madrid_Aseo'
		config.hashLength = 9
		config.radius = 100
		config.radiusLimit = 800

		searchQuery(data.c, config, (results) => {
			processAseo(data.c, reply, results)
		}).then(query.answer())
		break
		default:
		console.log(data)
		console.log(query)
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
