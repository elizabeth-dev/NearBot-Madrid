'use strict'

// Telegram and Botgram libraries and config
const https = require('https')
const agent = new https.Agent({ keepAlive: true, maxFreeSockets: 5 }) // Creating keepAlive agent
const botgram = require('botgram')
const bot = botgram(process.env.TELEGRAM_TOKEN, { agent: agent }) // Initializing Botgram with keepAlive agent

const searchQuery = require('./search').searchQuery
const render = require('./render')

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

// Show bot usage guide
bot.command('start', 'help', (msg, reply) => {
	reply.markdown('¡Hola! Soy NearBot. Puedes pedirme que busque sitios (como por ejemplo, supermercados) en Madrid y te responderé con la información y la localización del que tengas más cerca.\n\nPara ello, puedes enviarme tu ubicación y seleccionar el sitio que desees buscar en el menú que aparecerá, o puedes enviarme uno de estos comandos:\n\n*Medios de transporte*\n/transporte - Busca una estación de cualquier medio de transporte (no incluye bici)\n/metro - Busca una estación de metro\n/cercanias - Busca una estación de cercanías\n/metroligero - Busca una estación de metro ligero\n/bici - Busca una estación de BiciMAD\n\n*Supermercados*\n/supermercado - Busca un supermercado de cualquier marca\n/carrefour - Busca un supermercado Carrefour\n/mercadona - Busca un supermercado Mercadona\n\n*Otros*\n/fuente - Busca una fuente de agua potable en Madrid\n/aseo - Busca un aseo público en Madrid\n\n*Más comandos*\n/help - Vuelve a mostrar este mensaje\n/info - Muestra información del bot\n/novedades - Muestra los cambios añadidos recientemente al bot\n\nCada cierto tiempo, me iré actualizando automáticamente, añadiendo sitios y funcionalidades nuevas, usa el comando /novedades para ver los cambios recientes.')
})

// Show bot license and info
bot.command('info', (msg, reply) => {
	reply.disablePreview().markdown('*NearBot Madrid*\nVersión ' + process.env.NEARBOT_VERSION + ' (30/07/2018)\n\nTiempo de ejecución Node.js v8.10 junto al framework para bots [Botgram](https://github.com/botgram/botgram) v2.1.0.\n\nEste bot es software libre y está licenciado bajo [GNU AGPL v3.0](https://github.com/elizabeth-dev/NearBot-Madrid/blob/master/LICENSE.md), lo cuál significa que puedes modificarlo y redistribuirlo libremente conforme a los términos de la licencia. Asimismo, se distribuye sin ninguna garantía ni responsabilidad.\n\nPuedes obtener más informacion sobre el funcionamiento del bot, su código fuente, y su licencia en su repositorio de GitHub [NearBot-Madrid](https://github.com/elizabeth-dev/NearBot-Madrid).\n\nAdemás, puedes contactar con su creadora por [Twitter](https://twitter.com/Eli_coptero_), o por [Telegram](tg://user?id=74460537).\n\n_Elizabeth Martín Campos_\nhttps://eli.zabeth.es/')
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
			config.radius = 300
			config.radiusLimit = 2400
			
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
				searchQuery(coordinates, config, (result) => {
					render.processTransport('metro', coordinates, reply, result)
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
				searchQuery(coordinates, config, (result) => {
					render.processTransport('cercanías', coordinates, reply, result)
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
				searchQuery(coordinates, config, (result) => {
					render.processTransport('metro ligero', coordinates, reply, result)
				})
				break
				case RegExp('^' + regex.transporte).test(msg.reply.text):
				// Query the DB and process the results
				searchQuery(coordinates, config, (result) => {
					render.processTransport('transporte', coordinates, reply, result)
				})
				break
			}
		} else if (RegExp('^' + regex.marcasSupermercado).test(msg.reply.text)) { // If message requests a supermarket
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Supermercado'
			config.hashLength = 9
			config.radius = 500
			config.radiusLimit = 4000
			
			switch (true) {
				case RegExp('^' + regex.carrefour).test(msg.reply.text):
				config.filter = {
					QueryInput: {
						FilterExpression: '#marca = :type',
						ExpressionAttributeNames: { '#marca': 'marca' },
						ExpressionAttributeValues: { ':type': { 'S': 'Carrefour' } }
					}
				}
				searchQuery(coordinates, config, (result) => {
					render.processSuper('Carrefour', coordinates, reply, result)
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
				searchQuery(coordinates, config, (result) => {
					render.processSuper('Mercadona', coordinates, reply, result)
				})
				break
				case RegExp('^' + regex.supermercado).test(msg.reply.text):
				searchQuery(coordinates, config, (result) => {
					render.processSuper('supermercado', coordinates, reply, result)
				})
				break
			}
		} else if (RegExp('^' + regex.fuente).test(msg.reply.text)) { // If message requests a water fountain
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Fuente'
			config.hashLength = 9
			config.radius = 400
			config.radiusLimit = 1600
			
			searchQuery(coordinates, config, (result) => {
				render.processFuente(coordinates, reply, result)
			})
		} else if (RegExp('^' + regex.bici).test(msg.reply.text)) { // If message requests a bike station
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Bici'
			config.hashLength = 8
			config.radius = 300
			config.radiusLimit = 1200
			
			searchQuery(coordinates, config, (result) => {
				render.processBici(coordinates, reply, result)
			})
		} else if (RegExp('^' + regex.aseo).test(msg.reply.text)) { // If message requests a WC
			// Initialize the DB client
			config.table = 'NearBot_Madrid_Aseo'
			config.hashLength = 9
			config.radius = 400
			config.radiusLimit = 1600
			
			searchQuery(coordinates, config, (result) => {
				render.processAseo(coordinates, reply, result)
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
		case 'menu':
		reply.inlineKeyboard([
			[{ text: 'Transporte', callback_data: JSON.stringify({ t: 'tte_menu', c: data.c, i: data.i }) }],
			[{ text: 'Supermercado', callback_data: JSON.stringify({ t: 'spr_menu', c: data.c, i: data.i }) }],
			[{ text: 'BiciMAD', callback_data: JSON.stringify({ t: 'bici', c: data.c, i: data.i }) }],
			[{ text: 'Fuente de agua', callback_data: JSON.stringify({ t: 'fuente', c: data.c, i: data.i }) }],
			[{ text: 'Aseo', callback_data: JSON.stringify({ t: 'aseo', c: data.c, i: data.i }) }]
		]).editReplyMarkup(query.message).then(query.answer())
		break
		case 'tte_menu':
		reply.inlineKeyboard([
			[{ text: 'Metro', callback_data: JSON.stringify({ t: 'mtro', c: data.c, i: data.i }) }],
			[{ text: 'Cercanías', callback_data: JSON.stringify({ t: 'cerc', c: data.c, i: data.i }) }],
			[{ text: 'Metro ligero', callback_data: JSON.stringify({ t: 'mlig', c: data.c, i: data.i }) }],
			[{ text: 'Cualquiera', callback_data: JSON.stringify({ t: 'tte', c: data.c, i: data.i }) }],
			[{ text: '<- Volver', callback_data: JSON.stringify({ t: 'menu', c: data.c, i: data.i }) }]
		]).editReplyMarkup(query.message).then(query.answer())
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
		config.radius = 300
		config.radiusLimit = 2400
		
		// Query the DB and process the results
		searchQuery(data.c, config, (result) => {
			render.processTransport('metro', data.c, reply, result).then(query.answer())
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
		config.radius = 300
		config.radiusLimit = 2400
		
		// Query the DB and process the results
		searchQuery(data.c, config, (result) => {
			render.processTransport('cercanías', data.c, reply, result).then(query.answer())
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
		config.radius = 300
		config.radiusLimit = 2400
		
		// Query the DB and process the results
		searchQuery(data.c, config, (result) => {
			render.processTransport('metro ligero', data.c, reply, result).then(query.answer())
		})
		break
		case 'tte':
		// Initialize the DB client
		config.table = 'NearBot_Madrid_Transporte'
		config.hashLength = 8
		config.radius = 300
		config.radiusLimit = 2400
		
		// Query the DB and process the results
		searchQuery(data.c, config, (result) => {
			render.processTransport('transporte', data.c, reply, result).then(query.answer())
		})
		break
		case 'spr_menu':
		reply.inlineKeyboard([
			[{ text: 'Carrefour', callback_data: JSON.stringify({ t: 'crf', c: data.c, i: data.i }) }],
			[{ text: 'Mercadona', callback_data: JSON.stringify({ t: 'mrc', c: data.c, i: data.i }) }],
			[{ text: 'Cualquiera', callback_data: JSON.stringify({ t: 'spr', c: data.c, i: data.i }) }],
			[{ text: '<- Volver', callback_data: JSON.stringify({ t: 'menu', c: data.c, i: data.i }) }]
		]).editReplyMarkup(query.message).then(query.answer())
		break
		case 'crf':
		config.table = 'NearBot_Madrid_Supermercado'
		config.hashLength = 9
		config.radius = 500
		config.radiusLimit = 4000
		config.filter = {
			QueryInput: {
				FilterExpression: '#marca = :type',
				ExpressionAttributeNames: { '#marca': 'marca' },
				ExpressionAttributeValues: { ':type': { 'S': 'Carrefour' } }
			}
		}
		
		searchQuery(data.c, config, (result) => {
			render.processSuper('Carrefour', data.c, reply, result)
		}).then(query.answer())
		break
		case 'mrc':
		config.table = 'NearBot_Madrid_Supermercado'
		config.hashLength = 9
		config.radius = 500
		config.radiusLimit = 4000
		config.filter = {
			QueryInput: {
				FilterExpression: '#marca = :type',
				ExpressionAttributeNames: { '#marca': 'marca' },
				ExpressionAttributeValues: { ':type': { 'S': 'Mercadona' } }
			}
		}
		
		searchQuery(data.c, config, (result) => {
			render.processSuper('Mercadona', data.c, reply, result)
		}).then(query.answer())
		break
		case 'spr':
		config.table = 'NearBot_Madrid_Supermercado'
		config.hashLength = 9
		config.radius = 500
		config.radiusLimit = 4000
		
		searchQuery(data.c, config, (result) => {
			render.processSuper('supermercado', data.c, reply, result)
		}).then(query.answer())
		break
		case 'bici':
		config.table = 'NearBot_Madrid_Bici'
		config.hashLength = 8
		config.radius = 300
		config.radiusLimit = 1200
		
		searchQuery(data.c, config, (result) => {
			render.processBici(data.c, reply, result)
		}).then(query.answer())
		break
		case 'fuente':
		config.table = 'NearBot_Madrid_Fuente'
		config.hashLength = 9
		config.radius = 400
		config.radiusLimit = 1600
		
		searchQuery(data.c, config, (result) => {
			render.processFuente(data.c, reply, result)
		}).then(query.answer())
		break
		case 'aseo':
		config.table = 'NearBot_Madrid_Aseo'
		config.hashLength = 9
		config.radius = 400
		config.radiusLimit = 1600
		
		searchQuery(data.c, config, (result) => {
			render.processAseo(data.c, reply, result)
		}).then(query.answer())
		break
		default:
		console.log(data)
		console.log(query)
		query.answer()
	}
})

bot.stop()

module.exports.telegram = (event, context, callback) => {
	bot.processUpdate(JSON.parse(event.body)) // Botgram processes incoming request
	const response = {
		statusCode: 200,
		body: JSON.stringify('NearBot v' + process.env.NEARBOT_VERSION)
	}
	
	callback(null, response)
}
